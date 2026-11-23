# Registration

## Overview

A student adds and removes offerings during the semester's registration window. The server applies nine checks inside a transaction. The client shows a preview (already registered, already passed, missing prerequisites, section full) and displays the server's error code if a check fails. The offering list itself is already limited to the student's program.

## Purpose and responsibilities

- List the student's enrolled courses for a semester, with credit totals and the GPA-based maximum.
- Enroll into an offering, or re-activate a dropped row for the same offering.
- Drop an enrolled row by setting `status = 'dropped'`.
- Enforce the academic rules below. The client cannot skip them.

## Key files

| Path | Responsibility |
|---|---|
| `backend/src/services/registration.js` | `register`, `drop` |
| `backend/src/routes/enrollments.js` | Student routes |
| `backend/src/services/gpa.js` | `getStanding`, `maxCredits` used by the credit cap |
| `frontend/src/pages/student/Registration.jsx` | UI |

All enrollment routes use `authenticate` and `authorize('student')`.

## Data flow

### My courses

`GET /api/enrollments/me`

- Query `semester_id` optional. Default is `is_current = 1`.
- If that semester does not exist: `{ semester: null, courses: [], total_credits: 0, max_credits: 18 }`. The `18` here is a constant in the empty branch, not `maxCredits`.
- Otherwise: semester row including `registration_open`, courses whose status is `enrolled`, `completed`, or `failed` (code, names, hours, instructor names, section, meetings, `status`), `total_credits` as the sum of those hours, and `max_credits` from `maxCredits(getStanding(...))`.

`backend/src/domain/enrollment.js` names those three statuses "occupying". Dropped rows are omitted. Publishing a grade does not remove the course from this list or from the weekly schedule. The registration screen shows a drop button only while `status` is `enrolled`. A `completed` or `failed` row stays visible with a tag. Seat counts, the term credit load, same-course blocking, and schedule conflicts use the same occupying set, so publishing does not free a seat or free credit hours.

### Enroll

`POST /api/enrollments` body `{ offering_id }`. Missing id → `400 MISSING_FIELDS`. Success → `201 { id }` where `id` is the enrollment id.

`register(studentId, offeringId)` locks the offering (`SELECT id ... FOR UPDATE`) and then:

| Step | Rule | Error |
|---|---|---|
| | Offering must exist | `404 NOT_FOUND` |
| | Course department is one this student may take. Admins and instructors are not students, so this route never applies to them | `403 OUT_OF_PROGRAM` |
| 1 | `CURDATE()` inside `registration_start` .. `registration_end` | `403 REGISTRATION_CLOSED` |
| 2 | No existing row, or the existing row is `dropped` | `409 ALREADY_ENROLLED` |
| 3 | No other `enrolled` offering of the same course in the same semester | `409 COURSE_ALREADY_IN_SEMESTER` |
| 4 | No `completed` enrollment of this `course_id` (any semester) | `409 ALREADY_PASSED` |
| 5 | Every prerequisite `course_id` is in that completed set | `409 PREREQ_NOT_MET` with `{ courses: [codes] }` |
| 6 | Count of `enrolled` rows `< capacity` | `409 SECTION_FULL` |
| 7 | No meeting of this offering overlaps an enrolled meeting in the same semester | `409 TIME_CONFLICT` with `{ course: code }` |
| 8 | Current enrolled hours in the semester plus this course's hours `<= maxCredits` | `409 CREDIT_LIMIT` with `{ max, current }` |

Overlap is the same weekday and `start < otherEnd && otherStart < end`. Touching endpoints do not conflict.

If a dropped row already exists, it is updated to `enrolled` and `enrolled_at = NOW()`. Otherwise a row is inserted. The inserted status is whatever the database defaults to. The rest of the app assumes that default is `enrolled`. See [Data model](data-model.md).

`failed` does not count as passed, so a failed course can be registered again. Cumulative GPA then keeps only the latest published attempt of that course. The earlier attempt stays on its term. See [Grades and transcript](grades-and-transcript.md).

### Drop

`DELETE /api/enrollments/:id` where `:id` is the enrollment id, and the row's `student_id` must be the caller.

- Missing row → `404 NOT_FOUND`.
- Status other than `enrolled` → `409 NOT_ENROLLED`.
- Window closed → `403 REGISTRATION_CLOSED`.
- Success sets `dropped` and returns `{ ok: true }`.

Drop is not wrapped in `withTx`. It is one update. It does not delete grades or attendance.

### Credit cap

From `maxCredits` in `services/gpa.js`. The CGPA inside it uses the latest published attempt of each course (`completed` or `failed`). An earlier attempt of that course does not change the cap. See [Grades and transcript](grades-and-transcript.md).

| Standing | Max hours this term |
|---|---|
| `cgpa === null` (no published graded rows in those statuses) | 18 |
| `cgpa < 2` | 14 |
| `cgpa < 3` | 18 |
| `cgpa >= 3` | 21 |

The boundary is exact: `2.00` allows 18, `3.00` allows 21. The hours already counted against the cap are this semester's occupying rows (`enrolled`, `completed`, and `failed`), not only `enrolled`.

## Client behavior

`Registration.jsx` loads offerings (optional `q` and `department_id`), `/enrollments/me`, and `/departments`. For a student, those three reads are already limited to the departments in [Program visibility](#program-visibility). "My courses" is not filtered again: an existing enrollment stays on the schedule even when its department would not be offered to a new registrant. The department dropdown only lists departments the student may use. Choosing one the server rejects returns an empty offering list.

The register button is hidden when the offering is already enrolled, passed, missing prerequisites, or full. Those are display rules. The button is also disabled when the window is closed or a request is in flight. The server still checks time conflicts and the credit cap, which the row does not pre-compute. Those failures show up through `errorText`.

Drop calls `DELETE /enrollments/:enrollment_id`.

Success and failure both reload offerings and "my courses".

A failed load of "my courses" or the offering list shows `LoadError` with retry. An empty table shows `reg.none`. A failed department list shows the same error above the offering table and leaves the filter on "all".

## Dependencies and interactions

- Offerings list: [Offerings](offerings.md).
- GPA inputs: [Grades and transcript](grades-and-transcript.md).
- Student home links here when `registration_open` is true.
- The smoke test covers prerequisite block, already passed, duplicate, time conflict, drop, re-register, capacity, same-course second section, and a closed window. See [API smoke test](api-smoke-test.md).

## Current status

**Complete** for the nine server rules, the occupying-status rule, program visibility, and the student registration screen.

Editing a published grade sets that enrollment back to `enrolled` and clears the published letter until the instructor publishes again. See [Grades and transcript](grades-and-transcript.md).

## Implementation details and gotchas

- The capacity lock is per offering id. Two different offerings do not share the lock.
- `COURSE_ALREADY_IN_SEMESTER` looks only at `enrolled` rows. A `dropped` or `completed` row of another section does not block. Combined with `ALREADY_PASSED`, a completed course is blocked anyway. A dropped other section does not block.
- Prerequisite check is "completed", not "letter better than F". `completed` is only written when publish computes `points > 0`, so F is `failed` and does not satisfy a prerequisite.
- There is no waitlist, no add/drop reason, and no admin override endpoint.
- `registration_open` on read uses the same `CURDATE() BETWEEN` expression as the write check. Time of day is ignored. The window is date-based on the database server.
- The empty-semester response hardcodes `max_credits: 18` even if a student with no current semester would have a different cap. That response is only used when the semester row is missing.

## Program visibility

`backend/src/domain/visibility.js` decides the department codes. `GET /api/courses`, `GET /api/courses/:id`, `GET /api/departments`, and `GET /api/offerings` apply it when `req.user.role` is `student`. A hidden course detail is `404 NOT_FOUND`. Registering an offering outside the set is `403 OUT_OF_PROGRAM`, before the registration window is checked. Admins and instructors receive every department, course, and offering. Offerings and meetings are not deleted or reassigned by this rule.

| Student's department | Departments they can see |
|---|---|
| `CSE`, `ECE`, `EPC`, or `EE` | `CSE`, `ECE`, `EPC`, `EE`, `BSE`, `UNIVREQ`, `ELECT1`, `ELECT2` |
| `CBE` | `CBE`, `BSE`, `UNIVREQ` |
| `MEP`, `MEM`, or `MED` | That department, `BSE`, `UNIVREQ` |
| `ARC` | `ARC`, `BSE`, `UNIVREQ` |
| `BSE` | `BSE`, `UNIVREQ` |
| Any other code | That code, `BSE`, `UNIVREQ` |

`UNIVREQ` is University Requirements. `ELECT1` and `ELECT2` are the elective groups, included for the electrical programs. A student with no department row sees nothing and cannot register. A `department_id` query outside the set returns an empty list. It does not widen it.

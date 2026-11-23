# Offerings and meetings

## Overview

An offering is one section of a course in one semester, taught by one instructor, with a seat capacity and zero or more weekly meetings. Students register into offerings, not into bare courses.

## Purpose and responsibilities

- List offerings for a semester, with seats taken and meeting times.
- For a student caller, add `enrolled`, `passed`, and `prereq_missing` so the registration screen can disable rows.
- Let an admin create, replace, and delete offerings and their meetings.
- Validate day, time, room, and meeting type before write.

## Key files

| Path | Responsibility |
|---|---|
| `backend/src/routes/offerings.js` | HTTP |
| `backend/src/utils/meetings.js` | `attachMeetings`, `validateMeetings`, `saveMeetings`, `DAYS` |
| `frontend/src/pages/admin/AdminOfferings.jsx` | Semester picker and offering editor |
| `frontend/src/pages/student/Registration.jsx` | Reads `GET /offerings` |
| `frontend/src/components/WeeklySchedule.jsx` | Renders meetings by day |
| `frontend/src/utils/format.js` | `DAYS` and `hhmm` (first five characters of a time string) |

## Data flow

`GET /api/offerings` requires authentication. Any role. A student only receives offerings whose course department is in [Program visibility](registration.md#program-visibility). Admins and instructors receive every offering in the semester. The rows themselves are unchanged by that filter.

Query:

- `semester_id` optional. If missing, the row with `is_current = 1` is used. If no current semester exists, the response is `[]`.
- `department_id` optional.
- `q` optional. Matches course code or either course name.

Each row includes offering id, section, capacity, semester id, instructor id, course fields (`course_id`, `code`, names, `credit_hours`, `has_practical`), department code and names, instructor names, and `enrolled_count` (enrollments with status `enrolled` only).

`attachMeetings` loads `offering_meetings` for those ids and sorts by Saturday-first weekday order, then `start_time`. The MySQL `FIELD(...)` order is `Sat, Sun, Mon, Tue, Wed, Thu`.

Student-only extra fields:

- `enrolled`: this user has an `enrolled` row for this offering id.
- `passed`: this user has any `completed` enrollment whose offering's `course_id` matches.
- `prereq_missing`: prerequisite course codes not in that passed set.

A dropped enrollment does not set `enrolled`. A `failed` enrollment does not set `passed`, so the course can be taken again. A `completed` enrollment sets `passed` even if it was a different semester.

Admin writes (`authorize('admin')`):

- `POST /api/offerings` → `201 { id }`.
- `PUT /api/offerings/:id` → `{ ok: true }`.
- `DELETE /api/offerings/:id` → `{ ok: true }` or `409 IN_USE`.

Body: `course_id`, `semester_id`, `instructor_id` required. `capacity` defaults to 40 and must be a number greater than 0 (`MISSING_FIELDS` otherwise). `section` defaults to `'1'`. `meetings` is validated. Writes run in `withTx`. Update replaces meetings by deleting them and inserting the posted list.

`validateMeetings`:

- Non-array becomes `[]`.
- Each item needs `day_of_week` in `DAYS`, start and end matching `HH:MM` or `HH:MM:SS`, start string less than end string, a non-empty room, and `type` in `lecture | section | lab` (default `lecture`).
- Any bad item throws `400 INVALID_MEETING` and nothing is saved.

The admin form can submit zero meetings. The smoke test does that for a capacity check.

## Weekly schedule component

`WeeklySchedule` takes `{ day_of_week, start_time, end_time, room, type, code, name_ar, name_en }`. It renders six columns, Saturday through Thursday. Empty days show an em dash. Slot color classes are `slot-lecture`, `slot-section`, and `slot-lab` (styles in `index.css`).

`DoctorHome` and `Schedule` flatten offering meetings into that shape. The registration page prints meetings as a text line instead of the week grid.

## Dependencies and interactions

- Registration conflict detection compares `offering_meetings` of the target with meetings of the student's other `enrolled` offerings in the same semester. See [Registration](registration.md).
- Instructor home reads a different route, `GET /api/instructor/offerings`, which is limited to that instructor. Admins and students use `GET /api/offerings`.
- Seat count on this list is `status = 'enrolled'` only. Completed and failed rows from a past publish do not consume seats. During the current term, publish moves students to `completed` or `failed`, which drops them out of `enrolled_count` and out of the student's "my courses" list.

## Current status

**Complete** for admin editing and for the student/instructor views that read meetings.

**Partial** for the link between a meeting and attendance: sessions store `meeting_id` but no screen sends it, and no screen shows which weekly meeting a session belonged to.

## Implementation details and gotchas

- `PUT` does not check that the offering id exists. Updating a missing id still returns `{ ok: true }` and then deletes/inserts meetings for that id (the meeting insert would fail the FK if the offering row is gone, which becomes `INVALID_REFERENCE`).
- Time overlap uses string comparison. Equal endpoints do not overlap: `09:00–11:00` and `11:00–13:00` are allowed. That check lives in registration, not in offering save. An admin can create two of their own sections that overlap. The conflict is enforced per student, not per instructor or room.
- Room double-booking is not checked.
- `hhmm` slices times to five characters, so `09:00:00` from MySQL displays as `09:00`. The editor writes `HH:MM` from `<input type="time">`.
- Deleting an offering with enrollments depends on a foreign key. The code comment states that intent. The constraint itself is not in the repo.

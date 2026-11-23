# Grades, GPA, and transcript

## Overview

Instructors enter component scores for their own offerings, save them as an unpublished draft, then publish. Publish assigns a letter and grade points, changes the enrollment status, and notifies the student. Students read published rows on the grades page and the transcript. GPA and the registration credit cap use the same published rows.

## Purpose and responsibilities

- Define component maximums for courses with and without a practical component.
- Reject out-of-range scores.
- Compute a total only when every required component is filled.
- Map a total to a letter and points.
- Compute term GPA and cumulative GPA.
- Hide unpublished rows from students.

## Key files

| Path | Responsibility |
|---|---|
| `backend/src/services/gpa.js` | Scale, maximums, total, standing, credit cap |
| `backend/src/routes/instructor.js` | Offerings, roster, save, publish |
| `backend/src/routes/student.js` | Summary, grades, transcript |
| `backend/src/services/notify.js` | Insert used on publish |
| `frontend/src/pages/doctor/OfferingRoster.jsx` | Grade grid |
| `frontend/src/pages/student/Grades.jsx` | Published components |
| `frontend/src/pages/student/Transcript.jsx` | Printable transcript |
| `frontend/src/pages/student/StudentHome.jsx` | CGPA and hours |
| `frontend/src/utils/format.js` | `gradeTotal` mirrors the server sum for the unsaved grid |

## Grade scale

`gradeFromTotal` walks this table and returns the first row whose minimum is `<=` the total. The total is the sum of components, not a rescaled 100 beyond that sum. Component maximums add up to 100.

| Minimum total | Letter | Points |
|---|---|---|
| 97 | A+ | 4.0 |
| 93 | A | 4.0 |
| 89 | A- | 3.7 |
| 84 | B+ | 3.3 |
| 80 | B | 3.0 |
| 76 | B- | 2.7 |
| 73 | C+ | 2.3 |
| 70 | C | 2.0 |
| 67 | C- | 1.7 |
| 64 | D+ | 1.3 |
| 60 | D | 1.0 |
| 0 | F | 0 |

A total below 0 still returns F. The save path rejects negatives before that.

### Component maximums

| Component | `has_practical` true | `has_practical` false |
|---|---|---|
| coursework | 20 | 30 |
| midterm | 20 | 20 |
| practical | 10 | 0 |
| final_exam | 50 | 50 |

On save, a non-practical course forces `practical` to null. A value above the maximum, below 0, or not a finite number → `400 INVALID_GRADE` with `{ field, max }`. Empty, null, or `''` stores null for that component.

`computeTotal` returns null if any required component is null or undefined. Required keys are all four when the course has a practical, otherwise coursework, midterm, and final. The sum is rounded to two decimal places (`Math.round(n * 100) / 100`).

The roster UI uses the same required-key rule in `gradeTotal` so the total column updates before save. The letter column shows the stored letter, which stays empty until publish.

## Instructor flow

`GET /api/instructor/offerings` — current semester unless `semester_id` is passed. The UI does not pass it. Each row has section, capacity, course fields, `enrolled_count` (occupying statuses), `pending_grades` (status `enrolled` and no grade total), `open_session_id` if an attendance session is open, and meetings.

`GET /api/instructor/offerings/:id/roster` — only if `instructor_id` is the caller, else `404 NOT_FOUND`.

Students included: enrollment status `enrolled`, `completed`, or `failed`. Each student includes component scores, total, letter, points, `published` (0 when no grade row), and `attended` (records on closed sessions). `total_sessions` is the count of closed sessions. Response also includes `max` from `maxes(has_practical)`.

`PUT /api/instructor/offerings/:id/grades` body `{ grades: [{ enrollment_id, coursework, midterm, practical, final_exam }] }`.

For each item, inside one transaction:

- Enrollment must belong to this offering and be `enrolled`, `completed`, or `failed`. Otherwise `400 INVALID_ENROLLMENT` rolls back the batch.
- Unchanged component values are skipped (`saved` does not increment).
- Upsert sets `total`, sets `letter` and `points` to null, and sets `published` to 0.
- Enrollment status is set back to `enrolled`.

Response `{ saved }` is the number of rows that actually changed.

`POST /api/instructor/offerings/:id/grades/publish`

Selects grade rows for this offering with `total` not null and `published = 0`. For each:

- Sets letter and points from `gradeFromTotal`.
- Sets `published = 1`.
- Sets enrollment status to `completed` if `points > 0`, else `failed`. The course stays on the current schedule, registration list, attendance list, and credit load because those queries include `completed` and `failed`. See [Registration](registration.md).
- Notifies that student: type `grades_published`.

Response `{ published, pending }`. `pending` counts enrollments still `enrolled` whose grade row is missing or whose `total` is null. Publish does not fail when some students are incomplete. It does not republish rows that are already published.

## Student flow

All three routes require role `student`.

`GET /api/student/summary`

- `standing`: `{ cgpa, credits_attempted, credits_earned }` from `getStanding`.
- `semester`: current semester id, names, and `registration_open`, or null.
- `current`: `{ courses, credits }` for occupying rows (`enrolled`, `completed`, `failed`) in that semester.
- `max_credits`: from `maxCredits(standing)`.

`GET /api/student/grades`

Published `completed` and `failed` rows only, newest semester first. Each row includes `enrollment_id`, components, total, letter, points, hours, `has_practical`, semester names, `max`, and `replaced`. `replaced` is true when a later published attempt of the same course is the one counted in the cumulative GPA.

`GET /api/student/transcript`

Student identity (names, code, level, admission year, department) or `404 NOT_FOUND` if the joins fail.

Semesters are built in `start_date` order. Each course includes `enrollment_id`, code, names, hours, total, letter, points, and `replaced`. Each semester adds `gpa`, `credits_attempted`, and `credits_earned` from every published course in that term, including a course later replaced. Top-level `standing` uses the same repeat rule as `getStanding`.

Term GPA is the historical record of that term: `sum(hours * points) / sum(hours)` for every published course in the term, rounded to two decimals. It still includes an attempt that cumulative GPA later ignores. Pass-only rows add their hours to the term `credits_earned` and are left out of the term `gpa` and `credits_attempted`. A term with only pass-only rows has `gpa: null`.

Cumulative GPA keeps one published attempt per course. The winner is the attempt whose semester `start_date` is latest. If two attempts share that date, the higher `enrollment_id` wins. Earlier attempts stay on the transcript with `replaced: true` and do not add hours or quality points to `standing`. `credits_earned` adds hours only when that counted attempt has `points > 0`. A counted F adds attempted hours and zero quality points. A replaced F does neither. A pass-only grade (`PP` or `P`, see `isPassOnly` in `services/gpa.js`) is published with `points` null. When it is the counted attempt, it adds its hours to `credits_earned` only. It adds nothing to `credits_attempted` or quality points, so it never changes `cgpa`.

`standingFromAttempts` in `services/gpa.js` is the only implementation of that choice. `getStanding` loads the published rows and calls it. The transcript builds `standing` from the same function on the rows it already loaded.

`cgpa` is null when no such rows exist.

## Worked numbers from the seed and the smoke test

Seed writes published Spring grades for student `20250001`. `computeTotal` plus the scale yields the points the smoke test depends on:

| Course | Hours | Components | Total | Letter | Points | Quality |
|---|---|---|---|---|---|---|
| CS101 (practical) | 3 | 19, 18, 9, 49 | 95 | A | 4.0 | 12.0 |
| MTH101 | 3 | 26, 16, null, 40 | 82 | B | 3.0 | 9.0 |
| ENG101 | 2 | 27, 17, null, 45 | 89 | A- | 3.7 | 7.4 |
| IS101 | 3 | 24, 15, null, 38 | 77 | B- | 2.7 | 8.1 |

Quality sum 36.5 over 11 hours → CGPA `3.32`. Each of those courses is a first attempt, so the repeat rule does not drop any of them. The smoke test asserts `standing.cgpa === 3.32` and `credits_earned === 11`.

After it publishes CS102 as 18+17+9+45 = 89 → A- → 3.7, over 3 hours: `(36.5 + 11.1) / 14 = 3.4`, and `credits_earned === 14`. CS102 is also a first attempt. The smoke test asserts both. A later published attempt of the same course would replace the earlier one in CGPA only. The old term GPA would stay as printed for that term.

## Client behavior

The roster keeps edits in component state. Save sends only dirty enrollment ids. Publish is disabled while `dirty` is true, so unsaved inputs are not published. The hint string tells the instructor that a later edit must be published again.

`Grades.jsx` groups by semester in the order returned (newest first). A replaced row is muted and tagged `grade.replaced`. The row key is `enrollment_id`.

`Transcript.jsx` shows a print button that calls `window.print()`. `index.css` hides `.no-print` (the app chrome and the print button), shows `.print-head` (brand and title), and avoids breaking inside a semester block. A replaced row uses the same tag. When any row is replaced, the page shows `transcript.repeatNote` above the cumulative summary.

`StudentHome` shows CGPA, earned hours, and `current.credits / max_credits`.

## Dependencies and interactions

- Publish notifications: [Messaging and notifications](messaging-and-notifications.md).
- Credit cap: [Registration](registration.md).
- Practical flag: [Catalog](catalog.md).
- Attendance columns on the roster: [Attendance](attendance.md). They are display-only. Attendance does not change the grade in this code.

## Current status

**Complete** for draft save, publish, student grades, transcript, term GPA, and cumulative GPA with latest-attempt replacement.

## Implementation details and gotchas

- Saving after publish unpublishes that student, clears letter and points, and sets the enrollment back to `enrolled`. Until republish, the course leaves the transcript and the CGPA, and it reappears on the current schedule if the offering's semester is the current one.
- Publish uses the stored `total`. It does not recompute from components. A manual database edit of `total` would be what gets a letter.
- `points > 0` is the pass test. D is 1.0 and passes. F is 0 and fails. There is no separate incomplete grade. The exception is a pass-only letter (`PP`, `P`), which earns its hours with `points` null. The instructor publish flow never produces one. Such rows come only from imports, currently the ACU import for `51910313`. The current frontend prints a null `points` as `0.0` on the transcript and tags the letter in red on the grades page.
- The instructor cannot publish another instructor's offering (`ownOffering` → `404`).
- Students cannot read unpublished CS102 rows. The smoke test asserts the grades list has no CS102 before publish.
- Grades and transcript rows are keyed by `enrollment_id`. A failed attempt and a later attempt of the same course are two rows. `ALREADY_PASSED` still blocks a second registration after a `completed` attempt. A `failed` attempt can be retaken, and only the latest published attempt enters CGPA.
- Transcript semester GPA divides by attempted hours in that term, including F and including an attempt that cumulative GPA has replaced. Term GPAs therefore do not average to the CGPA after a retake.
- `StudentHome` and the summary treat `cgpa` null as an em dash in the UI (`?? '—'`).

# Student UI

## Overview

Student pages live under `frontend/src/pages/student` and are mounted in `App.jsx` behind `ProtectedRoute` with `roles={['student']}`. They call the student, enrollment, offering, and attendance APIs. They do not contain academic rules of their own except the buttons hidden on the registration table.

## Purpose and responsibilities

Show the signed-in student's standing, let them add and drop sections while registration is open, show the week, published grades, a printable transcript, and attendance.

Colors come from the shared tokens in [Frontend shell](frontend-shell.md), including dark mode. Enrolled and a passing letter use success. A completed enrollment uses info. Failed, full, and an absence warning use error. A late scan uses the warning alert. A replaced attempt uses the muted tag. Lecture, section, and lab slots use primary, success, and warning. A printed transcript uses the light palette.

## Key files

| Path | Route | API |
|---|---|---|
| `pages/student/StudentHome.jsx` | `/student` | `GET /student/summary`, `GET /enrollments/me`, `GET /attendance/me`, `GET /student/grades` |
| `pages/student/Registration.jsx` | `/student/registration` | `GET /offerings`, `GET /enrollments/me`, `GET /departments`, `POST /enrollments`, `DELETE /enrollments/:id` |
| `pages/student/Schedule.jsx` | `/student/schedule` | `GET /enrollments/me` |
| `pages/student/Grades.jsx` | `/student/grades` | `GET /student/grades` |
| `pages/student/Transcript.jsx` | `/student/transcript` | `GET /student/transcript` |
| `pages/student/Attendance.jsx` | `/student/attendance` | `GET /attendance/me` |
| `pages/student/Attend.jsx` | `/attend` | `POST /attendance/scan` |

## Data flow

### Home

Welcomes the user with `pick(full_name_ar, full_name_en)`. Shows `user.student.student_code` and department when `/auth/me` has filled `user.student`. `login()` stores that profile, so it is present after a normal sign-in.

Three stats: CGPA (em dash when null), credits earned, and `current credits / max`. If the current semester has `registration_open`, a card links to registration. That link is omitted when the window is closed.

The schedule card loads `GET /enrollments/me` and draws `WeeklySchedule`. Under attendance, the next remaining class day in the Sat–Thu week is listed from those same meetings. Friday has no classes, so the next day is Saturday. After the last meeting of a day, the list moves to the next day that has a meeting. There is no future-session feed: an instructor opens attendance live, and the student still records it by scanning the QR.

The attendance table is the current-term `/attendance/me` rows (attended, absent, warning). A warning is also an alert. Recent grades are the first five published rows from `GET /student/grades`, with the letter tag and `grade.replaced` when set. Each card links to the full page. A failed request shows `LoadError` with retry inside that card. An empty schedule or attendance list shows `reg.none`. An empty grade list shows `grades.none`.

### Registration

Filters offerings by search text and department. Those values are sent as query parameters, so each keystroke refetches. The server already limits both the offering list and the department dropdown to the student's program. See [Program visibility](registration.md#program-visibility). The page does not keep a second copy of that rule. "My courses" still lists every current enrollment, including a course the student could not newly register.

"My courses" lists code, name, hours, a text schedule, and a drop button. The button is disabled when a request is in flight or `registration_open` is false. The footer shows `total_credits / max_credits`.

The available table shows instructor, seats `enrolled_count/capacity`, and one of: completed tag (`info`), failed tag (`err`), registered tag (`ok`), passed tag (`muted`), missing-prereq tag (`warn`), full tag (`err`), or a register button. The register button is also disabled when the window is closed. A completed row in "my courses" uses the same info tag.

Server errors such as time conflict and credit limit appear in `Alert` via `errorText`, which appends the conflicting course or the credit numbers. A failed load of "my courses" or the offering list shows `LoadError` with retry. An empty table shows `reg.none`. A failed department list shows the same error and leaves the filter on "all".

### Schedule

Flattens `courses[].meetings` into `WeeklySchedule`. Empty enrollment shows `reg.none`. The heading includes the semester name.

### Grades

Groups the published list by `semester_id` in response order (newest semester first). Columns: course, coursework, midterm, practical (em dash when `has_practical` is falsy), final, total, letter. The letter tag is `tag-ok` when `points > 0` and `tag-err` otherwise. A row with `replaced` is muted and shows `grade.replaced`. The row key is `enrollment_id`. An empty list shows `grades.none`. A failed load shows `LoadError` with retry.

### Transcript

Print button calls `window.print()`. On screen the brand header (`.print-head`) is `display: none`. Print CSS shows it and hides `.no-print`. Identity block: name, code, department, level, admission year. Each semester table: code, name, hours, total, letter, points to one decimal. A replaced attempt is tagged and does not enter the cumulative summary. When any attempt is replaced, `transcript.repeatNote` appears above that summary. The term footer still includes every published course in the term. Summary box: CGPA, attempted, earned. `standing.cgpa?.toFixed(2)` is blank-safe when CGPA is null (`undefined` renders nothing inside `<strong>`). An empty semester list shows `grades.none`. A failed load shows `LoadError` with retry.

### Attendance list

Info alert with the QR how-to. Table: course, closed session count, attended, absent count and percent, and either an error tag (`att.warning`) or a tag whose text is the literal `OK` (not a translation key).

### Scan page

Reads `s` and `t`. Posts `{ session_id: Number(s), token }`. States: `loading`, `none` (missing query), `error`, `already`, and `ok`. `already` is the `ALREADY_RECORDED` success. A later duplicate does not replace `ok`, and a later error does not replace `already`. Success copy depends on `data.status === 'late'`. A late result uses the warning alert. A present result uses the success alert. A link points at `/student/attendance`.

## Dependencies and interactions

- Shell and `useFetch`: [Frontend shell](frontend-shell.md).
- Rules: [Registration](registration.md), [Grades and transcript](grades-and-transcript.md), [Attendance](attendance.md).
- Catalog link in the nav is the shared catalog, not a student-specific page. For a student, `GET /courses`, `GET /courses/:id`, and `GET /departments` return only the departments in [Program visibility](registration.md#program-visibility). An admin or instructor using the same page still receives the full catalog. A course outside the set is `404` on detail. The registration screen uses the same limit on `GET /offerings`, and `POST /enrollments` rejects a hidden offering with `OUT_OF_PROGRAM`.

## Current status

**Complete** for the seven screens and the APIs they call.

**Complete** for the profile on first login (`login()` stores `/auth/me`) and for a failed home, schedule, grades, transcript, or attendance load (`LoadError` instead of an endless loading line). The home draws each card on its own, so one failed request does not hide the others.

## Implementation details and gotchas

- Registration search has no debounce. Each change rebuilds the query string and `useFetch` depends on `url`.
- The full-section tag uses `enrolled_count >= capacity`. That matches the server count of occupying rows. A race can still return `SECTION_FULL` if the last seat is taken after the list loaded.
- Registration and each home card show `LoadError` with retry when their GET fails. An empty registration, schedule, or catalog result shows `reg.none`. The home grade card uses `grades.none`.
- Schedule and registration both use the current semester only. The API accepts `semester_id`. These pages do not.
- Grades practical cell uses truthiness of `has_practical`. MySQL `0`/`1` works. A string `"0"` would be truthy. The API returns the raw column.
- `/attend` requires the student role. An instructor who opens a QR link is redirected to `/doctor`.
- The attendance "OK" label is hardcoded English.

# Instructor UI

## Overview

Instructor screens are under `frontend/src/pages/doctor` and use the URL prefix `/doctor`. The API role is `instructor`. The nav label comes from `role.instructor` ("دكتور" / the English translation).

## Purpose and responsibilities

List the instructor's current-semester offerings, open QR attendance, edit draft grades, publish them, and review past sessions.

Colors come from the shared tokens in [Frontend shell](frontend-shell.md), including dark mode. A published grade and a live session use success. A draft uses the muted tag. The manual status control outlines present in success, late in warning, and absent in error. Closing a session uses the error button. The QR tile stays white in both themes, and the code itself is drawn dark on white.

## Key files

| Path | Route | API |
|---|---|---|
| `pages/doctor/DoctorHome.jsx` | `/doctor` | `GET /instructor/offerings`, `POST /attendance/sessions` |
| `pages/doctor/OfferingRoster.jsx` | `/doctor/offerings/:id` | roster, grade save, grade publish, session list |
| `pages/doctor/AttendanceSession.jsx` | `/doctor/attendance/:id` | session detail, token, close, manual mark |

## Data flow

### Home

Loads offerings for the current semester (no query string). Three stats: section count, the sum of `pending_grades`, and how many sections have `open_session_id`.

`pending_grades` is the count of enrollments still `enrolled` with no grade total. It is not the occupying-status count.

Two short tables follow. Open sessions list only live sections and post the same `{ offering_id }` call, which returns the existing open session. Pending grades list sections with a count above zero and link to the roster. An empty list uses `home.noneOpen` or `home.nonePending`.

The full section table shows code, name, `enrolled_count/capacity`, pending count, and a short meeting list (day and start only).

Actions on that table:

- Link to the roster (`doc.gradesStudents`).
- Button posts `{ offering_id }` and navigates to `/doctor/attendance/<id>`. Label is `doc.continueAtt` when `open_session_id` is set, otherwise `doc.startAtt`.
- A live tag when a session is open.

Below the table, `WeeklySchedule` shows every meeting of those offerings. An empty offering list shows `reg.none` in the section table.

Errors from starting attendance use `errorText` in `actionError`, above the stats.

### Roster

Loads `/instructor/offerings/:id/roster` and `/attendance/offering/:id/sessions`.

Header links back to `/doctor`. The hint (`roster.hint`) says to save, then publish, and that an edit after publish must be published again.

The grid columns are student code, name, `attended/total_sessions`, coursework, midterm, practical only when `has_practical` is true, final, a live total from `gradeTotal`, the stored letter, and a published or draft tag.

Inputs are `type="number"` with `min="0"`, `max` from the server `max` object, and `step="0.5"`. Edits live in component state keyed by enrollment id. The displayed value is the edit if present, otherwise the server value, otherwise `''`.

Save is enabled when there is at least one edited id. It sends all four keys for those students. Empty string becomes null. Success clears edits, reloads, and shows `roster.saved` plus `saved`.

Publish is enabled only when there are no local edits. It shows `published` and `pending` counts.

The history table lists session id, date, `present_count`, and a link. Open sessions use `att.live`. Closed sessions use `att.view`. An empty history shows `reg.none`.

### QR session

Polls `GET /attendance/sessions/:id` every 4 seconds. While the session is open, polls `GET .../token` every 20 seconds and renders `QRCodeSVG` at 280 pixels with `includeMargin`. Close posts `.../close`, clears the token, and reloads. A failed close or manual mark stays in the action alert via `errorText`.

Each student has a `<select>` of `present`, `late`, `excused`, `absent`. The control adds `status-present`, `status-late`, or `status-absent`, which only changes the border color. Excused keeps the default border. Change calls `PUT .../students/:studentId`. Null status is shown as `absent`.

A link returns to `/doctor/offerings/<offering_id>`.

Before the first successful load, a failure shows `LoadError` with retry instead of a spinner. A later poll failure shows the same banner above the roster that is already on screen, and the next successful poll clears it. A token request that fails before any code exists shows `LoadError` with retry in the QR card. If a code is already on screen, that code stays and the same error appears under it.

## Dependencies and interactions

- Grade math and publish side effects: [Grades and transcript](grades-and-transcript.md).
- QR and warning rules: [Attendance](attendance.md).
- Messages are the shared page, linked from `Layout`, not from these screens.

## Current status

**Complete** for the three instructor screens that exist.

**Partial** for term selection: the API accepts `semester_id` on instructor offerings, and the UI always uses the current semester. Closed sessions still show the manual status control.

## Implementation details and gotchas

- `DoctorHome` shows `LoadError` when the offerings request fails. A failure while opening attendance is a separate alert (`actionError`) and does not replace the list.
- The roster shows `LoadError` with retry when its request fails. The session history under it does the same, instead of looking empty. An empty history row says `reg.none`.
- The live session page uses `LoadError` with retry for the first roster load and for a failed QR token. Close and manual-mark failures stay on the action alert.
- Local totals can show a number the server will reject (for example coursework above `max` if the browser ignores `max`, or a value the server checks more strictly). The server returns `INVALID_GRADE` and `errorText` appends the field and max.
- Publish does not send the grid. It publishes whatever is already saved. The disabled state while dirty is what keeps the two steps in order.
- The practical column is omitted for non-practical courses. `gradeTotal` also ignores practical in that case.
- Starting attendance does not pass `meeting_id`, so the session is not tied to a weekly slot in the UI.
- The QR encodes the frontend origin. See [Architecture](architecture.md).

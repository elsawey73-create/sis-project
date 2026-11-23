# Catalog

## Overview

The catalog is departments, courses, prerequisites, and semesters. Any signed-in user can read it. A student only receives the departments their program may take. Admins and instructors receive the full list. Only an admin can change it. The instructor picker used when creating offerings is admin-only. The department set is in [Program visibility](registration.md#program-visibility).

Routes live in `backend/src/routes/catalog.js` and are mounted at `/api`, so the paths are `/api/departments` and `/api/courses`, not `/api/catalog/...`.

## Purpose and responsibilities

- Store the permanent course list (not the term-by-term schedule).
- Attach prerequisites to each course in list and detail responses.
- Keep at most one current semester when an admin marks one current.
- Expose instructors for the offering form.

## Key files

| Path | Responsibility |
|---|---|
| `backend/src/routes/catalog.js` | All catalog HTTP |
| `frontend/src/pages/shared/Catalog.jsx` | Read-only browser for every role |
| `frontend/src/pages/admin/AdminCatalog.jsx` | Department and course editor |
| `frontend/src/pages/admin/AdminOfferings.jsx` | Semester editor (calls these routes) |

## Data flow

### Departments

`GET /api/departments` returns rows ordered by `code`. A student receives only the departments in [Program visibility](registration.md#program-visibility). Other roles receive every department.

Admin writes:

- `POST /api/departments` `{ code, name_ar, name_en }` → `201 { id }`. Code is trimmed and uppercased.
- `PUT /api/departments/:id` same body → `{ ok: true }`. No check that the id exists. Zero rows updated is still 200.
- `DELETE /api/departments/:id` → `{ ok: true }`, or `409 IN_USE` when a foreign key blocks it.

### Courses

`loadCourses` selects courses joined to departments, then loads every prerequisite row in the database and groups them onto `course.prerequisites` as `{ id, code, name_ar, name_en }`.

`GET /api/courses` optional query:

- `department_id` exact match.
- `q` matched with `LIKE` against `code`, `name_ar`, and `name_en`.

`GET /api/courses/:id` returns one course or `404 NOT_FOUND`. A student also receives `404` when the course's department is outside their program. The list route applies the same department limit before `department_id` and `q`.

Admin create and update require `code`, `name_ar`, `name_en`, `credit_hours`, `department_id`. Optional: `description_ar`, `description_en`, `has_practical` (stored as 1 or 0), `prerequisites` (array of course ids).

Prerequisite writes run in a transaction: delete existing rows for that course, then insert each unique id that is not the course itself.

`DELETE /api/courses/:id` is a single delete. Referenced courses fail with `IN_USE`. The smoke test expects this for a course that has offerings.

### Semesters

`GET /api/semesters` returns every semester, newest `start_date` first, plus a computed `registration_open` (`CURDATE()` between the registration dates).

Create and update require all six date and name fields. `is_current` is stored as 1 or 0.

Date rules, compared as strings: `start_date >= end_date` or `registration_start > registration_end` → `400 INVALID_DATES`. ISO `YYYY-MM-DD` strings order correctly. Other formats are not validated.

If `is_current` is true, the transaction first clears `is_current` on every semester, then writes the target row. Updating a semester with `is_current: false` does not assign a new current semester. The database can be left with none.

There is no semester delete route and no UI delete button.

### Instructors

`GET /api/instructors` is admin-only. It returns `id` (the user id), `login_id`, both names, and both department names, ordered by `login_id`. The offering form uses `id` as `instructor_id`.

## Dependencies and interactions

- Registration reads `course_prerequisites` again on the server. The flags on `GET /api/offerings` (`passed`, `prereq_missing`) are a preview for the student UI. The enroll transaction does not trust the client.
- `has_practical` selects the grade scale in `services/gpa.js`.
- `credit_hours` is summed for the term credit cap.
- Catalog search is also what `Registration.jsx` uses indirectly: that page searches offerings, not courses. The shared catalog page searches courses.

## Current status

**Complete** for admin CRUD of departments and courses, semester create/update, and read-only catalog browsing.

**Partial** for semester lifecycle (no delete, no guarantee that one semester stays current) and for course integrity (no prerequisite cycle check, no credit-hour range check on the server).

## Implementation details and gotchas

- `GET` handlers require a token. The catalog is not public.
- Course update can change `code`, hours, practical flag, and department of a course that already has grades. Historical transcripts join the live `courses` row, so those edits change how old enrollments display.
- Prerequisite ids that do not exist fail the insert with `INVALID_REFERENCE`.
- The admin course form sends `prerequisites` as numeric ids taken from the loaded list. The server also skips the course's own id.
- `AdminCatalog` uses `window.confirm` with the translated `common.confirm` string before delete.
- Department and course list screens reload both lists after every successful write.

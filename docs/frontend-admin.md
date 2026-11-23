# Admin UI

## Overview

Admin pages are under `frontend/src/pages/admin`. They are the only UI that writes departments, courses, semesters, offerings, and users. Reads reuse the same GET routes as other roles.

## Purpose and responsibilities

Dashboard counts, catalog maintenance, term and section maintenance, and user creation plus password reset.

Colors come from the shared tokens in [Frontend shell](frontend-shell.md), including dark mode. Save and add use the primary button. Cancel and edit use the ghost button. Delete uses the error button. The current semester uses success. An open registration window uses success, and a closed window uses the muted tag. Form panels use the page background inside a surface card.

## Key files

| Path | Route | Main APIs |
|---|---|---|
| `pages/admin/AdminHome.jsx` | `/admin` | `GET /admin/stats` |
| `pages/admin/AdminCatalog.jsx` | `/admin/catalog` | departments and courses CRUD |
| `pages/admin/AdminOfferings.jsx` | `/admin/offerings` | semesters, offerings, courses, instructors |
| `pages/admin/AdminUsers.jsx` | `/admin/users` | `GET/POST /admin/users`, `PUT /admin/users/:id/password`, `GET /departments` |

## Data flow

### Home

Shows the current semester name or an em dash, then stats for students, instructors, courses, active offerings (current semester), and current-semester enrollments. The offering and enrollment stats name that semester. Quick links go to users, the catalog editor, offerings, and the read-only catalog. A failed stats load shows `LoadError` with retry. The page does not link to messages.

### Catalog

Two cards.

Departments: table of code and both names, delete with `confirm`, and an inline add form (code, Arabic name, English name). There is no department edit form, although `PUT /api/departments/:id` exists.

Courses: add/edit form with code, hours (number input 1–6), both names, department, practical checkbox, both descriptions, and a checkbox list of other courses as prerequisites. Save calls `POST /courses` or `PUT /courses/:id`. The table shows code, localized name, hours, prerequisite codes, edit, and delete with `confirm`.

`run` clears the message, performs the call, reloads both lists, and sets a success alert. Failures use `errorText`. If either list fails to load, the page shows `LoadError` with a retry that reloads both. An empty department table shows `reg.none`.

### Offerings

Semester card: add/edit form for both names, start, end, registration start, registration end (`input type="date"`), and an `is_current` checkbox. The table shows the localized name, a current tag, the registration dates, an open/closed tag from `registration_open`, and edit. No delete button. There is no delete route.

Offering card: a semester `<select>` defaults to the current semester id once semesters have loaded (`semId || current`). The list request is `GET /offerings?semester_id=`. A failed semester load replaces the page with `LoadError`. A failed offering list, course list, or instructor list shows `LoadError` with retry inside the card. An empty semester or offering table shows `reg.none`. Add/edit fields: course, instructor, section (default `1`), capacity (default 40), and a meeting editor (day, start, end, room, type, remove, add). Save includes `semester_id: sid`. Edit copies meetings through `hhmm` so time inputs receive `HH:MM`. Delete uses `confirm`.

### Users

Search box and role filter are query params on `GET /admin/users`. A failed user list shows `LoadError` with retry. A failed department list shows the same above the form. An empty user table shows `reg.none`. Create form: login id, password, Arabic name, English name, role, department unless role is admin, and email. The email label is the literal `Email`, not a translation key. Submit posts the form object and closes it. The table lists login id, localized name, role, and a button that `prompt`s for a new password and `PUT`s it.

`level` is not in the form. New students are level 1 on the server.

## Dependencies and interactions

- HTTP rules: [Catalog](catalog.md), [Offerings](offerings.md), [Admin](admin.md).
- Instructor ids in the offering form are user ids from `GET /instructors`.
- Creating a user does not sign them in. The smoke test checks that the new instructor can log in. The UI does not.

## Current status

**Complete** for the create and edit flows the forms implement.

**Partial** relative to the API: department update is unused, semester delete does not exist, user fields other than password cannot be edited, and the user list is capped at 300 with no pager.

## Implementation details and gotchas

- `confirm` and `prompt` are the browser dialogs. They are not styled and not translated except for the confirm message and the password prompt string.
- Course hours are constrained to 1–6 in the input. The API accepts any present `credit_hours`.
- Checking `is_current` on save clears the flag on every other semester first (server behavior). Unchecking it on the only current semester leaves no current semester. Offering lists then come back empty unless a `semester_id` is selected. The select on this page still lists semesters by id, so an admin can pick one explicitly. Student and instructor pages that omit `semester_id` follow `is_current` and would see an empty term.
- Offering save always sends the semester selected in the dropdown, including when editing a row that was loaded from that dropdown.
- Delete errors (`IN_USE`) surface as an alert. Success uses `common.saved` for deletes as well as saves.
- The department add form does not edit. Changing a code means delete and recreate, and delete fails when courses reference the department.

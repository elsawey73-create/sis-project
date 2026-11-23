# Admin

## Overview

The admin role manages users, reads dashboard counts, and uses the catalog and offering editors documented separately. Admin API routes are in `backend/src/routes/admin.js`, all behind `authenticate` and `authorize('admin')`.

## Purpose and responsibilities

- Count students, instructors, courses, current-semester offerings, and current-semester enrollments.
- Search users.
- Create a student, instructor, or admin.
- Replace any user's password.

## Key files

| Path | Responsibility |
|---|---|
| `backend/src/routes/admin.js` | Stats, users, password |
| `backend/src/server.js` | `GET /api/admin/ping` (not used by the UI) |
| `frontend/src/pages/admin/AdminHome.jsx` | Counts and links |
| `frontend/src/pages/admin/AdminUsers.jsx` | Search, create, password prompt |
| `frontend/src/pages/admin/AdminCatalog.jsx` | See [Catalog](catalog.md) |
| `frontend/src/pages/admin/AdminOfferings.jsx` | See [Offerings](offerings.md) |

## Data flow

### Stats

`GET /api/admin/stats`

```text
{
  semester: { id, name_ar, name_en } | null,
  students,        // users.role = student
  instructors,     // users.role = instructor
  courses,         // all courses
  offerings,       // course_offerings in the current semester, or semester id 0 if none
  enrollments      // status enrolled in that semester
}
```

`AdminHome` shows those five numbers and the current semester name.

### Users

`GET /api/admin/users`

Optional `role` and `q` (`login_id`, `full_name_ar`, `full_name_en`). Returns `id`, `login_id`, both names, `email`, `role`, `created_at`. Ordered by role then login id. Hard `LIMIT 300`.

`POST /api/admin/users`

Required: `login_id`, `password`, `full_name_ar`, and `role` in `student | instructor | admin`.

- Login id must match `^[A-Za-z0-9_-]{3,30}$` or `400 INVALID_LOGIN_ID`.
- Password length under 6 → `400 WEAK_PASSWORD`.
- Student or instructor without `department_id` → `400 MISSING_FIELDS`.

Transaction:

- Insert `users`. Optional `full_name_en` and `email` (email lowercased).
- Student: insert `students` with `student_code = login_id`, `level` from the body or `1`, `admission_year` = current year.
- Instructor: insert `instructors`.
- Admin: no extra row.

`201 { id }`. Duplicate login (or email, if the database unique key says so) → `409 DUPLICATE` via the global handler.

The UI form includes email and department. It does not send `level`, so created students get level 1. It does not send `full_name_en` as required. The API allows a null English name.

`PUT /api/admin/users/:id/password` body `{ password }`. Length under 6 → `WEAK_PASSWORD`. Otherwise updates `password_hash`. Response `{ ok: true }` even if the id matches no row (the update affects zero rows and still returns 200).

The UI uses `window.prompt` for the new password.

## Dependencies and interactions

- New instructors appear in `GET /api/instructors` and can be assigned to offerings.
- New students can log in and register. They have no prior grades, so `maxCredits` is 18 until a published grade exists.
- Catalog and offering writes are admin-only but are not implemented in `admin.js`. See those documents.
- Admins do not use enrollment, instructor, or message routers. They can call notification routes.

## Current status

**Complete** for counts, user search (up to 300), create, and password replace.

**Partial** for user administration: no edit of name, email, role, or department; no deactivate; no pagination. Password reset returns `404 USER_NOT_FOUND` when the id is missing. There is no public signup route.

## Implementation details and gotchas

- `GET /api/admin/ping` returns `{ message: 'Hello admin' }` for an admin token. The UI never calls it. The smoke test uses `/api/admin/stats` to prove a student token is forbidden.
- Dashboard course count is all courses, not "offered this term". Offering and enrollment counts are current-semester only.
- Creating an admin does not require a department. The form hides the department field when role is admin.
- Password reset does not invalidate existing JWTs. The old token works until it expires.
- The users table shows login id, name, role, and the reset button. Email and `created_at` are returned by the API and not shown.

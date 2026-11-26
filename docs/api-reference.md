# API reference

## Overview

Base path: `/api`. Default origin: `http://localhost:5000`. JSON in and out. Authenticated routes expect `Authorization: Bearer <jwt>`.

Unless a row says otherwise, failures use the codes in [Error codes](error-codes.md). Success bodies below are what the handlers pass to `res.json`.

This page is the route index. Rule details stay in the feature pages.

## Purpose and responsibilities

List every route registered in `backend/src`, the role allowed to call it, and the body the handler reads.

## Key files

`backend/src/server.js` and `backend/src/routes/*.js`, plus `backend/src/controllers/authController.js`.

## Auth

| Method and path | Role | Body / query | Success |
|---|---|---|---|
| `POST /api/auth/login` | public | `login_id`, `password` | `{ token, refresh_token, user }`. `token` expires in 7200 seconds. `refresh_token` expires in 7 days. `user` is unchanged |
| `POST /api/auth/refresh` | public | `{ refresh_token }` | `{ token }`. A new access token. The body field is required; the `Authorization` header is ignored |
| `POST /api/auth/forgot-password` | public | `identifier` (login id or email). `login_id` and `email` are aliases | `{ ok: true }` for known and unknown accounts. The reset link is emailed, not returned. See [Authentication](authentication.md) |
| `POST /api/auth/reset-password` | public | `token`, `password` | `{ ok: true }`. Increments `token_version` |
| `GET /api/auth/me` | any signed-in | | public user, plus `student` or `instructor` |
| `POST /api/auth/logout` | any signed-in | | `{ ok: true }`. Increments `token_version` |
| `PATCH /api/auth/language` | any signed-in | `{ lang: 'ar' \| 'en' }` | `{ lang }` |

## Catalog

Mounted at `/api`. Reads: any signed-in user. Writes: admin.

| Method and path | Body / query | Success |
|---|---|---|
| `GET /api/departments` | | department rows |
| `POST /api/departments` | `code`, `name_ar`, `name_en` | `201 { id }` |
| `PUT /api/departments/:id` | same | `{ ok: true }` |
| `DELETE /api/departments/:id` | | `{ ok: true }` |
| `GET /api/courses` | `department_id`, `q` | courses with `prerequisites` |
| `GET /api/courses/:id` | | one course |
| `POST /api/courses` | see [Catalog](catalog.md) | `201 { id }` |
| `PUT /api/courses/:id` | same | `{ ok: true }` |
| `DELETE /api/courses/:id` | | `{ ok: true }` |
| `GET /api/semesters` | | semesters plus `registration_open` |
| `POST /api/semesters` | names, four dates, `is_current` | `201 { id }` |
| `PUT /api/semesters/:id` | same | `{ ok: true }` |
| `GET /api/instructors` | admin only | instructor users |

## Offerings

| Method and path | Role | Body / query | Success |
|---|---|---|---|
| `GET /api/offerings` | any signed-in | `semester_id`, `department_id`, `q` | offerings with `meetings`. Students also get `enrolled`, `passed`, `prereq_missing` |
| `POST /api/offerings` | admin | `course_id`, `semester_id`, `instructor_id`, optional `section`, `capacity`, `meetings` | `201 { id }` |
| `PUT /api/offerings/:id` | admin | same | `{ ok: true }` |
| `DELETE /api/offerings/:id` | admin | | `{ ok: true }` |

## Enrollments

Role: student.

| Method and path | Body / query | Success |
|---|---|---|
| `GET /api/enrollments/me` | optional `semester_id` | `{ semester, courses, total_credits, max_credits }` |
| `POST /api/enrollments` | `{ offering_id }` | `201 { id }` |
| `DELETE /api/enrollments/:id` | enrollment id | `{ ok: true }` |

## Student records

Role: student.

| Method and path | Success |
|---|---|
| `GET /api/student/summary` | `{ standing, semester, current, max_credits }` |
| `GET /api/student/grades` | published rows, newest semester first. Each row includes `enrollment_id`, `max`, and `replaced` |
| `GET /api/student/transcript` | `{ student, semesters, standing }`. Each course includes `enrollment_id` and `replaced`. A semester GPA includes replaced rows. `standing` keeps the latest published attempt per course |

## Instructor

Role: instructor. Offering routes that take `:id` require `instructor_id = req.user.id`.

| Method and path | Body / query | Success |
|---|---|---|
| `GET /api/instructor/offerings` | optional `semester_id` | this instructor's offerings, including `pending_grades` and `open_session_id` |
| `GET /api/instructor/offerings/:id/roster` | | `{ offering, max, total_sessions, students }` |
| `PUT /api/instructor/offerings/:id/grades` | `{ grades: [...] }` | `{ saved }` |
| `POST /api/instructor/offerings/:id/grades/publish` | | `{ published, pending }` |

## Attendance

| Method and path | Role | Body | Success |
|---|---|---|---|
| `POST /api/attendance/sessions` | instructor | `{ offering_id, meeting_id? }` | `201 { id }` or `200 { id }` if already open |
| `GET /api/attendance/sessions/:id/token` | instructor, owner | | `{ session_id, token, expires_in }` |
| `GET /api/attendance/sessions/:id` | instructor, owner | | `{ session, students, present, total }` |
| `POST /api/attendance/sessions/:id/close` | instructor, owner | | `{ ok: true }` |
| `PUT /api/attendance/sessions/:id/students/:studentId` | instructor, owner | `{ status }` | `{ ok: true }` |
| `GET /api/attendance/offering/:id/sessions` | instructor, owner | | session list |
| `POST /api/attendance/scan` | student | `{ session_id, token }` | `{ status, course }` |
| `GET /api/attendance/me` | student | | per-offering totals and `warning` |

## Messages

Role: student or instructor.

| Method and path | Body | Success |
|---|---|---|
| `GET /api/messages/contacts` | | contact rows |
| `GET /api/messages/threads` | | thread summaries |
| `GET /api/messages/threads/:id` | | `{ thread, messages }` and marks received rows read |
| `POST /api/messages/threads` | `receiver_id`, `subject`, `body`, optional `offering_id` | `201 { id }` |
| `POST /api/messages/threads/:id/reply` | `{ body }` | `201 { ok: true }` |

## Notifications

Any signed-in role, including admin.

| Method and path | Success |
|---|---|
| `GET /api/notifications` | up to 50 rows, `data` parsed |
| `GET /api/notifications/summary` | `{ notifications, messages }` |
| `POST /api/notifications/read-all` | `{ ok: true }` |

## Admin

Role: admin.

| Method and path | Body / query | Success |
|---|---|---|
| `GET /api/health` | public, defined on the app | `{ status: 'ok', app: 'Unidex' }` |
| `GET /api/admin/ping` | | `{ message: 'Hello admin' }` |
| `GET /api/admin/stats` | | counts and current semester |
| `GET /api/admin/users` | `role`, `q` | up to 300 users |
| `POST /api/admin/users` | see [Admin](admin.md) | `201 { id }` |
| `PUT /api/admin/users/:id/password` | `{ password }` | `{ ok: true }` |

## Dependencies and interactions

The frontend calls every route in this table except `GET /api/health` and `GET /api/admin/ping`. There is no public signup route. Instructor `semester_id` and enrollment `semester_id` exist on the API and are not sent by the current pages (they use the current semester). `pending_grades` counts enrollments still `enrolled` whose grade row is missing or whose `total` is null. It does not count `completed` or `failed`.

## Current status

**Complete** relative to the source. No OpenAPI file is generated. No versioning prefix beyond `/api`.

## Implementation details and gotchas

- Unknown paths fall through Express and return its HTML 404, not `{ error: 'NOT_FOUND' }`. The client would treat that as `NETWORK` or `SERVER_ERROR` depending on whether Axios can parse JSON. The app router sends unknown frontend paths to `/`.
- List endpoints that return arrays do so as a bare JSON array, not `{ data: [] }`.
- Write endpoints that return `{ ok: true }` do not echo the saved row.

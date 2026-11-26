# Architecture

## Overview

Unidex is a two-process web application. The browser runs a React single-page app. A Node.js process serves a JSON API and reads and writes MySQL. There is no background worker, no message queue, and no separate auth service.

## Purpose and responsibilities

The architecture keeps three jobs apart:

- The client renders role-specific pages, stores the JWT in `localStorage`, and translates API error codes.
- The API checks the token, enforces role rules, and applies academic rules (registration, grades, attendance).
- MySQL holds users, catalog, enrollments, grades, attendance, messages, and notifications.

## Key files

| Path | Role |
|---|---|
| `frontend/src/main.jsx` | Mounts React in `StrictMode` |
| `frontend/src/App.jsx` | Route table |
| `frontend/src/api/axios.js` | Base URL and `Authorization` header |
| `backend/src/server.js` | Express app, route mounting, error handler |
| `backend/src/config/db.js` | Shared `mysql2` pool |
| `backend/src/middleware/auth.js` | JWT check and role check |
| `backend/src/services/` | Registration, GPA, notification insert |
| `backend/src/routes/` | HTTP handlers |

## Data flow

1. `index.html` sets `lang="ar"` and `dir="rtl"`. After load, `LanguageContext` sets `lang` and `dir` from `localStorage` (`ar` or `en`). Default is Arabic.
2. `AuthProvider` reads `localStorage.token`. If a token exists it calls `GET /api/auth/me`. A 401 can refresh once when `localStorage.refresh_token` is set. A failed call deletes both keys.
3. `BrowserRouter` sends `/` to `/login`, `/student`, `/doctor`, or `/admin` based on `user.role`.
4. Page components call the API through Axios. The request interceptor attaches `Bearer <token>`. A 401 with a stored refresh token refreshes once and retries.
5. Express matches a router. Most routers call `authenticate` and `authorize`.
6. Handlers use the pool directly or `withTx` when several statements must commit together.
7. Errors thrown as `HttpError` become `{ error, details }` with an HTTP status. The client maps `error` through `translations.js`.

Role homes, from `homeByRole` in `frontend/src/context/AuthContext.jsx`:

| `users.role` | Home path | API area |
|---|---|---|
| `student` | `/student` | `/api/student`, `/api/enrollments`, `/api/attendance` (student routes) |
| `instructor` | `/doctor` | `/api/instructor`, `/api/attendance` (instructor routes) |
| `admin` | `/admin` | `/api/admin`, plus catalog and offering writes |

The database role string is `instructor`. The URL and navigation label use "doctor".

## Access rules

The browser and the API both enforce these roles. `ProtectedRoute` sends a signed-in user who opens another role's path back to their own home. `authorize` returns `403 FORBIDDEN`. An ownership check that fails returns `404 NOT_FOUND`.

`authenticate` loads `users.role` on every request and does not use the role claim inside the JWT. `tv` must still match `users.token_version`. A refresh token is rejected. A token with no `typ` claim is still accepted.

### Pages

| Path | Who |
|---|---|
| `/login` | Public. A signed-in user is sent home. |
| `/catalog`, `/notifications` | Any signed-in role. The catalog page is read-only. |
| `/messages`, `/messages/:id` | Student and instructor. |
| `/student`, `/student/registration`, `/student/schedule`, `/student/grades`, `/student/transcript`, `/student/attendance`, `/attend` | Student. |
| `/doctor`, `/doctor/offerings/:id`, `/doctor/attendance/:id` | Instructor. |
| `/admin`, `/admin/catalog`, `/admin/offerings`, `/admin/users` | Admin. |

The nav shows only that role's links. Admins have no messages link. A message notification is plain text for an admin. The registration shortcut on the student home appears only while the current semester window is open. Register and drop buttons on the registration page stay disabled when the window is closed. The server still rejects those calls.

### API

| Area | Who |
|---|---|
| `POST /api/auth/login`, `POST /api/auth/refresh`, `GET /api/health` | Public. |
| `GET /api/auth/me`, `POST /api/auth/logout`, `PATCH /api/auth/language` | Any signed-in role. |
| `GET /api/departments`, `GET /api/courses`, `GET /api/courses/:id`, `GET /api/semesters`, `GET /api/offerings` | Any signed-in role. Offering rows include seats and the instructor's name. A student also receives their own enrollment status, passed courses, and missing prerequisites. The list does not include rosters or grades. |
| Catalog writes, `GET /api/instructors`, offering writes, `/api/admin/*`, `GET /api/admin/ping` | Admin. |
| `/api/student/*`, `/api/enrollments/*`, `POST /api/attendance/scan`, `GET /api/attendance/me` | Student. Those queries use `req.user.id`. |
| `/api/instructor/*` | Instructor, and only offerings where `instructor_id` is the caller. |
| Attendance session reads, the QR token, close, and manual marks | The instructor who opened the session (`opened_by`). Opening a session also requires that the caller teaches the offering. |
| `/api/messages/*` | Student or instructor. A thread is visible only to its sender or receiver. A new thread's receiver must be one of the caller's contacts. |
| `/api/notifications/*` | Any signed-in role, and only that user's rows. |

Accounts are created by an admin (`POST /api/admin/users`) or by `npm run seed`. There is no public signup route.

The full route list is [API reference](api-reference.md).

## Dependencies and interactions

- The client has no build-time proxy. `vite.config.js` only registers `@vitejs/plugin-react`. `axios.js` uses `VITE_API_URL` when it is set. Vite inlines that value at `npm run build`. The `http://<page-host>:5000/api` fallback runs only under the Vite dev server. A production build without `VITE_API_URL` throws when the module loads.
- CORS reads `CORS_ORIGINS` (`backend/src/server.js`). An empty list in development calls `cors()` with no origin list and prints a warning, so a phone on the LAN can reach the API. `NODE_ENV=production` refuses to start when the list is empty. A non-empty list is passed as `cors({ origin })`, with `https://localhost` and `capacitor://localhost` added so the Capacitor WebView is allowed.
- The API does not serve the frontend. In development they are two processes (Vite, and `node src/server.js`).
- Academic rules that must stay consistent live on the server: `services/registration.js` and `services/gpa.js`. The client mirrors the grade total in `utils/format.js` so the roster can show a total before save. The server recomputes the total on save.
- Registration locks the offering row with `SELECT ... FOR UPDATE` inside a transaction so two students cannot take the last seat together.
- Grade publish writes a `grades_published` notification in the same transaction as the grade update.
- A new message writes a `message` notification in the same transaction as the message insert.

## Current status

**Complete** as a single-campus monolith for the features listed in [the index](README.md). A new database comes from `backend/sql/001_init.sql` via `npm run db:init`. See [Data model](data-model.md) and [Setup](setup-and-configuration.md).

Access JWTs include `tv` (`users.token_version`) and expire in 2 hours. Refresh JWTs carry the same `tv` and expire in 7 days. `authenticate` rejects a token whose `tv` does not match the row, and rejects `typ: 'refresh'`. Logout and an admin password reset increment the version, which ends every session for that account. Both tokens are still stored in `localStorage`, so a script that runs on the page origin can read them until that happens.

## Implementation details and gotchas

- Express 5 is what this package uses (`express` `^5.3.0`). Route handlers are `async` and often `throw new HttpError(...)`. Those rejections are meant to reach the error middleware in `server.js`. The auth controller handles its own errors and does not use `HttpError`.
- `dateStrings: true` on the pool makes MySQL date values come back as strings such as `2026-09-01`. `decimalNumbers: true` makes decimal columns come back as numbers. GPA math uses those numbers directly.
- There is one pool (`connectionLimit: 10`) shared by HTTP handlers, `seed.js`, and transactions. Seed is a separate process (`npm run seed`), not an HTTP route.
- The QR payload is `${window.location.origin}/attend?s=...&t=...`. Opening the site as `localhost` puts `localhost` in the QR, which another device cannot open. In development the API base URL uses that same page hostname and port 5000 unless `VITE_API_URL` is set. A production build uses only `VITE_API_URL`, so the phone must be able to open that API origin too.
- Passwords are bcrypt hashes (cost 10). New session JWTs use `{ id, role, tv, typ }`. Authorization uses `users.role` from the database, not the role claim. `tv` must match `users.token_version`. Tokens that have no `typ` still pass `authenticate`. The menus still show the role returned by the last `GET /api/auth/me` until the next load.
- A student token cannot call admin or instructor routes (`403 FORBIDDEN`). An instructor token cannot open another instructor's offering, or a session that instructor did not open (`404 NOT_FOUND`).

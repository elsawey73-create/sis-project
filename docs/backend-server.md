# Backend server

## Overview

`backend/src/server.js` is the API process. It builds one Express application, mounts every router under `/api`, and listens on `PORT` or 5000.

## Purpose and responsibilities

- Load environment variables.
- Accept JSON bodies and cross-origin browser calls.
- Attach route modules.
- Turn `HttpError` and a few MySQL errors into a stable JSON shape.
- Log unexpected errors and return `SERVER_ERROR` with HTTP 500.

## Key files

| Path | Responsibility |
|---|---|
| `backend/src/server.js` | App wiring and the error middleware |
| `backend/src/utils/errors.js` | `HttpError(status, code, details)` |
| `backend/src/utils/tx.js` | `withTx(fn)` begin / commit / rollback / release |
| `backend/src/config/db.js` | Pool used by `withTx` and by handlers |
| `backend/src/middleware/auth.js` | Used by the admin ping route in this file |

## Route mount order

| Mount | Module |
|---|---|
| `GET /api/health` | Inline. No auth. Body `{ status: 'ok', app: 'Unidex' }` |
| `/api/auth` | `routes/auth.js` |
| `/api` | `routes/catalog.js` (departments, courses, semesters, instructors) |
| `/api/offerings` | `routes/offerings.js` |
| `/api/enrollments` | `routes/enrollments.js` |
| `/api/instructor` | `routes/instructor.js` |
| `/api/student` | `routes/student.js` |
| `/api/attendance` | `routes/attendance.js` |
| `/api/messages` | `messages` export from `routes/messages.js` |
| `/api/notifications` | `notifications` export from `routes/messages.js` |
| `GET /api/admin/ping` | Inline. `authenticate` + `authorize('admin')`. Body `{ message: 'Hello admin' }` |
| `/api/admin` | `routes/admin.js` |

The ping route is registered on the app before the admin router. The frontend does not call `/api/health` or `/api/admin/ping`.

## Error handling

```text
HttpError                          → status from the error, { error: code, details }
entity.parse.failed                → 400 MISSING_FIELDS
ER_DUP_ENTRY                       → 409 DUPLICATE
ER_ROW_IS_REFERENCED_2             → 409 IN_USE
ER_NO_REFERENCED_ROW_2             → 400 INVALID_REFERENCE
anything else                      → console.error, 500 SERVER_ERROR
```

`details` is whatever the throw site passed (for example `{ courses: ['CS102'] }` or `{ field, max }`). It is omitted in JSON when undefined.

`withTx` always rolls back on throw and always releases the connection. It does not translate errors. The route's thrown `HttpError` still reaches the middleware after rollback.

## Dependencies and interactions

Every feature document below hangs off this process. The frontend assumes this shape: an `error` string, optional `details`, and HTTP status. `frontend/src/utils/format.js` `errorText` reads `err.response.data`.

Startup prints `Unidex API running on http://localhost:${PORT}`. The listen address is the Express default (all interfaces). The log line always says `localhost`.

## Current status

**Complete** for local API hosting. **Partial** for production: development CORS is open until `CORS_ORIGINS` is set, and there is no structured logging, process manager config, or graceful shutdown. Production startup exits when `JWT_SECRET` is missing or shorter than 32 characters, or when `CORS_ORIGINS` is empty.

## Implementation details and gotchas

- The error middleware is registered after the routes. That order is required for it to see their errors.
- `next` is unused in the handler. Express still requires the four-argument signature so this function is treated as error-handling middleware.
- Auth routes that return `res.status(...).json(...)` themselves do not go through `HttpError`. Their codes are still the same strings the frontend translates.
- A JSON parse failure is reported as `MISSING_FIELDS`, the same code as a missing form field.
- `console.error` prints the raw error for 500s, including SQL. Clients only receive `SERVER_ERROR`.
- `assertRuntimeConfig()` runs at load, before `listen`. Missing `JWT_SECRET` exits 1. In production a secret shorter than 32 characters also exits 1.
- `config/env.js` supplies the pool and `npm run db:init`. Development fills in `localhost`, `root`, `unidex_db`, and an empty password when those variables are missing. Production exits if `DB_HOST`, `DB_USER`, or `DB_NAME` is missing or blank, or if `DB_PASSWORD` is unset. An explicit empty `DB_PASSWORD` is kept. `PORT` still defaults to `5000` when unset.
- `corsMiddleware()` splits `CORS_ORIGINS` on commas. An empty list outside production returns `cors()` and warns. Production with an empty list exits 1. A non-empty list uses `cors({ origin })` with that list plus the Capacitor WebView origins `https://localhost` and `capacitor://localhost`.

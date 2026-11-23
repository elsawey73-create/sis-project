# Authentication and authorization

## Overview

Users sign in with `login_id` and a password. The API returns a JWT. Later requests send `Authorization: Bearer <token>`. The token carries `id`, `role`, and `tv`. Each request re-reads `users.role`; the claim is not what `authorize` checks. A second, unrelated JWT is used for QR attendance and is documented in [Attendance](attendance.md).

## Purpose and responsibilities

- Check passwords without revealing whether the login ID exists. Accounts are created by an admin or by seed, not by a public signup route.
- Issue a 7-day token and a public user object.
- Load role-specific profile fields on `GET /api/auth/me`.
- Store `preferred_lang` on the user.
- Reject missing tokens, bad tokens, and wrong roles.

## Key files

| Path | Responsibility |
|---|---|
| `backend/src/controllers/authController.js` | login, forgot-password, reset-password, me, logout, setLanguage |
| `backend/src/routes/auth.js` | Paths and which ones require `authenticate` |
| `backend/src/middleware/auth.js` | `authenticate`, `authorize(...roles)` |
| `frontend/src/context/AuthContext.jsx` | Token storage, login, logout, `/auth/me` on load |
| `frontend/src/api/axios.js` | Attaches the bearer token |
| `frontend/src/components/ProtectedRoute.jsx` | Client-side role gate |
| `frontend/src/pages/Login.jsx` | Sign-in form, link to forgot password |
| `frontend/src/pages/ForgotPassword.jsx` | Asks for an ID or email and tells the person to check their email |
| `backend/src/services/mail.js` | Sends the reset email through Resend |
| `frontend/src/pages/ResetPassword.jsx` | Sets a new password from the `token` query parameter |

## Data flow

### Login

1. `POST /api/auth/login` with `{ login_id, password }`. Blank values → `400 MISSING_FIELDS`.
2. `SELECT * FROM users WHERE login_id = ?` after trim.
3. `bcrypt.compare`. Unknown user and wrong password both return `401 INVALID_CREDENTIALS`.
4. Response: `{ token, user }`. `user` is `id`, `login_id`, `full_name_ar`, `full_name_en`, `role`, `preferred_lang`. Password hash and email are not included.
5. The client stores the token under `localStorage` key `token`, then calls `GET /api/auth/me` and stores that fuller profile (including `student` or `instructor`). If `/me` fails, the token is removed.
6. If `localStorage.lang` is `ar` or `en`, the client `PATCH /api/auth/language` so the account matches this browser. Otherwise, if the account has `preferred_lang`, the client switches to it.

### Session restore

On load, if a token exists, `GET /api/auth/me` runs. Success replaces `user` with the fuller profile. Failure removes the token.

`/me` adds:

- Students: `student` = `{ student_code, level, admission_year, department_ar, department_en }`.
- Instructors: `instructor` = `{ department_ar, department_en }`.
- Admins: no extra object.

### Password reset

`POST /api/auth/forgot-password` accepts `{ identifier }` (a `login_id` or an email). `login_id` and `email` are accepted as aliases of that field. A blank value is `400 MISSING_FIELDS`. Every other outcome that is not rate limited returns `{ ok: true }`, including an unknown id, an unknown email, an account with no email address, and a Resend failure. The client is not told which of those happened.

The lookup is exact on `login_id` after trim, and case-insensitive on `email` (stored lowercased). If one row matches the login id and another matches the email, the login id wins.

A match with an email address stores only the SHA-256 hex digest of a random token in `password_reset_tokens`, with `expires_at` 60 minutes ahead. Older unused tokens for that user are marked used in the same transaction. The raw token is not stored. The API then sends that link with the official `resend` SDK. The message has an HTML part and a text part, and both contain Arabic and English. The link is `{FRONTEND_URL}/reset-password?token=...`. When `FRONTEND_URL` is empty, the API uses the request `Origin` header, then a relative path.

`RESEND_FROM` is the From address. When it is empty the sender is `Unidex <onboarding@resend.dev>`, which is Resend's shared test domain. That sender can deliver only to the email address of the Resend account owner. `RESEND_API_KEY` empty does not stop the process: startup logs a warning, and a later send logs the same warning and is skipped. A send that throws, or a Resend `{ error }` result, is logged on the server and still returns `{ ok: true }`.

`PASSWORD_RESET_RETURN_LINK` defaults to off. Set it to `true` only on a local process. While it is on, and `NODE_ENV` is not `production`, the JSON also includes `reset_link`. **That brings back the ability for anyone who can call the API and knows an id or email to reset the account.** Production ignores the flag.

`POST /api/auth/reset-password` takes `{ token, password }`. The password must be at least 6 characters, the same check as admin create and admin password change. A missing token or password is `400 MISSING_FIELDS`. A short password is `400 WEAK_PASSWORD` and does not consume the token. A missing, used, or expired token is `400 INVALID_RESET_TOKEN`. Success updates `password_hash`, increments `token_version` (existing sessions fail on the next request), marks every unused token for that user as used, and returns `{ ok: true }`.

Both routes are limited in memory per API process: 30 requests per IP per 15 minutes, and the request route also allows 8 per identifier per 15 minutes. Over the limit is `429 RATE_LIMITED`. The counters reset when the process restarts.

The login page links to `/forgot-password`. That page shows "check your email" after a successful response and does not show the link. `/reset-password` reads `token` from the query string.

`npm run test:reset` (`scripts/test-password-reset.js`) mocks the Resend SDK and runs the reset flow against the local database. It exits immediately when `NODE_ENV=production`.

### Accounts

There is no `POST /api/auth/register`. A student, instructor, or admin account is created with `POST /api/admin/users` or inserted by `npm run seed`. See [Admin](admin.md).

### Language

`PATCH /api/auth/language` with `{ lang }`. Only `ar` and `en`. Others → `400 INVALID_LANGUAGE`. Response `{ lang }`.

### Guards

`authenticate` reads the `Bearer` header. No token → `401 UNAUTHENTICATED`. `jwt.verify` failure (bad signature, expiry, malformed) → `401 SESSION_EXPIRED`. A missing user, or a `tv` that does not match `users.token_version`, is the same `401`. Success sets `req.user = { id, role }` from the user row, so a role change in the database applies on the next request.

`authorize(...roles)` returns `403 FORBIDDEN` when `req.user.role` is not in the list. It assumes `authenticate` already ran.

Client `ProtectedRoute`:

- While `loading`, shows the loading string.
- No user → redirect to `/login` and store `location` in `state.from` (path + search). Login sends the user back there. This is what lets a QR link survive sign-in.
- `roles` set and the user's role is outside the list → redirect to that role's home.

The server still enforces roles. The client redirect is only navigation.

## Dependencies and interactions

- JWT secret is `process.env.JWT_SECRET`. Sign and verify both use it. Expiry is the string `'7d'`. The payload is `{ id, role, tv }`. `tv` is `users.token_version`.
- `POST /api/auth/logout` requires the bearer token and increments `token_version`. The client calls it before deleting `localStorage.token`. Every device for that user must sign in again. Admin password reset and `POST /api/auth/reset-password` do the same increment. A missing user id on the admin password route returns `404 USER_NOT_FOUND`.
- bcrypt cost is 10 on admin create, admin password reset, public password reset, and seed.
- `LanguageSwitcher` patches `/auth/language` only when `useAuth().user` is set. On the login page the user is null, so the toggle only updates `localStorage` and the document direction. Login then uploads that choice.
- After login the client replaces the login payload with `GET /api/auth/me`, so `StudentHome` has `user.student` on the first paint. `DoctorHome` does not read `user.instructor`.

## Current status

**Complete** for login, session restore, role gates, and language persistence.

**Partial** for account lifecycle: a public reset emails a one-hour link and does not return that link unless `PASSWORD_RESET_RETURN_LINK=true` on a non-production process. There is still no password change for the signed-in user and no public signup. Logout and a completed reset revoke by bumping `token_version` for the whole account, not per device. The token remains in `localStorage` until logout, expiry, or revocation. The nav keeps the role from the last `/auth/me` until the next load, even if `users.role` changed underneath.

## Implementation details and gotchas

- Login ID comparison is exact after trim. It is not case-folded, except department and course codes on other routes.
- The same `401` for unknown user and bad password is intentional (comment in the controller).
- `SESSION_EXPIRED` is also returned for a token signed with the wrong secret, not only for expiry.
- `authorize` uses `users.role` from the row loaded in `authenticate`. The role claim in the JWT is not checked.
- `GET /me` returns `404 USER_NOT_FOUND` if the user row was deleted while the token is still valid. `authenticate` returns `401 SESSION_EXPIRED` in that case, because the version lookup finds no row.
- If the student row or instructor row is missing, `user.student` or `user.instructor` is `undefined` (`s[0]` / `i[0]`). The response is still 200.

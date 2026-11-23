# Error codes

## Overview

API failures return JSON `{ error: "<CODE>", details?: object }` plus an HTTP status. The frontend translates `error.<CODE>`. This list is every code assigned in `backend/src` or synthesized by the client.

## Purpose and responsibilities

Keep client copy and server codes aligned. `translations.js` has an `error.*` entry for each code below, in Arabic and English, except `NETWORK`, which exists only on the client.

## Key files

| Path | Responsibility |
|---|---|
| `backend/src/server.js` | `HttpError`, JSON parse, MySQL mappings |
| `backend/src/middleware/auth.js` | `UNAUTHENTICATED`, `SESSION_EXPIRED`, `FORBIDDEN` |
| `backend/src/controllers/authController.js` | Account and login codes |
| `backend/src/services/registration.js` | Registration rule codes |
| `backend/src/routes/*.js` | Feature codes |
| `frontend/src/utils/format.js` | `errorText` |
| `frontend/src/i18n/translations.js` | Display strings |
| `frontend/src/pages/Login.jsx` | Translates codes without `errorText` |

## Codes

| Code | HTTP | Produced when | `details` |
|---|---|---|---|
| `MISSING_FIELDS` | 400 | Required body field missing, bad manual attendance status, empty message, invalid JSON body | |
| `WEAK_PASSWORD` | 400 | Password shorter than 6 | |
| `INVALID_LOGIN_ID` | 400 | Admin create, login id fails `^[A-Za-z0-9_-]{3,30}$` | |
| `INVALID_LANGUAGE` | 400 | Language not `ar` or `en` | |
| `INVALID_DATES` | 400 | Semester start/end or registration window out of order | |
| `INVALID_MEETING` | 400 | A meeting fails day, time, room, or type checks | |
| `INVALID_GRADE` | 400 | Component out of range | `{ field, max }` |
| `INVALID_ENROLLMENT` | 400 | Grade row's enrollment is not on this offering | |
| `INVALID_REFERENCE` | 400 | MySQL `ER_NO_REFERENCED_ROW_2` on routes that use the global handler | |
| `DEPT_NOT_FOUND` | | Not returned. The translation key remains. | |
| `INVALID_CREDENTIALS` | 401 | Unknown login id or wrong password | |
| `UNAUTHENTICATED` | 401 | No bearer token | |
| `SESSION_EXPIRED` | 401 | Token failed `jwt.verify`, or `tv` does not match `users.token_version` | |
| `FORBIDDEN` | 403 | Role not allowed, or message receiver is not a contact | |
| `REGISTRATION_CLOSED` | 403 | Enroll or drop outside the window | |
| `NOT_ENROLLED` | 403 or 409 | Scan or manual mark: 403. Drop of a non-enrolled row: 409 | |
| `USER_NOT_FOUND` | 404 | `/auth/me` user row missing, or admin password update for an unknown id | |
| `NOT_FOUND` | 404 | Missing offering, session, thread, or student profile joins | |
| `DUPLICATE_USER` | | Not returned. Admin create uses `DUPLICATE`. The translation key remains. | |
| `DUPLICATE` | 409 | `ER_DUP_ENTRY` on other routes (admin create user) | |
| `IN_USE` | 409 | `ER_ROW_IS_REFERENCED_2` on delete | |
| `ALREADY_ENROLLED` | 409 | Enrollment exists and is not dropped | |
| `COURSE_ALREADY_IN_SEMESTER` | 409 | Another section of the same course is `enrolled`, `completed`, or `failed` | |
| `ALREADY_PASSED` | 409 | A `completed` enrollment of this course exists | |
| `PREREQ_NOT_MET` | 409 | Missing prerequisite codes | `{ courses: string[] }` |
| `OUT_OF_PROGRAM` | 403 | Student registering an offering outside the departments their program may take | |
| `SECTION_FULL` | 409 | Occupying count (`enrolled`, `completed`, `failed`) has reached capacity | |
| `TIME_CONFLICT` | 409 | Overlapping meeting | `{ course }` |
| `CREDIT_LIMIT` | 409 | Term hours would exceed the cap | `{ max, current }` |
| `ALREADY_RECORDED` | 409 | Second scan for the same session | |
| `QR_EXPIRED` | 400 | Bad, expired, or mismatched QR token | |
| `SESSION_CLOSED` | 400 | Token request or scan when the session is not open | |
| `SERVER_ERROR` | 500 | Unclassified exception | |
| `NETWORK` | none | Axios failure with no `response.data.error` | Client only |

## How the client formats details

`errorText` in `frontend/src/utils/format.js`:

- Looks up `error.<code>`. If the lookup returns the key unchanged, it uses `error.SERVER_ERROR`.
- Appends ` (A, B)` when `details.courses` is set.
- Appends ` (CS102)` when `details.course` is set.
- For `CREDIT_LIMIT`, appends ` (current/max)`.
- For `INVALID_GRADE`, appends ` (field ≤ max)`.

`Login.jsx` does not append `details`. It shows `t('error.' + code)` or, if the code is missing from the dictionary, the key string itself (because `t` falls back to the key).

## Current status

**Complete.** Every `error:` string literal in `backend/src` has a translation entry. `NETWORK` is client-only and also translated.

## Implementation details and gotchas

- The same `NOT_ENROLLED` code is sent with status 403 (attendance) and 409 (drop). The client translates the code and ignores the status.
- `MISSING_FIELDS` covers several unrelated validation failures, including a message body that is too long and a bad attendance status.
- `FORBIDDEN` covers both role denial and "you cannot message this person".
- Admin create lets `ER_DUP_ENTRY` reach `server.js`, which returns `DUPLICATE`.

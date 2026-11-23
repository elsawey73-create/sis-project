# Gaps and technical debt

## Overview

This page lists gaps that are visible from the repository itself: missing artifacts, behavior that is easy to misread, and security properties of the code as written. It does not rank a product roadmap. Items are included only when a file shows them.

## Purpose and responsibilities

Give the next development pass a factual backlog. Each item names the evidence.

## Key files

The evidence is the source cited on the feature pages. Remaining risk is concentrated in `frontend/src/api/axios.js` (bearer token in `localStorage`; development still derives the API host from the page hostname), `backend/src/server.js` (open CORS when `CORS_ORIGINS` is empty and `NODE_ENV` is not `production`), and `backend/src/seed.js` (demo passwords in source, seed is not one transaction).

## Missing from the repository

| Gap | Evidence |
|---|---|
| Schema for a new database | `backend/sql/001_init.sql`, applied by `npm run db:init`. An existing database is patched, not rebuilt |
| No root README that describes Unidex | `frontend/README.md` is still the Vite template, plus a short production-build note. Hosting steps are in [Deployment](deployment.md) |
| Smoke test mutates its database | `npm run test:api` exists and prints a warning. It still does not roll back |
| No frontend tests | `frontend/package.json` scripts are `dev`, `build`, `lint`, `preview` |
| No CI, Docker, or process manager config | Not present in the tree |
| No `TODO` / `FIXME` comments | Search of application source found none. Incomplete work is unmarked |

`001_init.sql` now supplies the defaults those inserts used to assume. New sessions and scans also write the attendance timing and `method` themselves. Details are in [Data model](data-model.md).

`seed.js` exits 1 after a caught failure and exits 1 immediately when `NODE_ENV=production`. A failed run can still leave a partial seed. The whole script is not one transaction.

## Behavior that will surprise a later change

- Publishing still sets `completed` or `failed`, and the schedule, registration list, attendance list, seat count, and credit load keep those rows. Editing the grade sets the row back to `enrolled` and removes it from the transcript until republish. [Grades and transcript](grades-and-transcript.md). [Registration](registration.md).
- Cumulative GPA keeps the latest published attempt of each course. The earlier attempt stays on that term's GPA and is marked `replaced` on the transcript. [Grades and transcript](grades-and-transcript.md).
- `ALREADY_PASSED` blocks any later registration of a `completed` course. `failed` does not.
- Absence is "no attendance row". Excused and late count as attended. The warning is `absent_pct > 25` on closed sessions only.
- New sessions insert `token_ttl_seconds = 30` and `late_after_minutes = 15`. The instructor page still refreshes the QR every 20 seconds. A photographed code works until that JWT expires.
- Scan and manual marks both allow `enrolled`, `completed`, and `failed`. Dropped rows cannot be marked.
- `meeting_id` is stored and never sent by the client.
- There is no public signup route. Accounts are created by an admin or by seed.
- `login()` stores the token, then replaces React state with `GET /auth/me`. A failed `/me` clears the token. A full page reload still calls `/me` again.
- List screens show `LoadError` with a retry button when their GET fails. A falsy `useFetch` url still clears loading. [Frontend shell](frontend-shell.md).
- Unchecking the only current semester leaves student and instructor "current term" queries empty.
- Department `PUT` exists and the admin UI has no edit form.
- Admin password update returns `404 USER_NOT_FOUND` when the user id does not exist, and it increments `token_version` when it does.
- User list is `LIMIT 300` with no page parameter.
- The smoke test closes registration and inserts extra users and courses. It is not safe to re-run on a database you still want in the seed state. [API smoke test](api-smoke-test.md).
- `frontend/src/App.css` and the files in `frontend/src/assets` plus `public/icons.svg` are unused leftovers from the Vite template.

## Security and deployment properties of the current code

These are descriptions of what the code does, not a penetration procedure.

- With `CORS_ORIGINS` empty and `NODE_ENV` not `production`, `cors()` allows any origin (`server.js`) and the process warns at startup. Production refuses to start until the list is set.
- The JWT lasts 7 days and is stored in `localStorage`. Logout and admin password reset increment `token_version`, so those tokens fail the next request. A stolen token still works until then. `authorize` uses `users.role` loaded on each request, not the role claim. The menus keep the role from the last `/auth/me` until the next load. Moving the token to an httpOnly cookie is a later change: it needs credentialed CORS and a fixed public origin, and it does not fix the QR hostname problem.
- `JWT_SECRET` has no code default. A local gitignored `.env` supplies it. The value is not recorded in this documentation. Production exits when it is missing or shorter than 32 characters. Database host, user, and name have defaults only outside production (`config/env.js`).
- Seed passwords are constants in `seed.js` and are printed to the console.
- There is no rate limit on `POST /api/auth/login`.
- There is no HTTPS terminator, cookie flags, or security-header middleware in the repo.
- QR tokens are signed with a per-session secret and are embedded in a URL. The URL will sit in browser history on the phone that opens it.
- Like search does not escape `%` and `_`.
- Admin create accepts an optional email and stores it. Nothing sends mail.

## Product surfaces that are not built

Stated as absence in the UI and routes, not as a requested feature list:

- No password change for the signed-in user, no profile edit, no account disable.
- No semester delete, no offering room-conflict check, no instructor double-book check.
- No waitlist, no admin registration override, no drop reason.
- No grade export file, no attendance export. Transcript print is `window.print()`.
- No email or push. Notifications are rows plus a 30-second poll.
- No admin participation in messages.
- No public course catalog. Every catalog GET requires a token.
- Friday is not a valid meeting day (`DAYS` in `utils/meetings.js` and `utils/format.js`).

## Current status

This list matches the source reviewed for the rest of `docs/`. When the schema is added to the repo, [Data model](data-model.md) and [Setup and configuration](setup-and-configuration.md) should be updated from that DDL rather than from inference.

## Implementation details and gotchas

The smoke script is the closest thing to a specification of the academic rules. Its assertions are quoted in [API smoke test](api-smoke-test.md) and [Grades and transcript](grades-and-transcript.md). A change to the scale, the credit cap, or the registration errors should update that script and those pages together.

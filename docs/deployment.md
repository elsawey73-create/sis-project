# Deployment

## Overview

Unidex is two processes: an Express API (`backend`) and a static React build (`frontend/dist`). MySQL is a third service. The API does not serve the frontend. This page is the production path. Local scripts and variable names are in [Setup and configuration](setup-and-configuration.md).

## Purpose and responsibilities

Say which environment variables a host must set, how to create an empty schema, and how to build and start the two apps. It does not change academic rules, and it does not add a process manager, HTTPS terminator, or container file. None of those are in the repository.

## Key files

| Path | Role |
|---|---|
| `backend/.env.example` | Names to copy. No real secrets |
| `backend/.env` | Local values. Gitignored by the root `.gitignore` entry `.env` |
| `backend/src/config/env.js` | Database settings. Development-only fallbacks |
| `backend/src/server.js` | JWT length check, CORS, listen port |
| `backend/src/seed.js` | Demo data. Exits immediately when `NODE_ENV=production` |
| `backend/scripts/migrate.js` | `npm run db:init` |
| `frontend/.env.example` | `VITE_API_URL` |
| `frontend/src/api/axios.js` | API base URL |
| `frontend/README.md` | Short production-build note |

Commands below assume the working directory is `backend` or `frontend`, matching `npm`. `dotenv` reads `backend/.env` from the process working directory. A host that injects variables into the environment does not need the file. `dotenv` does not override a variable that is already set.

## Environment variables

Copy `backend/.env.example` to `backend/.env` for a local file, or set the same names on the host.

| Variable | Production |
|---|---|
| `DB_HOST` | Required, non-empty. Development default `localhost` |
| `DB_USER` | Required, non-empty. Development default `root` |
| `DB_PASSWORD` | Required to be present. An empty value is kept. Development uses an empty password only when the variable is unset |
| `DB_NAME` | Required, non-empty. Letters, numbers, and underscores only. Development default `unidex_db` |
| `JWT_SECRET` | Required in every mode. Production also requires at least 32 characters. The example placeholder meets that length; replace it and do not commit the real value |
| `CORS_ORIGINS` | Required, comma-separated browser origins such as `https://unidex.example.com`. This is the site the browser loads, not the API URL. Spaces around commas are trimmed. An empty value in development allows every origin and prints a warning. Production exits when the list is empty |
| `PORT` | Listen port. `5000` when unset, including in production. Many hosts set this themselves |
| `NODE_ENV` | Set `production` on the public API process |

The frontend has one build-time variable:

| Variable | Production |
|---|---|
| `VITE_API_URL` | Full API prefix, including `/api`, for example `https://api.example.com/api`. Vite inlines it when `npm run build` runs. A production bundle with no value throws `VITE_API_URL is required for a production build.` when the app loads. `npm run dev` falls back to `http://<page-hostname>:5000/api` when this is unset |

`CORS_ORIGINS` and `VITE_API_URL` point at different hosts when the site and the API are on different origins. The browser origin goes in `CORS_ORIGINS`. The API origin plus `/api` goes in `VITE_API_URL`.

## Initialize the database

From `backend`, with the database variables set:

```text
npm install
npm run db:init
```

`npm run db:init` creates the database named by `DB_NAME` when it is missing, applies `sql/001_init.sql` when `users` does not exist, and records the step. It does not insert accounts. Details are in [Data model](data-model.md).

Do not run `npm run seed` on a public database. When `NODE_ENV=production` the script prints `Refusing to load demo accounts while NODE_ENV=production.` and exits 1 before any insert. Seed is a one-shot loader for an empty private database. It is not idempotent. A database that already has the university catalog must not be seeded again. See [Seed data](seed-data.md).

There is no public signup. `POST /api/admin/users` requires an admin who already exists. For a first private database:

1. Run `npm run db:init` with `NODE_ENV` unset or not `production`.
2. Run `npm run seed` once on that empty database. Account names are in [Seed data](seed-data.md).
3. Sign in, change the admin password, and delete demo users you do not want. Do this before the API is reachable from the internet.
4. Set `NODE_ENV=production` for the hosted process. Later seed runs exit before writing.

## Build and run

API, from `backend`:

```text
npm install
npm start
```

`npm start` is `node src/server.js`. `npm run dev` is nodemon and is for local development. The process listens on `PORT` (default 5000) on the Express default address. The log line always says `localhost` even when the bind is all interfaces.

In production the process exits before it listens when any of these is true:

- `JWT_SECRET` is missing, or shorter than 32 characters
- `CORS_ORIGINS` is empty
- `DB_HOST`, `DB_USER`, or `DB_NAME` is missing or blank
- `DB_PASSWORD` is unset

Frontend, from `frontend`, with `VITE_API_URL` set in the environment that runs the build:

```text
npm install
npm run build
```

On PowerShell, for that one shell:

```text
$env:VITE_API_URL = "https://api.example.com/api"
npm run build
```

Output is `frontend/dist`. Serve that directory as a static site. The API process does not serve it. A short copy of this build note is in `frontend/README.md`.

`npm run preview` serves the build locally. It is not the production host.

## Where to host it

The repository has no Docker file, CI config, or process-manager unit. Any host that can run Node, reach MySQL, and serve a static folder is enough.

- **Railway.** Use one service for the API with root directory `backend` and start command `npm start`. Add a MySQL service and copy its host, user, password, and database name into `DB_HOST`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME`. Put the static build on a second service, or any static host, and set `VITE_API_URL` when that frontend is built.
- **Render.** A Web Service can run the API: root directory `backend`, start command `npm start`. Render's managed database is PostgreSQL, and this API uses MySQL (`mysql2`), so point `DB_*` at MySQL elsewhere (Railway, a VPS, or another MySQL host). A Static Site can serve `frontend/dist`. `VITE_API_URL` must be present when Render runs `npm run build`.
- **A VPS.** Install Node and MySQL on the machine. Put the variables in the environment or in `backend/.env`. Run `npm run db:init` once, then keep `npm start` running from `backend`. Serve `frontend/dist` and terminate HTTPS with nginx or Caddy. Put the public site origin in `CORS_ORIGINS`.

After the API is up, `GET /api/health` returns `{ "status": "ok", "app": "Unidex" }`.

## Current status

**Partial.** Production startup refuses a missing database setting, a short `JWT_SECRET`, an empty `CORS_ORIGINS`, and `npm run seed`. The frontend production build requires `VITE_API_URL`. Still absent: HTTPS, a process manager, request rate limits, and security headers. Development CORS stays open until `CORS_ORIGINS` is set. The user token remains in `localStorage`. See [Gaps and technical debt](gaps-and-technical-debt.md).

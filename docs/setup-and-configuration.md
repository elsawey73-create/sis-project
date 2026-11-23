# Setup and configuration

## Overview

Each app is a separate npm package. The API reads MySQL settings and `JWT_SECRET` from the environment. The client reads an optional `VITE_API_URL`. A local `backend/.env` exists on disk and is gitignored. This page names the variables. It does not copy secret values.

## Purpose and responsibilities

Tell a developer which commands the repository defines, which variables the code reads, and which steps the repository does not automate.

## Key files

| Path | What it configures |
|---|---|
| `backend/package.json` | Dependencies and scripts |
| `backend/.env.example` | Variable names for a local `.env` or a host |
| `backend/.env` | Local DB and JWT settings (gitignored) |
| `backend/src/config/env.js` | Database settings. Fallbacks apply only when `NODE_ENV` is not `production` |
| `backend/src/config/db.js` | MySQL pool. Reads `databaseConfig()` from `env.js` |
| `backend/src/server.js` | `PORT`, CORS, JSON body parser |
| `frontend/package.json` | Dependencies and scripts |
| `frontend/vite.config.js` | React plugin only. No `server.port`, no proxy |
| `frontend/src/api/axios.js` | API base URL |
| `frontend/.oxlintrc.json` | Oxlint React rules |
| `.gitignore` | `node_modules/`, `.env`, `dist/` |

## Commands defined in package.json

Backend (`backend/package.json`):

| Script | Command |
|---|---|
| `npm run dev` | `nodemon src/server.js` |
| `npm start` | `node src/server.js` |
| `npm run db:init` | `node scripts/migrate.js` |
| `npm run seed` | `node src/seed.js` |
| `npm run test:api` | `node scripts/smoke.js` |
| `npm run test:reset` | `node scripts/test-password-reset.js` |

`npm run test:api` runs `scripts/smoke.js`. The API process must already be listening, and the database should be a fresh seed. The script changes data. See [API smoke test](api-smoke-test.md).

Frontend (`frontend/package.json`):

| Script | Command |
|---|---|
| `npm run dev` | `vite` |
| `npm run build` | `vite build` |
| `npm run lint` | `oxlint` |
| `npm run preview` | `vite preview` |

No test script exists on the frontend. No `engines` field pins a Node version in either package.

## Environment variables the code reads

| Variable | Read in | Behavior in code |
|---|---|---|
| `DB_HOST` | `config/env.js`, used by `config/db.js` and `scripts/migrate.js` | Pool host. Development default `localhost`. Production exits if this is missing or blank |
| `DB_USER` | same | Development default `root`. Production exits if this is missing or blank |
| `DB_PASSWORD` | same | An explicit empty value is kept. Development uses an empty password only when the variable is unset. Production exits when the variable is unset |
| `DB_NAME` | same | Development default `unidex_db`. Production exits if this is missing or blank. `migrate.js` allows only letters, numbers, and underscores |
| `JWT_SECRET` | `authController.js`, `middleware/auth.js`, `server.js` | HMAC secret for user tokens. The process exits on startup if it is missing. In `NODE_ENV=production` it must be at least 32 characters |
| `CORS_ORIGINS` | `server.js` | Comma-separated browser origins. Empty means every origin, with a startup warning. `NODE_ENV=production` refuses to start when this is empty |
| `NODE_ENV` | `server.js`, `config/env.js`, `seed.js` | `production` turns on the checks above and makes `npm run seed` exit 1 |
| `PORT` | `server.js` | Listen port. Default `5000` when unset, including in production |
| `API` | `scripts/smoke.js` | Smoke-test base URL. Default `http://localhost:5000/api` |
| `VITE_API_URL` | `frontend/src/api/axios.js` | Axios `baseURL` when set. Vite inlines it at build time. Include the `/api` suffix |
| `FRONTEND_URL` | `controllers/authController.js` | Origin written into password-reset links. Falls back to the request `Origin`, then a relative path |
| `RESEND_API_KEY` | `services/mail.js`, `server.js` | Resend API key. Empty logs a warning and skips sending. The process still starts |
| `RESEND_FROM` | `services/mail.js` | From address. Empty uses `Unidex <onboarding@resend.dev>`, which can deliver only to the Resend account owner's email |
| `PASSWORD_RESET_RETURN_LINK` | `controllers/authController.js` | Local only. `true` adds `reset_link` to the JSON when `NODE_ENV` is not `production`. Unset means off. Production ignores it |

`dotenv` is loaded in `server.js`, `config/env.js`, and `seed.js`. `config/db.js` and `scripts/migrate.js` load it by requiring `config/env.js`. A local `backend/.env` supplies `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, and `PORT`. Copy names from `backend/.env.example`. Treat `backend/.env` as a development secret. Do not commit it. The root `.gitignore` already ignores `.env`.

If `VITE_API_URL` is unset and the Vite dev server is running (`import.meta.env.DEV`), the client uses:

```text
http://${window.location.hostname}:5000/api
```

The page host and the API host are the same machine name. Only the port differs. Vite's own port is not set in `vite.config.js`. A production build without `VITE_API_URL` throws when `axios.js` loads. See [Deployment](deployment.md).

## Dependencies

Backend runtime (`backend/package.json`):

| Package | Version range | Use in this repo |
|---|---|---|
| `express` | `^5.3.0` | HTTP server |
| `mysql2` | `^3.24.6` | MySQL pool and transactions |
| `jsonwebtoken` | `^9.0.3` | User sessions and QR tokens |
| `bcryptjs` | `^3.0.3` | Password hashes |
| `cors` | `^2.8.6` | Open CORS |
| `dotenv` | `^18.0.10` | `.env` loading |
| `resend` | `^6.39.0` | Password-reset email |

Backend dev: `nodemon` `^3.1.14`.

Frontend runtime:

| Package | Version range | Use in this repo |
|---|---|---|
| `react` | `^19.3.1` | UI |
| `react-dom` | `^19.3.1` | UI |
| `react-router-dom` | `^7.18.6` | Routes |
| `axios` | `^1.21.1` | HTTP |
| `qrcode.react` | `^4.2.0` | `QRCodeSVG` on the attendance screen |

Frontend dev: `vite` `^8.3.6`, `@vitejs/plugin-react` `^6.1.2`, `oxlint` `^1.90.0`, `@types/react`, `@types/react-dom`. The application source is JavaScript (`.jsx`), not TypeScript.

`"type": "commonjs"` in the backend. `"type": "module"` in the frontend.

## Data flow for a new environment

`npm run db:init` creates the database named by `DB_NAME` when it is missing and applies [the schema](data-model.md). `npm run seed` then inserts demo rows. It exits 1 on failure and exits 1 immediately when `NODE_ENV=production`.

Expected local sequence:

1. Copy `backend/.env.example` to `backend/.env` and set `JWT_SECRET`. Leave `CORS_ORIGINS` empty for a LAN phone.
2. From `backend`: install dependencies, run `npm run db:init`, then `npm run seed` once on an empty database, then `npm run dev` or `npm start`.
3. From `frontend`: install dependencies, then `npm run dev`.
4. Open the Vite URL in the browser using a host name that phones can reach if you need QR attendance.

Production hosting is [Deployment](deployment.md). Do not run `npm run seed` when `NODE_ENV=production`.

## Current status

**Partial.** Schema init, seed, the smoke npm script, and `backend/.env.example` are in place. There is still no root script that starts both processes. Dev CORS stays open until `CORS_ORIGINS` is set. Production refuses to start without database settings, a JWT secret of at least 32 characters, and `CORS_ORIGINS`. See [Deployment](deployment.md).

## Implementation details and gotchas

- `package.json` `"main": "index.js"` does not point at a file. Use the npm scripts.
- Seed is not idempotent. The file comment says to run it once on an empty database. A second run hits duplicate keys. See [Seed data](seed-data.md).
- The smoke script logs in as the seed accounts and then creates users, courses, and offerings, publishes a grade, and moves the current semester's `registration_end` to yesterday. It is a mutating test.
- An empty `CORS_ORIGINS` in development uses `cors()` with no origin list, so a phone on the LAN can call the API. Set `CORS_ORIGINS` to a comma-separated list before a shared or production deployment. Production exits when that variable is empty.
- No HTTPS, rate limit, helmet, or request-size limit is configured. `express.json()` uses its default body limit.
- Oxlint is configured with `react/rules-of-hooks` as error and `react/only-export-components` as warn (`allowConstantExport: true`). `AuthContext.jsx` exports both components and `homeByRole`, which matches that allow-list.

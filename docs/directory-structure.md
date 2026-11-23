# Directory structure

## Overview

The repository root contains two applications, `backend` and `frontend`, plus this `docs` folder. There is no root `package.json`. `node_modules` exists under both apps after install and is ignored by git.

## Purpose and responsibilities

`backend` is the API and the demo-data script. `frontend` is the browser app. Shared types, a monorepo tool, Docker, and CI configuration are not present.

## Key files

```
sis-project/
├── .gitignore                  # ignores node_modules/, .env, dist/
├── docs/                       # this documentation
├── backend/
│   ├── package.json            # scripts: dev, start, db:init, seed
│   ├── package-lock.json
│   ├── .env.example            # variable names; copy to .env
│   ├── .env                    # local only; gitignored (names documented in setup)
│   ├── scripts/
│   │   ├── migrate.js          # npm run db:init
│   │   └── smoke.js            # npm run test:api
│   ├── sql/
│   │   └── 001_init.sql        # schema for an empty database
│   └── src/
│       ├── server.js           # process entry
│       ├── seed.js             # demo inserts
│       ├── domain/
│       │   └── enrollment.js   # occupying statuses (enrolled, completed, failed)
│       ├── config/db.js        # MySQL pool
│       ├── config/env.js       # DB settings; development-only fallbacks
│       ├── controllers/authController.js
│       ├── middleware/auth.js
│       ├── routes/
│       │   ├── auth.js
│       │   ├── catalog.js      # mounted at /api
│       │   ├── offerings.js
│       │   ├── enrollments.js
│       │   ├── student.js
│       │   ├── instructor.js
│       │   ├── attendance.js
│       │   ├── messages.js     # exports messages and notifications routers
│       │   └── admin.js
│       ├── services/
│       │   ├── gpa.js
│       │   ├── registration.js
│       │   └── notify.js
│       └── utils/
│           ├── errors.js
│           ├── meetings.js
│           └── tx.js
└── frontend/
    ├── index.html              # title Unidex, lang=ar, dir=rtl
    ├── package.json
    ├── package-lock.json
    ├── vite.config.js
    ├── .oxlintrc.json
    ├── .gitignore              # node_modules, .env
    ├── .env.example            # VITE_API_URL
    ├── README.md               # Vite template text, plus a Unidex production-build note
    ├── public/
    │   ├── favicon.svg         # referenced by index.html
    │   └── icons.svg           # not referenced by application source
    └── src/
        ├── main.jsx
        ├── App.jsx             # routes
        ├── App.css             # Vite template CSS; not imported
        ├── index.css           # application styles, including print
        ├── api/axios.js
        ├── context/AuthContext.jsx
        ├── context/LanguageContext.jsx
        ├── hooks/useFetch.js
        ├── i18n/translations.js
        ├── utils/format.js
        ├── assets/             # hero.png, react.svg, vite.svg; not imported
        ├── components/
        │   ├── Brand.jsx
        │   ├── LanguageSwitcher.jsx
        │   ├── Layout.jsx
        │   ├── ProtectedRoute.jsx
        │   ├── ui.jsx
        │   └── WeeklySchedule.jsx
        └── pages/
            ├── Login.jsx
            ├── student/        # StudentHome, Registration, Schedule, Grades, Transcript, Attendance, Attend
            ├── doctor/         # DoctorHome, OfferingRoster, AttendanceSession
            ├── admin/          # AdminHome, AdminCatalog, AdminOfferings, AdminUsers
            └── shared/         # Catalog, Messages, Notifications
```

## Data flow

Nothing at the root starts both processes. Each app has its own `npm` scripts. The frontend never imports backend code. The only contract is HTTP JSON under `/api`.

## Dependencies and interactions

- Root `.gitignore` ignores `.env` anywhere, so `backend/.env` is not committed. A `frontend/.env` would also be ignored. `.env.example` is not ignored. `backend/.env.example` and `frontend/.env.example` are in the tree. No filled-in `.env` file is committed.
- `backend/package.json` sets `"main": "index.js"`. That file does not exist. The real entry is `src/server.js`, used by the `start` and `dev` scripts.
- Comments in `backend/src` and `frontend/src` are written in Arabic. User-facing copy is in `frontend/src/i18n/translations.js` for both languages.

## Current status

**Complete** as a map of the working tree. Generated folders `backend/node_modules` and `frontend/node_modules` are install output and are not documented file by file.

## Implementation details and gotchas

- A search of application `js` / `jsx` / `css` / `html` / `md` / `sql` files found no `TODO`, `FIXME`, or `WIP` markers. The only ripgrep hit for that pattern was inside `backend/package-lock.json` integrity text.
- `backend/sql/001_init.sql` is the `CREATE TABLE` script. `npm run db:init` applies it only when `users` is missing.
- `frontend/src/App.css`, `frontend/src/assets/hero.png`, `frontend/src/assets/react.svg`, `frontend/src/assets/vite.svg`, and `frontend/public/icons.svg` are not referenced by `index.html` or by any file under `frontend/src` other than `App.css` itself.

# Unidex documentation

Unidex is a bilingual (Arabic / English) university student-information system. A React client talks to an Express API, which stores data in MySQL. Three roles are implemented: student, instructor (the UI calls this role "doctor"), and admin.

This folder describes the code that is in the repository today. It does not describe a planned future version. Where a behavior depends on a database object that is not defined in the repository, the page says so.

## What the system does

- Sign-in by login ID and password. Access tokens last 2 hours. A refresh token lasts 7 days.
- Course catalog with departments, bilingual names, credit hours, a practical flag, and prerequisites.
- Semesters, including one current semester and a registration window.
- Course offerings (sections) with an instructor, a capacity, and weekly meetings.
- Student registration with prerequisite, repeat, capacity, schedule-conflict, and credit-limit checks.
- Instructor grade entry and publish. Students see component scores, a letter, and a printable transcript.
- Cumulative GPA and a per-term credit cap (14, 18, or 21).
- QR attendance. The instructor shows a rotating code. The student opens it on a phone.
- Messages between a student and the instructors of that student's courses, plus in-app notifications.
- Admin screens for departments, courses, semesters, offerings, users, and dashboard counts.

## How it is put together

```
Browser (React, Vite)
    │  Axios  →  VITE_API_URL, or in `vite` dev  http://<page-host>:5000/api
    ▼
Express 5  (backend/src/server.js)
    ├── JWT middleware
    ├── route modules (catalog, offerings, enrollments, student, instructor, attendance, messages, admin)
    ├── services (registration rules, GPA, notifications)
    └── mysql2 pool  →  database name unidex_db by default
```

There is no root `README`. `backend/sql/001_init.sql` is the schema. `npm run db:init` applies it, then `backend/src/seed.js` inserts demo data.

## Index

| Document | What it covers |
|---|---|
| [Architecture](architecture.md) | Runtime shape, roles, request path, trust boundaries |
| [Directory structure](directory-structure.md) | Every application file and what it is for |
| [Setup and configuration](setup-and-configuration.md) | Scripts, environment variables, how the client finds the API |
| [Deployment](deployment.md) | Production env, database init, build, and where to host |
| [Data model](data-model.md) | Tables and columns inferred from queries. No DDL is in the repo |
| [Backend server](backend-server.md) | Process entry, middleware, error handler |
| [Authentication](authentication.md) | Register, login, `/me`, language, route guards |
| [Catalog](catalog.md) | Departments, courses, prerequisites, semesters, instructor list |
| [Offerings and meetings](offerings.md) | Sections, weekly times, rooms |
| [Registration](registration.md) | Enroll and drop rules |
| [Grades and transcript](grades-and-transcript.md) | Score scales, publish, GPA, credit cap |
| [Attendance](attendance.md) | QR sessions, scan, manual marks, absence warning |
| [Messaging and notifications](messaging-and-notifications.md) | Threads, contacts, unread counts |
| [Admin](admin.md) | Stats, user creation, password reset |
| [API reference](api-reference.md) | Every HTTP route, who may call it, and the response shape |
| [Error codes](error-codes.md) | JSON `error` codes and where they are produced |
| [Seed data](seed-data.md) | Demo departments, courses, accounts, and grades |
| [API smoke test](api-smoke-test.md) | `backend/scripts/smoke.js` and what it mutates |
| [Frontend shell](frontend-shell.md) | Router, auth context, API client, shared components |
| [Student UI](frontend-student.md) | Home, registration, schedule, grades, transcript, attendance |
| [Instructor UI](frontend-instructor.md) | Course list, roster, grade grid, QR screen |
| [Admin UI](frontend-admin.md) | Dashboard, catalog editor, offerings editor, users |
| [Shared UI](frontend-shared.md) | Catalog browser, messages, notifications |
| [Internationalization](internationalization.md) | Arabic/English strings, direction, stored language |
| [Gaps and technical debt](gaps-and-technical-debt.md) | Missing pieces and risks found in the code |

## Sources

Application source under `backend/src`, `backend/scripts/smoke.js`, `backend/package.json`, `frontend/src`, `frontend/package.json`, `frontend/vite.config.js`, `frontend/index.html`, and the root `.gitignore`. `node_modules` is not part of the application.

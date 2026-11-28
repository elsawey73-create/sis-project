# Data model

## Overview

The application expects a MySQL database (default name `unidex_db`). A new database is created from `backend/sql/001_init.sql` by `npm run db:init`. That command also patches a database that already has tables: it adds `users.token_version` when the column is missing, and it sets the attendance timing defaults below. It then applies any later `backend/sql/NNN_*.sql` file that is not recorded in `schema_migrations`. `003_password_reset_tokens.sql` creates `password_reset_tokens`.

`001_init.sql` is the contract for a new install. If `users` already exists, the runner does not rebuild the tables, so a database created before that file can still differ in types and foreign keys. The column list on this page matches both the SQL file and the queries.

`005_platform_features.sql` adds `app_settings`, `activity_log`, `notification_preferences`, `notification_dedup`, `announcements`, `course_exams`, `exam_reminder_sent`, and `course_evaluations`. `scripts/migrate.js` also adds attendance photo, location, device, and `marked_by` columns, plus `course_offerings.absence_limit_pct`, when they are missing. Those alters are safe to run again. Face photos stay in `attendance_records.photo`. `course_evaluations` stores `student_id` only to enforce one response per student; instructor reads return the average and, after three responses, comments without names. The admin JSON backup omits password hashes, `qr_secret`, reset tokens, evaluation rows, and photo blobs.

If a column is required for a feature but never set by application code, the database must supply it (a default, or a value inserted outside this repo). Those cases are called out.

## Purpose and responsibilities

Persist users, the academic catalog, registrations, grades, attendance, messages, and notifications. The API never creates tables at startup.

## Key files

Every file under `backend/src` that contains SQL, especially:

- `config/db.js` — pool
- `seed.js` — inserts that show required columns
- `controllers/authController.js`
- `routes/*.js`
- `services/registration.js`, `services/gpa.js`, `services/notify.js`
- `utils/meetings.js`

## Tables

### `users`

Written by seed and `POST /api/admin/users`. There is no public signup route.

| Column | Evidence |
|---|---|
| `id` | Insert id, used as the JWT `id` and as `student_id` / `instructor_id` / `opened_by` |
| `login_id` | Login lookup. Admin create requires `^[A-Za-z0-9_-]{3,30}$` |
| `password_hash` | bcrypt |
| `full_name_ar` | Required on create |
| `full_name_en` | Optional |
| `email` | Optional. Stored lowercased and trimmed. Seed does not set it |
| `role` | `'student'`, `'instructor'`, or `'admin'` |
| `preferred_lang` | `'ar'` or `'en'`, updated by `PATCH /api/auth/language`. Seed does not set it |
| `token_version` | Integer, default 0. Stored in the access JWT and the refresh JWT as `tv`. Logout, admin password reset, and public password reset increment it |
| `created_at` | Selected by `GET /api/admin/users`. Default `CURRENT_TIMESTAMP` in `001_init.sql` |

Duplicate `login_id` or email surfaces as MySQL `ER_DUP_ENTRY`, which admin create returns as `DUPLICATE`.

### `password_reset_tokens`

Created by `sql/003_password_reset_tokens.sql`. The API inserts a row from `POST /api/auth/forgot-password` and never stores the raw token.

| Column | Evidence |
|---|---|
| `id` | Surrogate key |
| `user_id` | FK to `users.id`, `ON DELETE CASCADE` |
| `token_hash` | SHA-256 hex of the reset token. Unique |
| `expires_at` | `NOW()` plus 60 minutes at insert |
| `used_at` | Null until the token is spent, replaced by a newer request, or left behind by a successful reset |
| `created_at` | Default `CURRENT_TIMESTAMP` |

### `students`

One row per student user.

| Column | Evidence |
|---|---|
| `user_id` | Joined to `users.id`. Also used as `enrollments.student_id` |
| `student_code` | Set equal to `login_id` by both create paths |
| `department_id` | Required FK. A missing department on admin create becomes `INVALID_REFERENCE` |
| `level` | Seed sets 2 or 1. Admin create uses `level` or `1` |
| `admission_year` | Set to `new Date().getFullYear()` on create. Seed sets 2025 or 2026 |

`enrollments.student_id` stores `users.id`, not a separate students primary key. Queries join `students.user_id`.

### `instructors`

| Column | Evidence |
|---|---|
| `user_id` | Joined to `users.id`. `course_offerings.instructor_id` stores this user id |
| `department_id` | Required when an admin creates an instructor |

### `departments`

| Column | Evidence |
|---|---|
| `id` | Insert id |
| `code` | Uppercased on admin write |
| `name_ar`, `name_en` | Required |

Delete is blocked by the database when a row is referenced (`ER_ROW_IS_REFERENCED_2` → `IN_USE`).

The live `unidex_db` faculty departments, beyond the original seed codes, are:

| Code | English name | Arabic name | Courses |
|---|---|---|---|
| `BSE` | Basic Sciences & Engineering | مواد إعدادي وأساسيات | 35, prefix `BSE` |
| `EE` | Electrical Engineering | الهندسة الكهربية | 17, prefixes `EEP` and `EEG` |
| `CSE` | Computer & Systems Engineering | هندسة الحاسبات والنظم | 62, prefix `CSE` |
| `ECE` | Electronics & Communications Engineering | هندسة الإلكترونيات والاتصالات | 39, prefix `ECE` |
| `EPC` | Electrical Power & Machines Engineering | هندسة القوى والآلات الكهربية | 44, prefix `EPC` |
| `ARC` | Architecture | الهندسة المعمارية | 0 |
| `CBE` | Civil Engineering | الهندسة المدنية | 0 |
| `MEP` | Mechanical Power Engineering | هندسة القوى الميكانيكية | 0 |
| `MEM` | Mechatronics Engineering | هندسة الميكاترونكس | 0 |
| `MED` | Mechanical Design Engineering | هندسة التصميم الميكانيكي | 0 |

`UNIVREQ` (متطلبات الجامعة) holds the 42 general courses (`HUM`, `LNG`, `lang`, `SNS`). Fall 2026 is the current semester: 34 offerings, 146 seat-holding enrollments, and one dropped row (`student9` in `HUM002n`). Forty of the seat-holding rows have a published grade. The other current enrollments have no grade row. Attendance has 14 closed sessions and one open session on `CSE101n`. Course codes, instructors, meetings, and which students are enrolled are listed in [Seed data](seed-data.md).

### `courses`

| Column | Evidence |
|---|---|
| `id` | |
| `code` | Uppercased on write |
| `name_ar`, `name_en` | Required |
| `description_ar`, `description_en` | Optional |
| `credit_hours` | Required number. UI asks for 1–6. API checks only that it is present |
| `has_practical` | `1` or `0`. Changes the grade component maximums |
| `department_id` | Required FK |

### `course_prerequisites`

| Column | Evidence |
|---|---|
| `course_id` | The course that requires another course |
| `prerequisite_id` | The required course |

Replaced as a set on course create and update. A course is not inserted as its own prerequisite (`Number(pid) !== Number(courseId)`). There is no cycle check in code.

### `semesters`

| Column | Evidence |
|---|---|
| `id` | |
| `name_ar`, `name_en` | Required |
| `start_date`, `end_date` | Required. Rejected when `start_date >= end_date` |
| `registration_start`, `registration_end` | Required. Rejected when `registration_start > registration_end` |
| `is_current` | `1` or `0`. Setting a semester current first runs `UPDATE semesters SET is_current = 0` |

Registration is open when `CURDATE()` is between `registration_start` and `registration_end`, inclusive. That comparison uses the MySQL server's current date.

There is no delete-semester route.

### `course_offerings`

| Column | Evidence |
|---|---|
| `id` | |
| `course_id`, `semester_id`, `instructor_id` | Required FKs |
| `section` | String. Default `'1'` when omitted |
| `capacity` | Number. Default `40` when omitted. Must be `> 0` |

Delete is expected to fail with `IN_USE` when enrollments reference the row (comment in `offerings.js`, plus the global handler for `ER_ROW_IS_REFERENCED_2`).

### `offering_meetings`

| Column | Evidence |
|---|---|
| `id` | Selected by `attachMeetings` |
| `offering_id` | |
| `day_of_week` | `Sat`, `Sun`, `Mon`, `Tue`, `Wed`, `Thu`. Friday is not accepted |
| `start_time`, `end_time` | Regex `HH:MM` or `HH:MM:SS`. Start must be `<` end as strings |
| `room` | Non-empty after trim |
| `type` | `lecture`, `section`, or `lab`. Default `lecture` |

Saving meetings deletes all meetings for the offering, then inserts the new list. An empty list is valid (the smoke test creates an offering with `meetings: []`).

### `enrollments`

| Column | Evidence |
|---|---|
| `id` | Returned as `enrollment_id` |
| `student_id` | `users.id` of the student |
| `offering_id` | |
| `status` | `'enrolled'`, `'dropped'`, `'completed'`, `'failed'`. Default `'enrolled'` in `001_init.sql` and on the current local database |
| `enrolled_at` | Set to `NOW()` when a dropped row is enrolled again |

Inserts omit `status`:

```sql
INSERT INTO enrollments (student_id, offering_id) VALUES (?,?)
```

Every later read treats a new row as `'enrolled'`. The default that makes that true is not defined in this repository. A unique key on `(student_id, offering_id)` is implied by the re-enroll path, which updates the existing row instead of inserting a second one, and by `ALREADY_ENROLLED`.

Status changes:

- Drop sets `'dropped'` (only from `'enrolled'`, and only inside the registration window).
- Grade publish sets `'completed'` when `points > 0`, otherwise `'failed'`.
- Saving a grade again sets `'enrolled'` and clears the published letter.

### `grades`

| Column | Evidence |
|---|---|
| `enrollment_id` | `ON DUPLICATE KEY UPDATE` proves a unique key |
| `coursework`, `midterm`, `practical`, `final_exam` | Nullable component scores |
| `total` | Sum when every required component is non-null. Otherwise null |
| `letter`, `points` | Null until publish. Cleared when the row is edited |
| `published` | `0` on save, `1` on publish. Students only read `published = 1` |

### `attendance_sessions`

| Column | Evidence |
|---|---|
| `id` | |
| `offering_id` | |
| `meeting_id` | Written from the request or null. No route reads it back for display. The instructor UI does not send it |
| `session_date` | Set to `CURDATE()` on insert |
| `opened_by` | Instructor user id |
| `qr_secret` | 24 random bytes, hex. Used only as the HMAC secret for the rotating QR JWT. Stripped from the session detail response |
| `status` | `'open'` or `'closed'` |
| `opened_at` | Used in `TIMESTAMPDIFF(MINUTE, s.opened_at, NOW())`. Not set by the INSERT |
| `closed_at` | Set to `NOW()` on close |
| `token_ttl_seconds` | Passed to `jwt.sign` as `expiresIn`. New sessions insert `30`. Column default in `001_init.sql` is 30 |
| `late_after_minutes` | Scan is `'late'` when minutes since `opened_at` is greater than this value. New sessions insert `15`. Column default is 15 |

New sessions insert `opened_at = NOW()`, `status = 'open'`, `token_ttl_seconds = 30`, and `late_after_minutes = 15`. The QR component asks for a new token every 20 seconds. A photographed code stops working when that 30-second JWT expires.

At most one open session per offering is returned. If one exists, `POST /sessions` returns that id with HTTP 200. A new session is HTTP 201.

### `attendance_records`

| Column | Evidence |
|---|---|
| `session_id`, `student_id` | Insert. Duplicate → `ER_DUP_ENTRY` → `ALREADY_RECORDED` |
| `status` | `'present'`, `'late'`, `'excused'`. `'absent'` deletes the row instead of storing it |
| `method` | Scan insert omits it. Manual upsert sets `'manual'` |
| `scanned_at` | Selected for the instructor session view. Not set in application SQL |

A student counts as attended when any row exists for a **closed** session. `present`, `late`, and `excused` all count. Absence is the lack of a row.

### `messages`

| Column | Evidence |
|---|---|
| `id` | |
| `sender_id`, `receiver_id` | User ids |
| `offering_id` | Nullable. Set only when that offering is one of the allowed contact pairs. Deleting the offering sets this column to NULL (`ON DELETE SET NULL`) and keeps the message row |
| `parent_id` | Null on the thread root. Replies store the root id |
| `subject` | Trimmed, cut to 150 characters. Required on create. Replies do not send a subject |
| `body` | Trimmed, length 1–5000 |
| `is_read` | `0` means unread. Opening a thread sets `1` for rows received by the current user |
| `created_at` | Selected and sorted. Not set in application SQL |

A thread is a root (`parent_id IS NULL`) plus rows whose `parent_id` is that root. There is no deeper nesting.

### `notifications`

| Column | Evidence |
|---|---|
| `id` | |
| `user_id` | |
| `type` | `'grades_published'` or `'message'` in current writers |
| `data` | `JSON.stringify` on write. `JSON.parse` on read. Parse failure becomes `{}` |
| `is_read` | `GET /summary` counts `is_read = 0`. `POST /read-all` sets `1` |
| `created_at` | Selected. Not set in application SQL |

`grades_published` data: `{ course_code, course_ar, course_en }`.

`message` data: `{ thread_id, from_ar, from_en }`.

List endpoint returns the latest 50 rows (`ORDER BY id DESC LIMIT 50`).

## Relationships

```
departments 1──* courses
departments 1──* students
departments 1──* instructors
courses *──* courses            through course_prerequisites
courses 1──* course_offerings
semesters 1──* course_offerings
users 1──* course_offerings     as instructor_id
course_offerings 1──* offering_meetings
users 1──* enrollments          as student_id
course_offerings 1──* enrollments
enrollments 1──1 grades
course_offerings 1──* attendance_sessions
attendance_sessions 1──* attendance_records
users 1──* messages             as sender and as receiver
users 1──* notifications
users 1──* password_reset_tokens
```

## Current status

**Complete** for a new install: `npm run db:init` creates `unidex_db` (or `DB_NAME`), applies `backend/sql/001_init.sql` when `users` is missing, then applies later numbered SQL files such as `003_password_reset_tokens.sql`.

**Partial** for an older database: the runner adds `token_version` and normalizes attendance defaults, applies unrecorded `sql/NNN_*.sql` files, and does not rebuild foreign keys or other columns. New attendance scans write `method = 'qr'`. New sessions write `opened_at`, `status`, `token_ttl_seconds`, and `late_after_minutes` explicitly. Running `npm run db:init` again records nothing new when `003_password_reset_tokens` is already in `schema_migrations`. The token table itself uses `CREATE TABLE IF NOT EXISTS`.

## Implementation details and gotchas

- Foreign-key failures become `INVALID_REFERENCE` (`ER_NO_REFERENCED_ROW_2`).
- Duplicate-key failures become `DUPLICATE` in the global handler.
- Deletes of departments, courses, and offerings rely on InnoDB foreign keys for `IN_USE`. If those constraints are missing, the deletes succeed and can orphan or remove related rows, depending on the engine.
- `student_id` on enrollments is `users.id`. The same id space is used for instructors and admins. Registering requires the caller to be role `student`, so an admin user id is not inserted by the enroll route.
- Like-filters (`q`) pass user text through as `%${q}%`. `?` placeholders prevent SQL injection. `%` and `_` typed by the user still act as LIKE wildcards.
- User search is `LIMIT 300`. There is no paging parameter.

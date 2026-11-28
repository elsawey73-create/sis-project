# Attendance

## Overview

An instructor opens one attendance session per offering. The session screen shows a QR code that points at the frontend route `/attend`. The code's token is a short-lived JWT signed with a per-session secret. Students who are enrolled scan it. The instructor can also set status by hand. Students see per-course totals and a warning when absence is above 25 percent.

## Purpose and responsibilities

- Open, reuse, and close a session for an offering the instructor teaches.
- Issue a rotating token and reject expired or mismatched tokens.
- Record `present` or `late` from a scan, once per student per session.
- Let the instructor set `present`, `late`, `excused`, or `absent`.
- Show the student closed-session totals for the current semester.

## Key files

| Path | Responsibility |
|---|---|
| `backend/src/routes/attendance.js` | All attendance HTTP |
| `frontend/src/pages/doctor/DoctorHome.jsx` | Starts or resumes a session |
| `frontend/src/pages/doctor/AttendanceSession.jsx` | QR, live roster, manual status, close |
| `frontend/src/pages/doctor/OfferingRoster.jsx` | Past sessions for the offering |
| `frontend/src/pages/student/Attend.jsx` | Page opened by the QR |
| `frontend/src/pages/student/Attendance.jsx` | Per-course totals |
| `frontend/src/pages/student/StudentHome.jsx` | Warning banners |
| `frontend/src/components/ProtectedRoute.jsx` | Sends an anonymous scan back to login, then returns |

Instructor routes use `authorize('instructor')`. Scan and `/me` use `authorize('student')`.

## Data flow

### Open

`POST /api/attendance/sessions` body `{ offering_id, meeting_id? }`.

- Missing `offering_id` → `400 MISSING_FIELDS`.
- Offering not taught by this user → `404 NOT_FOUND`.
- An open session already exists for the offering → `200 { id }` of that session.
- Otherwise insert and `201 { id }`. `qr_secret` is `crypto.randomBytes(24).toString('hex')`. `session_date` is `CURDATE()`. `meeting_id` is the body value or null. The doctor UI sends only `offering_id`.

`DoctorHome` navigates to `/doctor/attendance/:id`. If `open_session_id` is set, the button label is "continue" and a live tag is shown. Both paths call the same POST, which returns the existing open session.

### Token

`GET /api/attendance/sessions/:id/token`

The session must be opened by this instructor. Closed → `400 SESSION_CLOSED`. Otherwise:

```text
jwt.sign({ sid: Number(session.id) }, session.qr_secret, { expiresIn })
```

Response `{ session_id, token, expires_in }`. The user-login JWT secret is not used.

`AttendanceSession.jsx` requests a token on load and every 20 seconds while `session.status === 'open'`. A failed token request shows `LoadError` with retry. A code that was already drawn stays on screen. The QR value is:

```text
${window.location.origin}/attend?s=${id}&t=${token}
```

`expiresIn` is `token_ttl_seconds` coerced to a positive whole number of seconds. A numeric string such as `"30"` is 30 seconds. A missing or zero value falls back to 30. The page requests a token on load and every 20 seconds. Each new session stores `token_ttl_seconds = 30`, so a photographed code expires about 30 seconds after it was issued. When the page hostname is `localhost`, `127.0.0.1`, or `::1`, the screen shows `att.phoneHost`: a phone cannot open that QR. Open the instructor site through the machine's LAN address, then start the session again. The API base URL uses that same hostname on port 5000, and dev CORS allows it.

### Session detail

`GET /api/attendance/sessions/:id`

Returns `{ session, students, present, total }`. `session` is the row without `qr_secret`. Students are enrollments in `enrolled`, `completed`, or `failed`, left-joined to this session's record (`status`, `method`, `scanned_at`). `present` is the count of students whose `status` is non-null, so late and excused count. `total` is the roster length.

The page polls this every 4 seconds. The first failure shows `LoadError` with retry. A later failure shows that banner above the roster already on screen and clears it on the next success.

### Close

`POST /api/attendance/sessions/:id/close` sets `status = 'closed'` and `closed_at = NOW()`. Response `{ ok: true }`. It does not write absence rows. Students with no record are absent because the record is missing.

### Manual mark

`PUT /api/attendance/sessions/:id/students/:studentId` body `{ status }`.

Allowed: `present`, `late`, `excused`, `absent`. Anything else → `400 MISSING_FIELDS`.

`absent` deletes the record. The other three require an enrollment in `enrolled`, `completed`, or `failed` for this offering (`403 NOT_ENROLLED` otherwise) and upsert with `method = 'manual'`.

The status `<select>` on the session page calls this on every change. The select treats a null status as `absent`.

### Scan

`POST /api/attendance/scan` body `{ session_id, token }`.

- Missing fields → `400 MISSING_FIELDS`.
- Unknown session or status not `open` → `400 SESSION_CLOSED`.
- `jwt.verify(token, qr_secret)` fails, or `Number(payload.sid)` does not equal `Number(session.id)` → `400 QR_EXPIRED`.
- No occupying row (`enrolled`, `completed`, or `failed`) for this student and offering → `403 NOT_ENROLLED`. A dropped student cannot scan. A published current-term enrollment still can. The smoke test uses a student who is not in the section and expects `NOT_ENROLLED`.
- `Number(minutes since opened_at) > Number(late_after_minutes)` → store `late`, else `present`. A null or non-numeric value counts as present.
- Duplicate insert → `409 ALREADY_RECORDED`.
- Success `{ status, course: { code, name_ar, name_en } }`.

The scan insert sets `method = 'qr'`.

`Attend.jsx` reads `s` and `t` from the query string. It posts once per mount (`useRef`). `StrictMode` remounts in development, so a second post can receive `ALREADY_RECORDED`. That code is success (`att.already`). A `present` or `late` response is kept if the duplicate response arrives later, so the late/present text is not replaced. A later error does not replace `already`. Missing params show the how-to alert. Other errors use `errorText`.

If the phone is not signed in, `ProtectedRoute` stores the `/attend?s&t` location and returns there after login. `Login.jsx` keeps `pathname` and `search`.

### Student totals

`GET /api/attendance/me` for the caller's occupying offerings (`enrolled`, `completed`, `failed`) in the current semester. Publishing a grade does not remove the course from this list.

- `total_sessions`: closed sessions for the offering.
- `attended`: records for this student on those closed sessions (any status).
- `absent`: `total_sessions - attended`.
- `absent_pct`: `round(absent / total_sessions * 1000) / 10` when `total_sessions` is not 0, else 0. One decimal place.
- `warning`: `total_sessions > 0` and `absent_pct > 25`.

Open sessions are excluded from both counts. The smoke test closes a second session without a scan and expects `warning === true` and `absent_pct === 50` (1 of 2).

Exactly 25 percent does not warn, because the comparison is `>`.

`Attendance.jsx` lists the rows. `StudentHome` lists offerings where `warning` is true.

### History

`GET /api/attendance/offering/:id/sessions` for the instructor who owns the offering. Rows: `id`, `session_date`, `opened_at`, `closed_at`, `status`, `present_count` (count of records, not only status `present`). Ordered by id descending. The roster page links each row to `/doctor/attendance/:id`, including closed sessions. A closed session shows the locked message and still allows the manual status dropdown (the PUT route does not check `status === 'open'`).

## Dependencies and interactions

- Roster attendance column uses the same "record on a closed session" count. It does not affect grades.
- QR host must be the frontend origin the phone can open, and that origin's hostname must reach port 5000. See [Architecture](architecture.md).
- Students need a login. The how-to string tells them to sign in if asked.

## Current status

**Complete** for open, a rotating QR, scan, manual override, close, student totals, the absence warning, and the localhost warning.

The displayed code now lasts **20 seconds**, not 15 minutes. `POST /sessions/:id/qr/refresh` expires the previous stored token immediately. `POST /attendance/scan` accepts only that current stored token. A JWT signed with the session secret but not stored as the active row is `QR_EXPIRED`.

A scan also requires a JPEG face photo (`photo`, base64, at most 400 KB) and a `device_id`. The photo is stored in `attendance_records.photo` (a `MEDIUMBLOB` in MySQL), so it survives a Railway redeploy. The container disk is not used. The doctor loads each photo from `GET /sessions/:id/students/:studentId/photo`.

When the session has latitude and longitude (Start Lecture sends them), the scan must include the student's coordinates and a reported accuracy. The scan is accepted when `distance <= radius + accuracy` and `accuracy` is at most the accuracy cap (default 40 m). The default radius is 20 m. A weak fix returns `GPS_INACCURATE`. A reading outside the fence returns `TOO_FAR` with `distance_m` and `radius_m`. The distance is stored on the record. A session opened without coordinates still scans, so older rows keep working.

One `device_id` can record one student per session (`DEVICE_ALREADY_USED` for a second student). The same device can record attendance in the next session. Android sends the Capacitor device id. The website sends a persistent random id plus a hash of browser signals.

Closing a session notifies students who have no mark (`marked_absent`). Crossing 80 percent of the absence limit notifies once (`absence_warning`, approaching). Passing the limit notifies once more. The limit is `app_settings.absence_limit_pct` (default 25) unless the offering sets `absence_limit_pct`. Exactly the limit does not count as exceeded (`absent_pct > limit`), matching the old 25 percent rule.

Manual marks set `method = 'manual'` and `marked_by` to the instructor. Marking absent deletes the row and notifies the student.

`GET /attendance/me/history` is the student's session list. `?semester_id=` on `/attendance/me` and the history route selects another term. Reports: `GET /attendance/sessions/:id/report?format=xlsx|pdf` and `GET /attendance/offerings/:id/report?format=xlsx|pdf`.

`auto_close_minutes` (5–180) on open sets `auto_close_at`. The API process closes due sessions about once a minute and also when the session is read.

**Partial** for phones: the warning tells the instructor to reopen on a LAN host. The app cannot invent that host from `localhost`. `meeting_id` is still unused by the UI. Absence is still "no row". A second scan on the student page shows `att.already` as success instead of an error, including when React StrictMode posts twice in development.

## Implementation details and gotchas

- A student can scan only while `enrolled`. After grade publish moves them to `completed` or `failed`, scan returns `NOT_ENROLLED`. The instructor can still mark them manually because that check allows those statuses.
- Closing does not snapshot the roster. Later changes to enrollment status change who appears on `GET /sessions/:id` (`enrolled`, `completed`, `failed`).
- `GET /attendance/me` ignores offerings that are no longer `enrolled`. A published course vanishes from the student attendance page.
- The live "present" counter counts any stored status. The label in the UI is the attended translation.
- Excused counts as attended for the warning. Only a missing row (or an explicit absent delete) counts as absent.
- Token endpoint is instructor-only. The smoke test expects `403` when a student calls it.
- Wrong token and expired token share `QR_EXPIRED`.
- Re-opening after close creates a new session, because the "already open" lookup requires `status = 'open'`. The smoke test uses that to create the second session that triggers the warning.
- `Attend.jsx` captures `t` in the effect dependency list. The error string is translated with the language at request time. A language toggle does not re-scan, because of the ref.

# Platform features

## Overview

These routes sit on top of the existing roles. A student only sees their own grades, schedule, attendance, and evaluations. An instructor only sees offerings they teach. An admin sees college-wide stats, the activity log, settings, and the backup download.

## Attendance

See [Attendance](attendance.md). Start Lecture is `POST /api/attendance/qr` with `class_id`, `latitude`, `longitude`, `accuracy`, and optional `auto_close_minutes`. The doctor screen refreshes the QR about every 20 seconds.

## Notifications

Types: `grades_published`, `message`, `marked_absent`, `absence_warning`, `announcement`, `exam_reminder`, `registration_open`. Missing a preference row means the type is on. `PUT /api/notifications/preferences` stores `{ type: true|false }`.

Registration-open is created once per student per current semester, from the summary poll, using `notification_dedup`. Exam reminders use `course_exams.exam_at` and `exam_reminder_sent`. The timer is inside the API process. See [Deployment](deployment.md).

## Calendar, search, exports

| Route | Who |
|---|---|
| `GET /api/calendar` | Signed in. Students and instructors see their meetings and exams. Admins see the term window and every exam that term |
| `GET /api/search?q=` | Signed in. Students search visible courses. Instructors search their students and all courses. Admins search students and courses |
| `GET /api/enrollments/me/schedule.ics` | Student. Weekly events for the term. `?semester_id=` selects another term |
| `GET /api/enrollments/me/schedule.pdf` | Student |
| `GET /api/student/transcript.pdf` | Student |
| `GET /api/student/export.xlsx` | Student. Sheets for grades, attendance, and schedule |
| `GET /api/student/terms` | Student. Terms they have an enrollment in |

The `.ics` file is a normal calendar download. Android opens it from the browser download or the WebView download.

## Instructor tools

`GET /api/instructor/stats` is attendance percent, absence count, and average published grade per current course.

`POST /api/instructor/offerings/:id/announcements` writes `announcements` and notifies enrolled students.

`POST /api/instructor/offerings/:id/exams` stores an exam datetime used by the calendar and the reminder job.

`GET /api/instructor/offerings/:id/evaluation` returns the count and average. Comments are included only when at least three students have responded, and they have no student id.

## Evaluations

`GET /api/student/evaluations` lists occupying courses whose semester end is within 21 days or already past. `POST /api/student/evaluations` with `offering_id`, `rating` 1–5, and an optional comment. One row per student and offering. The instructor never receives `student_id`.

## Admin

`GET /api/admin/stats` adds department count, open and closed sessions, attendance marks, published grades, and average grade for the current term.

`GET /api/admin/activity` is the latest rows from `activity_log` (who, action, entity, when). Mutations that write it include user create and password reset, enrollment, grade publish, attendance open/close/scan/manual, announcements, exams, settings, and backup download.

`GET /api/admin/settings` and `PUT /api/admin/settings` change `attendance_radius_m` (5–500), `attendance_accuracy_cap_m` (5–200), and `absence_limit_pct` (1–100).

`GET /api/admin/backup` returns JSON, `Cache-Control: no-store`, admin only. It omits password hashes, QR secrets, reset tokens, evaluation rows, and face photos.

## Offline and theme

The website and the Android WebView keep the last successful schedule and grades payload in `localStorage` (`unidex.offline.v1`). A failed load shows that copy and an offline banner. Theme already follows the system until the user picks light or dark. The choice is stored in `localStorage` under `theme`.

## Android

The scan flow uses the rear camera for the QR, then the front camera for the face photo (`@capacitor/camera`). Location uses `@capacitor/geolocation`. The device id uses `@capacitor/device`. The manifest requests camera and fine location. The same pages run in the browser with `getUserMedia` and `navigator.geolocation`.

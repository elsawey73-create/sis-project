# Messaging and notifications

## Overview

Students and instructors can message each other when they share an enrollment that is not dropped. Admins have no message routes. Notifications are rows in `notifications`. Writers include grades, messages, absences, announcements, exam reminders, and registration open. Each user can turn a type off in `notification_preferences`. The navbar polls unread counts. `GET /api/messages/threads?q=` filters by subject, the other person's name, or course code. `POST /api/notifications/:id/read` marks one row. The bell still uses `GET /api/notifications/summary`.

## Purpose and responsibilities

- Limit who may start a thread.
- Store a thread as one root message plus replies that point at the root.
- Mark messages read when a participant opens the thread.
- Store notifications for any authenticated user and mark them all read.

## Key files

| Path | Responsibility |
|---|---|
| `backend/src/routes/messages.js` | Both routers. Exported as `{ messages, notifications }` |
| `backend/src/services/notify.js` | `INSERT INTO notifications` |
| `frontend/src/pages/shared/Messages.jsx` | Inbox, compose, reply |
| `frontend/src/pages/shared/Notifications.jsx` | List and mark-all-read |
| `frontend/src/components/Layout.jsx` | Bell, message link, 30-second poll |

Mounts: `/api/messages` and `/api/notifications`.

Message routes use `authorize('student', 'instructor')`. Notification routes use `authenticate` only, so an admin can open `/notifications`.

## Contacts

`GET /api/messages/contacts`

Student: distinct instructors of offerings where this student has an enrollment with status other than `dropped`, with `offering_id` and `course_code`.

Instructor: distinct students enrolled the same way on offerings this instructor teaches.

A person appears once per offering, because `offering_id` and `course_code` are in the select list. The compose form uses the array index as the option value and sends that row's `id` and `offering_id`.

## Threads

`GET /api/messages/threads`

Roots where the caller is sender or receiver. Each item adds the other party's id, names, and role, the course code if the offering still exists, `last_body`, `last_at` (from the max message id in the thread), and `unread` (count of messages in the thread received by the caller with `is_read = 0`). Sorted by `last_at` descending.

`GET /api/messages/threads/:id`

404 when the caller is not a participant or the id is not a root (`NOT_FOUND`). The smoke test expects this when a third student opens the thread.

Returns `{ thread, messages }`. Messages are root plus `parent_id = root`, ordered by id, with sender names. Then the handler marks `is_read = 1` for messages in that thread whose `receiver_id` is the caller.

`POST /api/messages/threads`

Body: `receiver_id`, `offering_id`, `subject`, `body`.

- Body trim empty or longer than 5000 → `400 MISSING_FIELDS`.
- Missing receiver or blank subject → `400 MISSING_FIELDS`.
- Receiver not in the contact list (numeric id compare) → `403 FORBIDDEN`.
- `offering_id` is stored only when some contact row matches both the receiver and that offering. Otherwise the column is null.
- Subject is trimmed and sliced to 150 characters.
- Insert plus a `message` notification to the receiver, in one transaction.
- `201 { id }` of the root.

`POST /api/messages/threads/:id/reply`

Loads the thread (participant check). Body rules match create. Receiver is the other participant. Inserts `parent_id = root id`, copies the root's `offering_id`, and notifies that person. `201 { ok: true }`.

The navbar hides the messages link when `user.role === 'admin'`. Routes for `/messages` allow only `student` and `instructor`.

## Notifications

`notify(q, userId, type, data)` inserts `JSON.stringify(data)`. Callers:

| Type | Writer | Payload |
|---|---|---|
| `message` | New thread and reply | `{ thread_id, from_ar, from_en }` |
| `grades_published` | Grade publish | `{ course_code, course_ar, course_en }` |

`GET /api/notifications` — latest 50 for the caller. `data` is parsed JSON.

`GET /api/notifications/summary` — `{ notifications, messages }`. Notification count is unread notification rows. Message count is unread messages where the caller is `receiver_id`. Admins get a message count too, which stays 0 unless a row exists. The UI shows the message badge only on the messages link, which admins do not see. The bell uses the notification count for every role.

`POST /api/notifications/read-all` sets `is_read = 1` on the caller's notifications. It does not mark messages read.

`Notifications.jsx` renders `message` as a link to `/messages/:thread_id` and `grades_published` as text. Any other `type` is shown as the raw type string. Unread rows use the `notif unread` class. The read-all button posts and reloads. Opening the page does not mark rows read by itself.

`Layout.jsx` loads the summary on mount, every 30 seconds, and whenever `location.pathname` changes.

## Dependencies and interactions

- Grade publish: [Grades and transcript](grades-and-transcript.md).
- Contact membership follows enrollment status. Dropped enrollments disappear from contacts. `completed` and `failed` still count (`status <> 'dropped'`), so a student can message an instructor after the course is published.
- Auth roles: [Authentication](authentication.md).

## Current status

**Complete** for course-scoped messaging between students and instructors, and for the two notification types the server writes.

**Partial** for admins (bell works, nothing currently notifies them) and for delivery (no email, no push, no websocket). The 30-second poll is the update mechanism.

## Implementation details and gotchas

- There is no delete, edit, or attachment.
- There is no check that a reply's sender is still in `contactsFor`. A participant can reply after a drop. Starting a **new** thread re-checks contacts.
- `nameOf` assumes the sender row exists. A missing user would throw when reading `full_name_ar` and become `500 SERVER_ERROR`.
- Unread on the thread list is message rows, not notification rows. Opening the thread clears message unread. The notification row stays unread until "mark all read".
- Summary `messages` counts every unread message, including ones inside threads. After the doctor opens the thread, the smoke test expects the summary message count to be 0.
- Compose navigates to `/messages` without an id, then after send navigates to `/messages/:id`.
- The message list and the open thread are separate `useFetch` calls. Sending a reply reloads both.
- `white-space: pre-wrap` on `.bubble` preserves line breaks in the body.
- At widths of 800px and below, `.msg-layout` stacks to one column (`index.css`).

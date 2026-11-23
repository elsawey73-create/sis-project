# Shared UI

## Overview

Three pages are used by more than one role: the course catalog, messages, and notifications. They live in `frontend/src/pages/shared`.

## Purpose and responsibilities

- Let any signed-in user browse courses and open a description row.
- Let students and instructors exchange course-related messages.
- Let any signed-in user read notifications.

Colors come from the shared tokens in [Frontend shell](frontend-shell.md), including dark mode. The open thread and an unread notification use primary light. A practical course uses the info tag. Empty results use secondary text. Send uses the primary button.

## Key files

| Path | Routes | API |
|---|---|---|
| `pages/shared/Catalog.jsx` | `/catalog` | `GET /courses`, `GET /departments` |
| `pages/shared/Messages.jsx` | `/messages`, `/messages/:id` | contacts, threads, thread detail, create, reply |
| `pages/shared/Notifications.jsx` | `/notifications` | `GET /notifications`, `POST /notifications/read-all` |

`App.jsx` puts catalog and notifications behind a signed-in guard with no role list. Messages allow `student` and `instructor` only.

## Catalog page

Local state: search string `q`, department id, and `open` (the course id whose detail row is expanded). Query string is sent to `GET /courses`. The table shows code, localized name, department, hours, a practical tag when `has_practical` is set, and prerequisite codes. Clicking a row toggles a second row with the localized description (or an em dash) and the prerequisite names. There is no link from a course to its offerings. A failed course list shows `LoadError` with retry. An empty result shows `reg.none`. A failed department list shows the same error above the table and leaves the department filter on "all".

## Messages page

Left column: a "new message" button, then threads. Each row shows the other person's name, an unread count badge when `unread > 0`, the subject, the course code, and `last_body` (CSS class `ellipsis`). The active thread matches the `:id` param.

Right column:

- Compose form when `composing` is true: contact `<select>` (name and course code), subject, body. Submit posts and navigates to the new id.
- Empty state `msg.select` when nothing is open.
- Otherwise subject, other person, course code, bubbles, and a reply box.

Bubbles use `bubble mine` when `sender_id === user.id`. A ref scrolls to the end when `thread.data` changes.

The new-message button also navigates to `/messages` (no id) so a previously open thread unmounts its detail.

Errors from send or reply use `errorText`. A failed thread list, open thread, or contact list shows `LoadError` with retry. Send and reply disable the button while the request is in flight. Reply also stays disabled when the box is empty. The new-message handler ignores a missing contact instead of posting.

Layout: two columns, stacked under 800px. See [Messaging and notifications](messaging-and-notifications.md).

## Notifications page

Renders up to 50 items. For a student or instructor, `message` links to `/messages/${data.thread_id}`. For an admin that same row is plain text, because `/messages` is not an admin route. `grades_published` is plain text with course code and name. Other types render `n.type`. Timestamp is `created_at` as returned by the API (a string, because of `dateStrings`). Unread items have class `unread`. "Mark all read" posts and reloads. Visiting the page does not mark items read.

An admin can open this page. Message rows stay on the page as text. The server does not write message notifications for admins.

## Dependencies and interactions

- Navbar badges: [Frontend shell](frontend-shell.md).
- Who may be contacted, and when rows are written: [Messaging and notifications](messaging-and-notifications.md).
- Course fields: [Catalog](catalog.md).

## Current status

**Complete** for browsing, threading, and the notification list as implemented.

**Complete** for an admin who already has a `message` row: the text is shown and the link is not.

## Implementation details and gotchas

- Catalog search refetches on every change, same as registration. There is no debounce.
- Contact options use the array index as `<option value>`. Reloading contacts while the form is open can point the index at a different person. The form is cleared after a successful send.
- Thread open marks messages read on the server. The thread list unread badge updates when `threads.reload()` runs. Opening a thread from the list does not call `threads.reload()` itself. The navbar poll (30 seconds or the pathname change) refreshes the summary. Pathname does change when navigating to `/messages/:id`, so the bell and message badge refresh on navigation. The badge inside the thread list updates on the next `threads` reload (reply, or a remount).
- `GET` thread is skipped when `id` is undefined (`useFetch(null)`).
- Notification `created_at` is not passed through a date formatter.
- Descriptions that are null show an em dash. Seed descriptions are non-null template sentences.

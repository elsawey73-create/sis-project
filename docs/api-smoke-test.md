# API smoke test

## Overview

`backend/scripts/smoke.js` signs in as the four seed accounts and asserts a long sequence of API behaviors. It is a Node script that uses global `fetch`. `backend/package.json` runs it as `npm run test:api`. The API must already be listening, and the database should be a fresh seed. The script prints a warning because it changes that database.

## Purpose and responsibilities

Lock the behavior of login, catalog search, registration rules, GPA, grade save and publish, QR attendance, messages, admin create, capacity, and the registration window. It prints `PASS` or `FAIL` per check and exits `1` if any failed, `2` if the process threw.

## Key files

| Path | Responsibility |
|---|---|
| `backend/scripts/smoke.js` | The whole test |
| `backend/src/seed.js` | The world it expects |

## How to run

From `backend`, with the API already listening:

```text
npm run test:api
```

Optional environment variable `API` replaces the default base `http://localhost:5000/api`.

There is no assertion library. `ok(name, cond, extra)` increments `pass` or `fail` and prints the line.

## What it covers

The names below are the strings passed to `ok`.

**Auth.** Login of admin, D1001, Amr, and Sara. Wrong password is 401. Student token on `GET /admin/stats` is 403.

**Catalog.** 12 courses. CS301 has 2 prerequisites. `q=Calculus` returns 2 courses.

**Registration for Amr.** 9 current offerings. CS101 is `passed`. CS201 reports missing `CS102`. Enroll CS201 → `PREREQ_NOT_MET`. Enroll CS101 → `ALREADY_PASSED`. Enroll CS102 → 201. Second enroll → `ALREADY_ENROLLED`. Enroll MTH201 → `TIME_CONFLICT` with `CS102`. Enroll MTH102 → 201. My courses length 2, credits 6, `max_credits` 21. Drop MTH102. Enroll MTH102 again → 201.

**GPA before the new grade.** Summary CGPA 3.32 and 11 credits earned. Transcript has one semester with GPA 3.32.

**Grades.** D1001 sees CS102 with `enrolled_count` 1. Roster practical max is 10. Coursework 25 is `INVALID_GRADE`. Save 18, 17, 9, 45 returns `saved === 1`. Student grades do not yet include CS102.

**Attendance.** Open session → 201. Open again returns the same id. Token is non-empty. Student cannot get the token (403). Token plus `x` is `QR_EXPIRED`. Sara's scan is `NOT_ENROLLED`. Amr's scan is `present`. Second scan is `ALREADY_RECORDED`. Detail is 1/1. Close, then scan is `SESSION_CLOSED`. Amr's CS102 attendance is 1/1 and `warning` is falsy. A second session is opened and closed with no scan. Absence 50 percent sets `warning` true.

**Publish.** Publish returns `published === 1`. Student sees CS102 total 89 letter A-. Transcript has 2 semesters and 14 credits earned. CGPA is 3.4. Enroll CS201 now returns 201. Notifications include `grades_published`.

**Messages.** Amr's contacts include an instructor. He messages the CS102 contact. Messaging the admin user id is 403. Doctor summary `messages` is 1. Thread list length 1, unread 1, course CS102. Opening the thread clears the summary count. Doctor reply is 201. Amr sees 2 messages. Sara opening the thread is 404.

**Admin.** Stats are 2 students, 2 instructors, 12 courses. Create instructor `D2001` / `Pass1234` → 201. Duplicate login id → 409. `D2001` can log in. Create course `CS999` with prerequisite CS101 → 201. Delete CS101 → `IN_USE`. A meeting with end before start → `INVALID_MEETING`. Create a second CS101 section with capacity 1 on Thursday → 201. Sara enrolling in it → `COURSE_ALREADY_IN_SEMESTER` (she is already in fall CS101). Create `GEN900`, offer it at capacity 1 with no meetings, Sara takes the seat, Amr gets `SECTION_FULL`.

**Window.** `PUT /semesters/:id` sets the current semester's `registration_end` to yesterday and `is_current` true. Amr enrolling in IS210 → `REGISTRATION_CLOSED`. Dropping one of his still-`enrolled` rows (not a row already moved to `completed` by publish) → `REGISTRATION_CLOSED`.

## Dependencies and interactions

It mutates the database the API is using:

- Amr becomes enrolled in CS102, MTH102, and CS201, with CS102 published.
- Two attendance sessions exist for CS102, one present and one absent.
- A message thread exists between Amr and D1001.
- Users `D2001`, courses `CS999` and `GEN900`, and extra offerings are created.
- Sara is enrolled in the capacity-1 GEN900 section.
- Fall registration is closed (`registration_end` moved to yesterday).

A second run against the same database will not match the counts (courses will be more than 12, Amr will already be enrolled, registration will already be closed).

## Current status

**Partial.** The npm script exists. The test is still not isolated and not reset. Run it only on a database you can throw away.

## Implementation details and gotchas

- Login helper assumes `data.token` exists. If the server is down, `call` may return `{ data: null }` and the next property access throws. The outer `.catch` prints `CRASH` and exits 2.
- Assertions use `===` on CGPA numbers. That matches the server's round-to-two-decimals results for this dataset (3.32 and 3.4). Each of those courses is a first attempt, so latest-attempt replacement does not change the numbers. See [Grades and transcript](grades-and-transcript.md).
- The "4 roles" check name counts four tokens. There are three roles in the product. Sara and Amr are both students.
- `day(-1)` uses the machine clock running the script, then the API stores that date. The registration check uses MySQL `CURDATE()`. If those clocks disagree on the calendar date, the closed-window assertion can fail.
- The script does not delete the rows it creates.

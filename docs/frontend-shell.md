# Frontend shell

## Overview

The client is a Vite + React 19 single-page app. `main.jsx` renders `App` in `StrictMode`. `App` nests language, theme, auth, and the router. All signed-in pages share `Layout`.

## Purpose and responsibilities

- Choose the API origin.
- Restore a session from `localStorage`.
- Gate routes by role.
- Provide translation, bilingual data picking, and small UI primitives.
- Poll notification counts in the shell.

## Key files

| Path | Responsibility |
|---|---|
| `frontend/index.html` | `#root`, title `Unidex`, initial `lang="ar"` `dir="rtl"`, favicon, and the script that sets `data-theme` before React loads |
| `frontend/src/main.jsx` | React root. Imports `index.css` only |
| `frontend/src/App.jsx` | Providers and routes |
| `frontend/src/api/axios.js` | Axios instance |
| `frontend/src/context/AuthContext.jsx` | `user`, `loading`, `login`, `logout`, `homeByRole` |
| `frontend/src/context/LanguageContext.jsx` | `lang`, `setLang`, `t`, `pick` |
| `frontend/src/context/ThemeContext.jsx` | `preference` (`light`, `dark`, `system`), `setTheme`, `cycle` |
| `frontend/src/components/ThemeSwitcher.jsx` | Cycles the theme. Same button style as the language switcher |
| `frontend/src/components/ProtectedRoute.jsx` | Auth and role outlet |
| `frontend/src/components/Layout.jsx` | Navbar, nav links, `<Outlet>` |
| `frontend/src/components/Brand.jsx` | "U" mark and the word Unidex |
| `frontend/src/components/LanguageSwitcher.jsx` | Toggles `ar` / `en` |
| `frontend/src/components/ui.jsx` | `Alert`, `Stat`, `Loading`, `Field`, `Tag` |
| `frontend/src/hooks/useFetch.js` | GET hook with `reload` |
| `frontend/src/utils/format.js` | `DAYS`, `hhmm`, `errorText`, `gradeTotal` |
| `frontend/src/index.css` | Layout, tables, messages, QR, print |

`App.css` is not imported.

## Routes

Defined in `App.jsx`.

| Path | Guard | Page |
|---|---|---|
| `/` | none | Redirect to login or role home |
| `/login` | none | `Login` |
| `/catalog` | signed in | `Catalog` |
| `/notifications` | signed in | `Notifications` |
| `/messages`, `/messages/:id` | student or instructor | `Messages` |
| `/student` | student | `StudentHome` |
| `/student/registration` | student | `Registration` |
| `/student/schedule` | student | `Schedule` |
| `/student/grades` | student | `Grades` |
| `/student/transcript` | student | `Transcript` |
| `/student/attendance` | student | `Attendance` |
| `/attend` | student | `Attend` (QR target; still inside `Layout`) |
| `/doctor` | instructor | `DoctorHome` |
| `/doctor/offerings/:id` | instructor | `OfferingRoster` |
| `/doctor/attendance/:id` | instructor | `AttendanceSession` |
| `/admin` | admin | `AdminHome` |
| `/admin/catalog` | admin | `AdminCatalog` |
| `/admin/offerings` | admin | `AdminOfferings` |
| `/admin/users` | admin | `AdminUsers` |
| `*` | none | Redirect to `/` |

`ProtectedRoute` renders an `<Outlet>`, and `Layout` renders another `<Outlet>`. Role homes are nested inside both.

Nav links in `Layout`:

- Student: home, registration, schedule, grades, transcript, attendance, catalog, plus messages.
- Instructor: my courses, catalog, plus messages.
- Admin: dashboard, manage catalog, offerings, users, catalog. No messages link.

The bell goes to `/notifications` for every role. Logout clears the token and sets `user` to null. The router then sends protected pages to `/login` because `user` is gone. Logout does not navigate by itself. The next render of `ProtectedRoute` does.

## API client

```text
baseURL = VITE_API_URL, if set
        = http://${window.location.hostname}:5000/api    only when import.meta.env.DEV
```

A production build without `VITE_API_URL` throws `VITE_API_URL is required for a production build.` when this module loads. The value must include the `/api` suffix. Vite inlines it at `npm run build`.

Request interceptor sets `Authorization` from `localStorage.token` when present. There is no response interceptor. 401 handling is per page, except the initial `/auth/me` failure which deletes the token.

## useFetch

`useFetch(url)` returns `{ data, error, loading, reload }`. A falsy `url` skips the request, clears `data` and `error`, and sets `loading` to false (`AdminOfferings` passes `null` until a semester id exists). `reload` bumps a counter so the effect runs again. Errors are the Axios error object.

`FetchBody` renders `Loading`, then `LoadError` with optional retry, then its child. Pass a function child when the child reads `data`, so a null payload is not touched during the loading render. Catalog, registration, messages, admin users, and admin offerings use it. Home, schedule, grades, transcript, attendance, instructor courses, roster, admin home, notifications, and the admin catalog use `LoadError` directly. `LoadError` shows `errorText` and, when `onRetry` is set, `common.retry`.

## Shared components

- `Alert` renders nothing when `children` is empty. `type` is `error` by default. Classes: `alert alert-<type>`.
- `Stat` shows a value, a label, and an optional hint.
- `Loading` is the translated `common.loading` string next to a small spinner.
- `LoadError` renders `errorText(error)` inside an `Alert`, plus a retry button when `onRetry` is passed. A missing error object is shown as `error.NETWORK`.
- `FetchBody` is the list wrapper around `Loading` and `LoadError`. A function child receives the loaded value.
- `Field` wraps a control with a label.
- `Tag` classes: `tag tag-<kind>` with kinds used in pages: `ok`, `muted`, `warn`, `err`, `info`.
- `Brand` takes `large` for the login card and the printed transcript header.

## Styles

`index.css` is a single handwritten sheet. Colors live on `:root` as `--color-*` tokens. There is no Tailwind theme. The font stack is Segoe UI, Tahoma, Arial. Direction comes from `dir` on `<html>`, not from a separate RTL stylesheet. Logical properties such as `border-inline-start` and `padding-inline` are used so the week slots, alert edge, and unread padding follow direction.

Palette, light: primary `#1E40AF` (hover `#1E3A8A`, light `#DBEAFE`), page `#F8FAFC`, surface `#FFFFFF`, border `#E2E8F0`, text `#0F172A`, secondary text `#64748B`. Status fills are success `#059669`, warning `#D97706`, error `#DC2626`, info `#2563EB`, and not-counted `#94A3B8`. The top bar uses `#0F172A` and the link row uses `#1E293B`. The active link is a primary fill. This is still a top bar, not a side column.

Dark mode overrides the same tokens under `[data-theme="dark"]`. Page `#0B1220`, surface `#1E293B`, border `#334155`, text `#F8FAFC`, secondary text `#94A3B8`. Primary becomes `#60A5FA` so links stay readable, and text on that fill switches to `#0F172A` (`--color-on-fill`). Status colors shift to `#34D399`, `#FBBF24`, `#F87171`, and `#60A5FA`. Success, warning, and muted tags keep dark label text (`--color-on-status`). The top bar stays near-black in both themes. The QR tile stays white so a phone can scan it. `color-scheme` follows the theme so native controls match.

`ThemeProvider` writes `data-theme` as `light` or `dark`. The saved choice in `localStorage.theme` is `light`, `dark`, or `system`. A missing choice uses `system`, which follows `prefers-color-scheme` and updates when the OS theme changes. An inline script in `index.html` sets the attribute before React loads. The switcher sits beside the language button in the top bar and on the login card. It cycles light, dark, then system. Labels are `theme.light`, `theme.dark`, `theme.system`, and `theme.switch`. Direction stays on `dir` and is independent of the theme. Print resets the tokens to the light palette.

Primary buttons are filled. Ghost buttons are the secondary action: surface fill, border, primary text, primary-light hover. Delete, drop, logout, and close use the error color. A disabled control uses the page background, secondary text, and a border, and hover does not restore the enabled color. Focus rings use the focus token. On the dark link row the ring is the light nav text.

Tags: `ok` success (enrolled, present, passing grade), `warn` warning (late, missing prerequisite), `err` error (failed, absent, full), `info` info (completed, practical), `muted` not-counted gray (replaced attempt, draft, closed). Success and warning tags use primary text on the status fill so the small label stays readable. Error and info tags use white text. Alerts keep primary text on a light tint of the same status color, with the status color on the inline start edge. Empty copy uses secondary text.

Tables use a surface background, a page-colored header, a stripe, and a primary-light hover. Replaced grade rows (`tr.replaced`) use secondary text. Cards and stats use the surface token and the shared border.

Breakpoints present in the file: `max-width: 800px` stacks `.grid-qr` and `.msg-layout`. `max-width: 640px` tightens container, card, stat, and table padding. Print rules are under `@media print` and drop the stripe and hover fill.

Motion is CSS only, in the Motion section of `index.css`. Durations are 150–240ms with `ease-out`, except the loading spinner. A route's top-level content fades and rises 6px. Alerts and the login error settle down 4px. Table rows and empty cells fade in. Buttons, including the theme and language controls, ease their color and lift 1px on hover, then scale to 0.98 on press. Disabled buttons do not move. That disabled look is the in-progress state for save, send, and register. Nav links ease into the active color. `Loading` shows a small spinner beside the loading sentence. There is no modal component. Native `confirm`, `prompt`, and `<select>` menus are left to the browser. `prefers-reduced-motion: reduce` removes animations and shortens transitions so theme and hover changes are effectively instant. Print removes them as well. Vertical movement uses `translateY`, so RTL and LTR stay aligned.

## Dependencies and interactions

Feature pages are documented in [Student UI](frontend-student.md), [Instructor UI](frontend-instructor.md), [Admin UI](frontend-admin.md), and [Shared UI](frontend-shared.md). Strings: [Internationalization](internationalization.md).

## Current status

**Complete** for role-based navigation and session restore.

**Complete** for failure display on the main lists: they show `LoadError` and a retry button. There is no automatic redirect when a later request returns 401. Login stores the `/auth/me` profile, and logout calls `POST /api/auth/logout` before clearing the token.

## Implementation details and gotchas

- Login of an already signed-in user redirects to `state.from` or the role home. The login form is not shown.
- `homeByRole` has no fallback. A token whose role is outside the three known strings would navigate to `undefined`.
- Token storage is `localStorage`, so any script on the page origin can read it. The API is on another port, so it is a different origin. CORS allows the browser to send the token because the client sets the header itself (it is not a cookie).
- `LanguageProvider` wraps `ThemeProvider`, which wraps `AuthProvider`, so auth can call `setLang` and every page can read the theme.
- The theme button shows the saved choice, including `system`, not only the resolved light or dark value.
- The QR page `/attend` is inside `Layout`, so a successful scan still shows the student navbar.

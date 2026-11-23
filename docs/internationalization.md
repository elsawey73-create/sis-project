# Internationalization

## Overview

The interface has two languages, Arabic and English. Arabic is the default. Course and person names are stored in both languages and chosen at render time. API errors are codes. The client translates the codes.

## Purpose and responsibilities

- Hold every UI string in one object.
- Switch `document.documentElement.lang` and `dir`.
- Remember the choice in `localStorage` and, when signed in, on `users.preferred_lang`.
- Pick `name_ar` or `name_en` for database content.

## Key files

| Path | Responsibility |
|---|---|
| `frontend/src/i18n/translations.js` | `translations.ar` and `translations.en`, same keys |
| `frontend/src/context/LanguageContext.jsx` | `t`, `pick`, `setLang`, `readStoredLang` |
| `frontend/src/components/LanguageSwitcher.jsx` | One button that flips the language |
| `frontend/index.html` | Initial `lang="ar"` and `dir="rtl"` before React runs |
| `backend/src/controllers/authController.js` | `PATCH` handler and `preferred_lang` on the public user |

The file comment in `translations.js` says a new string must be added under both `ar` and `en` with the same key.

## Data flow

`LanguageProvider` initializes from `localStorage.lang` when the value is `ar` or `en`. Otherwise it uses `ar`.

`setLang` writes state and `localStorage`. An effect sets `documentElement.lang` and `dir` (`rtl` for Arabic, `ltr` for English).

`t(key)` returns `translations[lang][key]`, then the Arabic string, then the key itself.

`pick(ar, en)` returns `en` when the language is English and `en` is truthy. Otherwise it returns `ar`. A missing English name stays Arabic.

`LanguageSwitcher` flips the language. If `user` is set, it `PATCH /api/auth/language` and ignores failure.

On login, if this browser already has a stored language, that value is patched onto the account. If not, and the account has `preferred_lang`, the client switches to it. See [Authentication](authentication.md).

`readStoredLang` is exported and used by `AuthContext`.

## Keys

Groups in the file, in order: `app`, `lang`, `theme`, `common`, `login`, `nav`, `role`, `home`, `student`, `stat`, `reg`, `col`, `catalog`, `day`, `type`, `att`, `grades` / `grade`, `transcript`, `doc`, `roster`, `msg`, `notif`, `admin`, `form`, `sem`, `off`, `users`, `error`.

`theme.light`, `theme.dark`, and `theme.system` are the theme button label for the saved choice. `theme.switch` is its accessible name. The choice is stored in `localStorage`, not on the user row. See [Frontend shell](frontend-shell.md).

`common.retry` is the retry button. `grade.replaced` is the tag on an attempt left out of cumulative GPA. `transcript.repeatNote` is the note above the cumulative summary when any attempt is replaced. Both languages have the same keys.

Day keys are `day.Sat` through `day.Thu`. Type keys are `type.lecture`, `type.section`, `type.lab`. Role keys are `role.student`, `role.instructor`, `role.admin`.

Error keys match [Error codes](error-codes.md).

## Strings that are not in the dictionary

These are hardcoded in components:

| Location | Literal |
|---|---|
| `pages/student/Attendance.jsx` | `OK` on the non-warning tag |
| `pages/admin/AdminUsers.jsx` | label `Email` |
| `pages/admin/AdminUsers.jsx` | table header `ID` |
| `pages/doctor/OfferingRoster.jsx` | table header `ID` |
| `components/Brand.jsx` | the word `Unidex` |
| Several pages | emoji inside translated sentences or as the only content of a control (bell, print, envelope, warning sign) |

`index.html` `<title>` is `Unidex` and does not change with language.

## Dependencies and interactions

Server responses that carry both languages: user names, departments, courses, semesters, instructors. The server does not translate. It does not look at `preferred_lang` when building payloads.

`Accept-Language` is not read.

## Current status

**Complete** for a two-language UI with RTL/LTR switching and stored preference.

**Partial** for full coverage: the literals above stay in English (or in the brand spelling) in both languages. There is no pluralization helper and no date/number locale formatter. `created_at` and semester dates are shown as API strings.

## Implementation details and gotchas

- `t` falls back to Arabic before it falls back to the raw key. A key present only in English is still shown in Arabic when the active language is English, if the Arabic entry exists. A key missing in both comes back as the key.
- `pick` does not fall back to Arabic when the active language is English and the English value is `''`. Empty string is falsy, so Arabic is used. That matches optional `full_name_en`.
- The switcher button label is `lang.switch`: the word "English" while the UI is Arabic, and "العربية" while the UI is English. It names the language you will switch to.
- Patch failures are swallowed (`.catch(() => {})`). The on-screen language still changes.
- Seeded users have no `preferred_lang` in the insert. The value they get is the database default, which is not defined in this repo. Login only applies it when it is truthy.
- Comments in the source are Arabic. They are not user-visible.

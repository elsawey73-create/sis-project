# Seed data

## Overview

`backend/src/seed.js` inserts a fixed academic demo: four departments, twelve courses, five users, two semesters, past grades for one student, and a current-term schedule that includes a deliberate time conflict. The file comment says to run it once against an empty database: `npm run seed` from `backend`.

## Purpose and responsibilities

Give the smoke test and a manual UI session a known world. The script does not create tables and does not delete existing rows.

## Key files

| Path | Responsibility |
|---|---|
| `backend/src/seed.js` | All inserts |
| `backend/src/services/gpa.js` | `computeTotal` and `gradeFromTotal` for the historical grades |
| `backend/package.json` | `"seed": "node src/seed.js"` |

## What it inserts

### Departments

| Code | Arabic name | English name |
|---|---|---|
| CS | علوم الحاسب | Computer Science |
| IS | نظم المعلومات | Information Systems |
| MTH | الرياضيات | Mathematics |
| GEN | المتطلبات العامة | General Requirements |

### Courses

Descriptions are template strings: Arabic `يغطي هذا المقرر أساسيات <name>.` and English `Covers the fundamentals of <name>.`

| Code | Hours | Department | Practical | Prerequisites |
|---|---|---|---|---|
| ENG101 | 2 | GEN | no | |
| MTH101 | 3 | MTH | no | |
| MTH102 | 3 | MTH | no | MTH101 |
| MTH201 | 3 | MTH | no | MTH101 |
| CS101 | 3 | CS | yes | |
| CS102 | 3 | CS | yes | CS101 |
| CS201 | 3 | CS | yes | CS102 |
| CS230 | 3 | CS | yes | CS102 |
| CS301 | 3 | CS | no | CS201, MTH201 |
| CS310 | 3 | CS | yes | CS201 |
| IS101 | 3 | IS | no | |
| IS210 | 3 | IS | no | IS101 |

CS230, CS301, and CS310 are in the catalog only. The seed does not create offerings for them.

### Accounts

Passwords are the demo values printed by the script. They are hardcoded in `seed.js`.

| Login ID | Role | Password | Profile |
|---|---|---|---|
| `admin` | admin | `Admin@123` | System Admin / مدير النظام. No department row |
| `D1001` | instructor | `Doctor@123` | Dr. Ahmed Mohamed, department CS |
| `D1002` | instructor | `Doctor@123` | Dr. Mona Samir, department MTH |
| `20250001` | student | `Student@123` | Amr Ali, code `20250001`, CS, level 2, admission year 2025 |
| `20260001` | student | `Student@123` | Sara Hassan, code `20260001`, CS, level 1, admission year 2026 |

### Semesters

| Name | Term dates | Registration | `is_current` |
|---|---|---|---|
| Spring 2026 / ربيع 2026 | 2026-02-15 to 2026-06-20 | 2026-02-01 to 2026-02-28 | 0 |
| Fall 2026 / خريف 2026 | 2026-09-20 to 2027-01-20 | today minus 30 days through today plus 60 days | 1 |

"Today" is the date on the machine when `npm run seed` runs (`iso` offsets `Date`). The fall registration window is open on the day you seed, and stays open for 60 days after that.

### Offerings

Section is always `'1'`. Capacity is 40. Instructor is D1001 for CS and IS courses and D1002 for MTH and ENG.

Spring (past), one lecture each:

| Code | Day | Time | Room |
|---|---|---|---|
| CS101 | Sat | 09:00–11:00 | A1 |
| MTH101 | Sun | 09:00–11:00 | B3 |
| ENG101 | Mon | 09:00–11:00 | C1 |
| IS101 | Tue | 09:00–11:00 | C2 |

Amr (`20250001`) is `completed` in all four with published grades. The component values are in [Grades and transcript](grades-and-transcript.md). Sara has no spring enrollments.

Fall (current):

| Code | Meetings |
|---|---|
| CS101 | Sat 09:00–11:00 A1 lecture; Mon 11:00–13:00 Lab1 lab |
| CS102 | Sun 09:00–11:00 A2 lecture; Tue 11:00–13:00 Lab2 lab |
| CS201 | Thu 09:00–12:00 A3 lecture |
| IS101 | Tue 09:00–11:00 C2 lecture |
| IS210 | Wed 11:00–13:00 C3 lecture |
| MTH101 | Sat 11:00–13:00 B3 lecture |
| MTH102 | Sun 11:00–13:00 B1 lecture; Wed 09:00–11:00 B1 section |
| MTH201 | Sun 09:00–11:00 B2 lecture |
| ENG101 | Mon 09:00–11:00 C1 lecture |

CS102 and MTH201 both meet Sunday 09:00–11:00. That overlap is what the smoke test calls `TIME_CONFLICT`.

Sara is enrolled in fall CS101 and fall ENG101. Amr has no fall enrollment until someone registers him.

## Dependencies and interactions

The smoke test assumes this exact world: 12 courses, CS301 has two prerequisites, 9 current offerings, Amr has passed CS101, CS201 is missing CS102, CGPA 3.32, and the Sunday conflict. Changing the seed without changing `scripts/smoke.js` makes that test fail.

## Current status

**Complete** as a one-shot demo loader for an empty database that already has the tables.

**Partial** as a repeatable setup: it does not truncate. Create the tables with `npm run db:init` first. A failure exits 1. `NODE_ENV=production` exits 1 before any insert, so the demo passwords are not loaded in that mode.

The course list above is what `seed.js` inserts. It is not the current contents of `unidex_db`.

## Live university catalog

The live database keeps the 239-course university list and its 133 prerequisite rows. No course row and no test user was deleted. Passwords were not changed. `has_practical` is 0. Both name columns store the English course title. One prerequisite was skipped because the required course is not in the list: `EEP408nC` requires `EEP407nC`. Running `npm run seed` again stops on the existing login ids. If those ids were absent, the script would insert the twelve demo courses beside this catalog.

### Departments

These faculty departments exist. Courses were assigned from the letter prefix of `code`.

| Code | English name | Arabic name | Courses |
|---|---|---|---|
| `BSE` | Basic Sciences & Engineering | مواد إعدادي وأساسيات | 35 (`BSE`) |
| `EE` | Electrical Engineering | الهندسة الكهربية | 17 (`EEP`, `EEG`) |
| `CSE` | Computer & Systems Engineering | هندسة الحاسبات والنظم | 62 (`CSE`) |
| `ECE` | Electronics & Communications Engineering | هندسة الإلكترونيات والاتصالات | 39 (`ECE`) |
| `EPC` | Electrical Power & Machines Engineering | هندسة القوى والآلات الكهربية | 44 (`EPC`) |
| `ARC` | Architecture | الهندسة المعمارية | 0 |
| `CBE` | Civil Engineering | الهندسة المدنية | 0 |
| `MEP` | Mechanical Power Engineering | هندسة القوى الميكانيكية | 0 |
| `MEM` | Mechatronics Engineering | هندسة الميكاترونكس | 0 |
| `MED` | Mechanical Design Engineering | هندسة التصميم الميكانيكي | 0 |
| `UNIVREQ` | University Requirements | متطلبات الجامعة | 42 (`HUM`, `LNG`, `lang`, `SNS`) |

`EE` is the parent electrical program. `CSE`, `ECE`, and `EPC` are separate departments. Shared practical and graduation courses (`EEP`, `EEG`) stay in `EE`. Architecture, civil, and the three mechanical departments are ready for later courses. This catalog has none of those prefixes.

Empty leftover departments are still present: `COLLREQ` (متطلبات الكلية), `PROGREQ` (متطلبات البرنامج), `ELECT1` (مجموعة اختيارية 1), `ELECT2` (مجموعة اختيارية 2), and the original seed departments `CS`, `IS`, `MTH`, and `GEN`.

### Fall 2026 offerings

Fall 2026 / خريف 2026 is current (2026-09-20 to 2027-01-20). Registration runs 2026-10-23 through 2027-01-21 and was open on 2026-11-23. There are 34 offerings, all section `1`, capacity 40, each with one weekly lecture.

| Code | Hours | Instructor | Meeting |
|---|---|---|---|
| BSE001n | 3 | doctor4 | Sat 08:00–10:00 H-101 |
| BSE003n | 3 | doctor4 | Sat 10:00–12:00 H-102 |
| BSE005n | 3 | doctor4 | Sun 08:00–10:00 H-103 |
| BSE007n | 3 | doctor4 | Sun 10:00–12:00 H-201 |
| BSE008n | 3 | doctor4 | Mon 08:00–10:00 H-202 |
| BSE010n | 2 | doctor4 | Mon 10:00–12:00 H-203 |
| BSE103n | 3 | doctor4 | Wed 12:00–14:00 H-301 |
| BSE207 | 3 | doctor4 | Tue 08:00–10:00 H-302 |
| CSE101n | 2 | doctor1 | Tue 08:00–10:00 C-101 |
| CSE102n | 2 | doctor1 | Tue 10:00–12:00 C-102 |
| CSE201n | 2 | doctor1 | Thu 12:00–14:00 C-103 |
| CSE202n | 3 | doctor1 | Sat 12:00–14:00 C-201 |
| CSE204n | 3 | doctor1 | Sat 14:00–16:00 C-202 |
| CSE301n | 3 | doctor1 | Tue 12:00–14:00 C-301 |
| CSE303n | 3 | doctor1 | Sat 12:00–14:00 C-203 |
| CSE304n | 3 | doctor1 | Tue 14:00–16:00 C-302 |
| ECE101n | 2 | doctor2 | Wed 08:00–10:00 E-101 |
| ECE201n | 2 | doctor2 | Sun 12:00–14:00 E-201 |
| ECE202n | 3 | doctor2 | Sun 10:00–12:00 E-102 |
| ECE203n | 2 | doctor2 | Sun 08:00–10:00 E-103 |
| ECE301n | 2 | doctor2 | Sun 14:00–16:00 E-202 |
| ECE302n | 3 | doctor2 | Wed 12:00–14:00 E-301 |
| EEG201 | 3 | doctor5 | Thu 14:00–16:00 EE-201 |
| EEP101n | 2 | doctor5 | Mon 12:00–14:00 EE-101 |
| EEP407nE | 3 | doctor5 | Thu 12:00–14:00 EE-301 |
| EPC101n | 2 | doctor3 | Wed 10:00–12:00 P-101 |
| EPC102n | 2 | doctor3 | Thu 14:00–16:00 P-102 |
| EPC201n | 3 | doctor3 | Mon 14:00–16:00 P-201 |
| EPC301n | 3 | doctor3 | Mon 08:00–10:00 P-301 |
| EPC302n | 2 | doctor3 | Mon 10:00–12:00 P-302 |
| EPC308n | 3 | doctor3 | Wed 14:00–16:00 P-303 |
| HUM001n | 2 | doctor5 | Wed 14:00–16:00 U-201 |
| HUM002n | 2 | doctor5 | Thu 10:00–12:00 U-102 |
| LNG001n | 2 | doctor4 | Thu 08:00–10:00 U-101 |

`doctor1` teaches CSE, `doctor2` ECE, `doctor3` EPC, `doctor4` BSE plus `LNG001n`, and `doctor5` the shared EE courses plus the two humanities lectures.

### Enrollments, grades, and attendance

`student1`–`student20` are enrolled in several of these sections. In each group the first two courses are `completed` with a published grade. The others are `enrolled` and have no grade row. A published grade stays on the current-term schedule. The two published totals are 92 (coursework 28, midterm 18, final 46, letter A-, 3.7 points) and 80 (coursework 24, midterm 16, final 40, letter B, 3.0 points). Neighbors in a group swap which course received which total. There is no practical score.

| Students | Completed | Still enrolled |
|---|---|---|
| student9 (CBE), student10 (ARC), student19 (MEP), student20 (MED), all level 1 | BSE001n, BSE003n | BSE005n, BSE007n, BSE008n, BSE010n |
| student7, student8, student17, student18 (level 2) | CSE101n, CSE102n | CSE201n, ECE101n, EEP101n, EPC101n, EPC102n, HUM002n, LNG001n |
| student5, student6, student15, student16 (level 3) | CSE202n, CSE204n | BSE103n, ECE201n, ECE301n, EPC201n, HUM001n |
| student1, student2, student11, student12 (level 4) | CSE301n, CSE304n | ECE302n, EEG201, EEP407nE, EPC308n |
| student3, student4, student13, student14 (level 4) | CSE303n, ECE203n | BSE207, ECE202n, EPC301n, EPC302n, HUM001n |

`student9` also has a dropped `HUM002n`. That row does not hold a seat. Some completed courses were loaded without the catalog prerequisite (for example `CSE301n` requires `CSE201n`). New registration still enforces prerequisites, the credit cap, and time conflicts. On 2026-11-23, `student10` could register for `BSE103n` and drop it again.

`20260001` (Sara Hassan) is enrolled, with no grades, in HUM001n, BSE001n, BSE003n, BSE005n, BSE007n, and BSE008n. `20250001` (Amr Ali) and `51910313` (Ahmed Amr Ibrahim) have no enrollments. `D1001` and `D1002` have no offerings.

Counts: 147 enrollment rows, of which 146 hold a seat and 1 is dropped. 40 grades are published. 34 offerings are in the current term.

Closed attendance sessions store `present` and `late` marks with method `manual`. Absence is no row. On BSE001n, CSE101n, CSE301n, ECE101n, EEP101n, and EPC101n, the earlier session has three marks (one late and one absent) and the later session has four marks (one late). Those sessions were recorded before `20260001` joined BSE001n, so she has no mark there. HUM001n on 4 November has eight marks (`student16` absent, `student4` late). HUM001n on 11 November has nine marks (`student14` late), which is everyone enrolled in that section, including `20260001`.

| Course | Dates | Opened by |
|---|---|---|
| BSE001n | 2026-11-08, 2026-11-15 | doctor4 |
| CSE101n | 2026-11-08, 2026-11-15 | doctor1 |
| CSE301n | 2026-11-08, 2026-11-15 | doctor1 |
| ECE101n | 2026-11-08, 2026-11-15 | doctor2 |
| EEP101n | 2026-11-08, 2026-11-15 | doctor5 |
| EPC101n | 2026-11-08, 2026-11-15 | doctor3 |
| HUM001n | 2026-11-04, 2026-11-11 | doctor5 |

`CSE101n` also has an open session dated 2026-11-23, opened by `doctor1`, with no marks yet. Every `student1`–`student20` account has at least one attendance mark.

### Live test accounts

These accounts are in `unidex_db` for manual testing. `seed.js` does not insert `doctor1`–`doctor5` or `student1`–`student20`. Passwords are bcrypt hashes at cost 10.

The original seed users are still present: `D1001`, `D1002`, `20250001` (Amr Ali), and `20260001` (Sara Hassan). The `admin` row was updated in place. Its English name is now `System Administrator`, and its `token_version` was incremented, so an older admin token must sign in again.

Student codes use `5YYTTXXX`: college `5`, entry year `YY`, semester `10` or `20`, then a sequence `001`–`020`. Entry years are 19–23, with both semesters in each year. Level follows the entry year (19 and 20 are level 4, 21 is 3, 22 is 2, 23 is 1). Admission year is `2000 + YY`. The login id is `student1`–`student20`, not the student code. Most of them are in `CSE`, `ECE`, or `EPC`. `student16` is `EE`. The four preparatory students are placed in other faculties whose visible catalog still includes their BSE and university courses: `student9` is `CBE`, `student10` is `ARC`, `student19` is `MEP`, and `student20` is `MED`.

| Role | Login | Password | Name | Student code | Department |
|---|---|---|---|---|---|
| admin | `admin` | `Admin@123` | مدير النظام / System Administrator | | |
| instructor | `doctor1` | `Doctor@123` | د. أحمد محمود / Dr. Ahmed Mahmoud | | CSE |
| instructor | `doctor2` | `Doctor@123` | د. منى إبراهيم / Dr. Mona Ibrahim | | ECE |
| instructor | `doctor3` | `Doctor@123` | د. خالد عبد الرحمن / Dr. Khaled Abdelrahman | | EPC |
| instructor | `doctor4` | `Doctor@123` | د. سارة فتحي / Dr. Sara Fathy | | BSE |
| instructor | `doctor5` | `Doctor@123` | د. يوسف حسن / Dr. Youssef Hassan | | EE |
| student | `student1` | `Student@123` | يوسف عادل / Youssef Adel | `51910001` | CSE |
| student | `student2` | `Student@123` | مريم حسين / Mariam Hussein | `51920002` | ECE |
| student | `student3` | `Student@123` | عمر فاروق / Omar Farouk | `52010003` | EPC |
| student | `student4` | `Student@123` | نورهان سعيد / Nourhan Saeed | `52020004` | CSE |
| student | `student5` | `Student@123` | محمود رضا / Mahmoud Reda | `52110005` | ECE |
| student | `student6` | `Student@123` | فاطمة الزهراء / Fatma Elzahraa | `52120006` | CSE |
| student | `student7` | `Student@123` | كريم نبيل / Karim Nabil | `52210007` | CSE |
| student | `student8` | `Student@123` | هدير مصطفى / Hadeer Mostafa | `52220008` | ECE |
| student | `student9` | `Student@123` | علي حسن / Ali Hassan | `52310009` | CBE |
| student | `student10` | `Student@123` | سلمى طارق / Salma Tarek | `52320010` | ARC |
| student | `student11` | `Student@123` | حسين جمال / Hussein Gamal | `51910011` | EPC |
| student | `student12` | `Student@123` | آية محمد / Aya Mohamed | `51920012` | CSE |
| student | `student13` | `Student@123` | زياد أشرف / Ziad Ashraf | `52010013` | ECE |
| student | `student14` | `Student@123` | جنى وليد / Jana Walid | `52020014` | EPC |
| student | `student15` | `Student@123` | مصطفى عادل / Mostafa Adel | `52110015` | EPC |
| student | `student16` | `Student@123` | رهف خالد / Rahaf Khaled | `52120016` | EE |
| student | `student17` | `Student@123` | عبد الرحمن سامي / Abdelrahman Samy | `52210017` | EPC |
| student | `student18` | `Student@123` | ملك ياسر / Malak Yasser | `52220018` | CSE |
| student | `student19` | `Student@123` | حسام الدين علي / Hossam Eldin Ali | `52310019` | MEP |
| student | `student20` | `Student@123` | رنا شريف / Rana Sherif | `52320020` | MED |

### ACU import for student `51910313`

`backend/scripts/import-acu-51910313.js` loads one real student's record exported from the ACU portal (`acu.eng.cu.edu.eg`) on 2026-11-23. The source files are `backend/import/acu-51910313/grades.tsv` (89 attempts, Fall 2019 to Fall 2026) and `timetable.tsv` (9 weekly meetings). Run it from `backend` with `node scripts/import-acu-51910313.js`. Add `--dry-run` to print the result and roll back. It runs in one transaction and matches existing rows before inserting, so running it again changes nothing. It does not store or use any portal password.

Profile: user id 6, login `51910313`. `full_name_en` was set to `Ahmed Amr Ibrahim Ahmed`, and the Arabic name was left as it was. The department changed from `CS` to `CSE` (Computer & Systems Engineering / هندسة الحاسبات والنظم). That department row already existed. Admission year is 2019, from the `519` code prefix, and level is 4, following the entry-year rule above. The portal does not show a level. No schema change was needed, because `students.department_id` already exists.

Catalog: all 63 ACU course codes already existed in `courses` with matching hours. No course rows were created or changed.

Semesters: 16 past terms were added with `is_current = 0`. They are Fall 2019 through Fall 2025, plus Summer 2026, and use these dates: Fall 20 Sep–20 Jan, Spring 15 Feb–20 Jun, Summer 1 Jul–31 Aug. Spring 2026 (id 1) and Fall 2026 (id 2, current) were reused.

Offerings: one offering per attempt. Past terms use section `1`. Each offering's instructor is the first instructor in the course's department (`doctor1` CSE, `doctor2` ECE, `doctor3` EPC, `doctor4` BSE, `doctor5` EE). For HUM and LNG courses (UNIVREQ, which has no instructor), the instructor falls back to `doctor1`. In total, 84 past and 5 Fall 2026 offerings were created.

Grades: 89 enrollments, each with one `grades` row. Components and `total` are null because ACU only gives letters. `points` is quality points divided by hours.

| ACU grade | Rows | Enrollment status | `grades` row |
|---|---|---|---|
| A+ … D | 44 | `completed` | letter, points, `published = 1` |
| F | 30 | `failed` | `F`, 0, `published = 1` |
| PP (Spring 2020 pass) | 6 | `completed` | `PP`, points null, `published = 1`. Counts as passed for prerequisites, earns its hours (`isPassOnly` in `gpa.js`), stays out of GPA, and shows on the transcript |
| W (Fall 2025) | 3 | `dropped` | `W`, points null, `published = 0` |
| UNKNOWN | 6 | `enrolled` | `UNK` (the column is `VARCHAR(3)`), points null, `published = 0` |

The UNKNOWN rows are EEP507 in Fall 2023 plus the five Fall 2026 courses. Every retake is a separate enrollment, for example BSE202 ×5, BSE108 ×4, EPC402 ×4, and ECE404 ×3. With the latest-attempt rule, `getStanding` gives CGPA **1.93**, 141 hours attempted, and **134** earned: 116 from graded passes plus the 18 PP hours. Both match the portal.

Fall 2026 timetable, all `enrolled`:

| Course | Section | Meetings |
|---|---|---|
| CSE302 | 1 | Sun 09:00–10:50 lecture; Wed 09:00–10:50 section. Room `TBA` (ACU gives none, and `room` is NOT NULL) |
| CSE403 | 3 | Mon 09:00–10:50 section, Annex Building LB4; Mon 13:00–14:50 lecture, F110 |
| CSE513 | 3 | Thu 09:00–10:50 section, Annex lab 7; Thu 13:00–14:50 lecture, F117 |
| EEP507 | 1 | Wed 11:00–12:50 lecture, Y22 |
| EPC402 | 3 | Mon 11:00–12:50 section, Annex; Thu 11:00–12:50 lecture, G27. ACU lists the lecture under group 0 and the tutorial under group 3. One offering holds both |

That is 14 credit hours. That equals the 14-hour cap that `maxCredits` gives a CGPA under 2.00, so the dashboard shows 14 / 14. The student's four earlier `dropped` Fall 2026 rows (BSE001n, BSE003n, EEP407nE, HUM001n) were left as they were. Attendance: the portal showed no absences. Unidex derives absence from closed sessions, and none exist for these offerings, so no attendance rows were written.

## Implementation details and gotchas

- The script loads dotenv, hashes passwords at cost 10, and uses the same pool as the API.
- It does not insert attendance, messages, or notifications.
- It does not set `email` or `preferred_lang`.
- A failure mid-way leaves a partial insert. There is no transaction around the whole seed.
- Re-running on a populated database hits duplicate `login_id` or course codes and stops.
- Fall registration dates depend on the clock. Seeding on a different day changes `registration_start` and `registration_end`. The smoke test later overwrites `registration_end` to yesterday.

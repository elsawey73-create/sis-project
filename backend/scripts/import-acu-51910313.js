// Imports ACU portal data for student 51910313 (Ahmed Amr Ibrahim Ahmed, CSE) into unidex_db.
// Re-runnable: every insert matches existing rows first, and everything runs in one transaction.
// Usage (from backend/):  node scripts/import-acu-51910313.js [--dry-run]
// Source files: backend/import/acu-51910313/grades.tsv and timetable.tsv (exported from acu.eng.cu.edu.eg).
// Only rows for this student are written, plus any missing department, semester, course,
// offering, or meeting rows that the data needs. Existing courses are never modified.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../src/config/db');
const { getStanding } = require('../src/services/gpa');

const DRY_RUN = process.argv.includes('--dry-run');
const DIR = path.join(__dirname, '..', 'import', 'acu-51910313');

const STUDENT = {
  code: '51910313',
  name_en: 'Ahmed Amr Ibrahim Ahmed',
  name_ar_if_new: 'Ahmed Amr Ibrahim Ahmed', // ACU shows the English name in both fields
  department: { code: 'CSE', name_ar: 'هندسة الحاسبات والنظم', name_en: 'Computer & Systems Engineering' },
  admission_year: 2019, // from the code prefix 519xxxxx, same pattern as the other 519xxxxx students
  level: 4, // 134 credits earned and in Graduation Project; existing 2019-admission students are level 4
};

// Letter grades that become published rows with grade points.
const PUBLISHED = new Set(['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'F']);
const DAY = { Saturday: 'Sat', Sunday: 'Sun', Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu' };
const TYPE = { Lecture: 'lecture', Tutorial: 'section', Lab: 'lab' };
// Department for a course code prefix, only used when a course must be created.
const PREFIX_DEPT = { BSE: 'BSE', CSE: 'CSE', ECE: 'ECE', EPC: 'EPC', EEP: 'EE', EEG: 'EE', HUM: 'UNIVREQ', LNG: 'UNIVREQ' };

function readTsv(file) {
  const lines = fs.readFileSync(path.join(DIR, file), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  const head = lines.shift().split('\t').map((h) => h.trim());
  return lines.map((l) => {
    const cells = l.split('\t');
    return Object.fromEntries(head.map((h, i) => [h, (cells[i] || '').trim()]));
  });
}

// "Fall-2019" -> semester row values. Fall runs Sep-Jan, Spring Feb-Jun, Summer Jul-Aug.
function termInfo(term) {
  const [season, yearStr] = term.split('-');
  const y = Number(yearStr);
  const ar = { Fall: 'خريف', Spring: 'ربيع', Summer: 'صيف' }[season];
  if (!ar || !y) throw new Error(`Unknown term ${term}`);
  const d = {
    Fall: [`${y}-09-20`, `${y + 1}-01-20`, `${y}-09-01`, `${y}-09-30`],
    Spring: [`${y}-02-15`, `${y}-06-20`, `${y}-02-01`, `${y}-02-28`],
    Summer: [`${y}-07-01`, `${y}-08-31`, `${y}-06-20`, `${y}-07-05`],
  }[season];
  return { name_en: `${season} ${y}`, name_ar: `${ar} ${y}`, start_date: d[0], end_date: d[1], registration_start: d[2], registration_end: d[3] };
}

function gradeStatus(letter) {
  if (PUBLISHED.has(letter)) return letter === 'F' ? 'failed' : 'completed';
  if (letter === 'PP') return 'completed'; // pass/fail pass (Spring 2020): earns credit hours, no GPA points
  if (letter === 'W') return 'dropped'; // withdrawn
  return 'enrolled'; // UNKNOWN: no final grade yet
}

const stats = { created: {}, matched: {}, issues: [] };
const bump = (kind, what) => { stats[kind][what] = (stats[kind][what] || 0) + 1; };

async function main() {
  const grades = readTsv('grades.tsv');
  const timetable = readTsv('timetable.tsv');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const q = async (sql, params) => (await conn.query(sql, params))[0];

    // Department
    let [dept] = await q('SELECT id FROM departments WHERE code = ?', [STUDENT.department.code]);
    if (!dept) {
      const r = await q('INSERT INTO departments (code, name_ar, name_en) VALUES (?,?,?)',
        [STUDENT.department.code, STUDENT.department.name_ar, STUDENT.department.name_en]);
      dept = { id: r.insertId }; bump('created', 'departments');
    } else bump('matched', 'departments');
    const deptIds = Object.fromEntries((await q('SELECT code, id FROM departments')).map((r) => [r.code, r.id]));

    // Student profile
    let [stu] = await q('SELECT s.user_id FROM students s WHERE s.student_code = ?', [STUDENT.code]);
    if (!stu) {
      let [user] = await q('SELECT id, role FROM users WHERE login_id = ?', [STUDENT.code]);
      if (!user) {
        const hash = await bcrypt.hash(crypto.randomBytes(24).toString('base64url'), 10);
        const r = await q("INSERT INTO users (login_id, password_hash, full_name_ar, full_name_en, role) VALUES (?,?,?,?, 'student')",
          [STUDENT.code, hash, STUDENT.name_ar_if_new, STUDENT.name_en]);
        user = { id: r.insertId, role: 'student' }; bump('created', 'users');
        stats.issues.push('Student user was created with a random password. An admin must set a password before login.');
      }
      if (user.role !== 'student') throw new Error(`login ${STUDENT.code} exists with role ${user.role}`);
      await q('INSERT INTO students (user_id, student_code, department_id, level, admission_year) VALUES (?,?,?,?,?)',
        [user.id, STUDENT.code, dept.id, STUDENT.level, STUDENT.admission_year]);
      stu = { user_id: user.id }; bump('created', 'students');
    } else bump('matched', 'students');
    const studentId = stu.user_id;
    await q('UPDATE students SET department_id = ?, level = ?, admission_year = ? WHERE user_id = ?',
      [dept.id, STUDENT.level, STUDENT.admission_year, studentId]);
    await q('UPDATE users SET full_name_en = ? WHERE id = ?', [STUDENT.name_en, studentId]);

    // Semesters
    const semIds = {};
    for (const term of new Set(grades.map((g) => g.Term))) {
      const t = termInfo(term);
      const [s] = await q('SELECT id FROM semesters WHERE name_en = ?', [t.name_en]);
      if (s) { semIds[term] = s.id; bump('matched', 'semesters'); continue; }
      const r = await q('INSERT INTO semesters (name_ar, name_en, start_date, end_date, registration_start, registration_end, is_current) VALUES (?,?,?,?,?,?,0)',
        [t.name_ar, t.name_en, t.start_date, t.end_date, t.registration_start, t.registration_end]);
      semIds[term] = r.insertId; bump('created', 'semesters');
    }

    // Courses (never modified when they already exist)
    const courseIds = {};
    const courseRows = new Map();
    for (const g of grades) courseRows.set(g.Code, g);
    for (const [code, g] of courseRows) {
      const [c] = await q('SELECT id, credit_hours, name_en FROM courses WHERE code = ?', [code]);
      if (c) {
        courseIds[code] = c.id; bump('matched', 'courses');
        if (Number(c.credit_hours) !== Number(g.Hours)) stats.issues.push(`${code}: ACU hours ${g.Hours}, Unidex catalog ${c.credit_hours} (catalog kept)`);
        continue;
      }
      const deptCode = PREFIX_DEPT[code.slice(0, 3)] || STUDENT.department.code;
      const deptId = deptIds[deptCode] || dept.id;
      const r = await q('INSERT INTO courses (code, name_ar, name_en, credit_hours, has_practical, department_id) VALUES (?,?,?,?,0,?)',
        [code, g.Name, g.Name, Number(g.Hours), deptId]);
      courseIds[code] = r.insertId; bump('created', 'courses');
    }

    // Instructor for a course: first instructor in the course's department, else first in CSE.
    const instructorFor = async (courseId) => {
      const [row] = await q(`SELECT i.user_id FROM courses c JOIN instructors i ON i.department_id = c.department_id
                             WHERE c.id = ? ORDER BY i.user_id LIMIT 1`, [courseId]);
      if (row) return row.user_id;
      const [fb] = await q('SELECT user_id FROM instructors WHERE department_id = ? ORDER BY user_id LIMIT 1', [dept.id]);
      if (fb) return fb.user_id;
      const [any] = await q('SELECT user_id FROM instructors ORDER BY user_id LIMIT 1');
      if (!any) throw new Error('No instructor exists to own imported offerings');
      return any.user_id;
    };
    const offeringFor = async (courseId, semesterId, section) => {
      const [o] = await q('SELECT id FROM course_offerings WHERE course_id = ? AND semester_id = ? AND section = ?', [courseId, semesterId, section]);
      if (o) { bump('matched', 'offerings'); return { id: o.id, created: false }; }
      const r = await q('INSERT INTO course_offerings (course_id, semester_id, instructor_id, section, capacity) VALUES (?,?,?,?,40)',
        [courseId, semesterId, await instructorFor(courseId), section]);
      bump('created', 'offerings');
      return { id: r.insertId, created: true };
    };

    // Current-term offerings and meetings from the timetable.
    const currentTerm = 'Fall-2026';
    const currentSem = semIds[currentTerm];
    const byCode = new Map();
    for (const m of timetable) { if (!byCode.has(m.Code)) byCode.set(m.Code, []); byCode.get(m.Code).push(m); }
    const currentOffering = {};
    for (const [code, meetings] of byCode) {
      if (!courseIds[code]) { stats.issues.push(`${code} is in the timetable but not in grades.tsv; skipped`); continue; }
      const groups = [...new Set(meetings.map((m) => m.GroupName || '1'))];
      // One offering per course for this student. If ACU lists different groups for lecture and
      // tutorial, use the tutorial group as the section and keep every meeting in it.
      const tut = meetings.find((m) => m['Session Type'] !== 'Lecture');
      const section = groups.length === 1 ? groups[0] : (tut ? tut.GroupName : groups[0]);
      if (groups.length > 1) stats.issues.push(`${code}: ACU groups ${groups.join('/')} (by session type); stored as section ${section} with all meetings`);
      const off = await offeringFor(courseIds[code], currentSem, section);
      currentOffering[code] = off.id;
      for (const m of meetings) {
        const day = DAY[m.DayName];
        const type = TYPE[m['Session Type']] || 'lecture';
        const room = m.Location || 'TBA';
        if (!m.Location) stats.issues.push(`${code} ${m['Session Type']} ${m.DayName}: no room in ACU, stored as 'TBA' (room is NOT NULL)`);
        const [ex] = await q('SELECT id FROM offering_meetings WHERE offering_id = ? AND day_of_week = ? AND start_time = ? AND end_time = ? AND type = ?',
          [off.id, day, m.BeginTime, m.EndTime, type]);
        if (ex) { bump('matched', 'meetings'); continue; }
        if (!off.created) { const [{ n }] = await q('SELECT COUNT(*) n FROM offering_meetings WHERE offering_id = ?', [off.id]);
          if (n > 0 && !DRY_RUN) stats.issues.push(`${code}: existing offering ${off.id} had other meetings; added ACU meeting ${m.DayName} ${m.BeginTime}`); }
        await q('INSERT INTO offering_meetings (offering_id, day_of_week, start_time, end_time, room, type) VALUES (?,?,?,?,?,?)',
          [off.id, day, m.BeginTime, m.EndTime, room, type]);
        bump('created', 'meetings');
      }
    }

    // Enrollments and grade rows: one enrollment per ACU attempt.
    let gradeRowsWritten = 0;
    for (const g of grades) {
      const courseId = courseIds[g.Code];
      const semId = semIds[g.Term];
      const offId = (g.Term === currentTerm && currentOffering[g.Code]) ? currentOffering[g.Code] : (await offeringFor(courseId, semId, '1')).id;
      const status = gradeStatus(g.Grade);
      const [sem] = await q('SELECT start_date FROM semesters WHERE id = ?', [semId]);
      const [e] = await q('SELECT id FROM enrollments WHERE student_id = ? AND offering_id = ?', [studentId, offId]);
      let enrollmentId;
      if (e) {
        enrollmentId = e.id; bump('matched', 'enrollments');
        await q('UPDATE enrollments SET status = ? WHERE id = ?', [status, enrollmentId]);
      } else {
        const r = await q('INSERT INTO enrollments (student_id, offering_id, status, enrolled_at) VALUES (?,?,?,?)',
          [studentId, offId, status, `${sem.start_date} 09:00:00`]);
        enrollmentId = r.insertId; bump('created', 'enrollments');
      }
      const letter = g.Grade === 'UNKNOWN' ? 'UNK' : g.Grade;
      if (PUBLISHED.has(g.Grade)) {
        const hours = Number(g.Hours);
        const points = hours ? Math.round((Number(g.QualityPoints) / hours) * 10) / 10 : 0;
        await q(`INSERT INTO grades (enrollment_id, letter, points, published) VALUES (?,?,?,1)
                 ON DUPLICATE KEY UPDATE letter = VALUES(letter), points = VALUES(points), published = 1`, [enrollmentId, letter, points]);
      } else if (g.Grade === 'UNKNOWN') {
        // Keep a marker row but never overwrite a grade an instructor entered later.
        await q('INSERT IGNORE INTO grades (enrollment_id, letter, points, published) VALUES (?,?,NULL,0)', [enrollmentId, letter]);
      } else {
        // PP is published with no points: it earns credit hours but stays out of GPA (gpa.js isPassOnly).
        // W stays unpublished.
        const pub = g.Grade === 'PP' ? 1 : 0;
        await q(`INSERT INTO grades (enrollment_id, letter, points, published) VALUES (?,?,NULL,?)
                 ON DUPLICATE KEY UPDATE letter = VALUES(letter), points = NULL, published = VALUES(published)`, [enrollmentId, letter, pub]);
      }
      gradeRowsWritten++;
    }

    // Verification inside the transaction.
    const [{ n: gradeRows }] = await q(`SELECT COUNT(*) n FROM grades g JOIN enrollments e ON e.id = g.enrollment_id WHERE e.student_id = ?`, [studentId]);
    const byStatus = await q(`SELECT e.status, COUNT(*) n FROM enrollments e JOIN grades g ON g.enrollment_id = e.id WHERE e.student_id = ? GROUP BY e.status`, [studentId]);
    const current = await q(`SELECT c.code, o.section, e.status, (SELECT COUNT(*) FROM offering_meetings m WHERE m.offering_id = o.id) meetings, c.credit_hours
                             FROM enrollments e JOIN course_offerings o ON o.id = e.offering_id JOIN courses c ON c.id = o.course_id
                             WHERE e.student_id = ? AND o.semester_id = ? AND e.status = 'enrolled' ORDER BY c.code`, [studentId, currentSem]);
    const standing = await getStanding(conn, studentId);

    console.log(JSON.stringify({ dryRun: DRY_RUN, studentUserId: studentId, gradeRowsWritten, gradeRowsForStudent: gradeRows, byStatus, current, standing, ...stats }, null, 2));

    if (DRY_RUN) { await conn.rollback(); console.log('Dry run: rolled back.'); }
    else { await conn.commit(); console.log('Committed.'); }
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((err) => { console.error('Import failed:', err.message); process.exit(1); });

const db = require('../config/db');
const { HttpError } = require('../utils/errors');
const { withTx } = require('../utils/tx');
const { getStanding, maxCredits } = require('./gpa');
const { occupying } = require('../domain/enrollment');
const { visibleCodesForUser } = require('../domain/visibility');

const overlap = (a, b) =>
  a.day_of_week === b.day_of_week && a.start_time < b.end_time && b.start_time < a.end_time;

// Register one offering. Every rule runs inside one transaction.
async function register(studentId, offeringId) {
  return withTx(async (conn) => {
    // Lock the offering so two students cannot take the last seat together.
    await conn.query('SELECT id FROM course_offerings WHERE id = ? FOR UPDATE', [offeringId]);

    const [[off]] = await conn.query(
      `SELECT o.id, o.course_id, o.semester_id, o.capacity, c.code, c.credit_hours, d.code AS department_code,
              (CURDATE() BETWEEN s.registration_start AND s.registration_end) AS reg_open
       FROM course_offerings o
       JOIN courses c ON c.id = o.course_id
       JOIN departments d ON d.id = c.department_id
       JOIN semesters s ON s.id = o.semester_id
       WHERE o.id = ?`,
      [offeringId]
    );
    if (!off) throw new HttpError(404, 'NOT_FOUND');

    const allowed = await visibleCodesForUser(conn, { id: studentId, role: 'student' });
    if (allowed && !allowed.includes(off.department_code)) throw new HttpError(403, 'OUT_OF_PROGRAM');

    // 1) Registration window.
    if (!off.reg_open) throw new HttpError(403, 'REGISTRATION_CLOSED');

    // 2) Already on this offering?
    const [[existing]] = await conn.query(
      'SELECT id, status FROM enrollments WHERE student_id = ? AND offering_id = ?',
      [studentId, offeringId]
    );
    if (existing && existing.status !== 'dropped') throw new HttpError(409, 'ALREADY_ENROLLED');

    // 3) Same course in another section this semester?
    const [same] = await conn.query(
      `SELECT e.id FROM enrollments e JOIN course_offerings o ON o.id = e.offering_id
       WHERE e.student_id = ? AND o.course_id = ? AND o.semester_id = ? AND ${occupying('e.status')}`,
      [studentId, off.course_id, off.semester_id]
    );
    if (same.length) throw new HttpError(409, 'COURSE_ALREADY_IN_SEMESTER');

    // 4) Passed this course before?
    const [passedRows] = await conn.query(
      `SELECT DISTINCT o.course_id FROM enrollments e JOIN course_offerings o ON o.id = e.offering_id
       WHERE e.student_id = ? AND e.status = 'completed'`,
      [studentId]
    );
    const passed = new Set(passedRows.map((r) => r.course_id));
    if (passed.has(off.course_id)) throw new HttpError(409, 'ALREADY_PASSED');

    // 5) Prerequisites.
    const [pre] = await conn.query(
      `SELECT pc.id, pc.code FROM course_prerequisites p
       JOIN courses pc ON pc.id = p.prerequisite_id WHERE p.course_id = ?`,
      [off.course_id]
    );
    const missing = pre.filter((p) => !passed.has(p.id)).map((p) => p.code);
    if (missing.length) throw new HttpError(409, 'PREREQ_NOT_MET', { courses: missing });

    // 6) Capacity.
    const [[cnt]] = await conn.query(
      `SELECT COUNT(*) AS n FROM enrollments WHERE offering_id = ? AND ${occupying('status')}`,
      [offeringId]
    );
    if (cnt.n >= off.capacity) throw new HttpError(409, 'SECTION_FULL');

    // 7) Schedule overlap.
    const [target] = await conn.query('SELECT * FROM offering_meetings WHERE offering_id = ?', [offeringId]);
    const [mine] = await conn.query(
      `SELECT m.day_of_week, m.start_time, m.end_time, c.code
       FROM enrollments e
       JOIN course_offerings o ON o.id = e.offering_id
       JOIN courses c ON c.id = o.course_id
       JOIN offering_meetings m ON m.offering_id = o.id
       WHERE e.student_id = ? AND ${occupying('e.status')} AND o.semester_id = ?`,
      [studentId, off.semester_id]
    );
    for (const a of target) {
      const hit = mine.find((b) => overlap(a, b));
      if (hit) throw new HttpError(409, 'TIME_CONFLICT', { course: hit.code });
    }

    // 8) Credit cap from the cumulative GPA.
    const [[cr]] = await conn.query(
      `SELECT COALESCE(SUM(c.credit_hours), 0) AS credits
       FROM enrollments e JOIN course_offerings o ON o.id = e.offering_id
       JOIN courses c ON c.id = o.course_id
       WHERE e.student_id = ? AND ${occupying('e.status')} AND o.semester_id = ?`,
      [studentId, off.semester_id]
    );
    const max = maxCredits(await getStanding(conn, studentId));
    const current = Number(cr.credits);
    if (current + off.credit_hours > max) throw new HttpError(409, 'CREDIT_LIMIT', { max, current });

    // Insert a new row, or revive a dropped one.
    if (existing) {
      await conn.query("UPDATE enrollments SET status = 'enrolled', enrolled_at = NOW() WHERE id = ?", [existing.id]);
      return { id: existing.id };
    }
    const [r] = await conn.query('INSERT INTO enrollments (student_id, offering_id) VALUES (?,?)', [
      studentId,
      offeringId,
    ]);
    return { id: r.insertId };
  });
}

// Drop is allowed only during the registration window, and only while status is enrolled.
async function drop(studentId, enrollmentId) {
  const [[e]] = await db.query(
    `SELECT e.id, e.status, (CURDATE() BETWEEN s.registration_start AND s.registration_end) AS reg_open
     FROM enrollments e
     JOIN course_offerings o ON o.id = e.offering_id
     JOIN semesters s ON s.id = o.semester_id
     WHERE e.id = ? AND e.student_id = ?`,
    [enrollmentId, studentId]
  );
  if (!e) throw new HttpError(404, 'NOT_FOUND');
  if (e.status !== 'enrolled') throw new HttpError(409, 'NOT_ENROLLED');
  if (!e.reg_open) throw new HttpError(403, 'REGISTRATION_CLOSED');
  await db.query("UPDATE enrollments SET status = 'dropped' WHERE id = ?", [enrollmentId]);
}

module.exports = { register, drop };

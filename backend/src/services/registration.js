const db = require('../config/db');
const { HttpError } = require('../utils/errors');
const { withTx } = require('../utils/tx');
const { getStanding, maxCredits } = require('./gpa');

const overlap = (a, b) =>
  a.day_of_week === b.day_of_week && a.start_time < b.end_time && b.start_time < a.end_time;

// تسجيل مادة لطالب مع كل القواعد
async function register(studentId, offeringId) {
  return withTx(async (conn) => {
    // قفل الـ offering عشان اتنين مايدخلوا آخر مكان في نفس اللحظة
    await conn.query('SELECT id FROM course_offerings WHERE id = ? FOR UPDATE', [offeringId]);

    const [[off]] = await conn.query(
      `SELECT o.id, o.course_id, o.semester_id, o.capacity, c.code, c.credit_hours,
              (CURDATE() BETWEEN s.registration_start AND s.registration_end) AS reg_open
       FROM course_offerings o
       JOIN courses c ON c.id = o.course_id
       JOIN semesters s ON s.id = o.semester_id
       WHERE o.id = ?`,
      [offeringId]
    );
    if (!off) throw new HttpError(404, 'NOT_FOUND');

    // 1) فترة التسجيل
    if (!off.reg_open) throw new HttpError(403, 'REGISTRATION_CLOSED');

    // 2) مسجّل قبل كده؟
    const [[existing]] = await conn.query(
      'SELECT id, status FROM enrollments WHERE student_id = ? AND offering_id = ?',
      [studentId, offeringId]
    );
    if (existing && existing.status !== 'dropped') throw new HttpError(409, 'ALREADY_ENROLLED');

    // 3) نفس المادة في شعبة تانية بنفس الترم؟
    const [same] = await conn.query(
      `SELECT e.id FROM enrollments e JOIN course_offerings o ON o.id = e.offering_id
       WHERE e.student_id = ? AND o.course_id = ? AND o.semester_id = ? AND e.status = 'enrolled'`,
      [studentId, off.course_id, off.semester_id]
    );
    if (same.length) throw new HttpError(409, 'COURSE_ALREADY_IN_SEMESTER');

    // 4) نجح فيها قبل كده؟
    const [passedRows] = await conn.query(
      `SELECT DISTINCT o.course_id FROM enrollments e JOIN course_offerings o ON o.id = e.offering_id
       WHERE e.student_id = ? AND e.status = 'completed'`,
      [studentId]
    );
    const passed = new Set(passedRows.map((r) => r.course_id));
    if (passed.has(off.course_id)) throw new HttpError(409, 'ALREADY_PASSED');

    // 5) المتطلبات السابقة
    const [pre] = await conn.query(
      `SELECT pc.id, pc.code FROM course_prerequisites p
       JOIN courses pc ON pc.id = p.prerequisite_id WHERE p.course_id = ?`,
      [off.course_id]
    );
    const missing = pre.filter((p) => !passed.has(p.id)).map((p) => p.code);
    if (missing.length) throw new HttpError(409, 'PREREQ_NOT_MET', { courses: missing });

    // 6) السعة
    const [[cnt]] = await conn.query(
      "SELECT COUNT(*) AS n FROM enrollments WHERE offering_id = ? AND status = 'enrolled'",
      [offeringId]
    );
    if (cnt.n >= off.capacity) throw new HttpError(409, 'SECTION_FULL');

    // 7) تعارض المواعيد
    const [target] = await conn.query('SELECT * FROM offering_meetings WHERE offering_id = ?', [offeringId]);
    const [mine] = await conn.query(
      `SELECT m.day_of_week, m.start_time, m.end_time, c.code
       FROM enrollments e
       JOIN course_offerings o ON o.id = e.offering_id
       JOIN courses c ON c.id = o.course_id
       JOIN offering_meetings m ON m.offering_id = o.id
       WHERE e.student_id = ? AND e.status = 'enrolled' AND o.semester_id = ?`,
      [studentId, off.semester_id]
    );
    for (const a of target) {
      const hit = mine.find((b) => overlap(a, b));
      if (hit) throw new HttpError(409, 'TIME_CONFLICT', { course: hit.code });
    }

    // 8) الحد الأقصى للساعات حسب الـ GPA
    const [[cr]] = await conn.query(
      `SELECT COALESCE(SUM(c.credit_hours), 0) AS credits
       FROM enrollments e JOIN course_offerings o ON o.id = e.offering_id
       JOIN courses c ON c.id = o.course_id
       WHERE e.student_id = ? AND e.status = 'enrolled' AND o.semester_id = ?`,
      [studentId, off.semester_id]
    );
    const max = maxCredits(await getStanding(conn, studentId));
    const current = Number(cr.credits);
    if (current + off.credit_hours > max) throw new HttpError(409, 'CREDIT_LIMIT', { max, current });

    // تمام: سجّل
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

// حذف مادة (في فترة التسجيل بس)
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

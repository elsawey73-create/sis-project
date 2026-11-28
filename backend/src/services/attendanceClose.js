const db = require('../config/db');
const { occupying } = require('../domain/enrollment');
const { absenceStanding } = require('../domain/attendancePolicy');
const { notify, notifyOnce } = require('./notify');
const { getNumber } = require('./settings');

// After a session closes, students with no mark are absent. Warn once when they
// approach the limit and once when they pass it. Each absence still notifies.
async function notifySessionAbsences(sessionId) {
  const [[session]] = await db.query(
    `SELECT s.id, s.offering_id, s.session_date, c.code, c.name_ar, c.name_en, o.absence_limit_pct
     FROM attendance_sessions s
     JOIN course_offerings o ON o.id = s.offering_id
     JOIN courses c ON c.id = o.course_id
     WHERE s.id = ?`,
    [sessionId]
  );
  if (!session) return;
  const globalLimit = await getNumber('absence_limit_pct');
  const limit = session.absence_limit_pct == null ? globalLimit : Number(session.absence_limit_pct);
  const [students] = await db.query(
    `SELECT e.student_id, ar.status
     FROM enrollments e
     LEFT JOIN attendance_records ar ON ar.session_id = ? AND ar.student_id = e.student_id
     WHERE e.offering_id = ? AND ${occupying('e.status')}`,
    [sessionId, session.offering_id]
  );
  const [[counts]] = await db.query(
    "SELECT COUNT(*) AS total_sessions FROM attendance_sessions WHERE offering_id = ? AND status = 'closed'",
    [session.offering_id]
  );
  for (const student of students) {
    if (!student.status) {
      await notify(db, student.student_id, 'marked_absent', {
        course_code: session.code,
        course_ar: session.name_ar,
        course_en: session.name_en,
        session_id: session.id,
        session_date: session.session_date,
      });
    }
    const [[attended]] = await db.query(
      `SELECT COUNT(*) AS n FROM attendance_records ar
       JOIN attendance_sessions s ON s.id = ar.session_id
       WHERE s.offering_id = ? AND s.status = 'closed' AND ar.student_id = ?`,
      [session.offering_id, student.student_id]
    );
    const standing = absenceStanding({
      attended: attended.n,
      totalSessions: counts.total_sessions,
      limitPct: limit,
    });
    const payload = {
      course_code: session.code,
      course_ar: session.name_ar,
      course_en: session.name_en,
      offering_id: session.offering_id,
      absent_pct: standing.absent_pct,
      absence_limit_pct: standing.absence_limit_pct,
      approaching: standing.approaching,
    };
    if (standing.warning) {
      await notifyOnce(db, student.student_id, 'absence_warning', `absence-exceeded-${session.offering_id}`, payload);
    } else if (standing.approaching) {
      await notifyOnce(db, student.student_id, 'absence_warning', `absence-approaching-${session.offering_id}`, payload);
    }
  }
}

module.exports = { notifySessionAbsences };

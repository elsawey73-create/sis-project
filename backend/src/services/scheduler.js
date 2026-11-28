const db = require('../config/db');
const { occupying } = require('../domain/enrollment');
const { notify } = require('./notify');
const { notifySessionAbsences } = require('./attendanceClose');

// In-process timers. Railway runs one API process, so this is the scheduler.
// The same functions also run from GET /api/notifications/summary, so a restart
// still delivers a reminder the next time someone opens the app.

async function closeDueSessions() {
  const [rows] = await db.query(
    "SELECT id FROM attendance_sessions WHERE status = 'open' AND auto_close_at IS NOT NULL AND auto_close_at <= NOW()"
  );
  for (const row of rows) {
    const [result] = await db.query(
      "UPDATE attendance_sessions SET status = 'closed', closed_at = NOW() WHERE id = ? AND status = 'open'",
      [row.id]
    );
    if (result.affectedRows) await notifySessionAbsences(row.id);
  }
}

async function sendExamReminders() {
  const [exams] = await db.query(
    `SELECT e.id, e.title, e.exam_at, e.offering_id, c.code, c.name_ar, c.name_en
     FROM course_exams e
     JOIN course_offerings o ON o.id = e.offering_id
     JOIN courses c ON c.id = o.course_id
     WHERE e.exam_at BETWEEN DATE_ADD(NOW(), INTERVAL 1 DAY) AND DATE_ADD(NOW(), INTERVAL 2 DAY)`
  );
  for (const exam of exams) {
    const [students] = await db.query(
      `SELECT e.student_id FROM enrollments e
       WHERE e.offering_id = ? AND ${occupying('e.status')}
         AND NOT EXISTS (SELECT 1 FROM exam_reminder_sent s WHERE s.exam_id = ? AND s.user_id = e.student_id)`,
      [exam.offering_id, exam.id]
    );
    for (const student of students) {
      try {
        await db.query('INSERT INTO exam_reminder_sent (exam_id, user_id) VALUES (?,?)', [exam.id, student.student_id]);
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') continue;
        throw err;
      }
      await notify(db, student.student_id, 'exam_reminder', {
        exam_id: exam.id,
        title: exam.title,
        exam_at: exam.exam_at,
        course_code: exam.code,
        course_ar: exam.name_ar,
        course_en: exam.name_en,
      });
    }
  }
}

async function runScheduledJobs() {
  await closeDueSessions();
  await sendExamReminders();
}

function startSchedulers() {
  const tick = () => {
    runScheduledJobs().catch((err) => console.error('scheduled jobs failed:', err.message));
  };
  const timer = setInterval(tick, 60 * 1000);
  if (typeof timer.unref === 'function') timer.unref();
  const first = setTimeout(tick, 8000);
  if (typeof first.unref === 'function') first.unref();
}

module.exports = { startSchedulers, runScheduledJobs, closeDueSessions, sendExamReminders };

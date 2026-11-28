const router = require('express').Router();
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { HttpError } = require('../utils/errors');
const { withTx } = require('../utils/tx');
const { attachMeetings } = require('../utils/meetings');
const { gradeFromTotal, maxes, computeTotal } = require('../services/gpa');
const { notify } = require('../services/notify');
const { audit } = require('../services/audit');
const { getNumber } = require('../services/settings');
const { occupying } = require('../domain/enrollment');

router.use(authenticate, authorize('instructor'));

async function ownOffering(req) {
  const [[o]] = await db.query(
    `SELECT o.*, c.code, c.name_ar, c.name_en, c.has_practical, c.credit_hours
     FROM course_offerings o JOIN courses c ON c.id = o.course_id
     WHERE o.id = ? AND o.instructor_id = ?`,
    [req.params.id, req.user.id]
  );
  if (!o) throw new HttpError(404, 'NOT_FOUND');
  return o;
}

// My offerings.
router.get('/offerings', async (req, res) => {
  let semesterId = req.query.semester_id;
  if (!semesterId) {
    const [[cur]] = await db.query('SELECT id FROM semesters WHERE is_current = 1 LIMIT 1');
    semesterId = cur ? cur.id : 0;
  }
  const [rows] = await db.query(
    `SELECT o.id, o.section, o.capacity, c.code, c.name_ar, c.name_en, c.credit_hours, c.has_practical,
            (SELECT COUNT(*) FROM enrollments e WHERE e.offering_id = o.id AND ${occupying('e.status')}) AS enrolled_count,
            (SELECT COUNT(*) FROM enrollments e LEFT JOIN grades g ON g.enrollment_id = e.id
              WHERE e.offering_id = o.id AND e.status = 'enrolled' AND (g.enrollment_id IS NULL OR g.total IS NULL)) AS pending_grades,
            (SELECT s.id FROM attendance_sessions s WHERE s.offering_id = o.id AND s.status = 'open' LIMIT 1) AS open_session_id
     FROM course_offerings o JOIN courses c ON c.id = o.course_id
     WHERE o.instructor_id = ? AND o.semester_id = ? ORDER BY c.code`,
    [req.user.id, semesterId]
  );
  await attachMeetings(rows);
  res.json(rows);
});

// Roster, grades, and attendance counts.
router.get('/offerings/:id/roster', async (req, res) => {
  const o = await ownOffering(req);
  const [students] = await db.query(
    `SELECT e.id AS enrollment_id, u.id AS student_id, st.student_code, u.full_name_ar, u.full_name_en,
            g.coursework, g.midterm, g.practical, g.final_exam, g.total, g.letter, g.points,
            COALESCE(g.published, 0) AS published,
            (SELECT COUNT(*) FROM attendance_records ar JOIN attendance_sessions s2 ON s2.id = ar.session_id
             WHERE s2.offering_id = e.offering_id AND s2.status = 'closed' AND ar.student_id = u.id) AS attended
     FROM enrollments e
     JOIN users u ON u.id = e.student_id
     JOIN students st ON st.user_id = u.id
     LEFT JOIN grades g ON g.enrollment_id = e.id
     WHERE e.offering_id = ? AND ${occupying('e.status')}
     ORDER BY st.student_code`,
    [o.id]
  );
  const [[ts]] = await db.query("SELECT COUNT(*) AS n FROM attendance_sessions WHERE offering_id = ? AND status = 'closed'", [o.id]);
  res.json({
    offering: { id: o.id, code: o.code, name_ar: o.name_ar, name_en: o.name_en, section: o.section, has_practical: o.has_practical },
    max: maxes(o.has_practical),
    total_sessions: ts.n,
    students,
  });
});

// Save grades. Unchanged rows are skipped.
router.put('/offerings/:id/grades', async (req, res) => {
  const o = await ownOffering(req);
  const list = req.body.grades;
  if (!Array.isArray(list)) throw new HttpError(400, 'MISSING_FIELDS');
  const mx = maxes(o.has_practical);
  const keys = ['coursework', 'midterm', 'practical', 'final_exam'];
  let saved = 0;

  await withTx(async (conn) => {
    for (const g of list) {
      const [[enr]] = await conn.query(
        `SELECT id FROM enrollments WHERE id = ? AND offering_id = ? AND ${occupying('status')}`,
        [g.enrollment_id, o.id]
      );
      if (!enr) throw new HttpError(400, 'INVALID_ENROLLMENT');

      const vals = {};
      for (const k of keys) {
        const raw = g[k];
        if (raw === null || raw === undefined || raw === '') vals[k] = null;
        else {
          const n = Number(raw);
          if (!Number.isFinite(n) || n < 0 || n > mx[k]) throw new HttpError(400, 'INVALID_GRADE', { field: k, max: mx[k] });
          vals[k] = n;
        }
      }
      if (!o.has_practical) vals.practical = null;

      const [[old]] = await conn.query('SELECT * FROM grades WHERE enrollment_id = ?', [enr.id]);
      if (old && keys.every((k) => (old[k] === null ? null : Number(old[k])) === vals[k])) continue; // unchanged

      const total = computeTotal(vals, o.has_practical);
      await conn.query(
        `INSERT INTO grades (enrollment_id, coursework, midterm, practical, final_exam, total, letter, points, published)
         VALUES (?,?,?,?,?,?,NULL,NULL,0)
         ON DUPLICATE KEY UPDATE coursework=VALUES(coursework), midterm=VALUES(midterm), practical=VALUES(practical),
           final_exam=VALUES(final_exam), total=VALUES(total), letter=NULL, points=NULL, published=0`,
        [enr.id, vals.coursework, vals.midterm, vals.practical, vals.final_exam, total]
      );
      await conn.query("UPDATE enrollments SET status = 'enrolled' WHERE id = ?", [enr.id]); // Editing unpublishes the grade.
      saved++;
    }
  });
  res.json({ saved });
});

// Publish: compute the letter grade and show it to the student.
router.post('/offerings/:id/grades/publish', async (req, res) => {
  const o = await ownOffering(req);
  const result = await withTx(async (conn) => {
    const [rows] = await conn.query(
      `SELECT e.id AS enrollment_id, e.student_id, g.total
       FROM enrollments e JOIN grades g ON g.enrollment_id = e.id
       WHERE e.offering_id = ? AND g.total IS NOT NULL AND g.published = 0`,
      [o.id]
    );
    for (const r of rows) {
      const { letter, points } = gradeFromTotal(Number(r.total));
      await conn.query('UPDATE grades SET letter = ?, points = ?, published = 1 WHERE enrollment_id = ?', [letter, points, r.enrollment_id]);
      await conn.query('UPDATE enrollments SET status = ? WHERE id = ?', [points > 0 ? 'completed' : 'failed', r.enrollment_id]);
      await notify(conn, r.student_id, 'grades_published', { course_code: o.code, course_ar: o.name_ar, course_en: o.name_en });
    }
    if (rows.length) await audit(req.user.id, 'grades.publish', 'course_offering', o.id, `${rows.length} students`);
    const [[pend]] = await conn.query(
      "SELECT COUNT(*) AS n FROM enrollments e LEFT JOIN grades g ON g.enrollment_id = e.id WHERE e.offering_id = ? AND e.status = 'enrolled' AND (g.enrollment_id IS NULL OR g.total IS NULL)",
      [o.id]
    );
    return { published: rows.length, pending: pend.n };
  });
  res.json(result);
});

router.get('/stats', async (req, res) => {
  const [[cur]] = await db.query('SELECT id FROM semesters WHERE is_current = 1 LIMIT 1');
  const semesterId = cur ? cur.id : 0;
  const globalLimit = await getNumber('absence_limit_pct');
  const [rows] = await db.query(
    `SELECT o.id, c.code, c.name_ar, c.name_en, o.absence_limit_pct,
            (SELECT COUNT(*) FROM enrollments e WHERE e.offering_id = o.id AND ${occupying('e.status')}) AS students,
            (SELECT COUNT(*) FROM attendance_sessions s WHERE s.offering_id = o.id AND s.status = 'closed') AS sessions,
            (SELECT COUNT(*) FROM attendance_records ar JOIN attendance_sessions s ON s.id = ar.session_id
              WHERE s.offering_id = o.id AND s.status = 'closed') AS attended_marks,
            (SELECT AVG(g.total) FROM grades g JOIN enrollments e ON e.id = g.enrollment_id
              WHERE e.offering_id = o.id AND g.published = 1) AS average_grade
     FROM course_offerings o JOIN courses c ON c.id = o.course_id
     WHERE o.instructor_id = ? AND o.semester_id = ?
     ORDER BY c.code`,
    [req.user.id, semesterId]
  );
  res.json({
    courses: rows.map((row) => {
      const possible = Number(row.students) * Number(row.sessions);
      const attended = Number(row.attended_marks);
      return {
        id: row.id,
        code: row.code,
        name_ar: row.name_ar,
        name_en: row.name_en,
        students: Number(row.students),
        sessions: Number(row.sessions),
        absent: Math.max(0, possible - attended),
        attendance_pct: possible ? Math.round((attended / possible) * 1000) / 10 : null,
        average_grade: row.average_grade == null ? null : Math.round(Number(row.average_grade) * 10) / 10,
        absence_limit_pct: row.absence_limit_pct == null ? globalLimit : Number(row.absence_limit_pct),
      };
    }),
  });
});

router.get('/offerings/:id/announcements', async (req, res) => {
  await ownOffering(req);
  const [rows] = await db.query(
    'SELECT id, title, body, created_at FROM announcements WHERE offering_id = ? ORDER BY id DESC',
    [req.params.id]
  );
  res.json(rows);
});

router.post('/offerings/:id/announcements', async (req, res) => {
  const o = await ownOffering(req);
  const title = String(req.body.title || '').trim().slice(0, 150);
  const body = String(req.body.body || '').trim();
  if (!title || !body || body.length > 5000) throw new HttpError(400, 'MISSING_FIELDS');
  const [students] = await db.query(
    `SELECT student_id FROM enrollments WHERE offering_id = ? AND ${occupying('status')}`,
    [o.id]
  );
  const id = await withTx(async (conn) => {
    const [created] = await conn.query(
      'INSERT INTO announcements (offering_id, author_id, title, body) VALUES (?,?,?,?)',
      [o.id, req.user.id, title, body]
    );
    for (const student of students) {
      await notify(conn, student.student_id, 'announcement', {
        announcement_id: created.insertId,
        title,
        course_code: o.code,
        course_ar: o.name_ar,
        course_en: o.name_en,
      });
    }
    return created.insertId;
  });
  await audit(req.user.id, 'announcement.create', 'announcement', id, o.code);
  res.status(201).json({ id, recipients: students.length });
});

router.get('/offerings/:id/exams', async (req, res) => {
  await ownOffering(req);
  const [rows] = await db.query(
    'SELECT id, title, exam_at, created_at FROM course_exams WHERE offering_id = ? ORDER BY exam_at',
    [req.params.id]
  );
  res.json(rows);
});

router.post('/offerings/:id/exams', async (req, res) => {
  const o = await ownOffering(req);
  const title = String(req.body.title || '').trim().slice(0, 150);
  const examAt = String(req.body.exam_at || '').trim();
  if (!title || !examAt) throw new HttpError(400, 'MISSING_FIELDS');
  const [created] = await db.query(
    'INSERT INTO course_exams (offering_id, title, exam_at, created_by) VALUES (?,?,?,?)',
    [o.id, title, examAt.replace('T', ' ').slice(0, 19), req.user.id]
  );
  await audit(req.user.id, 'exam.create', 'course_exam', created.insertId, `${o.code} ${title}`);
  res.status(201).json({ id: created.insertId });
});

router.delete('/offerings/:id/exams/:examId', async (req, res) => {
  await ownOffering(req);
  const [result] = await db.query(
    'DELETE FROM course_exams WHERE id = ? AND offering_id = ?',
    [req.params.examId, req.params.id]
  );
  if (!result.affectedRows) throw new HttpError(404, 'NOT_FOUND');
  await audit(req.user.id, 'exam.delete', 'course_exam', req.params.examId, String(req.params.id));
  res.json({ ok: true });
});

// Aggregated only. Comments are hidden until three students have responded.
router.get('/offerings/:id/evaluation', async (req, res) => {
  await ownOffering(req);
  const [[agg]] = await db.query(
    'SELECT COUNT(*) AS n, AVG(rating) AS average FROM course_evaluations WHERE offering_id = ?',
    [req.params.id]
  );
  const count = Number(agg.n);
  let comments = [];
  if (count >= 3) {
    const [rows] = await db.query(
      "SELECT rating, comment FROM course_evaluations WHERE offering_id = ? AND comment IS NOT NULL AND comment <> '' ORDER BY id",
      [req.params.id]
    );
    comments = rows;
  }
  res.json({
    count,
    average: agg.average == null ? null : Math.round(Number(agg.average) * 10) / 10,
    comments,
  });
});

module.exports = router;

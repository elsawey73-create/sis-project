const router = require('express').Router();
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { HttpError } = require('../utils/errors');
const { getStanding, standingFromAttempts, maxCredits, maxes, isPassOnly } = require('../services/gpa');
const { occupying } = require('../domain/enrollment');
const { audit } = require('../services/audit');
const { studentExportXlsx, transcriptPdf } = require('../services/exports');

router.use(authenticate, authorize('student'));

// Dashboard summary.
router.get('/summary', async (req, res) => {
  const standing = await getStanding(db, req.user.id);
  const [[sem]] = await db.query(
    'SELECT id, name_ar, name_en, (CURDATE() BETWEEN registration_start AND registration_end) AS registration_open FROM semesters WHERE is_current = 1 LIMIT 1'
  );
  let current = { courses: 0, credits: 0 };
  if (sem) {
    const [[c]] = await db.query(
      `SELECT COUNT(*) AS courses, COALESCE(SUM(c.credit_hours), 0) AS credits
       FROM enrollments e JOIN course_offerings o ON o.id = e.offering_id JOIN courses c ON c.id = o.course_id
       WHERE e.student_id = ? AND o.semester_id = ? AND ${occupying('e.status')}`,
      [req.user.id, sem.id]
    );
    current = { courses: c.courses, credits: Number(c.credits) };
  }
  res.json({ standing, semester: sem || null, current, max_credits: maxCredits(standing) });
});

// Published grades, one row per course.
router.get('/grades', async (req, res) => {
  const [rows] = await db.query(
    `SELECT e.id AS enrollment_id, c.id AS course_id, s.id AS semester_id, s.name_ar AS semester_ar,
            s.name_en AS semester_en, s.start_date, c.code, c.name_ar, c.name_en, c.credit_hours, c.has_practical,
            g.coursework, g.midterm, g.practical, g.final_exam, g.total, g.letter, g.points
     FROM enrollments e
     JOIN course_offerings o ON o.id = e.offering_id
     JOIN semesters s ON s.id = o.semester_id
     JOIN courses c ON c.id = o.course_id
     JOIN grades g ON g.enrollment_id = e.id AND g.published = 1
     WHERE e.student_id = ? AND e.status IN ('completed','failed')
     ORDER BY s.start_date DESC, c.code`,
    [req.user.id]
  );
  const { countedIds } = standingFromAttempts(rows);
  rows.forEach((r) => {
    r.max = maxes(r.has_practical);
    r.replaced = !countedIds.has(Number(r.enrollment_id));
  });
  res.json(rows);
});

async function buildTranscript(userId) {
  const [[info]] = await db.query(
    `SELECT u.full_name_ar, u.full_name_en, st.student_code, st.level, st.admission_year,
            d.name_ar AS department_ar, d.name_en AS department_en
     FROM users u JOIN students st ON st.user_id = u.id JOIN departments d ON d.id = st.department_id
     WHERE u.id = ?`,
    [userId]
  );
  if (!info) throw new HttpError(404, 'NOT_FOUND');

  const [rows] = await db.query(
    `SELECT e.id AS enrollment_id, c.id AS course_id, s.id AS semester_id,
            s.name_ar AS semester_ar, s.name_en AS semester_en, s.start_date,
            c.code, c.name_ar, c.name_en, c.credit_hours, g.total, g.letter, g.points
     FROM enrollments e
     JOIN course_offerings o ON o.id = e.offering_id
     JOIN semesters s ON s.id = o.semester_id
     JOIN courses c ON c.id = o.course_id
     JOIN grades g ON g.enrollment_id = e.id AND g.published = 1
     WHERE e.student_id = ? AND e.status IN ('completed','failed')
     ORDER BY s.start_date, c.code`,
    [userId]
  );

  const repeat = standingFromAttempts(rows);
  const semesters = [];
  const byId = {};
  for (const r of rows) {
    if (!byId[r.semester_id]) {
      byId[r.semester_id] = { id: r.semester_id, name_ar: r.semester_ar, name_en: r.semester_en, courses: [], _q: 0, _a: 0, _e: 0 };
      semesters.push(byId[r.semester_id]);
    }
    const s = byId[r.semester_id];
    const replaced = !repeat.countedIds.has(Number(r.enrollment_id));
    s.courses.push({
      enrollment_id: r.enrollment_id,
      code: r.code,
      name_ar: r.name_ar,
      name_en: r.name_en,
      credit_hours: r.credit_hours,
      total: r.total,
      letter: r.letter,
      points: r.points,
      replaced,
    });
    // Pass-only grades earn the hours but stay out of the term GPA.
    if (isPassOnly(r.letter)) { s._e += Number(r.credit_hours); continue; }
    s._a += Number(r.credit_hours);
    s._q += Number(r.credit_hours) * Number(r.points);
    if (Number(r.points) > 0) s._e += Number(r.credit_hours);
  }
  const round = (n) => Math.round(n * 100) / 100;
  semesters.forEach((s) => {
    s.gpa = s._a ? round(s._q / s._a) : null;
    s.credits_attempted = s._a;
    s.credits_earned = s._e;
    delete s._q; delete s._a; delete s._e;
  });
  return {
    student: info,
    semesters,
    standing: { cgpa: repeat.cgpa, credits_attempted: repeat.credits_attempted, credits_earned: repeat.credits_earned },
  };
}

// Full transcript: every semester, plus semester GPA and the cumulative GPA.
router.get('/transcript', async (req, res) => {
  res.json(await buildTranscript(req.user.id));
});

router.get('/transcript.pdf', async (req, res) => {
  const payload = await buildTranscript(req.user.id);
  const body = await transcriptPdf(payload);
  res.set('Content-Disposition', 'attachment; filename="transcript.pdf"');
  res.type('application/pdf');
  res.send(Buffer.from(body));
});

router.get('/terms', async (req, res) => {
  const [rows] = await db.query(
    `SELECT DISTINCT sm.id, sm.name_ar, sm.name_en, sm.start_date, sm.end_date, sm.is_current
     FROM enrollments e
     JOIN course_offerings o ON o.id = e.offering_id
     JOIN semesters sm ON sm.id = o.semester_id
     WHERE e.student_id = ? AND e.status <> 'dropped'
     ORDER BY sm.start_date DESC`,
    [req.user.id]
  );
  res.json(rows);
});

router.get('/export.xlsx', async (req, res) => {
  const transcript = await buildTranscript(req.user.id);
  const grades = [];
  transcript.semesters.forEach((semester) => {
    semester.courses.forEach((course) => grades.push({
      ...course,
      semester_en: semester.name_en,
      semester_ar: semester.name_ar,
    }));
  });
  const [attendance] = await db.query(
    `SELECT sm.name_ar AS semester_ar, sm.name_en AS semester_en, c.code, c.name_ar, c.name_en,
            s.session_date, s.status AS session_status, ar.status, ar.method, ar.distance_m
     FROM enrollments e
     JOIN course_offerings o ON o.id = e.offering_id
     JOIN semesters sm ON sm.id = o.semester_id
     JOIN courses c ON c.id = o.course_id
     JOIN attendance_sessions s ON s.offering_id = o.id
     LEFT JOIN attendance_records ar ON ar.session_id = s.id AND ar.student_id = e.student_id
     WHERE e.student_id = ? AND ${occupying('e.status')}
     ORDER BY s.session_date, c.code`,
    [req.user.id]
  );
  const [meetings] = await db.query(
    `SELECT c.code, c.name_en, c.name_ar, o.section, m.day_of_week, m.start_time, m.end_time, m.room, m.type
     FROM enrollments e
     JOIN course_offerings o ON o.id = e.offering_id
     JOIN courses c ON c.id = o.course_id
     LEFT JOIN offering_meetings m ON m.offering_id = o.id
     WHERE e.student_id = ? AND ${occupying('e.status')}
     ORDER BY c.code, m.day_of_week, m.start_time`,
    [req.user.id]
  );
  const schedule = meetings.filter((row) => row.day_of_week).map((row) => [
    row.code, row.name_en || row.name_ar, row.section, row.day_of_week,
    String(row.start_time).slice(0, 5), String(row.end_time).slice(0, 5), row.room, row.type,
  ]);
  const body = await studentExportXlsx({ grades, attendance, schedule });
  await audit(req.user.id, 'student.export', 'user', req.user.id, 'xlsx');
  res.set('Content-Disposition', 'attachment; filename="unidex-record.xlsx"');
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(Buffer.from(body));
});

router.get('/evaluations', async (req, res) => {
  const [rows] = await db.query(
    `SELECT o.id AS offering_id, c.code, c.name_ar, c.name_en, sm.name_ar AS semester_ar, sm.name_en AS semester_en,
            ev.rating, ev.comment, ev.created_at
     FROM enrollments e
     JOIN course_offerings o ON o.id = e.offering_id
     JOIN courses c ON c.id = o.course_id
     JOIN semesters sm ON sm.id = o.semester_id
     LEFT JOIN course_evaluations ev ON ev.offering_id = o.id AND ev.student_id = e.student_id
     WHERE e.student_id = ? AND ${occupying('e.status')}
       AND CURDATE() >= DATE_SUB(sm.end_date, INTERVAL 21 DAY)
     ORDER BY sm.start_date DESC, c.code`,
    [req.user.id]
  );
  res.json(rows);
});

router.post('/evaluations', async (req, res) => {
  const offeringId = Number(req.body.offering_id);
  const rating = Number(req.body.rating);
  const comment = String(req.body.comment || '').trim().slice(0, 1000) || null;
  if (!offeringId || !Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError(400, 'MISSING_FIELDS');
  const [[row]] = await db.query(
    `SELECT o.id FROM enrollments e
     JOIN course_offerings o ON o.id = e.offering_id
     JOIN semesters sm ON sm.id = o.semester_id
     WHERE e.student_id = ? AND o.id = ? AND ${occupying('e.status')}
       AND CURDATE() >= DATE_SUB(sm.end_date, INTERVAL 21 DAY)`,
    [req.user.id, offeringId]
  );
  if (!row) throw new HttpError(403, 'FORBIDDEN');
  await db.query(
    `INSERT INTO course_evaluations (offering_id, student_id, rating, comment) VALUES (?,?,?,?)
     ON DUPLICATE KEY UPDATE rating = VALUES(rating), comment = VALUES(comment)`,
    [offeringId, req.user.id, rating, comment]
  );
  res.json({ ok: true });
});

module.exports = router;

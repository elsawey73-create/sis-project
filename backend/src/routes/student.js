const router = require('express').Router();
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { HttpError } = require('../utils/errors');
const { getStanding, maxCredits, maxes } = require('../services/gpa');

router.use(authenticate, authorize('student'));

// ملخص الداشبورد
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
       WHERE e.student_id = ? AND o.semester_id = ? AND e.status = 'enrolled'`,
      [req.user.id, sem.id]
    );
    current = { courses: c.courses, credits: Number(c.credits) };
  }
  res.json({ standing, semester: sem || null, current, max_credits: maxCredits(standing) });
});

// الدرجات المنشورة بالتفصيل
router.get('/grades', async (req, res) => {
  const [rows] = await db.query(
    `SELECT s.id AS semester_id, s.name_ar AS semester_ar, s.name_en AS semester_en, s.start_date,
            c.code, c.name_ar, c.name_en, c.credit_hours, c.has_practical,
            g.coursework, g.midterm, g.practical, g.final_exam, g.total, g.letter, g.points
     FROM enrollments e
     JOIN course_offerings o ON o.id = e.offering_id
     JOIN semesters s ON s.id = o.semester_id
     JOIN courses c ON c.id = o.course_id
     JOIN grades g ON g.enrollment_id = e.id AND g.published = 1
     WHERE e.student_id = ? ORDER BY s.start_date DESC, c.code`,
    [req.user.id]
  );
  rows.forEach((r) => (r.max = maxes(r.has_practical)));
  res.json(rows);
});

// الترانسكريبت الكامل: كل الترمات + GPA لكل ترم والتراكمي
router.get('/transcript', async (req, res) => {
  const [[info]] = await db.query(
    `SELECT u.full_name_ar, u.full_name_en, st.student_code, st.level, st.admission_year,
            d.name_ar AS department_ar, d.name_en AS department_en
     FROM users u JOIN students st ON st.user_id = u.id JOIN departments d ON d.id = st.department_id
     WHERE u.id = ?`,
    [req.user.id]
  );
  if (!info) throw new HttpError(404, 'NOT_FOUND');

  const [rows] = await db.query(
    `SELECT s.id AS semester_id, s.name_ar AS semester_ar, s.name_en AS semester_en, s.start_date,
            c.code, c.name_ar, c.name_en, c.credit_hours, g.total, g.letter, g.points
     FROM enrollments e
     JOIN course_offerings o ON o.id = e.offering_id
     JOIN semesters s ON s.id = o.semester_id
     JOIN courses c ON c.id = o.course_id
     JOIN grades g ON g.enrollment_id = e.id AND g.published = 1
     WHERE e.student_id = ? ORDER BY s.start_date, c.code`,
    [req.user.id]
  );

  const semesters = [];
  const byId = {};
  for (const r of rows) {
    if (!byId[r.semester_id]) {
      byId[r.semester_id] = { id: r.semester_id, name_ar: r.semester_ar, name_en: r.semester_en, courses: [], _q: 0, _a: 0, _e: 0 };
      semesters.push(byId[r.semester_id]);
    }
    const s = byId[r.semester_id];
    s.courses.push({ code: r.code, name_ar: r.name_ar, name_en: r.name_en, credit_hours: r.credit_hours, total: r.total, letter: r.letter, points: r.points });
    s._a += r.credit_hours;
    s._q += r.credit_hours * Number(r.points);
    if (Number(r.points) > 0) s._e += r.credit_hours;
  }
  const round = (n) => Math.round(n * 100) / 100;
  semesters.forEach((s) => {
    s.gpa = s._a ? round(s._q / s._a) : null;
    s.credits_attempted = s._a;
    s.credits_earned = s._e;
    delete s._q; delete s._a; delete s._e;
  });
  res.json({ student: info, semesters, standing: await getStanding(db, req.user.id) });
});

module.exports = router;

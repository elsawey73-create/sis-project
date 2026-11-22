const router = require('express').Router();
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { attachMeetings } = require('../utils/meetings');
const { register, drop } = require('../services/registration');
const { getStanding, maxCredits } = require('../services/gpa');

router.use(authenticate, authorize('student'));

// موادي في الترم (الافتراضي: الحالي) + الجدول
router.get('/me', async (req, res) => {
  const [[sem]] = req.query.semester_id
    ? await db.query('SELECT *, (CURDATE() BETWEEN registration_start AND registration_end) AS registration_open FROM semesters WHERE id = ?', [req.query.semester_id])
    : await db.query('SELECT *, (CURDATE() BETWEEN registration_start AND registration_end) AS registration_open FROM semesters WHERE is_current = 1 LIMIT 1');
  if (!sem) return res.json({ semester: null, courses: [], total_credits: 0, max_credits: 18 });

  const [rows] = await db.query(
    `SELECT e.id AS enrollment_id, e.status, o.id AS offering_id, o.section,
            c.code, c.name_ar, c.name_en, c.credit_hours,
            u.full_name_ar AS instructor_ar, u.full_name_en AS instructor_en
     FROM enrollments e
     JOIN course_offerings o ON o.id = e.offering_id
     JOIN courses c ON c.id = o.course_id
     JOIN users u ON u.id = o.instructor_id
     WHERE e.student_id = ? AND o.semester_id = ? AND e.status = 'enrolled'
     ORDER BY c.code`,
    [req.user.id, sem.id]
  );
  await attachMeetings(rows, 'offering_id');
  const standing = await getStanding(db, req.user.id);
  res.json({
    semester: sem,
    courses: rows,
    total_credits: rows.reduce((s, r) => s + r.credit_hours, 0),
    max_credits: maxCredits(standing),
  });
});

router.post('/', async (req, res) => {
  if (!req.body.offering_id) return res.status(400).json({ error: 'MISSING_FIELDS' });
  const r = await register(req.user.id, req.body.offering_id);
  res.status(201).json(r);
});

router.delete('/:id', async (req, res) => {
  await drop(req.user.id, req.params.id);
  res.json({ ok: true });
});

module.exports = router;

const router = require('express').Router();
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { attachMeetings } = require('../utils/meetings');
const { register, drop } = require('../services/registration');
const { getStanding, maxCredits } = require('../services/gpa');
const { occupying } = require('../domain/enrollment');
const { audit } = require('../services/audit');
const { scheduleIcs, schedulePdf } = require('../services/exports');

router.use(authenticate, authorize('student'));

// My courses for a semester (the current semester by default), including meetings.
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
     WHERE e.student_id = ? AND o.semester_id = ? AND ${occupying('e.status')}
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

async function mySchedule(req) {
  const [[sem]] = req.query.semester_id
    ? await db.query('SELECT * FROM semesters WHERE id = ?', [req.query.semester_id])
    : await db.query('SELECT * FROM semesters WHERE is_current = 1 LIMIT 1');
  if (!sem) return { semester: null, courses: [] };
  const [rows] = await db.query(
    `SELECT e.id AS enrollment_id, o.id AS offering_id, o.section, c.code, c.name_ar, c.name_en
     FROM enrollments e
     JOIN course_offerings o ON o.id = e.offering_id
     JOIN courses c ON c.id = o.course_id
     WHERE e.student_id = ? AND o.semester_id = ? AND ${occupying('e.status')}
     ORDER BY c.code`,
    [req.user.id, sem.id]
  );
  await attachMeetings(rows, 'offering_id');
  return { semester: sem, courses: rows };
}

router.get('/me/schedule.ics', async (req, res) => {
  const payload = await mySchedule(req);
  res.set('Content-Disposition', 'attachment; filename="unidex-schedule.ics"');
  res.type('text/calendar');
  res.send(scheduleIcs(payload));
});

router.get('/me/schedule.pdf', async (req, res) => {
  const payload = await mySchedule(req);
  const body = await schedulePdf(payload);
  res.set('Content-Disposition', 'attachment; filename="unidex-schedule.pdf"');
  res.type('application/pdf');
  res.send(Buffer.from(body));
});

router.post('/', async (req, res) => {
  if (!req.body.offering_id) return res.status(400).json({ error: 'MISSING_FIELDS' });
  const r = await register(req.user.id, req.body.offering_id);
  await audit(req.user.id, 'enrollment.register', 'enrollment', r.id, String(req.body.offering_id));
  res.status(201).json(r);
});

router.delete('/:id', async (req, res) => {
  await drop(req.user.id, req.params.id);
  await audit(req.user.id, 'enrollment.drop', 'enrollment', req.params.id, null);
  res.json({ ok: true });
});

module.exports = router;

const router = require('express').Router();
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { HttpError } = require('../utils/errors');
const { withTx } = require('../utils/tx');
const { attachMeetings, validateMeetings, saveMeetings } = require('../utils/meetings');
const { occupying } = require('../domain/enrollment');
const { visibleCodesForUser, codeLimit } = require('../domain/visibility');

const admin = [authenticate, authorize('admin')];

async function currentSemesterId() {
  const [[cur]] = await db.query('SELECT id FROM semesters WHERE is_current = 1 LIMIT 1');
  return cur ? cur.id : null;
}

// Offerings for one semester. Defaults to the current semester.
router.get('/', authenticate, async (req, res) => {
  const semesterId = req.query.semester_id || (await currentSemesterId());
  if (!semesterId) return res.json([]);

  const conds = ['o.semester_id = ?'];
  const params = [semesterId];
  const limit = codeLimit('d.code', await visibleCodesForUser(db, req.user));
  if (limit.sql) { conds.push(limit.sql); params.push(...limit.params); }
  if (req.query.department_id) { conds.push('c.department_id = ?'); params.push(req.query.department_id); }
  if (req.query.q) {
    conds.push('(c.code LIKE ? OR c.name_ar LIKE ? OR c.name_en LIKE ?)');
    const like = `%${req.query.q}%`;
    params.push(like, like, like);
  }

  const [rows] = await db.query(
    `SELECT o.id, o.section, o.capacity, o.semester_id, o.instructor_id,
            c.id AS course_id, c.code, c.name_ar, c.name_en, c.credit_hours, c.has_practical,
            d.code AS department_code, d.name_ar AS department_ar, d.name_en AS department_en,
            u.full_name_ar AS instructor_ar, u.full_name_en AS instructor_en,
            (SELECT COUNT(*) FROM enrollments e WHERE e.offering_id = o.id AND ${occupying('e.status')}) AS enrolled_count
     FROM course_offerings o
     JOIN courses c ON c.id = o.course_id
     JOIN departments d ON d.id = c.department_id
     JOIN users u ON u.id = o.instructor_id
     WHERE ${conds.join(' AND ')}
     ORDER BY c.code, o.section`,
    params
  );
  await attachMeetings(rows);

  // For a student: enrollment status, passed courses, and missing prerequisites.
  if (req.user.role === 'student') {
    const [mine] = await db.query(`SELECT offering_id, status FROM enrollments WHERE student_id = ? AND ${occupying('status')}`, [req.user.id]);
    const [passedRows] = await db.query(
      `SELECT DISTINCT o.course_id FROM enrollments e JOIN course_offerings o ON o.id = e.offering_id
       WHERE e.student_id = ? AND e.status = 'completed'`, [req.user.id]);
    const [pre] = await db.query(
      `SELECT p.course_id, pc.id AS pid, pc.code FROM course_prerequisites p JOIN courses pc ON pc.id = p.prerequisite_id`);
    const statusByOffering = new Map(mine.map((m) => [m.offering_id, m.status]));
    const passed = new Set(passedRows.map((p) => p.course_id));
    rows.forEach((r) => {
      r.enrollment_status = statusByOffering.get(r.id) || null;
      r.enrolled = r.enrollment_status === 'enrolled';
      r.passed = passed.has(r.course_id);
      r.prereq_missing = pre.filter((p) => p.course_id === r.course_id && !passed.has(p.pid)).map((p) => p.code);
    });
  }
  res.json(rows);
});

function offeringValues(b) {
  if (!b.course_id || !b.semester_id || !b.instructor_id) throw new HttpError(400, 'MISSING_FIELDS');
  const capacity = Number(b.capacity || 40);
  if (!(capacity > 0)) throw new HttpError(400, 'MISSING_FIELDS');
  return { capacity, section: String(b.section || '1').trim(), meetings: validateMeetings(b.meetings) };
}

router.post('/', admin, async (req, res) => {
  const b = req.body;
  const { capacity, section, meetings } = offeringValues(b);
  const id = await withTx(async (conn) => {
    const [r] = await conn.query(
      'INSERT INTO course_offerings (course_id, semester_id, instructor_id, section, capacity) VALUES (?,?,?,?,?)',
      [b.course_id, b.semester_id, b.instructor_id, section, capacity]
    );
    await saveMeetings(conn, r.insertId, meetings);
    return r.insertId;
  });
  res.status(201).json({ id });
});

router.put('/:id', admin, async (req, res) => {
  const b = req.body;
  const { capacity, section, meetings } = offeringValues(b);
  await withTx(async (conn) => {
    await conn.query(
      'UPDATE course_offerings SET course_id=?, semester_id=?, instructor_id=?, section=?, capacity=? WHERE id=?',
      [b.course_id, b.semester_id, b.instructor_id, section, capacity, req.params.id]
    );
    await saveMeetings(conn, req.params.id, meetings);
  });
  res.json({ ok: true });
});

router.delete('/:id', admin, async (req, res) => {
  await db.query('DELETE FROM course_offerings WHERE id = ?', [req.params.id]); // IN_USE when enrollments still reference it.
  res.json({ ok: true });
});

module.exports = router;

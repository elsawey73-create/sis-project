const router = require('express').Router();
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { HttpError } = require('../utils/errors');
const { withTx } = require('../utils/tx');
const { visibleCodesForUser, codeLimit } = require('../domain/visibility');

const admin = [authenticate, authorize('admin')];

// ---------- Departments ----------
router.get('/departments', authenticate, async (req, res) => {
  const allowed = await visibleCodesForUser(db, req.user);
  const limit = codeLimit('code', allowed);
  const where = limit.sql ? `WHERE ${limit.sql}` : '';
  const [rows] = await db.query(`SELECT * FROM departments ${where} ORDER BY code`, limit.params);
  res.json(rows);
});

router.post('/departments', admin, async (req, res) => {
  const { code, name_ar, name_en } = req.body;
  if (!code || !name_ar || !name_en) throw new HttpError(400, 'MISSING_FIELDS');
  const [r] = await db.query('INSERT INTO departments (code, name_ar, name_en) VALUES (?,?,?)', [
    code.trim().toUpperCase(), name_ar.trim(), name_en.trim(),
  ]);
  res.status(201).json({ id: r.insertId });
});

router.put('/departments/:id', admin, async (req, res) => {
  const { code, name_ar, name_en } = req.body;
  if (!code || !name_ar || !name_en) throw new HttpError(400, 'MISSING_FIELDS');
  await db.query('UPDATE departments SET code=?, name_ar=?, name_en=? WHERE id=?', [
    code.trim().toUpperCase(), name_ar.trim(), name_en.trim(), req.params.id,
  ]);
  res.json({ ok: true });
});

router.delete('/departments/:id', admin, async (req, res) => {
  await db.query('DELETE FROM departments WHERE id = ?', [req.params.id]); // IN_USE when another row references this department.
  res.json({ ok: true });
});

// ---------- Courses ----------
async function loadCourses(where, params) {
  const [courses] = await db.query(
    `SELECT c.*, d.code AS department_code, d.name_ar AS department_ar, d.name_en AS department_en
     FROM courses c JOIN departments d ON d.id = c.department_id ${where} ORDER BY c.code`,
    params
  );
  const [pre] = await db.query(
    `SELECT p.course_id, pc.id, pc.code, pc.name_ar, pc.name_en
     FROM course_prerequisites p JOIN courses pc ON pc.id = p.prerequisite_id`
  );
  const map = {};
  pre.forEach((p) => (map[p.course_id] ||= []).push({ id: p.id, code: p.code, name_ar: p.name_ar, name_en: p.name_en }));
  courses.forEach((c) => (c.prerequisites = map[c.id] || []));
  return courses;
}

router.get('/courses', authenticate, async (req, res) => {
  const { department_id, q } = req.query;
  const conds = [];
  const params = [];
  const limit = codeLimit('d.code', await visibleCodesForUser(db, req.user));
  if (limit.sql) { conds.push(limit.sql); params.push(...limit.params); }
  if (department_id) { conds.push('c.department_id = ?'); params.push(department_id); }
  if (q) {
    conds.push('(c.code LIKE ? OR c.name_ar LIKE ? OR c.name_en LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  res.json(await loadCourses(conds.length ? 'WHERE ' + conds.join(' AND ') : '', params));
});

router.get('/courses/:id', authenticate, async (req, res) => {
  const [c] = await loadCourses('WHERE c.id = ?', [req.params.id]);
  if (!c) throw new HttpError(404, 'NOT_FOUND');
  const allowed = await visibleCodesForUser(db, req.user);
  if (allowed && !allowed.includes(c.department_code)) throw new HttpError(404, 'NOT_FOUND');
  res.json(c);
});

async function setPrereqs(conn, courseId, ids) {
  await conn.query('DELETE FROM course_prerequisites WHERE course_id = ?', [courseId]);
  for (const pid of [...new Set(ids || [])]) {
    if (Number(pid) !== Number(courseId))
      await conn.query('INSERT INTO course_prerequisites (course_id, prerequisite_id) VALUES (?,?)', [courseId, pid]);
  }
}

function courseValues(b) {
  if (!b.code || !b.name_ar || !b.name_en || !b.credit_hours || !b.department_id)
    throw new HttpError(400, 'MISSING_FIELDS');
  return [
    b.code.trim().toUpperCase(), b.name_ar.trim(), b.name_en.trim(),
    b.description_ar || null, b.description_en || null,
    Number(b.credit_hours), b.has_practical ? 1 : 0, b.department_id,
  ];
}

router.post('/courses', admin, async (req, res) => {
  const vals = courseValues(req.body);
  const id = await withTx(async (conn) => {
    const [r] = await conn.query(
      `INSERT INTO courses (code,name_ar,name_en,description_ar,description_en,credit_hours,has_practical,department_id)
       VALUES (?,?,?,?,?,?,?,?)`, vals);
    await setPrereqs(conn, r.insertId, req.body.prerequisites);
    return r.insertId;
  });
  res.status(201).json({ id });
});

router.put('/courses/:id', admin, async (req, res) => {
  const vals = courseValues(req.body);
  await withTx(async (conn) => {
    await conn.query(
      `UPDATE courses SET code=?, name_ar=?, name_en=?, description_ar=?, description_en=?,
       credit_hours=?, has_practical=?, department_id=? WHERE id=?`, [...vals, req.params.id]);
    await setPrereqs(conn, req.params.id, req.body.prerequisites);
  });
  res.json({ ok: true });
});

router.delete('/courses/:id', admin, async (req, res) => {
  await db.query('DELETE FROM courses WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// ---------- Semesters ----------
router.get('/semesters', authenticate, async (req, res) => {
  const [rows] = await db.query(
    `SELECT *, (CURDATE() BETWEEN registration_start AND registration_end) AS registration_open
     FROM semesters ORDER BY start_date DESC`
  );
  res.json(rows);
});

function semesterValues(b) {
  const need = ['name_ar', 'name_en', 'start_date', 'end_date', 'registration_start', 'registration_end'];
  if (need.some((k) => !b[k])) throw new HttpError(400, 'MISSING_FIELDS');
  if (b.start_date >= b.end_date || b.registration_start > b.registration_end) throw new HttpError(400, 'INVALID_DATES');
  return [b.name_ar.trim(), b.name_en.trim(), b.start_date, b.end_date, b.registration_start, b.registration_end, b.is_current ? 1 : 0];
}

router.post('/semesters', admin, async (req, res) => {
  const vals = semesterValues(req.body);
  const id = await withTx(async (conn) => {
    if (vals[6]) await conn.query('UPDATE semesters SET is_current = 0');
    const [r] = await conn.query(
      `INSERT INTO semesters (name_ar,name_en,start_date,end_date,registration_start,registration_end,is_current)
       VALUES (?,?,?,?,?,?,?)`, vals);
    return r.insertId;
  });
  res.status(201).json({ id });
});

router.put('/semesters/:id', admin, async (req, res) => {
  const vals = semesterValues(req.body);
  await withTx(async (conn) => {
    if (vals[6]) await conn.query('UPDATE semesters SET is_current = 0');
    await conn.query(
      `UPDATE semesters SET name_ar=?, name_en=?, start_date=?, end_date=?,
       registration_start=?, registration_end=?, is_current=? WHERE id=?`, [...vals, req.params.id]);
  });
  res.json({ ok: true });
});

// ---------- Instructors (admin picks them when building a schedule) ----------
router.get('/instructors', admin, async (req, res) => {
  const [rows] = await db.query(
    `SELECT u.id, u.login_id, u.full_name_ar, u.full_name_en, d.name_ar AS department_ar, d.name_en AS department_en
     FROM instructors i JOIN users u ON u.id = i.user_id JOIN departments d ON d.id = i.department_id
     ORDER BY u.login_id`
  );
  res.json(rows);
});

module.exports = router;

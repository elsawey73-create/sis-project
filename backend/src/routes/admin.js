const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { HttpError } = require('../utils/errors');
const { withTx } = require('../utils/tx');
const { occupying } = require('../domain/enrollment');

router.use(authenticate, authorize('admin'));

router.get('/stats', async (req, res) => {
  const one = async (sql, p = []) => (await db.query(sql, p))[0][0].n;
  const [[cur]] = await db.query('SELECT id, name_ar, name_en FROM semesters WHERE is_current = 1 LIMIT 1');
  const sid = cur ? cur.id : 0;
  res.json({
    semester: cur || null,
    students: await one("SELECT COUNT(*) AS n FROM users WHERE role = 'student'"),
    instructors: await one("SELECT COUNT(*) AS n FROM users WHERE role = 'instructor'"),
    courses: await one('SELECT COUNT(*) AS n FROM courses'),
    offerings: await one('SELECT COUNT(*) AS n FROM course_offerings WHERE semester_id = ?', [sid]),
    enrollments: await one(
      `SELECT COUNT(*) AS n FROM enrollments e JOIN course_offerings o ON o.id = e.offering_id WHERE o.semester_id = ? AND ${occupying('e.status')}`,
      [sid]
    ),
  });
});

router.get('/users', async (req, res) => {
  const conds = [];
  const params = [];
  if (req.query.role) { conds.push('role = ?'); params.push(req.query.role); }
  if (req.query.q) {
    conds.push('(login_id LIKE ? OR full_name_ar LIKE ? OR full_name_en LIKE ?)');
    const like = `%${req.query.q}%`;
    params.push(like, like, like);
  }
  const [rows] = await db.query(
    `SELECT id, login_id, full_name_ar, full_name_en, email, role, created_at FROM users
     ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''} ORDER BY role, login_id LIMIT 300`,
    params
  );
  res.json(rows);
});

router.post('/users', async (req, res) => {
  const { login_id, password, full_name_ar, full_name_en, email, role, department_id, level } = req.body;
  if (!login_id || !password || !full_name_ar || !['student', 'instructor', 'admin'].includes(role))
    throw new HttpError(400, 'MISSING_FIELDS');
  if (!/^[A-Za-z0-9_-]{3,30}$/.test(login_id)) throw new HttpError(400, 'INVALID_LOGIN_ID');
  if (String(password).length < 6) throw new HttpError(400, 'WEAK_PASSWORD');
  if (role !== 'admin' && !department_id) throw new HttpError(400, 'MISSING_FIELDS');

  const id = await withTx(async (conn) => {
    const [u] = await conn.query(
      'INSERT INTO users (login_id, password_hash, full_name_ar, full_name_en, email, role) VALUES (?,?,?,?,?,?)',
      [login_id.trim(), await bcrypt.hash(password, 10), full_name_ar.trim(), full_name_en ? full_name_en.trim() : null, email ? email.toLowerCase().trim() : null, role]
    );
    if (role === 'student')
      await conn.query('INSERT INTO students (user_id, student_code, department_id, level, admission_year) VALUES (?,?,?,?,?)',
        [u.insertId, login_id.trim(), department_id, level || 1, new Date().getFullYear()]);
    if (role === 'instructor')
      await conn.query('INSERT INTO instructors (user_id, department_id) VALUES (?,?)', [u.insertId, department_id]);
    return u.insertId;
  });
  res.status(201).json({ id });
});

router.put('/users/:id/password', async (req, res) => {
  if (String(req.body.password || '').length < 6) throw new HttpError(400, 'WEAK_PASSWORD');
  const [result] = await db.query(
    'UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?',
    [await bcrypt.hash(req.body.password, 10), req.params.id]
  );
  if (!result.affectedRows) throw new HttpError(404, 'USER_NOT_FOUND');
  res.json({ ok: true });
});

module.exports = router;

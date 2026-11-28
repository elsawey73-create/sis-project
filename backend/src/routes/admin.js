const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { HttpError } = require('../utils/errors');
const { withTx } = require('../utils/tx');
const { occupying } = require('../domain/enrollment');
const { audit } = require('../services/audit');
const { listSettings, setSetting, KEYS } = require('../services/settings');

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
    departments: await one('SELECT COUNT(*) AS n FROM departments'),
    open_sessions: await one("SELECT COUNT(*) AS n FROM attendance_sessions WHERE status = 'open'"),
    closed_sessions: await one(
      `SELECT COUNT(*) AS n FROM attendance_sessions s JOIN course_offerings o ON o.id = s.offering_id WHERE s.status = 'closed' AND o.semester_id = ?`,
      [sid]
    ),
    attendance_marks: await one(
      `SELECT COUNT(*) AS n FROM attendance_records ar
       JOIN attendance_sessions s ON s.id = ar.session_id
       JOIN course_offerings o ON o.id = s.offering_id
       WHERE s.status = 'closed' AND o.semester_id = ?`,
      [sid]
    ),
    published_grades: await one(
      `SELECT COUNT(*) AS n FROM grades g JOIN enrollments e ON e.id = g.enrollment_id
       JOIN course_offerings o ON o.id = e.offering_id WHERE g.published = 1 AND o.semester_id = ?`,
      [sid]
    ),
    average_grade: await (async () => {
      const [[row]] = await db.query(
        `SELECT AVG(g.total) AS n FROM grades g JOIN enrollments e ON e.id = g.enrollment_id
         JOIN course_offerings o ON o.id = e.offering_id WHERE g.published = 1 AND o.semester_id = ?`,
        [sid]
      );
      return row.n == null ? null : Math.round(Number(row.n) * 10) / 10;
    })(),
  });
});

router.get('/activity', async (req, res) => {
  const limit = Math.min(200, Math.max(1, Math.floor(Number(req.query.limit) || 80)));
  const [rows] = await db.query(
    `SELECT a.id, a.actor_id, a.action, a.entity, a.entity_id, a.detail, a.created_at,
            u.full_name_ar, u.full_name_en, u.login_id, u.role
     FROM activity_log a LEFT JOIN users u ON u.id = a.actor_id
     ORDER BY a.id DESC LIMIT ${limit}`
  );
  res.json(rows);
});

router.get('/settings', async (req, res) => {
  res.json(await listSettings());
});

router.put('/settings', async (req, res) => {
  const saved = {};
  for (const key of KEYS) {
    if (req.body[key] == null || req.body[key] === '') continue;
    const value = await setSetting(key, req.body[key], req.user.id);
    if (value == null) throw new HttpError(400, 'MISSING_FIELDS');
    saved[key] = value;
  }
  await audit(req.user.id, 'settings.update', 'app_settings', null, JSON.stringify(saved));
  res.json(saved);
});

// Academic data only. Password hashes, QR secrets, reset tokens, and face photos stay in the database.
router.get('/backup', async (req, res) => {
  const pick = async (sql) => (await db.query(sql))[0];
  const tables = {
    users: await pick('SELECT id, login_id, full_name_ar, full_name_en, email, role, preferred_lang, created_at FROM users'),
    departments: await pick('SELECT * FROM departments'),
    students: await pick('SELECT * FROM students'),
    instructors: await pick('SELECT * FROM instructors'),
    courses: await pick('SELECT * FROM courses'),
    course_prerequisites: await pick('SELECT * FROM course_prerequisites'),
    semesters: await pick('SELECT * FROM semesters'),
    course_offerings: await pick('SELECT * FROM course_offerings'),
    offering_meetings: await pick('SELECT * FROM offering_meetings'),
    enrollments: await pick('SELECT * FROM enrollments'),
    grades: await pick('SELECT * FROM grades'),
    attendance_sessions: await pick('SELECT id, offering_id, meeting_id, session_date, opened_at, closed_at, opened_by, status, token_ttl_seconds, late_after_minutes, latitude, longitude, accuracy_m, radius_m, auto_close_at FROM attendance_sessions'),
    attendance_records: await pick('SELECT session_id, student_id, status, method, scanned_at, latitude, longitude, accuracy_m, distance_m, device_id, marked_by FROM attendance_records'),
    announcements: await pick('SELECT * FROM announcements'),
    course_exams: await pick('SELECT * FROM course_exams'),
    app_settings: await pick('SELECT setting_key, setting_value, updated_at FROM app_settings'),
  };
  await audit(req.user.id, 'backup.download', 'database', null, 'json');
  res.set('Cache-Control', 'no-store');
  res.set('Content-Disposition', 'attachment; filename="unidex-backup.json"');
  res.json({
    exported_at: new Date().toISOString(),
    omitted: ['password_hash', 'qr_secret', 'password_reset_tokens', 'attendance_records.photo', 'course_evaluations'],
    tables,
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
  await audit(req.user.id, 'user.create', 'user', id, `${role} ${login_id}`);
  res.status(201).json({ id });
});

router.put('/users/:id/password', async (req, res) => {
  if (String(req.body.password || '').length < 6) throw new HttpError(400, 'WEAK_PASSWORD');
  const [result] = await db.query(
    'UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?',
    [await bcrypt.hash(req.body.password, 10), req.params.id]
  );
  if (!result.affectedRows) throw new HttpError(404, 'USER_NOT_FOUND');
  await audit(req.user.id, 'user.password', 'user', req.params.id, 'reset');
  res.json({ ok: true });
});

module.exports = router;

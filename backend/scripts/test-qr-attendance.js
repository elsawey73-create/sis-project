// QR attendance session checks. Talks to the local database.
// Usage: npm run test:qr
if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to run the QR attendance test while NODE_ENV=production.');
  process.exit(1);
}

const { execSync } = require('child_process');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'local_dev_jwt_secret_at_least_32_chars';
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
process.env.DB_USER = process.env.DB_USER || 'root';
process.env.DB_PASSWORD = process.env.DB_PASSWORD === undefined ? '' : process.env.DB_PASSWORD;
process.env.DB_NAME = process.env.DB_NAME || 'unidex_db';

const QR_FIELDS = ['session_id', 'class_id', 'doctor_id', 'qr_token', 'expires_at', 'created_at'];
const QR_TTL_SECONDS = 20;
const TINY_JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xdb]), Buffer.alloc(48, 7)]).toString('base64');

function scanBody(sessionId, token, extra = {}) {
  return {
    session_id: sessionId,
    token,
    device_id: extra.device_id || `dev-${sessionId}-primary`,
    photo: TINY_JPEG,
    ...extra,
  };
}

function assert(condition, message) {
  if (!condition) {
    console.error('FAIL:', message);
    throw new Error(message);
  }
  console.log('ok', message);
}

function buildApp() {
  const express = require('express');
  const { HttpError } = require('../src/utils/errors');
  const app = express();
  app.use(express.json());
  app.use('/api/attendance', require('../src/routes/attendance'));
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.code, details: err.details });
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'DUPLICATE' });
    console.error(err);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  });
  return app;
}

async function call(base, method, apiPath, token, body) {
  const res = await fetch(base + apiPath, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  if (text) data = JSON.parse(text);
  return { status: res.status, data };
}

(async () => {
  const migrateEnv = { ...process.env };
  const backend = path.join(__dirname, '..');
  const first = execSync('node scripts/migrate.js', { cwd: backend, env: migrateEnv, encoding: 'utf8' });
  const second = execSync('node scripts/migrate.js', { cwd: backend, env: migrateEnv, encoding: 'utf8' });
  assert(
    first.includes('Applied sql/004_qr_attendance_sessions.sql') || second.includes('004_qr_attendance_sessions already recorded.'),
    'migration applies 004_qr_attendance_sessions'
  );
  assert(second.includes('004_qr_attendance_sessions already recorded.'), 'second migrate leaves 004 recorded');

  const db = require('../src/config/db');
  const { signAccessToken } = require('../src/utils/tokens');
  const app = buildApp();
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;

  const stamp = Date.now().toString().slice(-8);
  const passwordHash = await bcrypt.hash('QrTest#1', 10);
  const ids = {};

  async function insertUser(loginId, role) {
    const [r] = await db.query(
      'INSERT INTO users (login_id, password_hash, full_name_ar, full_name_en, role) VALUES (?,?,?,?,?)',
      [loginId, passwordHash, 'اختبار', 'QR Test', role]
    );
    return r.insertId;
  }

  try {
    const [columns] = await db.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'qr_attendance_sessions'`
    );
    const names = columns.map((c) => c.COLUMN_NAME);
    for (const field of QR_FIELDS) {
      assert(names.includes(field), `qr_attendance_sessions has ${field}`);
    }
    const [indexes] = await db.query(
      `SELECT INDEX_NAME, NON_UNIQUE FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'qr_attendance_sessions' AND COLUMN_NAME = 'qr_token'`
    );
    assert(indexes.some((i) => Number(i.NON_UNIQUE) === 0), 'qr_token is unique');

    const [dept] = await db.query(
      'INSERT INTO departments (code, name_ar, name_en) VALUES (?,?,?)',
      [`Q${stamp}`, 'اختبار', 'QR Test']
    );
    ids.dept = dept.insertId;
    const [course] = await db.query(
      'INSERT INTO courses (code, name_ar, name_en, credit_hours, has_practical, department_id) VALUES (?,?,?,?,?,?)',
      [`QR${stamp}`, 'حضور', 'QR Attendance', 3, 0, ids.dept]
    );
    ids.course = course.insertId;
    const [semester] = await db.query(
      `INSERT INTO semesters (name_ar, name_en, start_date, end_date, registration_start, registration_end, is_current)
       VALUES ('اختبار','QR Test','2026-01-01','2026-06-01','2026-01-01','2026-01-15',0)`
    );
    ids.semester = semester.insertId;

    ids.doctor = await insertUser(`qrd${stamp}`, 'instructor');
    ids.other = await insertUser(`qro${stamp}`, 'instructor');
    ids.student = await insertUser(`qrs${stamp}`, 'student');
    ids.outsider = await insertUser(`qrx${stamp}`, 'student');
    await db.query('INSERT INTO instructors (user_id, department_id) VALUES (?,?)', [ids.doctor, ids.dept]);
    await db.query('INSERT INTO instructors (user_id, department_id) VALUES (?,?)', [ids.other, ids.dept]);
    await db.query(
      'INSERT INTO students (user_id, student_code, department_id, level, admission_year) VALUES (?,?,?,?,?)',
      [ids.student, `qrs${stamp}`, ids.dept, 1, 2026]
    );
    await db.query(
      'INSERT INTO students (user_id, student_code, department_id, level, admission_year) VALUES (?,?,?,?,?)',
      [ids.outsider, `qrx${stamp}`, ids.dept, 1, 2026]
    );

    const [off1] = await db.query(
      'INSERT INTO course_offerings (course_id, semester_id, instructor_id, section, capacity) VALUES (?,?,?,?,?)',
      [ids.course, ids.semester, ids.doctor, 'A', 40]
    );
    const [off2] = await db.query(
      'INSERT INTO course_offerings (course_id, semester_id, instructor_id, section, capacity) VALUES (?,?,?,?,?)',
      [ids.course, ids.semester, ids.doctor, 'B', 40]
    );
    ids.off1 = off1.insertId;
    ids.off2 = off2.insertId;
    await db.query('INSERT INTO enrollments (student_id, offering_id) VALUES (?,?)', [ids.student, ids.off1]);
    await db.query('INSERT INTO enrollments (student_id, offering_id) VALUES (?,?)', [ids.student, ids.off2]);

    const doctor = signAccessToken({ id: ids.doctor, role: 'instructor', token_version: 0 });
    const other = signAccessToken({ id: ids.other, role: 'instructor', token_version: 0 });
    const student = signAccessToken({ id: ids.student, role: 'student', token_version: 0 });
    const outsider = signAccessToken({ id: ids.outsider, role: 'student', token_version: 0 });

    let r = await call(base, 'POST', '/attendance/qr', null, { class_id: ids.off1 });
    assert(r.status === 401 && r.data.error === 'UNAUTHENTICATED', 'QR generation requires authentication');

    r = await call(base, 'POST', '/attendance/qr', student, { class_id: ids.off1 });
    assert(r.status === 403 && r.data.error === 'FORBIDDEN', 'student cannot generate a QR session');

    r = await call(base, 'POST', '/attendance/qr', other, { class_id: ids.off1 });
    assert(r.status === 404 && r.data.error === 'NOT_FOUND', 'another doctor cannot generate a QR for this class');

    r = await call(base, 'POST', '/attendance/qr', doctor, {});
    assert(r.status === 400 && r.data.error === 'MISSING_FIELDS', 'class id is required');

    r = await call(base, 'POST', '/attendance/qr', doctor, { class_id: ids.off1 });
    assert(r.status === 201, `doctor generates a QR session (${r.status})`);
    const created = r.data;
    for (const field of QR_FIELDS) {
      assert(created[field] !== undefined && created[field] !== null && created[field] !== '', `response includes ${field}`);
    }
    assert(Number(created.session_id) > 0, 'session_id is set');
    assert(Number(created.class_id) === ids.off1, 'class_id is the offering');
    assert(Number(created.doctor_id) === ids.doctor, 'doctor_id is the instructor');
    assert(created.expired === false, 'new code is not expired');
    assert(created.expires_in <= QR_TTL_SECONDS && created.expires_in >= QR_TTL_SECONDS - 5, `expires_in is about 20 seconds (${created.expires_in})`);
    assert(created.qr_token.length <= 512, `qr_token fits the column (${created.qr_token.length})`);

    const payload = jwt.decode(created.qr_token);
    assert(payload.exp - payload.iat === QR_TTL_SECONDS, 'JWT expires 20 seconds after it is issued');
    assert(Number(payload.sid) === Number(created.session_id), 'token sid matches the attendance session');
    assert(Number(payload.cid) === ids.off1, 'token carries the class id');
    assert(/^[a-f0-9]{32}$/.test(payload.rnd), 'token carries a random nonce');
    assert(Number.isFinite(payload.ts), 'token carries a timestamp');

    const [[span]] = await db.query(
      'SELECT TIMESTAMPDIFF(SECOND, created_at, expires_at) AS span, session_id, class_id, doctor_id, qr_token, expires_at, created_at FROM qr_attendance_sessions WHERE qr_token = ?',
      [created.qr_token]
    );
    assert(Number(span.span) === QR_TTL_SECONDS, `stored expiry is 20 seconds (${span.span})`);
    for (const field of QR_FIELDS) assert(span[field] !== null && span[field] !== '', `row stores ${field}`);

    const again = await call(base, 'POST', '/attendance/qr', doctor, { class_id: ids.off1 });
    assert(again.status === 200 && again.data.qr_token === created.qr_token, 'generating again returns the active code');

    const fetched = await call(base, 'GET', `/attendance/sessions/${created.session_id}/qr`, doctor);
    assert(fetched.status === 200 && fetched.data.qr_token === created.qr_token, 'doctor can fetch the active QR session');

    const hidden = await call(base, 'GET', `/attendance/sessions/${created.session_id}/qr`, other);
    assert(hidden.status === 404, 'another doctor cannot fetch the QR session');
    const studentGet = await call(base, 'GET', `/attendance/sessions/${created.session_id}/qr`, student);
    assert(studentGet.status === 403, 'student cannot fetch the doctor QR session');

    const legacy = await call(base, 'GET', `/attendance/sessions/${created.session_id}/token`, doctor);
    assert(legacy.status === 200 && legacy.data.token === created.qr_token, 'token route returns the current stored code');
    const forged = jwt.sign({ sid: created.session_id }, (await db.query('SELECT qr_secret FROM attendance_sessions WHERE id = ?', [created.session_id]))[0][0].qr_secret, { expiresIn: 20 });
    const forgedScan = await call(base, 'POST', '/attendance/scan', student, scanBody(created.session_id, forged));
    assert(forgedScan.status === 400 && forgedScan.data.error === 'QR_EXPIRED', 'a signed token that is not the current code is rejected');

    const storedScan = await call(base, 'POST', '/attendance/scan', student, scanBody(created.session_id, created.qr_token));
    assert(storedScan.status === 200 && storedScan.data.status === 'present', 'current QR token records attendance');

    const againScan = await call(base, 'POST', '/attendance/scan', student, scanBody(created.session_id, created.qr_token, { device_id: 'other-device' }));
    assert(againScan.status === 409 && againScan.data.error === 'ALREADY_RECORDED', 'the same student cannot scan twice');

    const outsiderScan = await call(base, 'POST', '/attendance/scan', outsider, { session_id: created.session_id, token: created.qr_token });
    assert(outsiderScan.status === 403 && outsiderScan.data.error === 'NOT_ENROLLED', 'unenrolled student cannot use the QR token');

    const refreshed = await call(base, 'POST', `/attendance/sessions/${created.session_id}/qr/refresh`, doctor);
    assert(refreshed.status === 201 && refreshed.data.qr_token && refreshed.data.qr_token !== created.qr_token, 'refresh issues a new token');
    assert(refreshed.data.expires_in <= QR_TTL_SECONDS && refreshed.data.expires_in >= QR_TTL_SECONDS - 5, 'refreshed code expires in 20 seconds');

    const stale = await call(base, 'POST', '/attendance/scan', student, scanBody(created.session_id, created.qr_token));
    assert(stale.status === 400 && stale.data.error === 'QR_EXPIRED', 'refreshed-away token is rejected');
    const fresh = await call(base, 'POST', '/attendance/scan', student, scanBody(created.session_id, refreshed.data.qr_token));
    assert(fresh.status === 409 && fresh.data.error === 'ALREADY_RECORDED', 'refreshed token still matches the scan format');

    const studentRefresh = await call(base, 'POST', `/attendance/sessions/${created.session_id}/qr/refresh`, student);
    assert(studentRefresh.status === 403, 'student cannot refresh a QR session');

    const second = await call(base, 'POST', '/attendance/qr', doctor, {
      class_id: ids.off2, latitude: 30, longitude: 31, accuracy: 5, radius_m: 20,
    });
    assert(second.status === 201 && second.data.qr_token !== refreshed.data.qr_token, 'a second class gets its own token');
    const [[counts]] = await db.query(
      'SELECT COUNT(*) AS n, COUNT(DISTINCT qr_token) AS distinct_tokens FROM qr_attendance_sessions WHERE doctor_id = ?',
      [ids.doctor]
    );
    assert(Number(counts.n) === Number(counts.distinct_tokens) && Number(counts.n) >= 3, 'stored tokens are unique');

    try {
      await db.query(
        'INSERT INTO qr_attendance_sessions (session_id, class_id, doctor_id, qr_token, expires_at) VALUES (?,?,?,?, DATE_ADD(NOW(), INTERVAL 15 MINUTE))',
        [second.data.session_id, ids.off2, ids.doctor, second.data.qr_token]
      );
      assert(false, 'duplicate qr_token is rejected');
    } catch (e) {
      assert(e.code === 'ER_DUP_ENTRY', 'duplicate qr_token is rejected');
    }

    const closed = await call(base, 'POST', `/attendance/sessions/${created.session_id}/close`, doctor);
    assert(closed.status === 200, 'doctor can close the session');
    const afterClose = await call(base, 'POST', `/attendance/sessions/${created.session_id}/qr/refresh`, doctor);
    assert(afterClose.status === 400 && afterClose.data.error === 'SESSION_CLOSED', 'closed session cannot regenerate a QR');

    const far = await call(base, 'POST', '/attendance/scan', student, scanBody(second.data.session_id, second.data.qr_token, {
      latitude: 30.001, longitude: 31, accuracy: 8,
    }));
    assert(far.status === 400 && far.data.error === 'TOO_FAR', `a far scan is rejected (${far.data && far.data.error})`);
    const poor = await call(base, 'POST', '/attendance/scan', student, scanBody(second.data.session_id, second.data.qr_token, {
      latitude: 30, longitude: 31, accuracy: 90,
    }));
    assert(poor.status === 400 && poor.data.error === 'GPS_INACCURATE', 'a poor GPS fix is rejected');
    const presentScan = await call(base, 'POST', '/attendance/scan', student, scanBody(second.data.session_id, second.data.qr_token, {
      latitude: 30.00005, longitude: 31, accuracy: 10, device_id: 'room-device',
    }));
    assert(presentScan.status === 200 && presentScan.data.status === 'present', 'a nearby scan records present');

    ids.secondStudent = await insertUser(`qr2${stamp}`, 'student');
    await db.query(
      'INSERT INTO students (user_id, student_code, department_id, level, admission_year) VALUES (?,?,?,?,?)',
      [ids.secondStudent, `qr2${stamp}`, ids.dept, 1, 2026]
    );
    await db.query('INSERT INTO enrollments (student_id, offering_id) VALUES (?,?)', [ids.secondStudent, ids.off2]);
    const student2 = signAccessToken({ id: ids.secondStudent, role: 'student', token_version: 0 });
    const blocked = await call(base, 'POST', '/attendance/scan', student2, scanBody(second.data.session_id, second.data.qr_token, {
      latitude: 30, longitude: 31, accuracy: 8, device_id: 'room-device',
    }));
    assert(blocked.status === 409 && blocked.data.error === 'DEVICE_ALREADY_USED', 'a second student cannot use the same device in this session');

    console.log('QR attendance tests passed');
  } finally {
    const offeringIds = [ids.off1, ids.off2].filter(Boolean);
    if (offeringIds.length) {
      await db.query(`DELETE FROM attendance_sessions WHERE offering_id IN (${offeringIds.map(() => '?').join(',')})`, offeringIds);
      await db.query(`DELETE FROM enrollments WHERE offering_id IN (${offeringIds.map(() => '?').join(',')})`, offeringIds);
      await db.query(`DELETE FROM course_offerings WHERE id IN (${offeringIds.map(() => '?').join(',')})`, offeringIds);
    }
    if (ids.course) await db.query('DELETE FROM courses WHERE id = ?', [ids.course]);
    if (ids.semester) await db.query('DELETE FROM semesters WHERE id = ?', [ids.semester]);
    const userIds = [ids.doctor, ids.other, ids.student, ids.outsider, ids.secondStudent].filter(Boolean);
    if (userIds.length) {
      await db.query(`DELETE FROM notifications WHERE user_id IN (${userIds.map(() => '?').join(',')})`, userIds);
      await db.query(`DELETE FROM notification_dedup WHERE user_id IN (${userIds.map(() => '?').join(',')})`, userIds).catch(() => {});
      await db.query(`DELETE FROM activity_log WHERE actor_id IN (${userIds.map(() => '?').join(',')})`, userIds).catch(() => {});
      await db.query(`DELETE FROM instructors WHERE user_id IN (${userIds.map(() => '?').join(',')})`, userIds);
      await db.query(`DELETE FROM students WHERE user_id IN (${userIds.map(() => '?').join(',')})`, userIds);
      await db.query(`DELETE FROM users WHERE id IN (${userIds.map(() => '?').join(',')})`, userIds);
    }
    if (ids.dept) await db.query('DELETE FROM departments WHERE id = ?', [ids.dept]);
    await server.close();
    await db.end();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

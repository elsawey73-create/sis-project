const router = require('express').Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { HttpError } = require('../utils/errors');
const { occupying } = require('../domain/enrollment');
const {
  QR_TTL_SECONDS,
  evaluateLocation,
  currentQrAccepts,
  deviceDecision,
  absenceStanding,
  decodePhoto,
} = require('../domain/attendancePolicy');
const { attendanceLimits, getNumber } = require('../services/settings');
const { audit } = require('../services/audit');
const { notify } = require('../services/notify');
const { notifySessionAbsences } = require('../services/attendanceClose');
const {
  sessionReportXlsx, sessionReportPdf, courseReportXlsx, courseReportPdf,
} = require('../services/exports');

const instructor = [authenticate, authorize('instructor')];
const student = [authenticate, authorize('student')];
const staff = [authenticate, authorize('instructor', 'admin')];

async function ownOfferingId(offeringId, userId) {
  const [[o]] = await db.query('SELECT id FROM course_offerings WHERE id = ? AND instructor_id = ?', [offeringId, userId]);
  if (!o) throw new HttpError(404, 'NOT_FOUND');
}
async function ownSession(req, sessionId = req.params.id) {
  const [[s]] = await db.query(
    `SELECT s.*, c.code, c.name_ar, c.name_en, o.absence_limit_pct
     FROM attendance_sessions s
     JOIN course_offerings o ON o.id = s.offering_id
     JOIN courses c ON c.id = o.course_id
     WHERE s.id = ? AND s.opened_by = ?`,
    [sessionId, req.user.id]
  );
  if (!s) throw new HttpError(404, 'NOT_FOUND');
  if (s.status === 'open' && s.auto_close_at && new Date(s.auto_close_at).getTime() <= Date.now()) {
    await db.query("UPDATE attendance_sessions SET status = 'closed', closed_at = NOW() WHERE id = ? AND status = 'open'", [s.id]);
    s.status = 'closed';
    await notifySessionAbsences(s.id);
  }
  return s;
}
const publicSession = ({ qr_secret, ...rest }) => rest;

async function openOrCreateSession(offeringId, userId, meetingId) {
  const [[open]] = await db.query(
    "SELECT id FROM attendance_sessions WHERE offering_id = ? AND status = 'open'",
    [offeringId]
  );
  if (open) return { id: open.id, created: false };
  const [r] = await db.query(
    `INSERT INTO attendance_sessions
      (offering_id, meeting_id, session_date, opened_at, opened_by, qr_secret, status, token_ttl_seconds, late_after_minutes)
     VALUES (?,?,CURDATE(),NOW(),?,?,'open',?,15)`,
    [offeringId, meetingId || null, userId, crypto.randomBytes(24).toString('hex'), QR_TTL_SECONDS]
  );
  return { id: r.insertId, created: true };
}

function requireOpen(session) {
  if (session.status !== 'open') throw new HttpError(400, 'SESSION_CLOSED');
  return session;
}

function optionalPoint(body) {
  if (!body || body.latitude == null || body.latitude === '' || body.longitude == null || body.longitude === '') return null;
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  const accuracy = body.accuracy == null || body.accuracy === '' ? null : Number(body.accuracy);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw new HttpError(400, 'LOCATION_REQUIRED');
  }
  return { latitude, longitude, accuracy: Number.isFinite(accuracy) ? accuracy : null };
}

async function rememberPlace(sessionId, body) {
  const point = optionalPoint(body);
  if (point) {
    await db.query(
      `UPDATE attendance_sessions
       SET latitude = COALESCE(latitude, ?), longitude = COALESCE(longitude, ?), accuracy_m = COALESCE(accuracy_m, ?)
       WHERE id = ?`,
      [point.latitude, point.longitude, point.accuracy, sessionId]
    );
  }
  const radius = Number(body?.radius_m);
  if (Number.isFinite(radius) && radius >= 5 && radius <= 500) {
    await db.query('UPDATE attendance_sessions SET radius_m = COALESCE(radius_m, ?) WHERE id = ?', [Math.round(radius), sessionId]);
  }
  const minutes = Number(body?.auto_close_minutes);
  if (Number.isFinite(minutes) && minutes >= 5 && minutes <= 180) {
    await db.query(
      'UPDATE attendance_sessions SET auto_close_at = COALESCE(auto_close_at, DATE_ADD(NOW(), INTERVAL ? MINUTE)) WHERE id = ? AND status = \'open\'',
      [Math.round(minutes), sessionId]
    );
  }
}

// JWT payload stays compatible with POST /attendance/scan: `sid` signed by qr_secret.
function buildQrToken(session, classId) {
  const rnd = crypto.randomBytes(16).toString('hex');
  const ts = Date.now();
  return jwt.sign(
    { sid: Number(session.id), cid: Number(classId), ts, rnd },
    session.qr_secret,
    { expiresIn: QR_TTL_SECONDS, jwtid: rnd }
  );
}

function publicQr(row) {
  const expiresIn = Math.max(0, Number(row.expires_in) || 0);
  const expired = expiresIn <= 0;
  return {
    session_id: row.session_id,
    class_id: row.class_id,
    doctor_id: row.doctor_id,
    qr_token: expired ? null : row.qr_token,
    expires_at: row.expires_at,
    created_at: row.created_at,
    expires_in: expiresIn,
    expired,
  };
}

async function selectQr(whereSql, params) {
  const [[row]] = await db.query(
    `SELECT session_id, class_id, doctor_id, qr_token, expires_at, created_at,
            TIMESTAMPDIFF(SECOND, NOW(), expires_at) AS expires_in
     FROM qr_attendance_sessions
     WHERE ${whereSql}
     ORDER BY id DESC LIMIT 1`,
    params
  );
  return row || null;
}

async function insertQr(session, doctorId) {
  const classId = session.offering_id;
  const qrToken = buildQrToken(session, classId);
  await db.query(
    `INSERT INTO qr_attendance_sessions (session_id, class_id, doctor_id, qr_token, expires_at)
     VALUES (?,?,?,?, DATE_ADD(NOW(), INTERVAL ? SECOND))`,
    [session.id, classId, doctorId, qrToken, QR_TTL_SECONDS]
  );
  return selectQr('session_id = ? AND qr_token = ?', [session.id, qrToken]);
}

async function expireActive(sessionId) {
  await db.query(
    'UPDATE qr_attendance_sessions SET expires_at = NOW() WHERE session_id = ? AND expires_at > NOW()',
    [sessionId]
  );
}

async function loadRoster(session) {
  const [students] = await db.query(
    `SELECT u.id AS student_id, st.student_code, u.full_name_ar, u.full_name_en,
            ar.status, ar.method, ar.scanned_at, ar.distance_m, ar.accuracy_m,
            (ar.photo IS NOT NULL) AS has_photo, ar.marked_by,
            mb.full_name_ar AS marked_by_ar, mb.full_name_en AS marked_by_en
     FROM enrollments e
     JOIN users u ON u.id = e.student_id
     JOIN students st ON st.user_id = u.id
     LEFT JOIN attendance_records ar ON ar.session_id = ? AND ar.student_id = u.id
     LEFT JOIN users mb ON mb.id = ar.marked_by
     WHERE e.offering_id = ? AND ${occupying('e.status')}
     ORDER BY st.student_code`,
    [session.id, session.offering_id]
  );
  students.forEach((row) => { row.has_photo = !!row.has_photo; });
  return students;
}

router.post('/sessions', instructor, async (req, res) => {
  const { offering_id, meeting_id } = req.body;
  if (!offering_id) throw new HttpError(400, 'MISSING_FIELDS');
  await ownOfferingId(offering_id, req.user.id);
  const opened = await openOrCreateSession(offering_id, req.user.id, meeting_id);
  await rememberPlace(opened.id, req.body);
  await audit(req.user.id, opened.created ? 'attendance.open' : 'attendance.resume', 'attendance_session', opened.id, `offering ${offering_id}`);
  if (!opened.created) return res.json({ id: opened.id });
  res.status(201).json({ id: opened.id });
});

// Current stored token. A new one is issued only after the previous 20 seconds end.
router.get('/sessions/:id/token', instructor, async (req, res) => {
  const s = requireOpen(await ownSession(req));
  let row = await selectQr('session_id = ? AND expires_at > NOW()', [s.id]);
  if (!row) row = await insertQr(s, req.user.id);
  const pub = publicQr(row);
  res.json({ session_id: s.id, token: pub.qr_token, expires_in: pub.expires_in });
});

router.get('/sessions/:id/qr', instructor, async (req, res) => {
  const s = requireOpen(await ownSession(req));
  const row = await selectQr('session_id = ?', [s.id]);
  if (!row) throw new HttpError(404, 'NOT_FOUND');
  res.json(publicQr(row));
});

router.post('/sessions/:id/qr', instructor, async (req, res) => {
  const s = requireOpen(await ownSession(req));
  await rememberPlace(s.id, req.body);
  const active = await selectQr('session_id = ? AND expires_at > NOW()', [s.id]);
  if (active) return res.json(publicQr(active));
  const row = await insertQr(s, req.user.id);
  res.status(201).json(publicQr(row));
});

// Replace the current code. The previous token stops scanning immediately.
router.post('/sessions/:id/qr/refresh', instructor, async (req, res) => {
  const s = requireOpen(await ownSession(req));
  await expireActive(s.id);
  const row = await insertQr(s, req.user.id);
  res.status(201).json(publicQr(row));
});

router.post('/qr', instructor, async (req, res) => {
  const classId = req.body.class_id ?? req.body.offering_id;
  if (classId === undefined || classId === null || classId === '') throw new HttpError(400, 'MISSING_FIELDS');
  await ownOfferingId(classId, req.user.id);
  const opened = await openOrCreateSession(classId, req.user.id, req.body.meeting_id);
  await rememberPlace(opened.id, req.body);
  const s = requireOpen(await ownSession(req, opened.id));
  await audit(req.user.id, 'attendance.qr', 'attendance_session', s.id, `offering ${classId}`);
  const active = await selectQr('session_id = ? AND expires_at > NOW()', [s.id]);
  if (active) return res.status(opened.created ? 201 : 200).json(publicQr(active));
  const row = await insertQr(s, req.user.id);
  res.status(201).json(publicQr(row));
});

router.get('/sessions/:id', instructor, async (req, res) => {
  const s = await ownSession(req);
  const students = await loadRoster(s);
  const present = students.filter((x) => x.status).length;
  res.json({ session: publicSession(s), students, present, total: students.length });
});

router.get('/sessions/:id/students/:studentId/photo', instructor, async (req, res) => {
  const s = await ownSession(req);
  const [[row]] = await db.query(
    'SELECT photo, photo_mime FROM attendance_records WHERE session_id = ? AND student_id = ?',
    [s.id, req.params.studentId]
  );
  if (!row || !row.photo) throw new HttpError(404, 'NOT_FOUND');
  res.set('Cache-Control', 'private, max-age=300');
  res.type(row.photo_mime || 'image/jpeg');
  res.send(row.photo);
});

router.get('/sessions/:id/report', instructor, async (req, res) => {
  const s = await ownSession(req);
  const students = await loadRoster(s);
  const format = req.query.format === 'pdf' ? 'pdf' : 'xlsx';
  const body = format === 'pdf' ? await sessionReportPdf(s, students) : await sessionReportXlsx(s, students);
  const ext = format === 'pdf' ? 'pdf' : 'xlsx';
  res.set('Content-Disposition', `attachment; filename="attendance-${s.id}.${ext}"`);
  res.type(format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(Buffer.from(body));
});

router.post('/sessions/:id/close', instructor, async (req, res) => {
  const s = await ownSession(req);
  await db.query("UPDATE attendance_sessions SET status = 'closed', closed_at = NOW() WHERE id = ? AND status = 'open'", [s.id]);
  if (s.status === 'open') await notifySessionAbsences(s.id);
  await audit(req.user.id, 'attendance.close', 'attendance_session', s.id, s.code);
  res.json({ ok: true });
});

router.put('/sessions/:id/students/:studentId', instructor, async (req, res) => {
  const s = await ownSession(req);
  const { status } = req.body;
  if (!['present', 'late', 'excused', 'absent'].includes(status)) throw new HttpError(400, 'MISSING_FIELDS');
  if (status === 'absent') {
    await db.query('DELETE FROM attendance_records WHERE session_id = ? AND student_id = ?', [s.id, req.params.studentId]);
    await notify(db, req.params.studentId, 'marked_absent', {
      course_code: s.code, course_ar: s.name_ar, course_en: s.name_en, session_id: s.id, manual: true,
    });
  } else {
    const [[enr]] = await db.query(
      `SELECT id FROM enrollments WHERE student_id = ? AND offering_id = ? AND ${occupying('status')}`,
      [req.params.studentId, s.offering_id]
    );
    if (!enr) throw new HttpError(403, 'NOT_ENROLLED');
    await db.query(
      `INSERT INTO attendance_records (session_id, student_id, status, method, marked_by) VALUES (?,?,?, 'manual', ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status), method = 'manual', marked_by = VALUES(marked_by)`,
      [s.id, req.params.studentId, status, req.user.id]
    );
  }
  await audit(req.user.id, 'attendance.manual', 'attendance_record', `${s.id}:${req.params.studentId}`, status);
  res.json({ ok: true });
});

router.get('/offering/:id/sessions', instructor, async (req, res) => {
  await ownOfferingId(req.params.id, req.user.id);
  const [rows] = await db.query(
    `SELECT s.id, s.session_date, s.opened_at, s.closed_at, s.status,
            (SELECT COUNT(*) FROM attendance_records r WHERE r.session_id = s.id) AS present_count
     FROM attendance_sessions s WHERE s.offering_id = ? ORDER BY s.id DESC`,
    [req.params.id]
  );
  res.json(rows);
});

router.get('/offerings/:id/report', instructor, async (req, res) => {
  await ownOfferingId(req.params.id, req.user.id);
  const [[offering]] = await db.query(
    `SELECT o.id, o.section, o.absence_limit_pct, c.code, c.name_ar, c.name_en
     FROM course_offerings o JOIN courses c ON c.id = o.course_id WHERE o.id = ?`,
    [req.params.id]
  );
  const limit = offering.absence_limit_pct == null ? await getNumber('absence_limit_pct') : Number(offering.absence_limit_pct);
  const [students] = await db.query(
    `SELECT u.id AS student_id, st.student_code, u.full_name_ar, u.full_name_en,
            (SELECT COUNT(*) FROM attendance_sessions s WHERE s.offering_id = o.id AND s.status = 'closed') AS total_sessions,
            (SELECT COUNT(*) FROM attendance_records ar JOIN attendance_sessions s ON s.id = ar.session_id
             WHERE s.offering_id = o.id AND s.status = 'closed' AND ar.student_id = u.id) AS attended
     FROM enrollments e
     JOIN course_offerings o ON o.id = e.offering_id
     JOIN users u ON u.id = e.student_id
     JOIN students st ON st.user_id = u.id
     WHERE e.offering_id = ? AND ${occupying('e.status')}
     ORDER BY st.student_code`,
    [offering.id]
  );
  const summary = students.map((row) => ({ ...row, ...absenceStanding({ attended: row.attended, totalSessions: row.total_sessions, limitPct: limit }) }));
  const [detail] = await db.query(
    `SELECT s.id, s.session_date, s.status AS session_status, st.student_code, u.full_name_en, ar.status, ar.method
     FROM attendance_sessions s
     JOIN enrollments e ON e.offering_id = s.offering_id AND ${occupying('e.status')}
     JOIN users u ON u.id = e.student_id
     JOIN students st ON st.user_id = u.id
     LEFT JOIN attendance_records ar ON ar.session_id = s.id AND ar.student_id = u.id
     WHERE s.offering_id = ?
     ORDER BY s.id, st.student_code`,
    [offering.id]
  );
  const flat = detail.map((row) => [
    row.session_date, row.id, row.student_code, row.full_name_en, row.status || (row.session_status === 'closed' ? 'absent' : 'unrecorded'), row.method || '',
  ]);
  const format = req.query.format === 'pdf' ? 'pdf' : 'xlsx';
  const body = format === 'pdf'
    ? await courseReportPdf(offering, summary)
    : await courseReportXlsx(offering, summary, flat);
  const ext = format === 'pdf' ? 'pdf' : 'xlsx';
  res.set('Content-Disposition', `attachment; filename="absence-${offering.code}.${ext}"`);
  res.type(format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(Buffer.from(body));
});

router.put('/offerings/:id/absence-limit', instructor, async (req, res) => {
  await ownOfferingId(req.params.id, req.user.id);
  const raw = req.body.absence_limit_pct;
  if (raw == null || raw === '') {
    await db.query('UPDATE course_offerings SET absence_limit_pct = NULL WHERE id = ?', [req.params.id]);
    await audit(req.user.id, 'attendance.limit', 'course_offering', req.params.id, 'cleared');
    return res.json({ absence_limit_pct: null });
  }
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n < 1 || n > 100) throw new HttpError(400, 'MISSING_FIELDS');
  await db.query('UPDATE course_offerings SET absence_limit_pct = ? WHERE id = ?', [n, req.params.id]);
  await audit(req.user.id, 'attendance.limit', 'course_offering', req.params.id, String(n));
  res.json({ absence_limit_pct: n });
});

router.get('/settings', staff, async (req, res) => {
  res.json(await attendanceLimits());
});

router.post('/scan', student, async (req, res) => {
  const { session_id, token } = req.body;
  if (!session_id || !token) throw new HttpError(400, 'MISSING_FIELDS');

  const [[s]] = await db.query(
    `SELECT s.*, TIMESTAMPDIFF(MINUTE, s.opened_at, NOW()) AS minutes, c.code, c.name_ar, c.name_en
     FROM attendance_sessions s JOIN course_offerings o ON o.id = s.offering_id JOIN courses c ON c.id = o.course_id
     WHERE s.id = ?`,
    [session_id]
  );
  if (!s || s.status !== 'open') throw new HttpError(400, 'SESSION_CLOSED');
  if (s.auto_close_at && new Date(s.auto_close_at).getTime() <= Date.now()) {
    await db.query("UPDATE attendance_sessions SET status = 'closed', closed_at = NOW() WHERE id = ? AND status = 'open'", [s.id]);
    await notifySessionAbsences(s.id);
    throw new HttpError(400, 'SESSION_CLOSED');
  }

  try {
    const payload = jwt.verify(token, s.qr_secret);
    if (Number(payload.sid) !== Number(s.id)) throw new Error('mismatch');
  } catch {
    throw new HttpError(400, 'QR_EXPIRED');
  }

  const [[active]] = await db.query(
    `SELECT qr_token, UNIX_TIMESTAMP(expires_at) * 1000 AS expires_ms
     FROM qr_attendance_sessions
     WHERE session_id = ? AND expires_at > NOW()
     ORDER BY id DESC LIMIT 1`,
    [s.id]
  );
  if (!currentQrAccepts({
    presentedToken: token,
    activeToken: active ? active.qr_token : null,
    expiresAtMs: active ? Number(active.expires_ms) : 0,
    nowMs: Date.now(),
  })) throw new HttpError(400, 'QR_EXPIRED');

  const [[enr]] = await db.query(
    `SELECT id FROM enrollments WHERE student_id = ? AND offering_id = ? AND ${occupying('status')}`,
    [req.user.id, s.offering_id]
  );
  if (!enr) throw new HttpError(403, 'NOT_ENROLLED');

  const photo = decodePhoto(req.body.photo);
  if (!photo.ok) throw new HttpError(400, photo.code);

  const deviceId = String(req.body.device_id || '').trim().slice(0, 128);
  if (!deviceId) throw new HttpError(400, 'DEVICE_REQUIRED');
  const signals = String(req.body.device_signals || '').trim().slice(0, 128) || null;

  let distance = null;
  let studentAccuracy = null;
  let studentLat = null;
  let studentLng = null;
  if (s.latitude != null && s.longitude != null) {
    const limits = await attendanceLimits();
    const point = optionalPoint(req.body);
    const verdict = evaluateLocation({
      doctorLat: Number(s.latitude),
      doctorLng: Number(s.longitude),
      studentLat: point ? point.latitude : null,
      studentLng: point ? point.longitude : null,
      studentAccuracy: point ? point.accuracy : null,
      radiusM: s.radius_m || limits.radiusM,
      accuracyCapM: limits.accuracyCapM,
    });
    if (!verdict.ok) {
      throw new HttpError(400, verdict.code, { distance_m: verdict.distanceM, radius_m: verdict.radiusM });
    }
    distance = verdict.distanceM;
    studentAccuracy = point.accuracy;
    studentLat = point.latitude;
    studentLng = point.longitude;
  }

  const [[used]] = await db.query(
    'SELECT student_id FROM attendance_records WHERE session_id = ? AND device_id = ? LIMIT 1',
    [s.id, deviceId]
  );
  const decision = deviceDecision({ existingStudentId: used ? used.student_id : null, studentId: req.user.id });
  if (!decision.ok) throw new HttpError(409, decision.code);

  const minutes = Number(s.minutes);
  const lateAfter = Number(s.late_after_minutes);
  const status = Number.isFinite(minutes) && Number.isFinite(lateAfter) && minutes > lateAfter ? 'late' : 'present';
  try {
    await db.query(
      `INSERT INTO attendance_records
        (session_id, student_id, status, method, photo, photo_mime, latitude, longitude, accuracy_m, distance_m, device_id, device_signals)
       VALUES (?,?,?, 'qr', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [s.id, req.user.id, status, photo.buffer, photo.mime, studentLat, studentLng, studentAccuracy, distance, deviceId, signals]
    );
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      const sameDevice = /device/i.test(e.message || '');
      throw new HttpError(409, sameDevice ? 'DEVICE_ALREADY_USED' : 'ALREADY_RECORDED');
    }
    throw e;
  }
  await audit(req.user.id, 'attendance.scan', 'attendance_record', `${s.id}:${req.user.id}`, status);
  res.json({ status, course: { code: s.code, name_ar: s.name_ar, name_en: s.name_en }, distance_m: distance });
});

async function studentRows(userId, semesterId) {
  const params = [];
  let semesterSql = 'AND sm.is_current = 1';
  if (semesterId) {
    semesterSql = 'AND sm.id = ?';
    params.push(semesterId);
  }
  params.push(userId);
  const [rows] = await db.query(
    `SELECT o.id AS offering_id, o.absence_limit_pct, c.code, c.name_ar, c.name_en,
            sm.id AS semester_id, sm.name_ar AS semester_ar, sm.name_en AS semester_en,
            (SELECT COUNT(*) FROM attendance_sessions s WHERE s.offering_id = o.id AND s.status = 'closed') AS total_sessions,
            (SELECT COUNT(*) FROM attendance_records ar JOIN attendance_sessions s ON s.id = ar.session_id
             WHERE s.offering_id = o.id AND s.status = 'closed' AND ar.student_id = e.student_id) AS attended
     FROM enrollments e
     JOIN course_offerings o ON o.id = e.offering_id
     JOIN courses c ON c.id = o.course_id
     JOIN semesters sm ON sm.id = o.semester_id ${semesterSql}
     WHERE e.student_id = ? AND ${occupying('e.status')} ORDER BY c.code`,
    params
  );
  const globalLimit = await getNumber('absence_limit_pct');
  rows.forEach((r) => {
    Object.assign(r, absenceStanding({
      attended: r.attended,
      totalSessions: r.total_sessions,
      limitPct: r.absence_limit_pct == null ? globalLimit : Number(r.absence_limit_pct),
    }));
  });
  return rows;
}

router.get('/me', student, async (req, res) => {
  res.json(await studentRows(req.user.id, req.query.semester_id));
});

router.get('/me/history', student, async (req, res) => {
  const params = [req.user.id];
  let semesterSql = '';
  if (req.query.semester_id) {
    semesterSql = 'AND sm.id = ?';
    params.push(req.query.semester_id);
  }
  const [rows] = await db.query(
    `SELECT s.id AS session_id, s.session_date, s.status AS session_status, o.id AS offering_id,
            c.code, c.name_ar, c.name_en, sm.id AS semester_id, sm.name_ar AS semester_ar, sm.name_en AS semester_en,
            ar.status, ar.method, ar.distance_m, ar.scanned_at
     FROM enrollments e
     JOIN course_offerings o ON o.id = e.offering_id
     JOIN courses c ON c.id = o.course_id
     JOIN semesters sm ON sm.id = o.semester_id
     JOIN attendance_sessions s ON s.offering_id = o.id
     LEFT JOIN attendance_records ar ON ar.session_id = s.id AND ar.student_id = e.student_id
     WHERE e.student_id = ? AND ${occupying('e.status')} ${semesterSql}
     ORDER BY s.session_date DESC, s.id DESC`,
    params
  );
  res.json(rows);
});

module.exports = router;

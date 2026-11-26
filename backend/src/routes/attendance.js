const router = require('express').Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { HttpError } = require('../utils/errors');
const { occupying } = require('../domain/enrollment');

const instructor = [authenticate, authorize('instructor')];
const student = [authenticate, authorize('student')];

// Displayed codes last 15 minutes. The older 30-second token route is unchanged.
const QR_TTL_MINUTES = 15;
const QR_TTL_SECONDS = QR_TTL_MINUTES * 60;

async function ownOfferingId(offeringId, userId) {
  const [[o]] = await db.query('SELECT id FROM course_offerings WHERE id = ? AND instructor_id = ?', [offeringId, userId]);
  if (!o) throw new HttpError(404, 'NOT_FOUND');
}
async function ownSession(req, sessionId = req.params.id) {
  const [[s]] = await db.query(
    `SELECT s.*, c.code, c.name_ar, c.name_en
     FROM attendance_sessions s JOIN course_offerings o ON o.id = s.offering_id JOIN courses c ON c.id = o.course_id
     WHERE s.id = ? AND s.opened_by = ?`,
    [sessionId, req.user.id]
  );
  if (!s) throw new HttpError(404, 'NOT_FOUND');
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
     VALUES (?,?,CURDATE(),NOW(),?,?,'open',30,15)`,
    [offeringId, meetingId || null, userId, crypto.randomBytes(24).toString('hex')]
  );
  return { id: r.insertId, created: true };
}

function requireOpen(session) {
  if (session.status !== 'open') throw new HttpError(400, 'SESSION_CLOSED');
  return session;
}

// JWT payload stays compatible with POST /attendance/scan: `sid` signed by qr_secret.
// cid, ts, and rnd make each code specific to the class, the moment, and a random value.
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
     VALUES (?,?,?,?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
    [session.id, classId, doctorId, qrToken, QR_TTL_MINUTES]
  );
  return selectQr('session_id = ? AND qr_token = ?', [session.id, qrToken]);
}

async function expireActive(sessionId) {
  await db.query(
    'UPDATE qr_attendance_sessions SET expires_at = NOW() WHERE session_id = ? AND expires_at > NOW()',
    [sessionId]
  );
}

// Instructor: open a session. If one is already open for this offering, return it.
router.post('/sessions', instructor, async (req, res) => {
  const { offering_id, meeting_id } = req.body;
  if (!offering_id) throw new HttpError(400, 'MISSING_FIELDS');
  await ownOfferingId(offering_id, req.user.id);
  const opened = await openOrCreateSession(offering_id, req.user.id, meeting_id);
  if (!opened.created) return res.json({ id: opened.id });
  res.status(201).json({ id: opened.id });
});

// New short-lived QR token. Kept for clients that rotate every few seconds.
router.get('/sessions/:id/token', instructor, async (req, res) => {
  const s = await ownSession(req);
  if (s.status !== 'open') throw new HttpError(400, 'SESSION_CLOSED');
  const ttl = Number(s.token_ttl_seconds);
  const expiresIn = Number.isFinite(ttl) && ttl > 0 ? Math.floor(ttl) : 30;
  const token = jwt.sign({ sid: Number(s.id) }, s.qr_secret, { expiresIn });
  res.json({ session_id: s.id, token, expires_in: expiresIn });
});

// Active stored QR for this session, including a code that has already expired.
router.get('/sessions/:id/qr', instructor, async (req, res) => {
  const s = requireOpen(await ownSession(req));
  const row = await selectQr('session_id = ?', [s.id]);
  if (!row) throw new HttpError(404, 'NOT_FOUND');
  res.json(publicQr(row));
});

// Issue a 15-minute code, or return the one that is still valid.
router.post('/sessions/:id/qr', instructor, async (req, res) => {
  const s = requireOpen(await ownSession(req));
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

// Open the class session if needed, then issue or reuse its QR code.
router.post('/qr', instructor, async (req, res) => {
  const classId = req.body.class_id ?? req.body.offering_id;
  if (classId === undefined || classId === null || classId === '') throw new HttpError(400, 'MISSING_FIELDS');
  await ownOfferingId(classId, req.user.id);
  const opened = await openOrCreateSession(classId, req.user.id, req.body.meeting_id);
  const s = requireOpen(await ownSession(req, opened.id));
  const active = await selectQr('session_id = ? AND expires_at > NOW()', [s.id]);
  if (active) return res.status(opened.created ? 201 : 200).json(publicQr(active));
  const row = await insertQr(s, req.user.id);
  res.status(201).json(publicQr(row));
});

// Session detail and each student's mark.
router.get('/sessions/:id', instructor, async (req, res) => {
  const s = await ownSession(req);
  const [students] = await db.query(
    `SELECT u.id AS student_id, st.student_code, u.full_name_ar, u.full_name_en,
            ar.status, ar.method, ar.scanned_at
     FROM enrollments e
     JOIN users u ON u.id = e.student_id
     JOIN students st ON st.user_id = u.id
     LEFT JOIN attendance_records ar ON ar.session_id = ? AND ar.student_id = u.id
     WHERE e.offering_id = ? AND ${occupying('e.status')}
     ORDER BY st.student_code`,
    [s.id, s.offering_id]
  );
  const present = students.filter((x) => x.status).length;
  res.json({ session: publicSession(s), students, present, total: students.length });
});

router.post('/sessions/:id/close', instructor, async (req, res) => {
  const s = await ownSession(req);
  await db.query("UPDATE attendance_sessions SET status = 'closed', closed_at = NOW() WHERE id = ?", [s.id]);
  res.json({ ok: true });
});

// Manual mark or correction for one student.
router.put('/sessions/:id/students/:studentId', instructor, async (req, res) => {
  const s = await ownSession(req);
  const { status } = req.body;
  if (!['present', 'late', 'excused', 'absent'].includes(status)) throw new HttpError(400, 'MISSING_FIELDS');
  if (status === 'absent') {
    await db.query('DELETE FROM attendance_records WHERE session_id = ? AND student_id = ?', [s.id, req.params.studentId]);
  } else {
    const [[enr]] = await db.query(
      `SELECT id FROM enrollments WHERE student_id = ? AND offering_id = ? AND ${occupying('status')}`,
      [req.params.studentId, s.offering_id]
    );
    if (!enr) throw new HttpError(403, 'NOT_ENROLLED');
    await db.query(
      `INSERT INTO attendance_records (session_id, student_id, status, method) VALUES (?,?,?, 'manual')
       ON DUPLICATE KEY UPDATE status = VALUES(status), method = 'manual'`,
      [s.id, req.params.studentId, status]
    );
  }
  res.json({ ok: true });
});

// Session history for one offering.
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

// Student: scan the QR.
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

  try {
    const p = jwt.verify(token, s.qr_secret);
    if (Number(p.sid) !== Number(s.id)) throw new Error('mismatch');
  } catch {
    throw new HttpError(400, 'QR_EXPIRED');
  }

  // Stored codes are single-use until they expire or the doctor refreshes them.
  // Short tokens from GET /sessions/:id/token are not stored and keep the old check.
  const [[stored]] = await db.query(
    'SELECT id FROM qr_attendance_sessions WHERE session_id = ? AND qr_token = ?',
    [s.id, token]
  );
  if (stored) {
    const [[active]] = await db.query(
      'SELECT id FROM qr_attendance_sessions WHERE session_id = ? AND qr_token = ? AND expires_at > NOW()',
      [s.id, token]
    );
    if (!active) throw new HttpError(400, 'QR_EXPIRED');
  }

  const [[enr]] = await db.query(
    `SELECT id FROM enrollments WHERE student_id = ? AND offering_id = ? AND ${occupying('status')}`,
    [req.user.id, s.offering_id]
  );
  if (!enr) throw new HttpError(403, 'NOT_ENROLLED');

  const minutes = Number(s.minutes);
  const lateAfter = Number(s.late_after_minutes);
  const status = Number.isFinite(minutes) && Number.isFinite(lateAfter) && minutes > lateAfter ? 'late' : 'present';
  try {
    await db.query("INSERT INTO attendance_records (session_id, student_id, status, method) VALUES (?,?,?, 'qr')", [s.id, req.user.id, status]);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'ALREADY_RECORDED');
    throw e;
  }
  res.json({ status, course: { code: s.code, name_ar: s.name_ar, name_en: s.name_en } });
});

// Student: attendance for occupying courses in the current term.
router.get('/me', student, async (req, res) => {
  const [rows] = await db.query(
    `SELECT o.id AS offering_id, c.code, c.name_ar, c.name_en,
            (SELECT COUNT(*) FROM attendance_sessions s WHERE s.offering_id = o.id AND s.status = 'closed') AS total_sessions,
            (SELECT COUNT(*) FROM attendance_records ar JOIN attendance_sessions s ON s.id = ar.session_id
             WHERE s.offering_id = o.id AND s.status = 'closed' AND ar.student_id = e.student_id) AS attended
     FROM enrollments e
     JOIN course_offerings o ON o.id = e.offering_id
     JOIN courses c ON c.id = o.course_id
     JOIN semesters sm ON sm.id = o.semester_id AND sm.is_current = 1
     WHERE e.student_id = ? AND ${occupying('e.status')} ORDER BY c.code`,
    [req.user.id]
  );
  rows.forEach((r) => {
    r.absent = r.total_sessions - r.attended;
    r.absent_pct = r.total_sessions ? Math.round((r.absent / r.total_sessions) * 1000) / 10 : 0;
    r.warning = r.total_sessions > 0 && r.absent_pct > 25;
  });
  res.json(rows);
});

module.exports = router;

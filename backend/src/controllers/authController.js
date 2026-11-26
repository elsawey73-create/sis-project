const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { withTx } = require('../utils/tx');
const { rateLimit, clientIp } = require('../utils/rateLimit');
const { sendPasswordResetEmail } = require('../services/mail');
const { signAccessToken, signRefreshToken, refreshSecret, isJwtError } = require('../utils/tokens');

const RESET_TTL_MINUTES = 60;
const RESET_WINDOW_MS = 15 * 60 * 1000;
const RESET_LIMIT_IP = 30;
const RESET_LIMIT_ID = 8;

function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Off unless a local process sets PASSWORD_RESET_RETURN_LINK=true.
// Ignored when NODE_ENV=production. Returning the link lets anyone who knows
// an id or email reset that account, so production always emails it instead.
function includeDevResetLink() {
  if (process.env.NODE_ENV === 'production') return false;
  const raw = String(process.env.PASSWORD_RESET_RETURN_LINK || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function resetPageLink(req, token) {
  const configured = String(process.env.FRONTEND_URL || '').trim().replace(/\/+$/, '');
  const originHeader = String(req.get('origin') || '').trim().replace(/\/+$/, '');
  const base = configured || originHeader;
  const path = `/reset-password?token=${encodeURIComponent(token)}`;
  return base ? `${base}${path}` : path;
}

function limited(res) {
  return res.status(429).json({ error: 'RATE_LIMITED' });
}

function issueSession(user) {
  return {
    token: signAccessToken(user),
    refresh_token: signRefreshToken(user),
  };
}

function publicUser(u) {
  return {
    id: u.id,
    login_id: u.login_id,
    full_name_ar: u.full_name_ar,
    full_name_en: u.full_name_en,
    role: u.role,
    preferred_lang: u.preferred_lang,
  };
}

// POST /api/auth/login. The identifier is login_id, not email.
exports.login = async (req, res) => {
  const { login_id, password } = req.body;
  if (!login_id || !password) {
    return res.status(400).json({ error: 'MISSING_FIELDS' });
  }

  const [rows] = await db.query('SELECT * FROM users WHERE login_id = ?', [
    String(login_id).trim(),
  ]);
  const user = rows[0];

  // Same response for an unknown id and a wrong password.
  const ok = user && (await bcrypt.compare(password, user.password_hash));
  if (!ok) return res.status(401).json({ error: 'INVALID_CREDENTIALS' });

  res.json({ ...issueSession(user), user: publicUser(user) });
};

// POST /api/auth/refresh. Body: { refresh_token }. Returns a new access token.
// The refresh token is in the JSON body so a Capacitor WebView can call the
// API cross-origin without a cookie. Access tokens are rejected here.
exports.refresh = async (req, res) => {
  const raw = req.body && req.body.refresh_token;
  const token = typeof raw === 'string' ? raw.trim() : '';
  if (!token) return res.status(401).json({ error: 'UNAUTHENTICATED' });

  let payload;
  try {
    payload = jwt.verify(token, refreshSecret());
  } catch (err) {
    if (isJwtError(err)) return res.status(401).json({ error: 'SESSION_EXPIRED' });
    throw err;
  }
  if (!payload || payload.typ !== 'refresh') {
    return res.status(401).json({ error: 'SESSION_EXPIRED' });
  }

  const [rows] = await db.query('SELECT token_version, role FROM users WHERE id = ?', [payload.id]);
  if (!rows[0] || Number(rows[0].token_version) !== Number(payload.tv)) {
    return res.status(401).json({ error: 'SESSION_EXPIRED' });
  }

  res.json({
    token: signAccessToken({
      id: payload.id,
      role: rows[0].role,
      token_version: rows[0].token_version,
    }),
  });
};

// GET /api/auth/me
exports.me = async (req, res) => {
  const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!rows[0]) return res.status(404).json({ error: 'USER_NOT_FOUND' });
  const user = publicUser(rows[0]);

  if (user.role === 'student') {
    const [s] = await db.query(
      `SELECT s.student_code, s.level, s.admission_year,
              d.name_ar AS department_ar, d.name_en AS department_en
       FROM students s JOIN departments d ON d.id = s.department_id
       WHERE s.user_id = ?`,
      [user.id]
    );
    user.student = s[0];
  } else if (user.role === 'instructor') {
    const [i] = await db.query(
      `SELECT d.name_ar AS department_ar, d.name_en AS department_en
       FROM instructors i JOIN departments d ON d.id = i.department_id
       WHERE i.user_id = ?`,
      [user.id]
    );
    user.instructor = i[0];
  }
  res.json(user);
};

// POST /api/auth/logout. Invalidates every open session for this account.
exports.logout = async (req, res) => {
  await db.query('UPDATE users SET token_version = token_version + 1 WHERE id = ?', [req.user.id]);
  res.json({ ok: true });
};

// PATCH /api/auth/language. Stores the user's language.
exports.setLanguage = async (req, res) => {
  const { lang } = req.body;
  if (!['ar', 'en'].includes(lang)) {
    return res.status(400).json({ error: 'INVALID_LANGUAGE' });
  }
  await db.query('UPDATE users SET preferred_lang = ? WHERE id = ?', [lang, req.user.id]);
  res.json({ lang });
};

// POST /api/auth/forgot-password. Body: { identifier } (login_id or email).
// login_id and email are accepted as aliases of identifier.
exports.forgotPassword = async (req, res) => {
  const body = req.body || {};
  const raw = body.identifier ?? body.login_id ?? body.email;
  if (typeof raw !== 'string' || !raw.trim()) {
    return res.status(400).json({ error: 'MISSING_FIELDS' });
  }
  const loginId = raw.trim();
  const email = loginId.toLowerCase();
  const ip = clientIp(req);
  if (!rateLimit(`pwreset:ip:${ip}`, RESET_LIMIT_IP, RESET_WINDOW_MS)) return limited(res);
  if (!rateLimit(`pwreset:id:${email}`, RESET_LIMIT_ID, RESET_WINDOW_MS)) return limited(res);

  // Same JSON for an unknown id, an unknown email, and an account with no address.
  if (loginId.length > 255) return res.json({ ok: true });

  const [rows] = await db.query(
    'SELECT id, login_id, email FROM users WHERE login_id = ? OR email = ?',
    [loginId, email]
  );
  const user = rows.find((row) => row.login_id === loginId) || rows[0];
  const devLink = includeDevResetLink();
  const address = user && user.email ? String(user.email).trim() : '';
  if (!user || (!address && !devLink)) {
    if (user && !address) {
      console.warn('Password reset email skipped because the account has no email address.');
    }
    return res.json({ ok: true });
  }

  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashResetToken(token);
  await withTx(async (conn) => {
    await conn.query(
      'UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL',
      [user.id]
    );
    await conn.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
      [user.id, tokenHash, RESET_TTL_MINUTES]
    );
  });

  const link = resetPageLink(req, token);
  if (address) {
    await sendPasswordResetEmail({ to: address, resetLink: link, ttlMinutes: RESET_TTL_MINUTES });
  } else {
    console.warn('Password reset email skipped because the account has no email address.');
  }

  const payload = { ok: true };
  if (devLink) payload.reset_link = link;
  res.json(payload);
};

// POST /api/auth/reset-password. Body: { token, password }.
// One successful use. Older tokens for that user are already marked used.
exports.resetPassword = async (req, res) => {
  const body = req.body || {};
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  const password = body.password;
  if (!token || password === undefined || password === null || password === '') {
    return res.status(400).json({ error: 'MISSING_FIELDS' });
  }
  // Same minimum as admin create and admin password reset.
  if (String(password).length < 6) return res.status(400).json({ error: 'WEAK_PASSWORD' });

  const ip = clientIp(req);
  if (!rateLimit(`pwconfirm:ip:${ip}`, RESET_LIMIT_IP, RESET_WINDOW_MS)) return limited(res);

  const tokenHash = hashResetToken(token);
  const passwordHash = await bcrypt.hash(String(password), 10);
  const updated = await withTx(async (conn) => {
    const [rows] = await conn.query(
      `SELECT id, user_id FROM password_reset_tokens
       WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()
       FOR UPDATE`,
      [tokenHash]
    );
    const row = rows[0];
    if (!row) return false;
    await conn.query(
      'UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?',
      [passwordHash, row.user_id]
    );
    await conn.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL', [
      row.user_id,
    ]);
    return true;
  });

  if (!updated) return res.status(400).json({ error: 'INVALID_RESET_TOKEN' });
  res.json({ ok: true });
};

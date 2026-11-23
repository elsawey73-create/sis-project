const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, tv: Number(user.token_version || 0) },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
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

  res.json({ token: signToken(user), user: publicUser(user) });
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

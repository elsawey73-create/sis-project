const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: '7d',
  });
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

// POST /api/auth/register  (تسجيل طالب جديد - الـ ID هو الرقم الجامعي)
exports.register = async (req, res) => {
  const { full_name_ar, full_name_en, student_code, password, department_id, email } = req.body;

  if (!full_name_ar || !student_code || !password || !department_id) {
    return res.status(400).json({ error: 'MISSING_FIELDS' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'WEAK_PASSWORD' });
  }

  const loginId = String(student_code).trim();
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const hash = await bcrypt.hash(password, 10);
    const [u] = await conn.query(
      `INSERT INTO users (login_id, password_hash, full_name_ar, full_name_en, email, role)
       VALUES (?,?,?,?,?,?)`,
      [
        loginId,
        hash,
        full_name_ar.trim(),
        full_name_en ? full_name_en.trim() : null,
        email ? email.toLowerCase().trim() : null,
        'student',
      ]
    );

    await conn.query(
      'INSERT INTO students (user_id, student_code, department_id, level, admission_year) VALUES (?,?,?,?,?)',
      [u.insertId, loginId, department_id, 1, new Date().getFullYear()]
    );

    await conn.commit();
    res.status(201).json({ message: 'CREATED' });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'DUPLICATE_USER' });
    if (err.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ error: 'DEPT_NOT_FOUND' });
    console.error(err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  } finally {
    conn.release();
  }
};

// POST /api/auth/login  (بالـ ID مش بالإيميل)
exports.login = async (req, res) => {
  const { login_id, password } = req.body;
  if (!login_id || !password) {
    return res.status(400).json({ error: 'MISSING_FIELDS' });
  }

  const [rows] = await db.query('SELECT * FROM users WHERE login_id = ?', [
    String(login_id).trim(),
  ]);
  const user = rows[0];

  // نفس الرد للحالتين عشان محدش يعرف إن الـ ID موجود
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

// PATCH /api/auth/language  (حفظ لغة المستخدم في الداتابيز)
exports.setLanguage = async (req, res) => {
  const { lang } = req.body;
  if (!['ar', 'en'].includes(lang)) {
    return res.status(400).json({ error: 'INVALID_LANGUAGE' });
  }
  await db.query('UPDATE users SET preferred_lang = ? WHERE id = ?', [lang, req.user.id]);
  res.json({ lang });
};

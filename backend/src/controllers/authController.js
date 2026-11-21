const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: '7d',
  });
}

// POST /api/auth/register  (تسجيل طالب جديد)
exports.register = async (req, res) => {
  const { full_name, email, password, student_code, department_id } = req.body;

  if (!full_name || !email || !password || !student_code || !department_id) {
    return res.status(400).json({ error: 'كل الحقول مطلوبة' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'الباسورد لازم 6 حروف على الأقل' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const hash = await bcrypt.hash(password, 10);
    const [u] = await conn.query(
      'INSERT INTO users (email, password_hash, full_name, role) VALUES (?,?,?,?)',
      [email.toLowerCase().trim(), hash, full_name.trim(), 'student']
    );

    await conn.query(
      'INSERT INTO students (user_id, student_code, department_id, level, admission_year) VALUES (?,?,?,?,?)',
      [u.insertId, student_code.trim(), department_id, 1, new Date().getFullYear()]
    );

    await conn.commit();
    res.status(201).json({ message: 'تم إنشاء الحساب، سجّل دخول دلوقتي' });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'الإيميل أو الرقم الجامعي مستخدم قبل كده' });
    }
    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({ error: 'القسم غير موجود' });
    }
    console.error(err);
    res.status(500).json({ error: 'حصل خطأ في السيرفر' });
  } finally {
    conn.release();
  }
};

// POST /api/auth/login
exports.login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'اكتب الإيميل والباسورد' });
  }

  const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [
    email.toLowerCase().trim(),
  ]);
  const user = rows[0];

  // نفس الرسالة للحالتين عشان محدش يعرف إن الإيميل موجود
  const ok = user && (await bcrypt.compare(password, user.password_hash));
  if (!ok) return res.status(401).json({ error: 'الإيميل أو الباسورد غلط' });

  res.json({
    token: signToken(user),
    user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role },
  });
};

// GET /api/auth/me
exports.me = async (req, res) => {
  const [rows] = await db.query(
    'SELECT id, full_name, email, role FROM users WHERE id = ?',
    [req.user.id]
  );
  const user = rows[0];
  if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

  if (user.role === 'student') {
    const [s] = await db.query(
      `SELECT s.student_code, s.level, s.admission_year, d.name AS department
       FROM students s JOIN departments d ON d.id = s.department_id
       WHERE s.user_id = ?`,
      [user.id]
    );
    user.student = s[0];
  }
  res.json(user);
};

// بيعمل قسم + أدمن + دكتور + طالب للتجربة. شغّله مرة واحدة: npm run seed
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./config/db');

async function createUser(email, name, role, password) {
  const hash = await bcrypt.hash(password, 10);
  const [r] = await db.query(
    'INSERT INTO users (email, password_hash, full_name, role) VALUES (?,?,?,?)',
    [email, hash, name, role]
  );
  return r.insertId;
}

(async () => {
  try {
    const [d] = await db.query(
      "INSERT INTO departments (code, name) VALUES ('CS','علوم الحاسب')"
    );
    const deptId = d.insertId;

    await createUser('admin@sis.com', 'مدير النظام', 'admin', 'Admin@123');

    const insId = await createUser('doctor@sis.com', 'د. أحمد محمد', 'instructor', 'Doctor@123');
    await db.query('INSERT INTO instructors (user_id, department_id) VALUES (?,?)', [insId, deptId]);

    const stuId = await createUser('student@sis.com', 'عمرو علي', 'student', 'Student@123');
    await db.query(
      'INSERT INTO students (user_id, student_code, department_id, level, admission_year) VALUES (?,?,?,?,?)',
      [stuId, '20260001', deptId, 1, 2026]
    );

    console.log('تم! حسابات التجربة:');
    console.log('  admin@sis.com   / Admin@123');
    console.log('  doctor@sis.com  / Doctor@123');
    console.log('  student@sis.com / Student@123');
  } catch (e) {
    console.error('فشل تشغيل seed:', e.message);
  }
  process.exit();
})();

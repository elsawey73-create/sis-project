const router = require('express').Router();
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { occupying } = require('../domain/enrollment');
const { visibleCodesForUser, codeLimit } = require('../domain/visibility');

router.use(authenticate);

router.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ courses: [], students: [] });
  const like = `%${q}%`;
  const courseConds = ['(c.code LIKE ? OR c.name_ar LIKE ? OR c.name_en LIKE ?)'];
  const courseParams = [like, like, like];
  if (req.user.role === 'student') {
    const limit = codeLimit('d.code', await visibleCodesForUser(db, req.user));
    if (limit.sql) {
      courseConds.push(limit.sql);
      courseParams.push(...limit.params);
    }
  }
  const [courses] = await db.query(
    `SELECT c.id, c.code, c.name_ar, c.name_en, c.credit_hours, d.code AS department_code
     FROM courses c JOIN departments d ON d.id = c.department_id
     WHERE ${courseConds.join(' AND ')}
     ORDER BY c.code LIMIT 20`,
    courseParams
  );

  let students = [];
  if (req.user.role === 'admin') {
    const [rows] = await db.query(
      `SELECT u.id, st.student_code, u.full_name_ar, u.full_name_en
       FROM users u JOIN students st ON st.user_id = u.id
       WHERE u.role = 'student' AND (st.student_code LIKE ? OR u.full_name_ar LIKE ? OR u.full_name_en LIKE ? OR u.login_id LIKE ?)
       ORDER BY st.student_code LIMIT 20`,
      [like, like, like, like]
    );
    students = rows;
  } else if (req.user.role === 'instructor') {
    const [rows] = await db.query(
      `SELECT DISTINCT u.id, st.student_code, u.full_name_ar, u.full_name_en, c.code AS course_code
       FROM course_offerings o
       JOIN enrollments e ON e.offering_id = o.id AND ${occupying('e.status')}
       JOIN users u ON u.id = e.student_id
       JOIN students st ON st.user_id = u.id
       JOIN courses c ON c.id = o.course_id
       WHERE o.instructor_id = ?
         AND (st.student_code LIKE ? OR u.full_name_ar LIKE ? OR u.full_name_en LIKE ? OR c.code LIKE ?)
       ORDER BY st.student_code LIMIT 20`,
      [req.user.id, like, like, like, like]
    );
    students = rows;
  }
  res.json({ courses, students });
});

module.exports = router;

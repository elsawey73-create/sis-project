const router = require('express').Router();
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { occupying } = require('../domain/enrollment');

router.use(authenticate);

router.get('/', async (req, res) => {
  const [[sem]] = req.query.semester_id
    ? await db.query('SELECT * FROM semesters WHERE id = ?', [req.query.semester_id])
    : await db.query('SELECT * FROM semesters WHERE is_current = 1 LIMIT 1');
  if (!sem) return res.json({ semester: null, events: [] });

  const events = [
    {
      type: 'term',
      start: sem.start_date,
      end: sem.end_date,
      title_ar: sem.name_ar,
      title_en: sem.name_en,
    },
    {
      type: 'registration',
      start: sem.registration_start,
      end: sem.registration_end,
      title_ar: sem.name_ar,
      title_en: sem.name_en,
    },
  ];

  let meetingSql;
  let meetingParams;
  let examSql;
  let examParams;
  if (req.user.role === 'student') {
    meetingSql = `SELECT m.id, m.day_of_week, m.start_time, m.end_time, m.room, m.type,
                         c.code, c.name_ar, c.name_en
                  FROM enrollments e
                  JOIN course_offerings o ON o.id = e.offering_id
                  JOIN courses c ON c.id = o.course_id
                  JOIN offering_meetings m ON m.offering_id = o.id
                  WHERE e.student_id = ? AND o.semester_id = ? AND ${occupying('e.status')}`;
    meetingParams = [req.user.id, sem.id];
    examSql = `SELECT x.id, x.title, x.exam_at, c.code, c.name_ar, c.name_en
               FROM course_exams x
               JOIN course_offerings o ON o.id = x.offering_id
               JOIN courses c ON c.id = o.course_id
               JOIN enrollments e ON e.offering_id = o.id AND e.student_id = ? AND ${occupying('e.status')}
               WHERE o.semester_id = ?`;
    examParams = [req.user.id, sem.id];
  } else if (req.user.role === 'instructor') {
    meetingSql = `SELECT m.id, m.day_of_week, m.start_time, m.end_time, m.room, m.type,
                         c.code, c.name_ar, c.name_en
                  FROM course_offerings o
                  JOIN courses c ON c.id = o.course_id
                  JOIN offering_meetings m ON m.offering_id = o.id
                  WHERE o.instructor_id = ? AND o.semester_id = ?`;
    meetingParams = [req.user.id, sem.id];
    examSql = `SELECT x.id, x.title, x.exam_at, c.code, c.name_ar, c.name_en
               FROM course_exams x
               JOIN course_offerings o ON o.id = x.offering_id
               JOIN courses c ON c.id = o.course_id
               WHERE o.instructor_id = ? AND o.semester_id = ?`;
    examParams = [req.user.id, sem.id];
  } else {
    meetingSql = null;
    examSql = `SELECT x.id, x.title, x.exam_at, c.code, c.name_ar, c.name_en
               FROM course_exams x
               JOIN course_offerings o ON o.id = x.offering_id
               JOIN courses c ON c.id = o.course_id
               WHERE o.semester_id = ?`;
    examParams = [sem.id];
  }

  if (meetingSql) {
    const [meetings] = await db.query(meetingSql, meetingParams);
    meetings.forEach((meeting) => events.push({
      type: 'meeting',
      id: meeting.id,
      day_of_week: meeting.day_of_week,
      start_time: meeting.start_time,
      end_time: meeting.end_time,
      room: meeting.room,
      meeting_type: meeting.type,
      code: meeting.code,
      name_ar: meeting.name_ar,
      name_en: meeting.name_en,
    }));
  }
  const [exams] = await db.query(examSql, examParams);
  exams.forEach((exam) => events.push({
    type: 'exam',
    id: exam.id,
    start: exam.exam_at,
    title: exam.title,
    code: exam.code,
    name_ar: exam.name_ar,
    name_en: exam.name_en,
  }));

  res.json({
    semester: {
      id: sem.id,
      name_ar: sem.name_ar,
      name_en: sem.name_en,
      start_date: sem.start_date,
      end_date: sem.end_date,
      registration_start: sem.registration_start,
      registration_end: sem.registration_end,
    },
    events,
  });
});

module.exports = router;

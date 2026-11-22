// بيجهّز بيانات تجريبية كاملة. شغّله مرة واحدة على داتابيز فاضية: npm run seed
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./config/db');
const { gradeFromTotal, computeTotal } = require('./services/gpa');

const iso = (offsetDays) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

async function user(loginId, ar, en, role, pw) {
  const [r] = await db.query(
    'INSERT INTO users (login_id, password_hash, full_name_ar, full_name_en, role) VALUES (?,?,?,?,?)',
    [loginId, await bcrypt.hash(pw, 10), ar, en, role]
  );
  return r.insertId;
}

(async () => {
  try {
    // ---------- الأقسام ----------
    const dept = {};
    for (const [code, ar, en] of [
      ['CS', 'علوم الحاسب', 'Computer Science'],
      ['IS', 'نظم المعلومات', 'Information Systems'],
      ['MTH', 'الرياضيات', 'Mathematics'],
      ['GEN', 'المتطلبات العامة', 'General Requirements'],
    ]) {
      const [r] = await db.query('INSERT INTO departments (code,name_ar,name_en) VALUES (?,?,?)', [code, ar, en]);
      dept[code] = r.insertId;
    }

    // ---------- المقررات (مع المتطلبات السابقة) ----------
    const C = {}; // code -> {id, practical}
    const courses = [
      // code, عربي, English, ساعات, قسم, عملي؟, متطلبات
      ['ENG101', 'اللغة الإنجليزية 1', 'English Language 1', 2, 'GEN', 0, []],
      ['MTH101', 'تفاضل وتكامل 1', 'Calculus 1', 3, 'MTH', 0, []],
      ['MTH102', 'تفاضل وتكامل 2', 'Calculus 2', 3, 'MTH', 0, ['MTH101']],
      ['MTH201', 'الرياضيات المتقطعة', 'Discrete Mathematics', 3, 'MTH', 0, ['MTH101']],
      ['CS101', 'مقدمة في البرمجة', 'Introduction to Programming', 3, 'CS', 1, []],
      ['CS102', 'البرمجة الكائنية', 'Object-Oriented Programming', 3, 'CS', 1, ['CS101']],
      ['CS201', 'هياكل البيانات', 'Data Structures', 3, 'CS', 1, ['CS102']],
      ['CS230', 'نظم قواعد البيانات', 'Database Systems', 3, 'CS', 1, ['CS102']],
      ['CS301', 'تحليل وتصميم الخوارزميات', 'Algorithms', 3, 'CS', 0, ['CS201', 'MTH201']],
      ['CS310', 'نظم التشغيل', 'Operating Systems', 3, 'CS', 1, ['CS201']],
      ['IS101', 'مقدمة في نظم المعلومات', 'Introduction to Information Systems', 3, 'IS', 0, []],
      ['IS210', 'تحليل وتصميم النظم', 'Systems Analysis and Design', 3, 'IS', 0, ['IS101']],
    ];
    for (const [code, ar, en, cr, d, prac] of courses) {
      const [r] = await db.query(
        `INSERT INTO courses (code,name_ar,name_en,description_ar,description_en,credit_hours,has_practical,department_id)
         VALUES (?,?,?,?,?,?,?,?)`,
        [code, ar, en, `يغطي هذا المقرر أساسيات ${ar}.`, `Covers the fundamentals of ${en}.`, cr, prac, dept[d]]
      );
      C[code] = { id: r.insertId, practical: prac };
    }
    for (const [code, , , , , , pre] of courses)
      for (const p of pre)
        await db.query('INSERT INTO course_prerequisites (course_id, prerequisite_id) VALUES (?,?)', [C[code].id, C[p].id]);

    // ---------- المستخدمين ----------
    await user('admin', 'مدير النظام', 'System Admin', 'admin', 'Admin@123');
    const d1 = await user('D1001', 'د. أحمد محمد', 'Dr. Ahmed Mohamed', 'instructor', 'Doctor@123');
    const d2 = await user('D1002', 'د. منى سمير', 'Dr. Mona Samir', 'instructor', 'Doctor@123');
    await db.query('INSERT INTO instructors (user_id, department_id) VALUES (?,?)', [d1, dept.CS]);
    await db.query('INSERT INTO instructors (user_id, department_id) VALUES (?,?)', [d2, dept.MTH]);

    const amr = await user('20250001', 'عمرو علي', 'Amr Ali', 'student', 'Student@123');
    const sara = await user('20260001', 'سارة حسن', 'Sara Hassan', 'student', 'Student@123');
    await db.query('INSERT INTO students (user_id,student_code,department_id,level,admission_year) VALUES (?,?,?,?,?)', [amr, '20250001', dept.CS, 2, 2025]);
    await db.query('INSERT INTO students (user_id,student_code,department_id,level,admission_year) VALUES (?,?,?,?,?)', [sara, '20260001', dept.CS, 1, 2026]);

    // ---------- الترمات ----------
    const sem = async (ar, en, s, e, rs, re, cur) =>
      (await db.query(
        'INSERT INTO semesters (name_ar,name_en,start_date,end_date,registration_start,registration_end,is_current) VALUES (?,?,?,?,?,?,?)',
        [ar, en, s, e, rs, re, cur]
      ))[0].insertId;
    const spring = await sem('ربيع 2026', 'Spring 2026', '2026-02-15', '2026-06-20', '2026-02-01', '2026-02-28', 0);
    const fall = await sem('خريف 2026', 'Fall 2026', '2026-09-20', '2027-01-20', iso(-30), iso(60), 1);

    // ---------- المواد المطروحة + المواعيد ----------
    const offer = async (code, semId, instr, meetings, capacity = 40) => {
      const [r] = await db.query(
        'INSERT INTO course_offerings (course_id,semester_id,instructor_id,section,capacity) VALUES (?,?,?,?,?)',
        [C[code].id, semId, instr, '1', capacity]
      );
      for (const [day, st, en, room, type] of meetings)
        await db.query(
          'INSERT INTO offering_meetings (offering_id,day_of_week,start_time,end_time,room,type) VALUES (?,?,?,?,?,?)',
          [r.insertId, day, st, en, room, type]
        );
      return r.insertId;
    };

    // الترم الماضي (الطالب عمرو خلّصه ودرجاته منشورة)
    const past = {
      CS101: await offer('CS101', spring, d1, [['Sat', '09:00', '11:00', 'A1', 'lecture']]),
      MTH101: await offer('MTH101', spring, d2, [['Sun', '09:00', '11:00', 'B3', 'lecture']]),
      ENG101: await offer('ENG101', spring, d2, [['Mon', '09:00', '11:00', 'C1', 'lecture']]),
      IS101: await offer('IS101', spring, d1, [['Tue', '09:00', '11:00', 'C2', 'lecture']]),
    };
    const history = {
      CS101: { coursework: 19, midterm: 18, practical: 9, final_exam: 49 },
      MTH101: { coursework: 26, midterm: 16, practical: null, final_exam: 40 },
      ENG101: { coursework: 27, midterm: 17, practical: null, final_exam: 45 },
      IS101: { coursework: 24, midterm: 15, practical: null, final_exam: 38 },
    };
    for (const [code, g] of Object.entries(history)) {
      const [e] = await db.query("INSERT INTO enrollments (student_id, offering_id, status) VALUES (?,?,'completed')", [amr, past[code]]);
      const total = computeTotal(g, C[code].practical);
      const { letter, points } = gradeFromTotal(total);
      await db.query(
        'INSERT INTO grades (enrollment_id,coursework,midterm,practical,final_exam,total,letter,points,published) VALUES (?,?,?,?,?,?,?,?,1)',
        [e.insertId, g.coursework, g.midterm, g.practical, g.final_exam, total, letter, points]
      );
    }

    // الترم الحالي (CS102 و MTH201 متعارضين عمداً يوم الأحد 9-11)
    const f = {
      CS101: await offer('CS101', fall, d1, [['Sat', '09:00', '11:00', 'A1', 'lecture'], ['Mon', '11:00', '13:00', 'Lab1', 'lab']]),
      CS102: await offer('CS102', fall, d1, [['Sun', '09:00', '11:00', 'A2', 'lecture'], ['Tue', '11:00', '13:00', 'Lab2', 'lab']]),
      CS201: await offer('CS201', fall, d1, [['Thu', '09:00', '12:00', 'A3', 'lecture']]),
      IS101: await offer('IS101', fall, d1, [['Tue', '09:00', '11:00', 'C2', 'lecture']]),
      IS210: await offer('IS210', fall, d1, [['Wed', '11:00', '13:00', 'C3', 'lecture']]),
      MTH101: await offer('MTH101', fall, d2, [['Sat', '11:00', '13:00', 'B3', 'lecture']]),
      MTH102: await offer('MTH102', fall, d2, [['Sun', '11:00', '13:00', 'B1', 'lecture'], ['Wed', '09:00', '11:00', 'B1', 'section']]),
      MTH201: await offer('MTH201', fall, d2, [['Sun', '09:00', '11:00', 'B2', 'lecture']]),
      ENG101: await offer('ENG101', fall, d2, [['Mon', '09:00', '11:00', 'C1', 'lecture']]),
    };
    // سارة مسجّلة في مادتين عشان يبقى فيه طلاب عند الدكتور
    await db.query('INSERT INTO enrollments (student_id, offering_id) VALUES (?,?)', [sara, f.CS101]);
    await db.query('INSERT INTO enrollments (student_id, offering_id) VALUES (?,?)', [sara, f.ENG101]);

    console.log('Done! Test accounts (ID / password):');
    console.log('  admin     / Admin@123    (admin)');
    console.log('  D1001     / Doctor@123   (Dr. Ahmed - CS)');
    console.log('  D1002     / Doctor@123   (Dr. Mona - Math)');
    console.log('  20250001  / Student@123  (Amr - has a previous semester)');
    console.log('  20260001  / Student@123  (Sara - new student)');
  } catch (e) {
    console.error('Seed failed:', e.message);
  }
  process.exit();
})();

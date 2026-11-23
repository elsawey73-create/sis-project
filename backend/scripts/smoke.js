// Mutating API check: grades, users, courses, and the registration window.
// Run it only against a disposable database that was just seeded: npm run test:api
// The API process must already be listening.
const BASE = process.env.API || 'http://localhost:5000/api';
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name} ${cond ? '' : extra}`); };

async function call(method, path, token, body) {
  const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data };
}
const login = async (id, pw) => (await call('POST', '/auth/login', null, { login_id: id, password: pw })).data.token;
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

(async () => {
  console.log('WARNING: this script changes grades, users, courses, and the registration window.');
  console.log('Point it only at a disposable database that was just seeded.');
  const admin = await login('admin', 'Admin@123');
  const doc = await login('D1001', 'Doctor@123');
  const amr = await login('20250001', 'Student@123');
  const sara = await login('20260001', 'Student@123');
  ok('login by ID (4 roles)', admin && doc && amr && sara);
  ok('wrong password rejected', (await call('POST', '/auth/login', null, { login_id: 'admin', password: 'x' })).status === 401);
  ok('student blocked from admin route', (await call('GET', '/admin/stats', amr)).status === 403);

  // ---- Catalog ----
  const courses = (await call('GET', '/courses', amr)).data;
  ok('catalog has 12 courses', courses.length === 12);
  ok('CS301 has 2 prerequisites', courses.find((c) => c.code === 'CS301').prerequisites.length === 2);
  ok('search works', (await call('GET', '/courses?q=Calculus', amr)).data.length === 2);

  // ---- Registration ----
  const offs = (await call('GET', '/offerings', amr)).data;
  const off = (code) => offs.find((o) => o.code === code);
  ok('9 offerings in current semester', offs.length === 9);
  ok('CS101 flagged passed', off('CS101').passed === true);
  ok('CS201 shows missing prereq CS102', off('CS201').prereq_missing[0] === 'CS102');

  let r = await call('POST', '/enrollments', amr, { offering_id: off('CS201').id });
  ok('prereq rule blocks CS201', r.status === 409 && r.data.error === 'PREREQ_NOT_MET' && r.data.details.courses[0] === 'CS102', JSON.stringify(r.data));
  r = await call('POST', '/enrollments', amr, { offering_id: off('CS101').id });
  ok('already-passed rule blocks CS101', r.data.error === 'ALREADY_PASSED', JSON.stringify(r.data));
  r = await call('POST', '/enrollments', amr, { offering_id: off('CS102').id });
  ok('register CS102', r.status === 201, JSON.stringify(r.data));
  r = await call('POST', '/enrollments', amr, { offering_id: off('CS102').id });
  ok('duplicate registration blocked', r.data.error === 'ALREADY_ENROLLED');
  r = await call('POST', '/enrollments', amr, { offering_id: off('MTH201').id });
  ok('time conflict CS102 vs MTH201', r.data.error === 'TIME_CONFLICT' && r.data.details.course === 'CS102', JSON.stringify(r.data));
  r = await call('POST', '/enrollments', amr, { offering_id: off('MTH102').id });
  ok('register MTH102', r.status === 201, JSON.stringify(r.data));
  const mthEnr = r.data.id;
  let me = (await call('GET', '/enrollments/me', amr)).data;
  ok('my courses = 2, credits = 6', me.courses.length === 2 && me.total_credits === 6, JSON.stringify(me.total_credits));
  ok('max credits = 21 (cgpa > 3)', me.max_credits === 21);
  r = await call('DELETE', '/enrollments/' + mthEnr, amr);
  ok('drop MTH102', r.status === 200);
  r = await call('POST', '/enrollments', amr, { offering_id: off('MTH102').id });
  ok('re-register after drop', r.status === 201);

  // ---- GPA and transcript before the new grades ----
  let sum = (await call('GET', '/student/summary', amr)).data;
  ok('CGPA = 3.32, 11 credits earned', sum.standing.cgpa === 3.32 && sum.standing.credits_earned === 11, JSON.stringify(sum.standing)); // one attempt per course, so replacement does not change this
  let tr = (await call('GET', '/student/transcript', amr)).data;
  ok('transcript: 1 semester (Spring) GPA 3.32', tr.semesters.length === 1 && tr.semesters[0].gpa === 3.32, JSON.stringify(tr.semesters.map((s) => s.gpa)));

  // ---- Instructor grades ----
  const myOffs = (await call('GET', '/instructor/offerings', doc)).data;
  const csOff = myOffs.find((o) => o.code === 'CS102');
  ok('doctor sees CS102 with 1 student', csOff && csOff.enrolled_count === 1);
  const roster = (await call('GET', `/instructor/offerings/${csOff.id}/roster`, doc)).data;
  ok('roster has Amr + practical max 10', roster.students.length === 1 && roster.max.practical === 10);
  r = await call('PUT', `/instructor/offerings/${csOff.id}/grades`, doc, { grades: [{ enrollment_id: roster.students[0].enrollment_id, coursework: 25, midterm: 10, practical: 5, final_exam: 10 }] });
  ok('grade above max rejected', r.status === 400 && r.data.error === 'INVALID_GRADE', JSON.stringify(r.data));
  r = await call('PUT', `/instructor/offerings/${csOff.id}/grades`, doc, { grades: [{ enrollment_id: roster.students[0].enrollment_id, coursework: 18, midterm: 17, practical: 9, final_exam: 45 }] });
  ok('save grades', r.data.saved === 1, JSON.stringify(r.data));
  ok('student cannot see unpublished grade', (await call('GET', '/student/grades', amr)).data.every((g) => g.code !== 'CS102'));
  // ---- QR attendance ----
  r = await call('POST', '/attendance/sessions', doc, { offering_id: csOff.id });
  const sid = r.data.id;
  ok('open attendance session', r.status === 201 && sid);
  ok('re-open returns same session', (await call('POST', '/attendance/sessions', doc, { offering_id: csOff.id })).data.id === sid);
  const tok = (await call('GET', `/attendance/sessions/${sid}/token`, doc)).data.token;
  ok('QR token issued', !!tok);
  ok('student cannot get QR token', (await call('GET', `/attendance/sessions/${sid}/token`, amr)).status === 403);
  ok('wrong token rejected', (await call('POST', '/attendance/scan', amr, { session_id: sid, token: tok + 'x' })).data.error === 'QR_EXPIRED');
  ok('non-enrolled student rejected', (await call('POST', '/attendance/scan', sara, { session_id: sid, token: tok })).data.error === 'NOT_ENROLLED');
  r = await call('POST', '/attendance/scan', amr, { session_id: sid, token: tok });
  ok('scan -> present', r.data.status === 'present', JSON.stringify(r.data));
  ok('double scan blocked', (await call('POST', '/attendance/scan', amr, { session_id: sid, token: tok })).data.error === 'ALREADY_RECORDED');
  let det = (await call('GET', `/attendance/sessions/${sid}`, doc)).data;
  ok('session shows 1/1 present', det.present === 1 && det.total === 1);
  await call('POST', `/attendance/sessions/${sid}/close`, doc);
  ok('scan after close rejected', (await call('POST', '/attendance/scan', amr, { session_id: sid, token: tok })).data.error === 'SESSION_CLOSED');
  const att = (await call('GET', '/attendance/me', amr)).data.find((a) => a.code === 'CS102');
  ok('my attendance 1/1, no warning', att.total_sessions === 1 && att.attended === 1 && !att.warning, JSON.stringify(att));
  // Second session with no scan, so the absence warning fires.
  const sid2 = (await call('POST', '/attendance/sessions', doc, { offering_id: csOff.id })).data.id;
  await call('POST', `/attendance/sessions/${sid2}/close`, doc);
  const att2 = (await call('GET', '/attendance/me', amr)).data.find((a) => a.code === 'CS102');
  ok('absence 50% triggers warning', att2.warning === true && att2.absent_pct === 50, JSON.stringify(att2));

  // ---- Publish grades (after attendance) ----
  r = await call('POST', `/instructor/offerings/${csOff.id}/grades/publish`, doc);
  ok('publish grades', r.data.published === 1, JSON.stringify(r.data));
  const g = (await call('GET', '/student/grades', amr)).data.find((x) => x.code === 'CS102');
  ok('CS102 = 89 / A-', g && g.total === 89 && g.letter === 'A-', JSON.stringify(g));
  tr = (await call('GET', '/student/transcript', amr)).data;
  ok('transcript now 2 semesters', tr.semesters.length === 2 && tr.standing.credits_earned === 14, JSON.stringify(tr.standing));
  ok('CGPA = (36.5+3*3.7)/14 = 3.4', tr.standing.cgpa === 3.4, String(tr.standing.cgpa));
  r = await call('POST', '/enrollments', amr, { offering_id: off('CS201').id });
  ok('CS201 now allowed (prereq passed)', r.status === 201, JSON.stringify(r.data));
  ok('student got grades notification', (await call('GET', '/notifications', amr)).data.some((n) => n.type === 'grades_published'));

  // ---- Messages ----
  const contacts = (await call('GET', '/messages/contacts', amr)).data;
  ok('student can message his doctors', contacts.some((c) => c.role === 'instructor'));
  const d1 = contacts.find((c) => c.course_code === 'CS102');
  r = await call('POST', '/messages/threads', amr, { receiver_id: d1.id, offering_id: d1.offering_id, subject: 'Question', body: 'Hello doctor' });
  ok('send message', r.status === 201, JSON.stringify(r.data));
  const tid = r.data.id;
  const adminId = (await call('GET', '/admin/users?q=admin', admin)).data[0].id;
  ok('student cannot message random user', (await call('POST', '/messages/threads', amr, { receiver_id: adminId, subject: 'x', body: 'x' })).status === 403);
  ok('doctor sees unread', (await call('GET', '/notifications/summary', doc)).data.messages === 1);
  let th = (await call('GET', '/messages/threads', doc)).data;
  ok('doctor thread list unread=1', th.length === 1 && th[0].unread === 1 && th[0].course_code === 'CS102');
  await call('GET', `/messages/threads/${tid}`, doc);
  ok('read clears unread', (await call('GET', '/notifications/summary', doc)).data.messages === 0);
  ok('doctor replies', (await call('POST', `/messages/threads/${tid}/reply`, doc, { body: 'Hi Amr' })).status === 201);
  const conv = (await call('GET', `/messages/threads/${tid}`, amr)).data;
  ok('student sees 2 messages', conv.messages.length === 2);
  ok('outsider cannot open thread', (await call('GET', `/messages/threads/${tid}`, sara)).status === 404);

  // ---- Admin ----
  const st = (await call('GET', '/admin/stats', admin)).data;
  ok('admin stats', st.students === 2 && st.instructors === 2 && st.courses === 12, JSON.stringify(st));
  r = await call('POST', '/admin/users', admin, { login_id: 'D2001', password: 'Pass1234', full_name_ar: 'د. جديد', full_name_en: 'Dr. New', role: 'instructor', department_id: 1 });
  ok('admin creates instructor', r.status === 201, JSON.stringify(r.data));
  ok('duplicate login id rejected', (await call('POST', '/admin/users', admin, { login_id: 'D2001', password: 'Pass1234', full_name_ar: 'x', role: 'instructor', department_id: 1 })).status === 409);
  ok('new doctor can log in with ID', !!(await login('D2001', 'Pass1234')));
  const cs101 = courses.find((c) => c.code === 'CS101');
  r = await call('POST', '/courses', admin, { code: 'CS999', name_ar: 'مقرر', name_en: 'Test', credit_hours: 3, department_id: cs101.department_id, prerequisites: [cs101.id] });
  ok('admin creates course with prereq', r.status === 201);
  ok('delete used course blocked', (await call('DELETE', '/courses/' + cs101.id, admin)).data.error === 'IN_USE');
  const sems = (await call('GET', '/semesters', admin)).data;
  const fall = sems.find((s) => s.is_current);
  const ins = (await call('GET', '/instructors', admin)).data;
  ok('bad meeting rejected', (await call('POST', '/offerings', admin, { course_id: cs101.id, semester_id: fall.id, instructor_id: ins[0].id, section: '2', meetings: [{ day_of_week: 'Mon', start_time: '12:00', end_time: '10:00', room: 'X' }] })).data.error === 'INVALID_MEETING');
  r = await call('POST', '/offerings', admin, { course_id: cs101.id, semester_id: fall.id, instructor_id: ins[0].id, section: '2', capacity: 1, meetings: [{ day_of_week: 'Thu', start_time: '13:00', end_time: '15:00', room: 'Z1', type: 'lecture' }] });
  ok('admin creates offering (capacity 1)', r.status === 201, JSON.stringify(r.data));
  const small = r.data.id;
  ok('Sara registers in tiny section', (await call('POST', '/enrollments', sara, { offering_id: small })).data.error === 'COURSE_ALREADY_IN_SEMESTER');
  // Capacity: a new course with no prerequisites and one seat.
  const cid = (await call('POST', '/courses', admin, { code: 'GEN900', name_ar: 'مادة اختبار', name_en: 'Capacity Test', credit_hours: 1, department_id: cs101.department_id })).data.id;
  const tiny = (await call('POST', '/offerings', admin, { course_id: cid, semester_id: fall.id, instructor_id: ins[0].id, section: '1', capacity: 1, meetings: [] })).data.id;
  ok('first student takes the only seat', (await call('POST', '/enrollments', sara, { offering_id: tiny })).status === 201);
  r = await call('POST', '/enrollments', amr, { offering_id: tiny });
  ok('section full for second student', r.data.error === 'SECTION_FULL', JSON.stringify(r.data));

  // ---- Close registration ----
  await call('PUT', '/semesters/' + fall.id, admin, { ...fall, registration_end: day(-1), is_current: true });
  r = await call('POST', '/enrollments', amr, { offering_id: off('IS210').id });
  ok('registration closed after window', r.data.error === 'REGISTRATION_CLOSED', JSON.stringify(r.data));
  const enr = (await call('GET', '/enrollments/me', amr)).data.courses.find((c) => c.status === 'enrolled');
  ok('drop also blocked when closed', !!enr && (await call('DELETE', '/enrollments/' + enr.enrollment_id, amr)).data.error === 'REGISTRATION_CLOSED');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(2); });

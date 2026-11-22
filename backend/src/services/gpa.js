// مقياس التقديرات (من 100) والنقاط
const SCALE = [
  [97, 'A+', 4.0], [93, 'A', 4.0], [89, 'A-', 3.7],
  [84, 'B+', 3.3], [80, 'B', 3.0], [76, 'B-', 2.7],
  [73, 'C+', 2.3], [70, 'C', 2.0], [67, 'C-', 1.7],
  [64, 'D+', 1.3], [60, 'D', 1.0], [0, 'F', 0],
];

function gradeFromTotal(total) {
  for (const [min, letter, points] of SCALE) if (total >= min) return { letter, points };
  return { letter: 'F', points: 0 };
}

// توزيع الدرجات: المادة اللي فيها عملي مختلفة عن اللي مفيهاش
function maxes(hasPractical) {
  return hasPractical
    ? { coursework: 20, midterm: 20, practical: 10, final_exam: 50 }
    : { coursework: 30, midterm: 20, practical: 0, final_exam: 50 };
}

function computeTotal(g, hasPractical) {
  const need = hasPractical
    ? ['coursework', 'midterm', 'practical', 'final_exam']
    : ['coursework', 'midterm', 'final_exam'];
  if (need.some((k) => g[k] === null || g[k] === undefined)) return null;
  return Math.round(need.reduce((s, k) => s + Number(g[k]), 0) * 100) / 100;
}

// GPA التراكمي والساعات (q = db أو connection)
async function getStanding(q, studentId) {
  const [rows] = await q.query(
    `SELECT c.credit_hours, g.points
     FROM enrollments e
     JOIN course_offerings o ON o.id = e.offering_id
     JOIN courses c ON c.id = o.course_id
     JOIN grades g ON g.enrollment_id = e.id AND g.published = 1
     WHERE e.student_id = ? AND e.status IN ('completed','failed')`,
    [studentId]
  );
  let attempted = 0, earned = 0, quality = 0;
  for (const r of rows) {
    attempted += r.credit_hours;
    quality += r.credit_hours * Number(r.points);
    if (Number(r.points) > 0) earned += r.credit_hours;
  }
  const cgpa = attempted ? Math.round((quality / attempted) * 100) / 100 : null;
  return { cgpa, credits_attempted: attempted, credits_earned: earned };
}

// الحد الأقصى للساعات حسب الـ GPA
function maxCredits(standing) {
  if (standing.cgpa === null) return 18;
  if (standing.cgpa < 2) return 12;
  if (standing.cgpa < 3) return 18;
  return 21;
}

module.exports = { gradeFromTotal, maxes, computeTotal, getStanding, maxCredits };

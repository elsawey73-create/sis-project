// Letter scale for a score out of 100, and the grade points for each letter.
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

// Component maximums. A course with a practical uses a different split.
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

// Pass-only grades (PP, P) earn credit hours but carry no grade points, so they stay out of GPA.
const PASS_ONLY = new Set(['PP', 'P']);
const isPassOnly = (letter) => PASS_ONLY.has(String(letter || '').toUpperCase());

// A later attempt replaces an earlier one when its semester starts later.
// The same start date uses the higher enrollment id.
function isLaterAttempt(candidate, current) {
  if (candidate.start_date !== current.start_date) return candidate.start_date > current.start_date;
  return Number(candidate.enrollment_id) > Number(current.enrollment_id);
}

// Cumulative GPA keeps one published attempt per course. Term GPA does not use this.
// rows need enrollment_id, course_id, credit_hours, points, letter, and start_date.
function standingFromAttempts(rows) {
  const latest = new Map();
  for (const row of rows) {
    const prev = latest.get(row.course_id);
    if (!prev || isLaterAttempt(row, prev)) latest.set(row.course_id, row);
  }
  let attempted = 0;
  let earned = 0;
  let quality = 0;
  const countedIds = new Set();
  for (const row of latest.values()) {
    const hours = Number(row.credit_hours);
    const points = Number(row.points);
    countedIds.add(Number(row.enrollment_id));
    if (isPassOnly(row.letter)) { earned += hours; continue; }
    attempted += hours;
    quality += hours * points;
    if (points > 0) earned += hours;
  }
  return {
    cgpa: attempted ? Math.round((quality / attempted) * 100) / 100 : null,
    credits_attempted: attempted,
    credits_earned: earned,
    countedIds,
  };
}

// Cumulative GPA and credits. q is the pool or a transaction connection.
async function getStanding(q, studentId) {
  const [rows] = await q.query(
    `SELECT e.id AS enrollment_id, c.id AS course_id, c.credit_hours, g.points, g.letter, s.start_date
     FROM enrollments e
     JOIN course_offerings o ON o.id = e.offering_id
     JOIN semesters s ON s.id = o.semester_id
     JOIN courses c ON c.id = o.course_id
     JOIN grades g ON g.enrollment_id = e.id AND g.published = 1
     WHERE e.student_id = ? AND e.status IN ('completed','failed')`,
    [studentId]
  );
  const { cgpa, credits_attempted, credits_earned } = standingFromAttempts(rows);
  return { cgpa, credits_attempted, credits_earned };
}

// Credit cap for registration, from the cumulative GPA.
function maxCredits(standing) {
  if (standing.cgpa === null) return 18;
  if (standing.cgpa < 2) return 14;
  if (standing.cgpa < 3) return 18;
  return 21;
}

module.exports = { gradeFromTotal, maxes, computeTotal, getStanding, standingFromAttempts, maxCredits, isPassOnly };

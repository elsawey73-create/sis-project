// Which department codes a student may browse and register.
// null from visibleCodesForUser means the caller is not a student and is not limited.

const ELECTRICAL = ['CSE', 'ECE', 'EPC', 'EE'];
const BASICS = ['BSE'];
const UNIVERSITY = ['UNIVREQ'];
const ELECTIVES = ['ELECT1', 'ELECT2'];

function visibleDepartmentCodes(homeCode) {
  const home = String(homeCode || '').trim().toUpperCase();
  if (!home) return [];
  let codes;
  // Electrical programs share one faculty catalog, plus prep, university courses, and electives.
  if (ELECTRICAL.includes(home)) codes = [...ELECTRICAL, ...BASICS, ...UNIVERSITY, ...ELECTIVES];
  // Each other faculty sees its own courses, prep, and university requirements.
  else if (['CBE', 'ARC', 'MEP', 'MEM', 'MED'].includes(home)) codes = [home, ...BASICS, ...UNIVERSITY];
  else if (home === 'BSE') codes = [...BASICS, ...UNIVERSITY];
  else codes = [home, ...BASICS, ...UNIVERSITY];
  return [...new Set(codes)];
}

// q is the pool or a transaction connection. Returns null when the role is not student.
async function visibleCodesForUser(q, user) {
  if (!user || user.role !== 'student') return null;
  const [[row]] = await q.query(
    `SELECT d.code FROM students s JOIN departments d ON d.id = s.department_id WHERE s.user_id = ?`,
    [user.id]
  );
  return visibleDepartmentCodes(row && row.code);
}

// SQL fragment for a department-code limit. Empty codes match nothing.
function codeLimit(column, codes) {
  if (codes == null) return { sql: '', params: [] };
  if (codes.length === 0) return { sql: '1 = 0', params: [] };
  return { sql: `${column} IN (${codes.map(() => '?').join(',')})`, params: codes };
}

module.exports = { visibleDepartmentCodes, visibleCodesForUser, codeLimit };

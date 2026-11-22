export const DAYS = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu'];
export const hhmm = (t) => (t || '').slice(0, 5);

// يحوّل خطأ الـ API لنص بلغة المستخدم
export function errorText(err, t) {
  const d = err?.response?.data;
  const code = d?.error || 'NETWORK';
  let msg = t('error.' + code);
  if (msg === 'error.' + code) msg = t('error.SERVER_ERROR');
  const det = d?.details;
  if (det?.courses) msg += ` (${det.courses.join(', ')})`;
  else if (det?.course) msg += ` (${det.course})`;
  else if (code === 'CREDIT_LIMIT') msg += ` (${det.current}/${det.max})`;
  else if (code === 'INVALID_GRADE') msg += ` (${det.field} ≤ ${det.max})`;
  return msg;
}

export const gradeTotal = (g, hasPractical) => {
  const keys = hasPractical ? ['coursework', 'midterm', 'practical', 'final_exam'] : ['coursework', 'midterm', 'final_exam'];
  if (keys.some((k) => g[k] === '' || g[k] === null || g[k] === undefined)) return null;
  return Math.round(keys.reduce((s, k) => s + Number(g[k]), 0) * 100) / 100;
};

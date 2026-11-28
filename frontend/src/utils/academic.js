// Regular semester load and the hours required to graduate.
// The home page shows registered hours as "X out of 18" and a bar from 0 to 174.
export const REGULAR_LOAD_HOURS = 18;
export const GRADUATION_HOURS = 174;

export function formatHours(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

// Credits earned fill the bar. Extra hours stay visible in the numbers and cap the bar at 100%.
export function graduationProgress(creditsEarned, total = GRADUATION_HOURS) {
  const raw = Number(creditsEarned);
  const earned = Number.isFinite(raw) ? Math.max(0, raw) : 0;
  const goal = Number(total) > 0 ? Number(total) : GRADUATION_HOURS;
  const percent = goal > 0 ? Math.min(100, (earned / goal) * 100) : 0;
  return { earned, total: goal, percent };
}

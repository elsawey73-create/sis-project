// Log out after this much time with no interaction. Shared by the website and the Android app.
export const INACTIVITY_MS = 5 * 60 * 1000;

export function idleRemaining(lastActivity, now, limit = INACTIVITY_MS) {
  const last = Number(lastActivity);
  const current = Number(now);
  if (!Number.isFinite(last) || !Number.isFinite(current)) return limit;
  return Math.max(0, limit - (current - last));
}

export function idleExpired(lastActivity, now, limit = INACTIVITY_MS) {
  const last = Number(lastActivity);
  const current = Number(now);
  if (!Number.isFinite(last) || !Number.isFinite(current)) return false;
  return current - last >= limit;
}

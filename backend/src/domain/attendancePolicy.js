// Pure attendance rules. Routes call these so the checks can be tested without MySQL.
// QR codes rotate every 20 seconds. Only the token the server currently stores is valid.
// A scan is inside the room when the measured distance, plus the phone's reported
// accuracy, still falls inside the configured radius. A very large accuracy reading
// is rejected instead of widening the fence without limit.

const QR_TTL_SECONDS = 20;
const DEFAULT_RADIUS_M = 20;
const DEFAULT_ACCURACY_CAP_M = 40;
const DEFAULT_ABSENCE_LIMIT_PCT = 25;
const APPROACHING_RATIO = 0.8;
const PHOTO_MAX_BYTES = 400000;
const PHOTO_MIN_BYTES = 32;

function round1(n) {
  return Math.round(n * 10) / 10;
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// doctor* and student* are numbers. radiusM and accuracyCapM are the active limits.
// Returns { ok, code, distanceM, radiusM, allowedM }.
function evaluateLocation({
  doctorLat, doctorLng, studentLat, studentLng, studentAccuracy, radiusM, accuracyCapM,
}) {
  const radius = Number(radiusM);
  const cap = Number(accuracyCapM);
  const coords = [doctorLat, doctorLng, studentLat, studentLng].map((value) => {
    if (value == null || value === '') return NaN;
    return Number(value);
  });
  if (!Number.isFinite(radius) || radius <= 0 || coords.some((n) => !Number.isFinite(n))) {
    return { ok: false, code: 'LOCATION_REQUIRED', distanceM: null, radiusM: Number.isFinite(radius) ? radius : null, allowedM: null };
  }
  if (Math.abs(coords[0]) > 90 || Math.abs(coords[2]) > 90 || Math.abs(coords[1]) > 180 || Math.abs(coords[3]) > 180) {
    return { ok: false, code: 'LOCATION_REQUIRED', distanceM: null, radiusM: radius, allowedM: null };
  }
  const distance = haversineMeters(coords[0], coords[1], coords[2], coords[3]);
  const accuracy = Number(studentAccuracy);
  if (!Number.isFinite(accuracy) || accuracy < 0 || !Number.isFinite(cap) || accuracy > cap) {
    return { ok: false, code: 'GPS_INACCURATE', distanceM: round1(distance), radiusM: radius, allowedM: null };
  }
  const allowed = radius + accuracy;
  const ok = distance <= allowed + 0.05;
  return {
    ok,
    code: ok ? null : 'TOO_FAR',
    distanceM: round1(distance),
    radiusM: radius,
    allowedM: round1(allowed),
  };
}

// The presented token must be the one active row, and that row must still be in the future.
function currentQrAccepts({ presentedToken, activeToken, expiresAtMs, nowMs }) {
  if (!presentedToken || !activeToken) return false;
  if (presentedToken !== activeToken) return false;
  const exp = Number(expiresAtMs);
  const now = Number(nowMs);
  if (!Number.isFinite(exp) || !Number.isFinite(now) || exp <= now) return false;
  return true;
}

// One device records one student per session. The same device may be used again next session.
function deviceDecision({ existingStudentId, studentId }) {
  if (existingStudentId == null || existingStudentId === '') return { ok: true, code: null };
  if (Number(existingStudentId) === Number(studentId)) return { ok: false, code: 'ALREADY_RECORDED' };
  return { ok: false, code: 'DEVICE_ALREADY_USED' };
}

function absenceStanding({ attended, totalSessions, limitPct }) {
  const total = Number(totalSessions) || 0;
  const present = Number(attended) || 0;
  const absent = Math.max(0, total - present);
  const absentPct = total ? Math.round((absent / total) * 1000) / 10 : 0;
  const limit = Number(limitPct);
  const cap = Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_ABSENCE_LIMIT_PCT;
  const warning = total > 0 && absentPct > cap;
  const approaching = total > 0 && !warning && absentPct >= cap * APPROACHING_RATIO;
  return {
    absent,
    absent_pct: absentPct,
    absence_limit_pct: cap,
    warning,
    approaching,
  };
}

function decodePhoto(input) {
  if (input == null || input === '') {
    return { ok: false, code: 'PHOTO_REQUIRED' };
  }
  const raw = String(input).trim();
  const base64 = raw.startsWith('data:') ? raw.slice(raw.indexOf(',') + 1) : raw;
  if (!/^[A-Za-z0-9+/=\s]+$/.test(base64)) return { ok: false, code: 'PHOTO_REQUIRED' };
  let buf;
  try {
    buf = Buffer.from(base64.replace(/\s/g, ''), 'base64');
  } catch {
    return { ok: false, code: 'PHOTO_REQUIRED' };
  }
  if (buf.length < PHOTO_MIN_BYTES || buf.length > PHOTO_MAX_BYTES) return { ok: false, code: 'PHOTO_REQUIRED' };
  if (buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) return { ok: false, code: 'PHOTO_REQUIRED' };
  return { ok: true, buffer: buf, mime: 'image/jpeg' };
}

module.exports = {
  QR_TTL_SECONDS,
  DEFAULT_RADIUS_M,
  DEFAULT_ACCURACY_CAP_M,
  DEFAULT_ABSENCE_LIMIT_PCT,
  APPROACHING_RATIO,
  PHOTO_MAX_BYTES,
  haversineMeters,
  evaluateLocation,
  currentQrAccepts,
  deviceDecision,
  absenceStanding,
  decodePhoto,
};

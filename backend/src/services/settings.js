const db = require('../config/db');

const DEFAULTS = {
  attendance_radius_m: 20,
  attendance_accuracy_cap_m: 40,
  absence_limit_pct: 25,
};

const KEYS = Object.keys(DEFAULTS);

function clampSetting(key, value) {
  const n = Number(value);
  if (!KEYS.includes(key) || !Number.isFinite(n)) return null;
  if (key === 'attendance_radius_m') return Math.round(Math.min(500, Math.max(5, n)));
  if (key === 'attendance_accuracy_cap_m') return Math.round(Math.min(200, Math.max(5, n)));
  return Math.round(Math.min(100, Math.max(1, n)));
}

async function getNumber(key) {
  const fallback = DEFAULTS[key];
  const [[row]] = await db.query('SELECT setting_value FROM app_settings WHERE setting_key = ?', [key]);
  const n = Number(row ? row.setting_value : fallback);
  return Number.isFinite(n) ? n : fallback;
}

async function attendanceLimits() {
  return {
    radiusM: await getNumber('attendance_radius_m'),
    accuracyCapM: await getNumber('attendance_accuracy_cap_m'),
    absenceLimitPct: await getNumber('absence_limit_pct'),
  };
}

async function listSettings() {
  const out = {};
  for (const key of KEYS) out[key] = await getNumber(key);
  return out;
}

async function setSetting(key, value, userId) {
  const stored = clampSetting(key, value);
  if (stored == null) return null;
  await db.query(
    `INSERT INTO app_settings (setting_key, setting_value, updated_by) VALUES (?,?,?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
    [key, String(stored), userId || null]
  );
  return stored;
}

module.exports = { DEFAULTS, KEYS, clampSetting, getNumber, attendanceLimits, listSettings, setSetting };

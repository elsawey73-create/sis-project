const PREFERENCE_TYPES = [
  'grades_published',
  'message',
  'marked_absent',
  'absence_warning',
  'announcement',
  'exam_reminder',
  'registration_open',
];

async function allows(q, userId, type) {
  try {
    const [[pref]] = await q.query(
      'SELECT enabled FROM notification_preferences WHERE user_id = ? AND type = ?',
      [userId, type]
    );
    if (pref && Number(pref.enabled) === 0) return false;
    return true;
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE') return true;
    throw err;
  }
}

async function notify(q, userId, type, data = {}) {
  if (!(await allows(q, userId, type))) return false;
  await q.query('INSERT INTO notifications (user_id, type, data) VALUES (?,?,?)', [
    userId,
    type,
    JSON.stringify(data),
  ]);
  return true;
}

// Inserts once per user and key. A repeated key does not create another row.
async function notifyOnce(q, userId, type, dedupKey, data = {}) {
  try {
    await q.query('INSERT INTO notification_dedup (user_id, dedup_key) VALUES (?,?)', [userId, dedupKey]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return false;
    if (err.code === 'ER_NO_SUCH_TABLE') return notify(q, userId, type, data);
    throw err;
  }
  return notify(q, userId, type, data);
}

module.exports = { notify, notifyOnce, PREFERENCE_TYPES };

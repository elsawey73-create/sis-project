const db = require('../config/db');

// Best-effort. A missing table or a long detail must not fail the mutation itself.
async function audit(actorId, action, entity, entityId, detail) {
  const text = detail == null ? null : String(detail).slice(0, 500);
  try {
    await db.query(
      'INSERT INTO activity_log (actor_id, action, entity, entity_id, detail) VALUES (?,?,?,?,?)',
      [actorId || null, String(action).slice(0, 64), String(entity).slice(0, 64), entityId == null ? null : String(entityId).slice(0, 64), text]
    );
  } catch (err) {
    console.error('activity log failed:', err.message);
  }
}

module.exports = { audit };

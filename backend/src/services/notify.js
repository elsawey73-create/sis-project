async function notify(q, userId, type, data = {}) {
  await q.query('INSERT INTO notifications (user_id, type, data) VALUES (?,?,?)', [
    userId,
    type,
    JSON.stringify(data),
  ]);
}
module.exports = { notify };

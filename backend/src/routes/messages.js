const express = require('express');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { HttpError } = require('../utils/errors');
const { withTx } = require('../utils/tx');
const { notify } = require('../services/notify');

const messages = express.Router();
const notifications = express.Router();
const who = [authenticate, authorize('student', 'instructor')];

// People the caller may message. Students see their instructors. Instructors see their students.
async function contactsFor(user) {
  const sql =
    user.role === 'student'
      ? `SELECT DISTINCT u.id, u.full_name_ar, u.full_name_en, u.role, o.id AS offering_id, c.code AS course_code
         FROM enrollments e JOIN course_offerings o ON o.id = e.offering_id
         JOIN users u ON u.id = o.instructor_id JOIN courses c ON c.id = o.course_id
         WHERE e.student_id = ? AND e.status <> 'dropped'`
      : `SELECT DISTINCT u.id, u.full_name_ar, u.full_name_en, u.role, o.id AS offering_id, c.code AS course_code
         FROM course_offerings o JOIN enrollments e ON e.offering_id = o.id AND e.status <> 'dropped'
         JOIN users u ON u.id = e.student_id JOIN courses c ON c.id = o.course_id
         WHERE o.instructor_id = ?`;
  const [rows] = await db.query(sql, [user.id]);
  return rows;
}

const nameOf = async (id) => (await db.query('SELECT full_name_ar, full_name_en FROM users WHERE id = ?', [id]))[0][0];

messages.get('/contacts', who, async (req, res) => res.json(await contactsFor(req.user)));

messages.get('/threads', who, async (req, res) => {
  const me = req.user.id;
  const [roots] = await db.query(
    `SELECT t.id, t.subject, t.offering_id, t.sender_id, c.code AS course_code,
            ou.id AS other_id, ou.full_name_ar AS other_ar, ou.full_name_en AS other_en, ou.role AS other_role
     FROM messages t
     JOIN users ou ON ou.id = IF(t.sender_id = ?, t.receiver_id, t.sender_id)
     LEFT JOIN course_offerings o ON o.id = t.offering_id
     LEFT JOIN courses c ON c.id = o.course_id
     WHERE t.parent_id IS NULL AND (t.sender_id = ? OR t.receiver_id = ?)`,
    [me, me, me]
  );
  if (!roots.length) return res.json([]);
  const ids = roots.map((r) => r.id);
  const [last] = await db.query(
    `SELECT m.body, m.created_at, COALESCE(m.parent_id, m.id) AS tid FROM messages m
     WHERE m.id IN (SELECT MAX(id) FROM messages WHERE COALESCE(parent_id, id) IN (?) GROUP BY COALESCE(parent_id, id))`,
    [ids]
  );
  const [unread] = await db.query(
    'SELECT COALESCE(parent_id, id) AS tid, COUNT(*) AS n FROM messages WHERE receiver_id = ? AND is_read = 0 AND COALESCE(parent_id, id) IN (?) GROUP BY tid',
    [me, ids]
  );
  const lastBy = Object.fromEntries(last.map((l) => [l.tid, l]));
  const unreadBy = Object.fromEntries(unread.map((u) => [u.tid, u.n]));
  const out = roots
    .map((r) => ({ ...r, last_body: lastBy[r.id]?.body, last_at: lastBy[r.id]?.created_at, unread: unreadBy[r.id] || 0 }))
    .sort((a, b) => (a.last_at < b.last_at ? 1 : -1));
  res.json(out);
});

async function getThread(req) {
  const me = req.user.id;
  const [[root]] = await db.query(
    `SELECT t.*, c.code AS course_code,
            ou.id AS other_id, ou.full_name_ar AS other_ar, ou.full_name_en AS other_en, ou.role AS other_role
     FROM messages t
     JOIN users ou ON ou.id = IF(t.sender_id = ?, t.receiver_id, t.sender_id)
     LEFT JOIN course_offerings o ON o.id = t.offering_id
     LEFT JOIN courses c ON c.id = o.course_id
     WHERE t.id = ? AND t.parent_id IS NULL AND (t.sender_id = ? OR t.receiver_id = ?)`,
    [me, req.params.id, me, me]
  );
  if (!root) throw new HttpError(404, 'NOT_FOUND');
  return root;
}

messages.get('/threads/:id', who, async (req, res) => {
  const root = await getThread(req);
  const [msgs] = await db.query(
    `SELECT m.id, m.sender_id, m.body, m.created_at, u.full_name_ar, u.full_name_en
     FROM messages m JOIN users u ON u.id = m.sender_id
     WHERE m.id = ? OR m.parent_id = ? ORDER BY m.id`,
    [root.id, root.id]
  );
  await db.query('UPDATE messages SET is_read = 1 WHERE receiver_id = ? AND (id = ? OR parent_id = ?)', [req.user.id, root.id, root.id]);
  res.json({
    thread: { id: root.id, subject: root.subject, course_code: root.course_code, other_id: root.other_id, other_ar: root.other_ar, other_en: root.other_en, other_role: root.other_role },
    messages: msgs,
  });
});

function cleanBody(b) {
  const body = String(b || '').trim();
  if (!body || body.length > 5000) throw new HttpError(400, 'MISSING_FIELDS');
  return body;
}

// New thread.
messages.post('/threads', who, async (req, res) => {
  const { receiver_id, offering_id, subject } = req.body;
  const body = cleanBody(req.body.body);
  if (!receiver_id || !String(subject || '').trim()) throw new HttpError(400, 'MISSING_FIELDS');

  const contacts = await contactsFor(req.user);
  if (!contacts.some((c) => c.id === Number(receiver_id))) throw new HttpError(403, 'FORBIDDEN');
  const offId = contacts.some((c) => c.id === Number(receiver_id) && c.offering_id === Number(offering_id)) ? offering_id : null;

  const id = await withTx(async (conn) => {
    const [r] = await conn.query(
      'INSERT INTO messages (sender_id, receiver_id, offering_id, subject, body) VALUES (?,?,?,?,?)',
      [req.user.id, receiver_id, offId, String(subject).trim().slice(0, 150), body]
    );
    const me = await nameOf(req.user.id);
    await notify(conn, receiver_id, 'message', { thread_id: r.insertId, from_ar: me.full_name_ar, from_en: me.full_name_en });
    return r.insertId;
  });
  res.status(201).json({ id });
});

// Reply.
messages.post('/threads/:id/reply', who, async (req, res) => {
  const root = await getThread(req);
  const body = cleanBody(req.body.body);
  const receiver = root.sender_id === req.user.id ? root.receiver_id : root.sender_id;
  await withTx(async (conn) => {
    await conn.query(
      'INSERT INTO messages (sender_id, receiver_id, offering_id, parent_id, body) VALUES (?,?,?,?,?)',
      [req.user.id, receiver, root.offering_id, root.id, body]
    );
    const me = await nameOf(req.user.id);
    await notify(conn, receiver, 'message', { thread_id: root.id, from_ar: me.full_name_ar, from_en: me.full_name_en });
  });
  res.status(201).json({ ok: true });
});

// ---------- Notifications ----------
notifications.get('/', authenticate, async (req, res) => {
  const [rows] = await db.query('SELECT id, type, data, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50', [req.user.id]);
  rows.forEach((r) => { try { r.data = JSON.parse(r.data || '{}'); } catch { r.data = {}; } });
  res.json(rows);
});

notifications.get('/summary', authenticate, async (req, res) => {
  const [[n]] = await db.query('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0', [req.user.id]);
  const [[m]] = await db.query('SELECT COUNT(*) AS c FROM messages WHERE receiver_id = ? AND is_read = 0', [req.user.id]);
  res.json({ notifications: n.c, messages: m.c });
});

notifications.post('/read-all', authenticate, async (req, res) => {
  await db.query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
  res.json({ ok: true });
});

module.exports = { messages, notifications };

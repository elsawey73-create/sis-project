const db = require('../config/db');
const { HttpError } = require('./errors');

const DAYS = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu'];
const TYPES = ['lecture', 'section', 'lab'];

// يضيف مواعيد المحاضرات لكل صف (offering)
async function attachMeetings(rows, idField = 'id') {
  const ids = rows.map((r) => r[idField]);
  const map = {};
  if (ids.length) {
    const [ms] = await db.query(
      `SELECT id, offering_id, day_of_week, start_time, end_time, room, type
       FROM offering_meetings WHERE offering_id IN (?)
       ORDER BY FIELD(day_of_week,'Sat','Sun','Mon','Tue','Wed','Thu'), start_time`,
      [ids]
    );
    ms.forEach((m) => (map[m.offering_id] ||= []).push(m));
  }
  rows.forEach((r) => (r.meetings = map[r[idField]] || []));
  return rows;
}

function validateMeetings(list) {
  if (!Array.isArray(list)) return [];
  return list.map((m) => {
    const ok =
      DAYS.includes(m.day_of_week) &&
      /^\d{2}:\d{2}(:\d{2})?$/.test(m.start_time || '') &&
      /^\d{2}:\d{2}(:\d{2})?$/.test(m.end_time || '') &&
      m.start_time < m.end_time &&
      String(m.room || '').trim() &&
      TYPES.includes(m.type || 'lecture');
    if (!ok) throw new HttpError(400, 'INVALID_MEETING');
    return { ...m, type: m.type || 'lecture', room: String(m.room).trim() };
  });
}

async function saveMeetings(conn, offeringId, meetings) {
  await conn.query('DELETE FROM offering_meetings WHERE offering_id = ?', [offeringId]);
  for (const m of meetings) {
    await conn.query(
      'INSERT INTO offering_meetings (offering_id, day_of_week, start_time, end_time, room, type) VALUES (?,?,?,?,?,?)',
      [offeringId, m.day_of_week, m.start_time, m.end_time, m.room, m.type]
    );
  }
}

module.exports = { attachMeetings, validateMeetings, saveMeetings, DAYS };

const db = require('../config/db');

// يشغّل مجموعة استعلامات كـ Transaction واحدة (يا كلها يا ولا حاجة)
async function withTx(fn) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
module.exports = { withTx };

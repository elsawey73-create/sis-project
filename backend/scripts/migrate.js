// Creates the database when needed, applies sql/001_init.sql on an empty
// database, adds columns this code requires on a database that already
// has tables, then applies later sql/NNN_*.sql files that are not recorded.
// Later files must be safe to run again (CREATE TABLE IF NOT EXISTS, and so on).
// Usage: npm run db:init
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { databaseConfig } = require('../src/config/env');

const db = databaseConfig();
const dbName = db.database;
if (!/^[A-Za-z0-9_]+$/.test(dbName)) {
  console.error('DB_NAME may contain only letters, numbers, and underscores.');
  process.exit(1);
}

function statements(sql) {
  return sql
    .replace(/--[^\n]*/g, '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
}

async function hasTable(conn, name) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [name]
  );
  return rows.length > 0;
}

async function hasColumn(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows.length > 0;
}

async function applied(conn, id) {
  const [rows] = await conn.query('SELECT id FROM schema_migrations WHERE id = ?', [id]);
  return rows.length > 0;
}

async function mark(conn, id) {
  await conn.query('INSERT IGNORE INTO schema_migrations (id) VALUES (?)', [id]);
}

async function patchExisting(conn) {
  if (await hasTable(conn, 'users') && !(await hasColumn(conn, 'users', 'token_version'))) {
    await conn.query('ALTER TABLE users ADD COLUMN token_version INT NOT NULL DEFAULT 0');
    console.log('Added users.token_version');
  }

  if (!(await hasTable(conn, 'attendance_sessions'))) return;

  if (!(await hasColumn(conn, 'attendance_sessions', 'token_ttl_seconds'))) {
    await conn.query('ALTER TABLE attendance_sessions ADD COLUMN token_ttl_seconds INT NOT NULL DEFAULT 30');
    console.log('Added attendance_sessions.token_ttl_seconds');
  } else {
    await conn.query(
      'UPDATE attendance_sessions SET token_ttl_seconds = 30 WHERE token_ttl_seconds IS NULL OR token_ttl_seconds = 0'
    );
    await conn.query('ALTER TABLE attendance_sessions MODIFY token_ttl_seconds INT NOT NULL DEFAULT 30');
  }

  if (!(await hasColumn(conn, 'attendance_sessions', 'late_after_minutes'))) {
    await conn.query('ALTER TABLE attendance_sessions ADD COLUMN late_after_minutes INT NOT NULL DEFAULT 15');
    console.log('Added attendance_sessions.late_after_minutes');
  } else {
    await conn.query(
      'UPDATE attendance_sessions SET late_after_minutes = 15 WHERE late_after_minutes IS NULL'
    );
    await conn.query('ALTER TABLE attendance_sessions MODIFY late_after_minutes INT NOT NULL DEFAULT 15');
  }
}

(async () => {
  const server = await mysql.createConnection({
    host: db.host,
    user: db.user,
    password: db.password,
    multipleStatements: true,
  });
  await server.query(
    `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await server.end();

  const conn = await mysql.createConnection({
    host: db.host,
    user: db.user,
    password: db.password,
    database: dbName,
    multipleStatements: true,
  });

  await conn.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      id VARCHAR(64) PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );

  const usersExist = await hasTable(conn, 'users');
  if (!usersExist) {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'sql', '001_init.sql'), 'utf8');
    for (const statement of statements(sql)) await conn.query(statement);
    await mark(conn, '001_init');
    console.log('Applied sql/001_init.sql');
  } else if (!(await applied(conn, '001_init'))) {
    await mark(conn, '001_init');
    console.log('Tables already exist. Recorded 001_init without recreating them.');
  } else {
    console.log('001_init already recorded.');
  }

  await patchExisting(conn);
  await mark(conn, '002_token_and_attendance_defaults');

  const sqlDir = path.join(__dirname, '..', 'sql');
  const later = fs
    .readdirSync(sqlDir)
    .filter((name) => /^\d{3}_.+\.sql$/.test(name) && name !== '001_init.sql')
    .sort();
  for (const filename of later) {
    const id = filename.replace(/\.sql$/, '');
    if (await applied(conn, id)) {
      console.log(`${id} already recorded.`);
      continue;
    }
    const sql = fs.readFileSync(path.join(sqlDir, filename), 'utf8');
    for (const statement of statements(sql)) await conn.query(statement);
    await mark(conn, id);
    console.log(`Applied sql/${filename}`);
  }

  console.log(`Database \`${dbName}\` is ready.`);
  await conn.end();
})().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

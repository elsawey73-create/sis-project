const mysql = require('mysql2/promise');
const { databaseConfig } = require('./env');

const pool = mysql.createPool({
  ...databaseConfig(),
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,     // Return dates as strings such as "2026-09-01".
  decimalNumbers: true,  // Return DECIMAL columns as numbers.
});

module.exports = pool;

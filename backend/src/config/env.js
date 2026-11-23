// Database settings from the environment.
// Development may omit them. Production must set them.
require('dotenv').config();

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function missing(name) {
  console.error(`${name} is required when NODE_ENV=production.`);
  process.exit(1);
}

// Empty string counts as unset for host, user, and database name.
function fromEnv(name, devFallback) {
  const value = process.env[name];
  if (value !== undefined && value !== '') return value;
  if (!isProduction()) return devFallback;
  missing(name);
}

// An explicit empty password is kept. Only a missing variable falls back, and only in development.
function dbPassword() {
  if (process.env.DB_PASSWORD !== undefined) return process.env.DB_PASSWORD;
  if (!isProduction()) return '';
  missing('DB_PASSWORD');
}

function databaseConfig() {
  return {
    host: fromEnv('DB_HOST', 'localhost'),
    user: fromEnv('DB_USER', 'root'),
    password: dbPassword(),
    database: fromEnv('DB_NAME', 'unidex_db'),
  };
}

module.exports = { isProduction, databaseConfig };

const express = require('express');
const cors = require('cors');
const { isProduction } = require('./config/env');
const { authenticate, authorize } = require('./middleware/auth');
const { HttpError } = require('./utils/errors');

function assertRuntimeConfig() {
  if (!process.env.JWT_SECRET) {
    console.error('JWT_SECRET is required. Set it in backend/.env.');
    process.exit(1);
  }
  if (isProduction() && process.env.JWT_SECRET.length < 32) {
    console.error('JWT_SECRET must be at least 32 characters when NODE_ENV=production.');
    process.exit(1);
  }
}

function corsMiddleware() {
  const list = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (isProduction() && list.length === 0) {
    console.error('Set CORS_ORIGINS (comma-separated) when NODE_ENV=production.');
    process.exit(1);
  }
  if (list.length === 0) {
    console.warn('CORS is open to every origin so a phone on the LAN can call the API. Set CORS_ORIGINS before a shared deployment.');
    return cors();
  }
  return cors({ origin: list });
}

assertRuntimeConfig();

const app = express();
app.use(corsMiddleware());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok', app: 'Unidex' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/catalog')); // departments, courses, semesters, instructors
app.use('/api/offerings', require('./routes/offerings'));
app.use('/api/enrollments', require('./routes/enrollments'));
app.use('/api/instructor', require('./routes/instructor'));
app.use('/api/student', require('./routes/student'));
app.use('/api/attendance', require('./routes/attendance'));
const { messages, notifications } = require('./routes/messages');
app.use('/api/messages', messages);
app.use('/api/notifications', notifications);

app.get('/api/admin/ping', authenticate, authorize('admin'), (req, res) => res.json({ message: 'Hello admin' }));
app.use('/api/admin', require('./routes/admin'));

// Turn thrown errors into { error: CODE }. The frontend translates the code.
app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.code, details: err.details });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'MISSING_FIELDS' });
  if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'DUPLICATE' });
  if (err.code === 'ER_ROW_IS_REFERENCED_2') return res.status(409).json({ error: 'IN_USE' });
  if (err.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ error: 'INVALID_REFERENCE' });
  console.error(err);
  res.status(500).json({ error: 'SERVER_ERROR' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Unidex API running on http://localhost:${PORT}`));

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { authenticate, authorize } = require('./middleware/auth');
const { HttpError } = require('./utils/errors');

const app = express();
app.use(cors()); // للتطوير: أي عنوان (عشان الموبايل على الشبكة يقدر يكلم السيرفر)
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

// معالج الأخطاء المركزي: بيحوّل أي خطأ لرد JSON بكود (الفرونت بيترجمه)
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

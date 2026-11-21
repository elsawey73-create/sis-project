require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { authenticate, authorize } = require('./middleware/auth');

const app = express();
app.use(cors({ origin: 'http://localhost:5173' })); // عنوان Vite
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', require('./routes/auth'));

// مثال لاختبار الصلاحيات: للأدمن بس
app.get('/api/admin/ping', authenticate, authorize('admin'), (req, res) => {
  res.json({ message: 'أهلاً يا أدمن' });
});

// أي خطأ غير متوقع
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'حصل خطأ في السيرفر' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

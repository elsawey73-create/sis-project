const jwt = require('jsonwebtoken');

// بنرجّع "كود" الخطأ والفرونت هو اللي بيترجمه للغة المستخدم

// يتأكد إن المستخدم باعت توكن سليم
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'UNAUTHENTICATED' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.id, role: payload.role };
    next();
  } catch {
    res.status(401).json({ error: 'SESSION_EXPIRED' });
  }
}

// يسمح بس للأدوار المحددة: authorize('admin') أو authorize('instructor','admin')
function authorize(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    next();
  };
}

module.exports = { authenticate, authorize };

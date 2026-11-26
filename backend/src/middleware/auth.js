const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { isJwtError } = require('../utils/tokens');

// Handlers return an error code. The frontend translates it.

// Require a valid access token whose tv still matches users.token_version.
// A refresh token cannot call these routes. Tokens issued before typ existed
// have no typ claim and stay valid until they expire.
async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'UNAUTHENTICATED' });

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    if (isJwtError(err)) return res.status(401).json({ error: 'SESSION_EXPIRED' });
    return next(err);
  }
  if (payload.typ != null && payload.typ !== 'access') {
    return res.status(401).json({ error: 'SESSION_EXPIRED' });
  }

  try {
    const [rows] = await db.query('SELECT token_version, role FROM users WHERE id = ?', [payload.id]);
    if (!rows[0] || Number(rows[0].token_version) !== Number(payload.tv)) {
      return res.status(401).json({ error: 'SESSION_EXPIRED' });
    }
    // users.role is the source of truth. A role edited in the database applies on the next request.
    req.user = { id: payload.id, role: rows[0].role };
    next();
  } catch (err) {
    next(err);
  }
}

// Restrict the route. Example: authorize('admin') or authorize('instructor', 'admin').
function authorize(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    next();
  };
}

module.exports = { authenticate, authorize };

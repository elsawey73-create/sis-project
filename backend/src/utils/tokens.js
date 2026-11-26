const jwt = require('jsonwebtoken');

// Access tokens are short. Refresh tokens keep the previous 7-day session length.
const ACCESS_TTL_SECONDS = 7200;
const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;

// A separate refresh secret is optional. Production keeps working when it is unset.
function refreshSecret() {
  const dedicated = process.env.JWT_REFRESH_SECRET;
  if (dedicated !== undefined && dedicated !== '') return dedicated;
  return process.env.JWT_SECRET;
}

function signAccessToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, tv: Number(user.token_version || 0), typ: 'access' },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TTL_SECONDS }
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, tv: Number(user.token_version || 0), typ: 'refresh' },
    refreshSecret(),
    { expiresIn: REFRESH_TTL_SECONDS }
  );
}

function isJwtError(err) {
  return !!err && (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError' || err.name === 'NotBeforeError');
}

module.exports = {
  ACCESS_TTL_SECONDS,
  REFRESH_TTL_SECONDS,
  refreshSecret,
  signAccessToken,
  signRefreshToken,
  isJwtError,
};

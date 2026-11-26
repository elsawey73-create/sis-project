// Session-token checks. No database: the user lookup is stubbed.
// Usage: npm run test:tokens
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'local_dev_jwt_secret_at_least_32_chars';
delete process.env.JWT_REFRESH_SECRET;

const user = {
  id: 42,
  login_id: 'token-test',
  password_hash: bcrypt.hashSync('Secret#123', 8),
  full_name_ar: 'اختبار',
  full_name_en: 'Token Test',
  role: 'student',
  preferred_lang: 'en',
  token_version: 3,
  email: 'token-test@example.com',
};

const fakeDb = {
  async query(sql, params) {
    const text = String(sql);
    if (text.includes('WHERE login_id = ?')) {
      return [params[0] === user.login_id ? [user] : []];
    }
    if (text.includes('token_version = token_version + 1')) {
      if (Number(params[0]) !== user.id) return [{ affectedRows: 0 }];
      user.token_version += 1;
      return [{ affectedRows: 1 }];
    }
    if (text.includes('FROM users WHERE id = ?')) {
      if (Number(params[0]) !== user.id) return [[]];
      return [[{ token_version: user.token_version, role: user.role }]];
    }
    throw new Error(`unexpected SQL: ${text}`);
  },
  async end() {},
};

const dbPath = require.resolve('../src/config/db');
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: fakeDb,
};

const { login, refresh, logout } = require('../src/controllers/authController');
const { authenticate } = require('../src/middleware/auth');
const authRouter = require('../src/routes/auth');
const { ACCESS_TTL_SECONDS, REFRESH_TTL_SECONDS } = require('../src/utils/tokens');

function assert(condition, message) {
  if (!condition) {
    console.error('FAIL:', message);
    throw new Error(message);
  }
  console.log('ok', message);
}

async function invoke(handler, { body = {}, user: reqUser = null, headers = {} } = {}) {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  const req = {
    body,
    headers,
    user: reqUser,
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    get() {
      return '';
    },
  };
  await handler(req, res);
  return res;
}

function authenticateWith(token) {
  return new Promise((resolve, reject) => {
    const req = { headers: { authorization: token ? `Bearer ${token}` : '' } };
    const res = {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        resolve({ statusCode: this.statusCode, body: payload, next: false, user: req.user });
        return this;
      },
    };
    Promise.resolve(
      authenticate(req, res, () => {
        resolve({ statusCode: 200, body: null, next: true, user: req.user });
      })
    ).catch(reject);
  });
}

function expired(payload, secret) {
  return jwt.sign({ ...payload, exp: Math.floor(Date.now() / 1000) - 30 }, secret);
}

(async () => {
  assert(ACCESS_TTL_SECONDS === 7200, 'access TTL constant is 7200 seconds');
  assert(REFRESH_TTL_SECONDS === 7 * 24 * 60 * 60, 'refresh TTL constant is 7 days');

  const routes = authRouter.stack
    .filter((layer) => layer.route)
    .map((layer) => `${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`);
  assert(routes.includes('POST /refresh'), 'POST /refresh is registered');

  const session = await invoke(login, { body: { login_id: user.login_id, password: 'Secret#123' } });
  assert(session.statusCode === 200 && session.body.token && session.body.refresh_token, 'login returns an access token and a refresh token');
  assert(session.body.user && session.body.user.login_id === user.login_id && !session.body.user.password_hash, 'login still returns the public user');

  const access = jwt.decode(session.body.token);
  const refreshTok = jwt.decode(session.body.refresh_token);
  assert(access.typ === 'access' && access.exp - access.iat === 7200, 'access token exp is 7200 seconds');
  assert(refreshTok.typ === 'refresh' && refreshTok.exp - refreshTok.iat === REFRESH_TTL_SECONDS, 'refresh token exp is 7 days');
  jwt.verify(session.body.refresh_token, process.env.JWT_SECRET);
  assert(true, 'unset JWT_REFRESH_SECRET signs refresh tokens with JWT_SECRET');

  const legacy = jwt.sign(
    { id: user.id, role: 'instructor', tv: user.token_version },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
  const legacyResult = await authenticateWith(legacy);
  assert(legacyResult.next === true && legacyResult.user.role === user.role, 'legacy access token without typ still authenticates');
  assert(!jwt.decode(legacy).typ, 'legacy fixture has no typ claim');

  const typedAccess = await authenticateWith(session.body.token);
  assert(typedAccess.next === true && typedAccess.user.id === user.id, 'new access token authenticates');

  const refreshAsAccess = await authenticateWith(session.body.refresh_token);
  assert(
    refreshAsAccess.next === false && refreshAsAccess.statusCode === 401 && refreshAsAccess.body.error === 'SESSION_EXPIRED',
    'refresh token cannot access protected routes'
  );

  const renewed = await invoke(refresh, { body: { refresh_token: session.body.refresh_token } });
  assert(renewed.statusCode === 200 && typeof renewed.body.token === 'string', 'POST /api/auth/refresh issues a new access token');
  const renewedClaims = jwt.decode(renewed.body.token);
  assert(renewedClaims.typ === 'access' && renewedClaims.exp - renewedClaims.iat === 7200, 'refreshed access token exp is 7200 seconds');
  assert(!Object.prototype.hasOwnProperty.call(renewed.body, 'refresh_token'), 'refresh response keeps the existing refresh token');
  const renewedAuth = await authenticateWith(renewed.body.token);
  assert(renewedAuth.next === true, 'refreshed access token authenticates');

  user.role = 'admin';
  const roleRefresh = await invoke(refresh, { body: { refresh_token: session.body.refresh_token } });
  assert(jwt.decode(roleRefresh.body.token).role === 'admin', 'refreshed access token uses the role from the database');
  user.role = 'student';

  const accessAsRefresh = await invoke(refresh, { body: { refresh_token: session.body.token } });
  assert(accessAsRefresh.statusCode === 401 && accessAsRefresh.body.error === 'SESSION_EXPIRED' && !accessAsRefresh.body.token, 'access token cannot mint a new token');

  const legacyAsRefresh = await invoke(refresh, { body: { refresh_token: legacy } });
  assert(legacyAsRefresh.statusCode === 401 && legacyAsRefresh.body.error === 'SESSION_EXPIRED', 'legacy access token cannot mint a new token');

  const missing = await invoke(refresh, { body: {} });
  assert(missing.statusCode === 401 && missing.body.error === 'UNAUTHENTICATED', 'refresh without a token is rejected');

  const headerOnly = await invoke(refresh, {
    body: {},
    headers: { authorization: `Bearer ${session.body.refresh_token}` },
  });
  assert(headerOnly.statusCode === 401 && headerOnly.body.error === 'UNAUTHENTICATED', 'refresh token in the Authorization header is not enough');

  const garbage = await invoke(refresh, { body: { refresh_token: 'not-a-token' } });
  assert(garbage.statusCode === 401 && garbage.body.error === 'SESSION_EXPIRED', 'invalid refresh token is rejected');

  const wrongSecret = jwt.sign(
    { id: user.id, role: user.role, tv: user.token_version, typ: 'refresh' },
    'different_secret_value_at_least_32',
    { expiresIn: REFRESH_TTL_SECONDS }
  );
  const badSig = await invoke(refresh, { body: { refresh_token: wrongSecret } });
  assert(badSig.statusCode === 401 && badSig.body.error === 'SESSION_EXPIRED', 'refresh token signed with the wrong secret is rejected');

  const stale = expired(
    { id: user.id, role: user.role, tv: user.token_version, typ: 'refresh' },
    process.env.JWT_SECRET
  );
  const expiredRefresh = await invoke(refresh, { body: { refresh_token: stale } });
  assert(expiredRefresh.statusCode === 401 && expiredRefresh.body.error === 'SESSION_EXPIRED', 'expired refresh token is rejected');

  const expiredAccess = expired(
    { id: user.id, role: user.role, tv: user.token_version, typ: 'access' },
    process.env.JWT_SECRET
  );
  const expiredAccessResult = await authenticateWith(expiredAccess);
  assert(expiredAccessResult.statusCode === 401 && expiredAccessResult.body.error === 'SESSION_EXPIRED', 'expired access token is rejected');

  const authed = await authenticateWith(session.body.token);
  const loggedOut = await invoke(logout, { user: authed.user });
  assert(loggedOut.statusCode === 200 && loggedOut.body.ok === true, 'logout still succeeds');
  const revokedAccess = await authenticateWith(session.body.token);
  assert(revokedAccess.statusCode === 401 && revokedAccess.body.error === 'SESSION_EXPIRED', 'logout revokes the access token');
  const revokedRefresh = await invoke(refresh, { body: { refresh_token: session.body.refresh_token } });
  assert(revokedRefresh.statusCode === 401 && revokedRefresh.body.error === 'SESSION_EXPIRED', 'logout revokes the refresh token');

  process.env.JWT_REFRESH_SECRET = '';
  const blankSecret = await invoke(login, { body: { login_id: user.login_id, password: 'Secret#123' } });
  jwt.verify(blankSecret.body.refresh_token, process.env.JWT_SECRET);
  assert(blankSecret.statusCode === 200, 'empty JWT_REFRESH_SECRET falls back to JWT_SECRET');

  process.env.JWT_REFRESH_SECRET = 'dedicated_refresh_secret_at_least_32';
  const oldRefresh = await invoke(refresh, { body: { refresh_token: blankSecret.body.refresh_token } });
  assert(oldRefresh.statusCode === 401, 'a refresh token from the access secret is rejected once a dedicated secret is set');

  const dedicated = await invoke(login, { body: { login_id: user.login_id, password: 'Secret#123' } });
  jwt.verify(dedicated.body.token, process.env.JWT_SECRET);
  jwt.verify(dedicated.body.refresh_token, process.env.JWT_REFRESH_SECRET);
  let accessSecretRejected = false;
  try {
    jwt.verify(dedicated.body.refresh_token, process.env.JWT_SECRET);
  } catch (err) {
    accessSecretRejected = err.name === 'JsonWebTokenError';
  }
  assert(accessSecretRejected, 'dedicated refresh secret does not verify with JWT_SECRET');
  const dedicatedAuth = await authenticateWith(dedicated.body.refresh_token);
  assert(dedicatedAuth.statusCode === 401 && dedicatedAuth.next === false, 'dedicated refresh token cannot access protected routes');
  const dedicatedRenewed = await invoke(refresh, { body: { refresh_token: dedicated.body.refresh_token } });
  assert(dedicatedRenewed.statusCode === 200 && jwt.decode(dedicatedRenewed.body.token).typ === 'access', 'dedicated refresh secret still issues an access token');
  const dedicatedLegacy = await authenticateWith(legacy);
  assert(dedicatedLegacy.statusCode === 401, 'legacy token is not accepted after logout bumped token_version');

  const currentLegacy = jwt.sign(
    { id: user.id, role: user.role, tv: user.token_version },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
  const currentLegacyResult = await authenticateWith(currentLegacy);
  assert(currentLegacyResult.next === true, 'legacy access token still authenticates when JWT_REFRESH_SECRET is set');

  delete process.env.JWT_REFRESH_SECRET;
  console.log('Auth token test passed.');
})().catch((err) => {
  console.error('Auth token test failed:', err.message);
  process.exit(1);
});

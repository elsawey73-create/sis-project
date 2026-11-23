// Dev-only password reset test. Mocks the Resend SDK and talks to the local database.
// Usage: npm run test:reset
if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to run the password reset test while NODE_ENV=production.');
  process.exit(1);
}

const Module = require('module');
const path = require('path');
const { execSync } = require('child_process');

const resendPkg = require(path.join(__dirname, '..', 'node_modules', 'resend', 'package.json'));
if (resendPkg.name !== 'resend') {
  console.error('The official resend package is not installed.');
  process.exit(1);
}

const mailState = { mode: 'ok', sent: [], keys: [] };

class FakeResend {
  constructor(key) {
    mailState.keys.push(key);
    this.emails = {
      send: async (payload) => {
        if (mailState.mode === 'throw') throw new Error('network down');
        if (mailState.mode === 'api-error') return { data: null, error: { message: 'domain not verified' } };
        mailState.sent.push(payload);
        return { data: { id: 'email_test' }, error: null };
      },
    };
  }
}

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === 'resend') return { Resend: FakeResend };
  return originalLoad.call(this, request, parent, isMain);
};

process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'local_dev_jwt_secret_at_least_32_chars';
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
process.env.DB_USER = process.env.DB_USER || 'root';
process.env.DB_PASSWORD = process.env.DB_PASSWORD === undefined ? '' : process.env.DB_PASSWORD;
process.env.DB_NAME = process.env.DB_NAME || 'unidex_db';
process.env.FRONTEND_URL = 'http://localhost:5173';
delete process.env.RESEND_API_KEY;
delete process.env.RESEND_FROM;
delete process.env.PASSWORD_RESET_RETURN_LINK;

const warnings = [];
const errors = [];
const realWarn = console.warn;
const realError = console.error;
console.warn = (...args) => {
  warnings.push(args.map(String).join(' '));
  realWarn(...args);
};
console.error = (...args) => {
  errors.push(args.map(String).join(' '));
  realError(...args);
};

function assert(condition, message) {
  if (!condition) {
    realError('FAIL:', message);
    throw new Error(message);
  }
  realWarn('ok', message);
}

function tokenFromLink(link) {
  const url = new URL(link);
  return url.searchParams.get('token');
}

async function invoke(handler, { body = {}, ip = '10.9.0.1', origin = '' } = {}) {
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
    headers: {},
    ip,
    socket: { remoteAddress: ip },
    get(name) {
      return String(name).toLowerCase() === 'origin' ? origin : '';
    },
  };
  await handler(req, res);
  return res;
}

(async () => {
  const crypto = require('crypto');
  const bcrypt = require('bcryptjs');
  const migrateEnv = { ...process.env };
  const first = execSync('node scripts/migrate.js', { cwd: path.join(__dirname, '..'), env: migrateEnv, encoding: 'utf8' });
  const second = execSync('node scripts/migrate.js', { cwd: path.join(__dirname, '..'), env: migrateEnv, encoding: 'utf8' });
  assert(second.includes('003_password_reset_tokens already recorded.'), 'second migrate leaves 003 recorded');
  assert(first.includes('003_password_reset_tokens') || second.includes('003_password_reset_tokens'), 'migration mentions 003');

  const db = require('../src/config/db');
  const { forgotPassword, resetPassword, login } = require('../src/controllers/authController');
  const { authenticate } = require('../src/middleware/auth');
  const { warnIfNoResendKey, DEFAULT_FROM } = require('../src/services/mail');

  const stamp = Date.now().toString().slice(-8);
  const ids = {
    main: `rst${stamp}a`,
    none: `rst${stamp}b`,
    prefer: `rst${stamp}c`,
    other: `rst${stamp}d`,
    fail: `rst${stamp}e`,
    origin: `rst${stamp}f`,
  };
  const mainEmail = `rst${stamp}a@example.com`;
  const preferEmail = `rst${stamp}c@example.com`;
  const failEmail = `rst${stamp}e@example.com`;
  const originEmail = `rst${stamp}f@example.com`;
  const oldPassword = 'OldPass#1';
  const newPassword = 'NewPass#9';
  const passwordHash = await bcrypt.hash(oldPassword, 10);

  async function insertUser(loginId, email) {
    await db.query(
      'INSERT INTO users (login_id, password_hash, full_name_ar, full_name_en, email, role) VALUES (?,?,?,?,?,?)',
      [loginId, passwordHash, 'اختبار', 'Reset Test', email, 'admin']
    );
  }

  try {
    await insertUser(ids.main, mainEmail);
    await insertUser(ids.none, null);
    await insertUser(ids.prefer, preferEmail);
    await insertUser(ids.other, ids.prefer.toLowerCase());
    await insertUser(ids.fail, failEmail);
    await insertUser(ids.origin, originEmail);

    warnIfNoResendKey();
    assert(warnings.some((line) => line.includes('RESEND_API_KEY is not set')), 'missing key logs a warning and does not throw');

    const missingKey = await invoke(forgotPassword, { body: { identifier: ids.main }, ip: '10.9.1.1' });
    assert(missingKey.statusCode === 200 && JSON.stringify(missingKey.body) === '{"ok":true}', 'missing key still returns generic success');
    assert(!Object.prototype.hasOwnProperty.call(missingKey.body, 'reset_link'), 'missing key does not return a link');
    assert(mailState.sent.length === 0, 'missing key does not send');

    process.env.RESEND_API_KEY = 're_test_key';

    const unknown = await invoke(forgotPassword, { body: { identifier: `missing-${stamp}` }, ip: '10.9.1.2' });
    const unknownEmail = await invoke(forgotPassword, { body: { email: `nobody-${stamp}@example.com` }, ip: '10.9.1.3' });
    assert(unknown.statusCode === 200 && unknownEmail.statusCode === 200, 'unknown id and email are accepted');
    assert(JSON.stringify(unknown.body) === '{"ok":true}' && JSON.stringify(unknownEmail.body) === '{"ok":true}', 'unknown accounts get the same success body');

    const blank = await invoke(forgotPassword, { body: { identifier: '   ' }, ip: '10.9.1.4' });
    assert(blank.statusCode === 400 && blank.body.error === 'MISSING_FIELDS', 'blank identifier is rejected');

    const tooLong = await invoke(forgotPassword, { body: { identifier: 'x'.repeat(300) }, ip: '10.9.1.5' });
    assert(tooLong.statusCode === 200 && JSON.stringify(tooLong.body) === '{"ok":true}', 'overlong identifier stays generic');

    const noEmail = await invoke(forgotPassword, { body: { login_id: ids.none }, ip: '10.9.1.6' });
    assert(JSON.stringify(noEmail.body) === '{"ok":true}', 'account without email gets the same success body');
    assert(warnings.some((line) => line.includes('no email address')), 'account without email is logged');
    assert(mailState.sent.length === 0, 'account without email does not send');

    const firstReset = await invoke(forgotPassword, { body: { identifier: ids.main }, ip: '10.9.1.7' });
    assert(JSON.stringify(firstReset.body) === JSON.stringify(unknown.body), 'known and unknown responses match');
    assert(mailState.sent.length === 1, 'known account sends one email');
    const firstMail = mailState.sent[0];
    assert(firstMail.from === DEFAULT_FROM, 'default from is the Resend test sender');
    assert(firstMail.to[0] === mainEmail, 'email goes to the account address');
    assert(firstMail.subject.includes('password reset') && firstMail.subject.includes('إعادة تعيين'), 'subject is English and Arabic');
    assert(firstMail.html.includes('1 hour') && firstMail.html.includes('ساعة واحدة'), 'html is English and Arabic');
    assert(firstMail.text.includes('1 hour') && firstMail.text.includes('ساعة واحدة'), 'text part is English and Arabic');
    assert(firstMail.html.includes('إذا لم تطلب ذلك') && firstMail.text.includes('If you did not request this'), 'both parts include the ignore line');
    const linkA = firstMail.text.split('\n').map((line) => line.trim()).find((line) => line.startsWith('http://localhost:5173/reset-password?token='));
    assert(linkA && firstMail.html.includes(linkA), 'html and text include the same reset link');
    const tokenA = tokenFromLink(linkA);
    const hashA = crypto.createHash('sha256').update(tokenA).digest('hex');
    const [storedA] = await db.query(
      'SELECT token_hash, TIMESTAMPDIFF(MINUTE, NOW(), expires_at) AS mins, used_at FROM password_reset_tokens WHERE token_hash = ?',
      [hashA]
    );
    assert(storedA[0] && storedA[0].token_hash === hashA && storedA[0].token_hash !== tokenA, 'database stores the hash, not the token');
    assert(storedA[0].mins >= 59 && storedA[0].mins <= 60, 'token expires in about 1 hour');
    assert(mailState.keys.includes('re_test_key'), 'Resend client is constructed with RESEND_API_KEY');

    const secondReset = await invoke(forgotPassword, { body: { identifier: mainEmail.toUpperCase() }, ip: '10.9.1.8' });
    assert(JSON.stringify(secondReset.body) === '{"ok":true}', 'email lookup returns generic success');
    const linkB = mailState.sent[1].text.split('\n').map((line) => line.trim()).find((line) => line.startsWith('http'));
    const tokenB = tokenFromLink(linkB);

    const reusedOld = await invoke(resetPassword, { body: { token: tokenA, password: newPassword }, ip: '10.9.2.1' });
    assert(reusedOld.statusCode === 400 && reusedOld.body.error === 'INVALID_RESET_TOKEN', 'older token is invalid after a new request');

    const hashB = crypto.createHash('sha256').update(tokenB).digest('hex');
    await db.query('UPDATE password_reset_tokens SET expires_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE token_hash = ?', [hashB]);
    const expired = await invoke(resetPassword, { body: { token: tokenB, password: newPassword }, ip: '10.9.2.2' });
    assert(expired.statusCode === 400 && expired.body.error === 'INVALID_RESET_TOKEN', 'expired token fails');

    const thirdReset = await invoke(forgotPassword, { body: { identifier: ids.main }, ip: '10.9.1.9' });
    assert(JSON.stringify(thirdReset.body) === '{"ok":true}', 'third request stays generic');
    const linkC = mailState.sent[2].text.split('\n').map((line) => line.trim()).find((line) => line.startsWith('http'));
    const tokenC = tokenFromLink(linkC);

    const weak = await invoke(resetPassword, { body: { token: tokenC, password: 'short' }, ip: '10.9.2.3' });
    assert(weak.statusCode === 400 && weak.body.error === 'WEAK_PASSWORD', 'short password is rejected');
    const [stillUnused] = await db.query('SELECT used_at FROM password_reset_tokens WHERE token_hash = ?', [
      crypto.createHash('sha256').update(tokenC).digest('hex'),
    ]);
    assert(stillUnused[0] && stillUnused[0].used_at == null, 'weak password does not consume the token');

    const session = await invoke(login, { body: { login_id: ids.main, password: oldPassword }, ip: '10.9.2.4' });
    assert(session.statusCode === 200 && session.body.token, 'old password works before reset');
    const [beforeVersion] = await db.query('SELECT token_version FROM users WHERE login_id = ?', [ids.main]);

    const changed = await invoke(resetPassword, { body: { token: tokenC, password: newPassword }, ip: '10.9.2.5' });
    assert(changed.statusCode === 200 && JSON.stringify(changed.body) === '{"ok":true}', 'new password is saved');

    const again = await invoke(resetPassword, { body: { token: tokenC, password: 'Another#1' }, ip: '10.9.2.6' });
    assert(again.statusCode === 400 && again.body.error === 'INVALID_RESET_TOKEN', 'reused token fails');

    const oldLogin = await invoke(login, { body: { login_id: ids.main, password: oldPassword }, ip: '10.9.2.7' });
    assert(oldLogin.statusCode === 401 && oldLogin.body.error === 'INVALID_CREDENTIALS', 'old password fails');
    const newLogin = await invoke(login, { body: { login_id: ids.main, password: newPassword }, ip: '10.9.2.8' });
    assert(newLogin.statusCode === 200 && newLogin.body.token, 'new password works');

    const [afterVersion] = await db.query('SELECT token_version FROM users WHERE login_id = ?', [ids.main]);
    assert(Number(afterVersion[0].token_version) === Number(beforeVersion[0].token_version) + 1, 'reset increments token_version');

    const oldSession = await new Promise((resolve, reject) => {
      const req = { headers: { authorization: `Bearer ${session.body.token}` } };
      const res = {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; resolve(this); return this; },
      };
      Promise.resolve(authenticate(req, res, () => resolve({ statusCode: 200, body: { next: true } }))).catch(reject);
    });
    assert(oldSession.statusCode === 401 && oldSession.body.error === 'SESSION_EXPIRED', 'old session is logged out');

    process.env.RESEND_FROM = 'Unidex <reset-test@example.com>';
    const preferred = await invoke(forgotPassword, { body: { identifier: ids.prefer }, ip: '10.9.3.1' });
    assert(JSON.stringify(preferred.body) === '{"ok":true}', 'login id wins when an email collides');
    assert(mailState.sent.at(-1).to[0] === preferEmail, 'email is sent to the login id match');
    assert(mailState.sent.at(-1).from === 'Unidex <reset-test@example.com>', 'RESEND_FROM overrides the default sender');
    delete process.env.RESEND_FROM;

    delete process.env.FRONTEND_URL;
    const fromOrigin = await invoke(forgotPassword, {
      body: { identifier: ids.origin },
      ip: '10.9.3.2',
      origin: 'http://192.168.1.20:5173',
    });
    assert(JSON.stringify(fromOrigin.body) === '{"ok":true}', 'origin fallback still returns generic success');
    assert(mailState.sent.at(-1).text.includes('http://192.168.1.20:5173/reset-password?token='), 'link falls back to Origin');
    process.env.FRONTEND_URL = 'http://localhost:5173';

    const sentBeforeFailure = mailState.sent.length;
    mailState.mode = 'throw';
    const threw = await invoke(forgotPassword, { body: { identifier: ids.fail }, ip: '10.9.3.3' });
    assert(threw.statusCode === 200 && JSON.stringify(threw.body) === '{"ok":true}', 'send exception stays generic');
    assert(errors.some((line) => line.includes('network down')), 'send exception is logged');
    assert(mailState.sent.length === sentBeforeFailure, 'failed send is not treated as delivered');

    mailState.mode = 'api-error';
    const apiError = await invoke(forgotPassword, { body: { identifier: ids.fail }, ip: '10.9.3.4' });
    assert(apiError.statusCode === 200 && JSON.stringify(apiError.body) === '{"ok":true}', 'Resend error result stays generic');
    assert(errors.some((line) => line.includes('domain not verified')), 'Resend error result is logged');
    mailState.mode = 'ok';

    process.env.PASSWORD_RESET_RETURN_LINK = 'true';
    const devLink = await invoke(forgotPassword, { body: { identifier: ids.origin }, ip: '10.9.3.5' });
    assert(typeof devLink.body.reset_link === 'string' && devLink.body.reset_link.includes('/reset-password?token='), 'local flag can return the link');
    process.env.NODE_ENV = 'production';
    const hidden = await invoke(forgotPassword, { body: { identifier: ids.origin }, ip: '10.9.3.6' });
    assert(hidden.statusCode === 200 && !Object.prototype.hasOwnProperty.call(hidden.body, 'reset_link'), 'production ignores the return-link flag');
    process.env.NODE_ENV = 'development';
    delete process.env.PASSWORD_RESET_RETURN_LINK;

    realWarn('Password reset test passed.');
  } finally {
    console.warn = realWarn;
    console.error = realError;
    const list = Object.values(ids);
    if (typeof db !== 'undefined') {
      await db.query('DELETE FROM users WHERE login_id IN (?)', [list]);
      await db.end();
    }
  }
})().catch((err) => {
  console.error('Password reset test failed:', err.message);
  process.exit(1);
});

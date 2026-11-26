import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionRefresh, shouldRefresh } from '../src/api/refreshSession.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
    removeItem(key) {
      delete data[key];
    },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test('login and refresh endpoints are not refreshed', () => {
  const refreshToken = 'refresh-1';
  assert.equal(shouldRefresh({ url: '/auth/login' }, 401, refreshToken), false);
  assert.equal(shouldRefresh({ url: '/auth/refresh' }, 401, refreshToken), false);
  assert.equal(shouldRefresh({ url: '/auth/login?next=1' }, 401, refreshToken), false);
  assert.equal(shouldRefresh({ url: 'https://api.example.com/api/auth/refresh' }, 401, refreshToken), false);
  assert.equal(shouldRefresh({ url: '/student/grades' }, 401, refreshToken), true);
  assert.equal(shouldRefresh({ url: '/student/grades', _retry: true }, 401, refreshToken), false);
  assert.equal(shouldRefresh({ url: '/student/grades' }, 401, ''), false);
  assert.equal(shouldRefresh({ url: '/student/grades' }, 401, null), false);
  assert.equal(shouldRefresh({ url: '/student/grades' }, 500, refreshToken), false);
  assert.equal(shouldRefresh(undefined, 401, refreshToken), false);
});

test('concurrent refreshes share one request and store the new access token', async () => {
  const storage = memoryStorage({ token: 'expired', refresh_token: 'refresh-1' });
  let calls = 0;
  const gate = deferred();
  const session = createSessionRefresh({
    storage,
    postRefresh(refreshToken) {
      calls += 1;
      assert.equal(refreshToken, 'refresh-1');
      return gate.promise;
    },
  });

  const first = session.refreshAccessToken();
  const second = session.refreshAccessToken();
  assert.equal(calls, 1);
  gate.resolve({ data: { token: 'access-2' } });
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a, 'access-2');
  assert.equal(b, 'access-2');
  assert.equal(storage.getItem('token'), 'access-2');
  assert.equal(storage.getItem('refresh_token'), 'refresh-1');
});

test('a rejected refresh is not reused, and a 401 clears both tokens', async () => {
  const storage = memoryStorage({ token: 'expired', refresh_token: 'refresh-1' });
  let calls = 0;
  const session = createSessionRefresh({
    storage,
    postRefresh() {
      calls += 1;
      return Promise.reject({ response: { status: 401 } });
    },
  });

  await assert.rejects(session.refreshAccessToken());
  assert.equal(storage.getItem('token'), null);
  assert.equal(storage.getItem('refresh_token'), null);
  await assert.rejects(session.refreshAccessToken(), (err) => err.noRefresh === true);
  assert.equal(calls, 1);
});

test('a network error keeps the stored session', async () => {
  const storage = memoryStorage({ token: 'expired', refresh_token: 'refresh-1' });
  const session = createSessionRefresh({
    storage,
    postRefresh() {
      return Promise.reject(new Error('network down'));
    },
  });
  await assert.rejects(session.refreshAccessToken(), (err) => err.message === 'network down');
  assert.equal(storage.getItem('token'), 'expired');
  assert.equal(storage.getItem('refresh_token'), 'refresh-1');
});

test('login during an in-flight refresh keeps the new session', async () => {
  const storage = memoryStorage({ token: 'expired', refresh_token: 'old-refresh' });
  const gate = deferred();
  const session = createSessionRefresh({
    storage,
    postRefresh() {
      return gate.promise;
    },
  });
  const pending = session.refreshAccessToken();
  session.storeSession('login-access', 'login-refresh');
  gate.resolve({ data: { token: 'should-not-stick' } });
  await assert.rejects(pending, (err) => err.sessionReplaced === true);
  assert.equal(storage.getItem('token'), 'login-access');
  assert.equal(storage.getItem('refresh_token'), 'login-refresh');
});

test('a 401 that arrives after login does not clear the new session', async () => {
  const storage = memoryStorage({ token: 'expired', refresh_token: 'old-refresh' });
  const gate = deferred();
  const session = createSessionRefresh({
    storage,
    postRefresh() {
      return gate.promise;
    },
  });
  const pending = session.refreshAccessToken();
  session.storeSession('login-access', 'login-refresh');
  gate.reject({ response: { status: 401 } });
  await assert.rejects(pending);
  assert.equal(storage.getItem('token'), 'login-access');
  assert.equal(storage.getItem('refresh_token'), 'login-refresh');
});

test('a refresh response without an access token clears the session', async () => {
  const storage = memoryStorage({ token: 'expired', refresh_token: 'refresh-1' });
  const session = createSessionRefresh({
    storage,
    postRefresh() {
      return Promise.resolve({ data: {} });
    },
  });
  await assert.rejects(session.refreshAccessToken());
  assert.equal(storage.getItem('token'), null);
  assert.equal(storage.getItem('refresh_token'), null);
});

test('storeSession without a refresh token drops a previous one', () => {
  const storage = memoryStorage({ token: 'old', refresh_token: 'old-refresh' });
  const session = createSessionRefresh({ storage, postRefresh() { return Promise.resolve({ data: { token: 'x' } }); } });
  session.storeSession('access-only');
  assert.equal(storage.getItem('token'), 'access-only');
  assert.equal(storage.getItem('refresh_token'), null);
});

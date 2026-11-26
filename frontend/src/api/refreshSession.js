export const ACCESS_KEY = 'token';
export const REFRESH_KEY = 'refresh_token';

// Login and refresh must not trigger another refresh. A 401 from either is final.
export function isCredentialRequest(url) {
  const path = String(url || '').split('?')[0];
  return /\/auth\/login\/?$/.test(path) || /\/auth\/refresh\/?$/.test(path);
}

export function shouldRefresh(config, status, refreshToken) {
  if (!config || config._retry || status !== 401) return false;
  if (isCredentialRequest(config.url)) return false;
  return typeof refreshToken === 'string' && refreshToken !== '';
}

// storage matches localStorage. postRefresh(refreshToken) returns an axios-like promise.
export function createSessionRefresh({ storage, postRefresh }) {
  let sessionEpoch = 0;
  let refreshPromise = null;

  function storeSession(accessToken, refreshToken) {
    sessionEpoch += 1;
    if (typeof accessToken === 'string' && accessToken) storage.setItem(ACCESS_KEY, accessToken);
    else storage.removeItem(ACCESS_KEY);
    if (typeof refreshToken === 'string' && refreshToken) storage.setItem(REFRESH_KEY, refreshToken);
    else storage.removeItem(REFRESH_KEY);
  }

  function clearSession() {
    sessionEpoch += 1;
    storage.removeItem(ACCESS_KEY);
    storage.removeItem(REFRESH_KEY);
  }

  function refreshAccessToken() {
    if (refreshPromise) return refreshPromise;
    const epoch = sessionEpoch;
    const refreshToken = storage.getItem(REFRESH_KEY);
    if (!refreshToken) return Promise.reject(Object.assign(new Error('NO_REFRESH'), { noRefresh: true }));

    let request;
    try {
      request = postRefresh(refreshToken);
    } catch (err) {
      request = Promise.reject(err);
    }
    const pending = Promise.resolve(request)
      .then((res) => {
        if (epoch !== sessionEpoch) {
          const replaced = new Error('SESSION_REPLACED');
          replaced.sessionReplaced = true;
          throw replaced;
        }
        const token = res && res.data && typeof res.data.token === 'string' ? res.data.token : '';
        if (!token) {
          const missing = new Error('REFRESH_FAILED');
          missing.response = { status: 401 };
          throw missing;
        }
        storage.setItem(ACCESS_KEY, token);
        return token;
      })
      .catch((err) => {
        const rejected = err.response && err.response.status === 401;
        if (!err.sessionReplaced && !err.noRefresh && epoch === sessionEpoch && rejected) clearSession();
        throw err;
      })
      .finally(() => {
        if (refreshPromise === pending) refreshPromise = null;
      });
    refreshPromise = pending;
    return pending;
  }

  return { storeSession, clearSession, refreshAccessToken };
}

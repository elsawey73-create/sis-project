import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import useFetch from '../hooks/useFetch';

const STORAGE_KEY = 'unidex.offline.v1';

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

export function writeCache(userId, bucket, data) {
  const all = readAll();
  all[`${userId}:${bucket}`] = { at: Date.now(), data };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* a full cache should not break the page */
  }
}

export function readCache(userId, bucket) {
  const row = readAll()[`${userId}:${bucket}`];
  return row && row.data != null ? row : null;
}

// Same hook on the website and in the Capacitor webview. A failed request
// falls back to the last successful payload for this user.
export function useCachedFetch(url, bucket) {
  const { user } = useAuth();
  const result = useFetch(url);
  useEffect(() => {
    if (user && result.data != null) writeCache(user.id, bucket, result.data);
  }, [user, bucket, result.data]);
  if (user && result.error) {
    const cached = readCache(user.id, bucket);
    if (cached) {
      return { ...result, data: cached.data, error: null, loading: false, offline: true, cachedAt: cached.at };
    }
  }
  return { ...result, offline: false, cachedAt: null };
}

// Public site used when the instructor app builds a QR. The WebView origin is
// https://localhost, which another phone cannot open.
export const PUBLIC_WEB_ORIGIN = 'https://unidex-frontend-production.up.railway.app';

export function attendancePageUrl(origin, sessionId, token) {
  const base = String(origin || '').replace(/\/+$/, '');
  const query = `s=${encodeURIComponent(sessionId)}&t=${encodeURIComponent(token)}`;
  return `${base}/attend?${query}`;
}

// Pull the session id and token out of a scanned attendance QR.
export function parseAttendanceTarget(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    try {
      url = new URL(raw, 'https://unidex.local');
    } catch {
      return null;
    }
  }
  if (!url.pathname.endsWith('/attend')) return null;
  const sessionId = url.searchParams.get('s');
  const token = url.searchParams.get('t');
  if (!sessionId || !token || !/^\d+$/.test(sessionId)) return null;
  return { sessionId, token };
}

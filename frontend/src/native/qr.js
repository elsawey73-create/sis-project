// Pull session id and token out of an attendance QR. The instructor QR is a URL
// such as https://host/attend?s=<id>&t=<token>. The scanner posts those fields
// to the existing /attendance/scan endpoint.
export function parseAttendanceQr(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  return readParams(extractCandidate(text));
}

function extractCandidate(text) {
  const absolute = text.match(/https?:\/\/[^\s]+/i);
  if (absolute) return absolute[0].replace(/[),.;]+$/, '');
  const first = text.split(/\s/)[0];
  if (first.startsWith('/attend') || first.startsWith('?')) return first;
  return null;
}

function readParams(value) {
  if (!value) return null;
  let url;
  try {
    url = new URL(value, 'https://unidex.local');
  } catch {
    return null;
  }
  const sessionRaw = url.searchParams.get('s') || url.searchParams.get('session_id');
  const token = (url.searchParams.get('t') || url.searchParams.get('token') || '').trim();
  if (!sessionRaw || !token || /\s/.test(token)) return null;
  const sessionId = Number(sessionRaw);
  if (!Number.isInteger(sessionId) || sessionId <= 0) return null;
  return { sessionId, token };
}

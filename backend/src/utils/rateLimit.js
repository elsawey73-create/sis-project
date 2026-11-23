// In-memory fixed window. Enough for a single API process. Restarts clear it.
const buckets = new Map();

function prune(now, windowMs) {
  if (buckets.size < 5000) return;
  for (const [key, times] of buckets) {
    const fresh = times.filter((t) => now - t < windowMs);
    if (fresh.length === 0) buckets.delete(key);
    else buckets.set(key, fresh);
  }
}

// Returns true when the caller is still inside the limit and records the hit.
function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  const fresh = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (fresh.length >= limit) {
    buckets.set(key, fresh);
    prune(now, windowMs);
    return false;
  }
  fresh.push(now);
  buckets.set(key, fresh);
  prune(now, windowMs);
  return true;
}

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    const first = forwarded.split(',')[0].trim();
    if (first) return first.slice(0, 80);
  }
  return String(req.ip || req.socket?.remoteAddress || 'unknown').slice(0, 80);
}

module.exports = { rateLimit, clientIp };

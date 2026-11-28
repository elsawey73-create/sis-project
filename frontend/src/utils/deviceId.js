import { isNativeApp } from '../native/platform';

const STORAGE_KEY = 'unidex.deviceId';

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

function browserSignals() {
  return [
    navigator.userAgent || '',
    navigator.language || '',
    String(screen.width || ''),
    String(screen.height || ''),
    Intl.DateTimeFormat().resolvedOptions().timeZone || '',
  ].join('|');
}

function persistentWebId() {
  try {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    return 'web-ephemeral';
  }
}

// Android uses the Capacitor device id. The website keeps a generated id and
// also sends a hash of browser signals so the record can be audited.
export async function getDeviceIdentity() {
  if (isNativeApp()) {
    try {
      const { Device } = await import('@capacitor/device');
      const info = await Device.getId();
      if (info?.identifier) return { device_id: info.identifier, device_signals: 'capacitor' };
    } catch {
      /* fall through to the stored id */
    }
  }
  const signals = await sha256(browserSignals());
  return { device_id: persistentWebId(), device_signals: signals };
}

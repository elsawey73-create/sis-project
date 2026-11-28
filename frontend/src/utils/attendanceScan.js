import api from '../api/axios';
import { getDeviceIdentity } from './deviceId';
import { readPosition } from './geo';

// Photo is required. Location is sent when the browser can read it. The server
// rejects a scan that is outside the doctor's radius, or that has no fix when
// the session recorded one.
export async function submitAttendance({ sessionId, token, photo }) {
  const identity = await getDeviceIdentity();
  let place = {};
  try {
    place = await readPosition();
  } catch {
    place = {};
  }
  return api.post('/attendance/scan', {
    session_id: Number(sessionId),
    token,
    photo,
    device_id: identity.device_id,
    device_signals: identity.device_signals,
    latitude: place.latitude,
    longitude: place.longitude,
    accuracy: place.accuracy,
  });
}

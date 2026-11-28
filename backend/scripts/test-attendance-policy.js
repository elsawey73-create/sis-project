const test = require('node:test');
const assert = require('node:assert/strict');
const {
  QR_TTL_SECONDS,
  haversineMeters,
  evaluateLocation,
  currentQrAccepts,
  deviceDecision,
  absenceStanding,
  decodePhoto,
} = require('../src/domain/attendancePolicy');

test('QR lifetime is 20 seconds', () => {
  assert.equal(QR_TTL_SECONDS, 20);
});

test('only the current unexpired QR token is accepted', () => {
  const now = 1_000_000;
  assert.equal(currentQrAccepts({
    presentedToken: 'aaa', activeToken: 'aaa', expiresAtMs: now + 5000, nowMs: now,
  }), true);
  assert.equal(currentQrAccepts({
    presentedToken: 'old', activeToken: 'aaa', expiresAtMs: now + 5000, nowMs: now,
  }), false);
  assert.equal(currentQrAccepts({
    presentedToken: 'aaa', activeToken: 'aaa', expiresAtMs: now, nowMs: now,
  }), false);
  assert.equal(currentQrAccepts({
    presentedToken: 'aaa', activeToken: null, expiresAtMs: now + 5000, nowMs: now,
  }), false);
});

test('haversine is about 11.1 m per 0.0001 degree of latitude', () => {
  const meters = haversineMeters(30, 31, 30.0001, 31);
  assert.ok(meters > 10.5 && meters < 11.7, `got ${meters}`);
});

test('location allows a reading inside the radius plus reported accuracy', () => {
  const near = evaluateLocation({
    doctorLat: 30, doctorLng: 31, studentLat: 30.00018, studentLng: 31,
    studentAccuracy: 15, radiusM: 20, accuracyCapM: 40,
  });
  assert.equal(near.ok, true, JSON.stringify(near));
  assert.ok(near.distanceM > 18 && near.distanceM < 22);

  const far = evaluateLocation({
    doctorLat: 30, doctorLng: 31, studentLat: 30.0005, studentLng: 31,
    studentAccuracy: 5, radiusM: 20, accuracyCapM: 40,
  });
  assert.equal(far.ok, false);
  assert.equal(far.code, 'TOO_FAR');
  assert.ok(far.distanceM > 50);
});

test('a poor GPS fix is rejected instead of expanding the fence', () => {
  const poor = evaluateLocation({
    doctorLat: 30, doctorLng: 31, studentLat: 30.001, studentLng: 31,
    studentAccuracy: 80, radiusM: 20, accuracyCapM: 40,
  });
  assert.equal(poor.ok, false);
  assert.equal(poor.code, 'GPS_INACCURATE');
});

test('a scan without coordinates is rejected when the session has a fence', () => {
  const missing = evaluateLocation({
    doctorLat: 30, doctorLng: 31, studentLat: null, studentLng: null,
    studentAccuracy: 5, radiusM: 20, accuracyCapM: 40,
  });
  assert.equal(missing.code, 'LOCATION_REQUIRED');
});

test('a device can record one student per session', () => {
  assert.deepEqual(deviceDecision({ existingStudentId: null, studentId: 4 }), { ok: true, code: null });
  assert.equal(deviceDecision({ existingStudentId: 4, studentId: 4 }).code, 'ALREADY_RECORDED');
  assert.equal(deviceDecision({ existingStudentId: 4, studentId: 9 }).code, 'DEVICE_ALREADY_USED');
  assert.equal(deviceDecision({ existingStudentId: 9, studentId: 4 }).ok, false);
});

test('absence warning stays above the limit, and approaching starts at 80 percent of it', () => {
  const none = absenceStanding({ attended: 0, totalSessions: 0, limitPct: 25 });
  assert.equal(none.warning, false);
  assert.equal(none.approaching, false);

  const half = absenceStanding({ attended: 1, totalSessions: 2, limitPct: 25 });
  assert.equal(half.absent_pct, 50);
  assert.equal(half.warning, true);

  const exact = absenceStanding({ attended: 3, totalSessions: 4, limitPct: 25 });
  assert.equal(exact.absent_pct, 25);
  assert.equal(exact.warning, false);
  assert.equal(exact.approaching, true);
});

test('a face photo must be a reasonably sized JPEG', () => {
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xdb]), Buffer.alloc(40, 1)]);
  const ok = decodePhoto(jpeg.toString('base64'));
  assert.equal(ok.ok, true);
  assert.equal(ok.mime, 'image/jpeg');
  assert.equal(decodePhoto('').code, 'PHOTO_REQUIRED');
  assert.equal(decodePhoto(Buffer.from('hello world hello world hello world').toString('base64')).code, 'PHOTO_REQUIRED');
  const huge = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(400001, 2)]);
  assert.equal(decodePhoto(huge.toString('base64')).code, 'PHOTO_REQUIRED');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseAttendanceQr } from './qr.js';

test('parses an absolute attendance URL', () => {
  assert.deepEqual(
    parseAttendanceQr('https://localhost/attend?s=12&t=abc_def'),
    { sessionId: 12, token: 'abc_def' },
  );
});

test('parses a relative attend path', () => {
  assert.deepEqual(
    parseAttendanceQr('/attend?s=4&t=tok-1'),
    { sessionId: 4, token: 'tok-1' },
  );
});

test('accepts session_id and token parameter names', () => {
  assert.deepEqual(
    parseAttendanceQr('https://unidex.example/attend?session_id=9&token=zzz'),
    { sessionId: 9, token: 'zzz' },
  );
});

test('reads a URL embedded in extra scanner text', () => {
  assert.deepEqual(
    parseAttendanceQr('scan https://app.example/attend?s=3&t=abc now'),
    { sessionId: 3, token: 'abc' },
  );
});

test('rejects empty, garbage, and incomplete codes', () => {
  assert.equal(parseAttendanceQr(''), null);
  assert.equal(parseAttendanceQr('hello'), null);
  assert.equal(parseAttendanceQr('https://localhost/attend?s=4'), null);
  assert.equal(parseAttendanceQr('https://localhost/attend?s=0&t=abc'), null);
  assert.equal(parseAttendanceQr('https://localhost/attend?s=1.5&t=abc'), null);
});

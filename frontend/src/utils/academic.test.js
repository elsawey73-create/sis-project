import assert from 'node:assert/strict';
import test from 'node:test';
import { GRADUATION_HOURS, REGULAR_LOAD_HOURS, formatHours, graduationProgress } from './academic.js';

test('the regular load is 18 and graduation is 174 hours', () => {
  assert.equal(REGULAR_LOAD_HOURS, 18);
  assert.equal(GRADUATION_HOURS, 174);
});

test('graduation progress is credits earned over 174', () => {
  const bar = graduationProgress(134);
  assert.equal(bar.earned, 134);
  assert.equal(bar.total, 174);
  assert.ok(Math.abs(bar.percent - (134 / 174) * 100) < 1e-9);
});

test('the graduation bar caps at 100 percent and ignores bad input', () => {
  assert.equal(graduationProgress(200).percent, 100);
  assert.equal(graduationProgress(200).earned, 200);
  assert.equal(graduationProgress(-4).earned, 0);
  assert.equal(graduationProgress('nope').earned, 0);
  assert.equal(graduationProgress(null).percent, 0);
});

test('hour labels stay short', () => {
  assert.equal(formatHours(12), '12');
  assert.equal(formatHours('12.0'), '12');
  assert.equal(formatHours(12.25), '12.3');
  assert.equal(formatHours(undefined), '0');
});

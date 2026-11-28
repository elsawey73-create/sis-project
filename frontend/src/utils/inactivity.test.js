import assert from 'node:assert/strict';
import test from 'node:test';
import { INACTIVITY_MS, idleExpired, idleRemaining } from './inactivity.js';

test('inactivity is five minutes', () => {
  assert.equal(INACTIVITY_MS, 5 * 60 * 1000);
});

test('a session expires at five minutes and not a millisecond earlier', () => {
  const start = 1_000_000;
  assert.equal(idleExpired(start, start + INACTIVITY_MS - 1), false);
  assert.equal(idleExpired(start, start + INACTIVITY_MS), true);
  assert.equal(idleExpired(start, start + INACTIVITY_MS + 30_000), true);
});

test('activity leaves the remaining time, and a resume after the limit is due', () => {
  const start = 5_000;
  assert.equal(idleRemaining(start, start + 60_000), INACTIVITY_MS - 60_000);
  assert.equal(idleRemaining(start, start + INACTIVITY_MS), 0);
  assert.equal(idleRemaining(start, start + INACTIVITY_MS + 10), 0);
  assert.equal(idleExpired('nope', start), false);
  assert.equal(idleRemaining('nope', start), INACTIVITY_MS);
});

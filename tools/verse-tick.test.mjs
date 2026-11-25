import test from 'node:test';
import assert from 'node:assert/strict';
import { STEPS, due, pick } from './verse-tick.mjs';

test('the clock runs the steps the workflows ran, and every step says why it exists', () => {
  assert.deepEqual(STEPS.map((s) => s.id), ['hand', 'self', 'crew', 'traffic']);
  for (const s of STEPS) assert.ok(s.why && s.why.length > 20, s.id + ' needs a reason');
});

test('a step is due when it has never run, or when its interval has passed', () => {
  const now = 1_000_000_000_000;
  assert.equal(due(STEPS, {}, now).length, STEPS.length, 'nothing has run yet');
  const last = { hand: now - 1, self: now - 9 * 60_000, crew: now - 61 * 60_000, traffic: now - 23 * 3_600_000 };
  assert.deepEqual(due(STEPS, last, now).map((s) => s.id), ['hand', 'crew'], 'self is not due at 9 of 10 minutes, and traffic is not due at 23 of 24 hours');
  const later = { hand: now, self: now - 10 * 60_000, crew: now, traffic: now };
  // hand has every: 0, which means "every lap", so it is always due
  assert.deepEqual(due(STEPS, later, now).map((s) => s.id), ['hand', 'self'], 'exactly at the interval is due');
});

test('--only keeps the clock order, and an empty filter is every step', () => {
  assert.deepEqual(pick(STEPS, 'crew,hand').map((s) => s.id), ['hand', 'crew']);
  assert.equal(pick(STEPS, '').length, STEPS.length);
  assert.deepEqual(pick(STEPS, 'nope').map((s) => s.id), []);
});

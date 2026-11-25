import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankRoutes, pickBoundary, makeSeed, dedupKey } from '../tools/epistemic-probe.mjs';

test('rankRoutes: sorted by score desc', () => {
  const r = rankRoutes();
  assert.ok(r.length > 0);
  for (let i = 1; i < r.length; i++) assert.ok(r[i-1].score >= r[i].score);
});
test('pickBoundary: returns a boundary', () => {
  const b = pickBoundary(42, { path: '/api/will' });
  assert.ok(b.type);
  assert.ok(b.input !== undefined);
});
test('makeSeed: has replay command', () => {
  const s = makeSeed(42, 'probe', '/api/will', { type: 'empty' }, 'timeout');
  assert.match(s.replay, /--seed 42/);
});
test('dedupKey: deterministic', () => {
  assert.equal(dedupKey('/api/will', 'timeout', 'x'), dedupKey('/api/will', 'timeout', 'x'));
});
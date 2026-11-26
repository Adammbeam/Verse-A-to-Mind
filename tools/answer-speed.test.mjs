// lib/answer-speed.js: a slow source or a slow free model never holds an uncached answer (2026-11-25: 25.9 s and 29.2 s)
import test from 'node:test';
import assert from 'node:assert/strict';
import { bounded, hedged } from '../void-live-deploy/lib/answer-speed.js';

const after = (ms, v, fail = false) => new Promise((res, rej) => setTimeout(() => (fail ? rej(new Error(v)) : res(v)), ms));

test('bounded: the value in time, the fallback when late or failed', async () => {
  assert.deepEqual(await bounded(after(5, ['a']), 100, []), ['a']);
  assert.deepEqual(await bounded(after(200, ['late']), 20, []), []);
  assert.deepEqual(await bounded(after(5, 'x', true), 100, []), []);
});

test('hedged: a quick first model answers alone; the second never starts', async () => {
  let second = 0;
  const r = await hedged([{ id: 'a', run: () => after(5, 'first') }, { id: 'b', run: () => { second++; return after(5, 'second'); } }], { hedgeMs: 50, capMs: 500 });
  assert.deepEqual(r, { id: 'a', value: 'first', hedged: false }); await after(80); assert.equal(second, 0);
});

test('hedged: a slow first model gets the second beside it after the hedge, and the faster one wins', async () => {
  const t0 = Date.now();
  const r = await hedged([{ id: 'a', run: () => after(400, 'slow') }, { id: 'b', run: () => after(20, 'quick') }], { hedgeMs: 30, capMs: 1000 });
  assert.equal(r.id, 'b'); assert.equal(r.hedged, true); assert.ok(Date.now() - t0 < 200, 'answered at about hedge + second, not at the slow call');
  const s = await hedged([{ id: 'a', run: () => after(60, 'first anyway') }, { id: 'b', run: () => after(500, 'late') }], { hedgeMs: 30, capMs: 1000 });
  assert.equal(s.id, 'a', 'the first still wins when it lands first');
});

test('hedged: a first model failing fast is reported at once; empty answers do not win; both slow is a timeout at the cap', async () => {
  await assert.rejects(hedged([{ id: 'a', run: () => after(5, 'busy', true) }, { id: 'b', run: () => after(5, 'x') }], { hedgeMs: 100, capMs: 500 }), /busy/);
  const r = await hedged([{ id: 'a', run: () => after(50, '   ') }, { id: 'b', run: () => after(10, 'real') }], { hedgeMs: 20, capMs: 500 });
  assert.equal(r.value, 'real');
  const t0 = Date.now();
  await assert.rejects(hedged([{ id: 'a', run: () => after(1000, 'x') }, { id: 'b', run: () => after(1000, 'y') }], { hedgeMs: 10, capMs: 80 }), /timeout/);
  assert.ok(Date.now() - t0 < 300);
  await assert.rejects(hedged([{ id: 'a', run: () => after(40, 'a down', true) }, { id: 'b', run: () => after(5, 'b down', true) }], { hedgeMs: 10, capMs: 500 }), /down/);
});

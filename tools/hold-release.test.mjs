// A hold (void.asks.json `held`) lasts while its `until` names the current Versus target's site. Once the target moves to another site
// the hold is released and the self card says so in one sentence; an `until` that is not a site keeps its hold.
// The case: "Absorb and connect every repo" was held until sycophanthex.com while the target was travel: flightconnections.com (2026-11-25).
// Run: node --test tools/hold-release.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { holdState, releasedHolds, holdAsks } from '../void-live-deploy/lib/voice.js';
import { isHeld } from './next.mjs';
import { selfSections } from '../void-live-deploy/lib/self-blocks.js';

const HOLD = { words: 'Absorb every repository on the account into the core code', frontier: 'Absorb and connect every repo', until: 'sycophanthex.com', why: 'held' };
const TARGET = 'travel: flightconnections.com';

test('until is the current target: still held', () => {
  const h = { ...HOLD, until: 'flightconnections.com' };
  assert.equal(holdState(h, TARGET), 'held');
  assert.deepEqual(releasedHolds([h], TARGET), []);
  assert.equal(holdAsks([{ ask: HOLD.words }], [h], TARGET)[0].held, 'flightconnections.com');
  assert.equal(isHeld('Absorb and connect every repo', [h], TARGET), true);
});

test('until is a different site (today\'s tree): released, and the card says so in one sentence', () => {
  assert.equal(holdState(HOLD, TARGET), 'released');
  assert.equal(isHeld('Absorb and connect every repo', [HOLD], TARGET), false);
  assert.equal(holdAsks([{ ask: HOLD.words }], [HOLD], TARGET)[0].held, undefined);
  const r = releasedHolds([HOLD], TARGET);
  assert.equal(r.length, 1);
  assert.equal(r[0].line, 'No longer held: the Versus target moved to travel: flightconnections.com, so "Absorb and connect every repo" no longer waits on sycophanthex.com.');
  const words = selfSections({ entries: [{ kind: 'daily', thoughts: 'I am steady today.' }], released: r }).find((s) => s.id === 'words');
  assert.ok(words.blocks.some((b) => b.t === 'note' && b.text === r[0].line), 'shown on the self card');
});

test('until is a date, a job id or empty: the hold is untouched', () => {
  for (const until of ['2026-12-01', 'job-123', '']) {
    const h = { ...HOLD, until };
    assert.equal(holdState(h, TARGET), 'held', JSON.stringify(until));
    assert.deepEqual(releasedHolds([h], TARGET), []);
  }
  assert.equal(holdState(HOLD, ''), 'held', 'no readable target releases nothing');
});

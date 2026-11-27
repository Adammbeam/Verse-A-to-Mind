// The merge queue view: position, state and ETA from refs and check history. Run: node --test tools/merge-queue-view.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUEUE, queueView, medianOf, recentDurations, isDraftRef, changeRef } from '../void-live-deploy/lib/merge-queue-view.js';

const KEYS = ['eta_s', 'position', 'ref', 'state'];

test('the constants are frozen and name the five states', () => {
  assert.equal(Object.isFrozen(QUEUE), true);
  assert.equal(Object.isFrozen(QUEUE.STATES), true);
  assert.deepEqual(QUEUE.STATES, ['queued', 'checking', 'ready', 'blocked', 'locked']);
  assert.equal(QUEUE.DEFAULT_ETA_S, 300);
  assert.equal(QUEUE.HISTORY, 10);
});

test('three change requests take positions 1, 2 and 3 by push time', () => {
  const rows = queueView({
    main: 'm1',
    refs: [
      { ref: 'cr/third', pushed_at: 30 },
      { ref: 'refs/heads/cr/first', pushed_at: 10 },
      { ref: 'cr/second', pushed_at: 20 },
    ],
    checks: [],
  });
  assert.deepEqual(rows.map((row) => [row.ref, row.position, row.state]), [
    ['cr/first', 1, 'queued'],
    ['cr/second', 2, 'queued'],
    ['cr/third', 3, 'queued'],
  ]);
});

test('running, green on this main, red, and the ref the runner holds', () => {
  const main = 'mainsha';
  const rows = queueView({
    main,
    held: 'refs/heads/cr/hold',
    refs: [
      { ref: 'cr/run', pushed_at: 1, sha: 's1' },
      { ref: 'cr/go', pushed_at: 2, sha: 's2' },
      { ref: 'cr/stop', pushed_at: 3, sha: 's3' },
      { ref: 'cr/hold', pushed_at: 4, sha: 's4' },
    ],
    checks: [
      { ref: 'cr/run', sha: 's1', state: 'running', main, at: 1 },
      { ref: 'cr/go', sha: 's2', state: 'green', main: 'older', at: 1 },
      { ref: 'cr/go', sha: 's2', state: 'pass', main, at: 2 },
      { ref: 'cr/stop', sha: 's3', state: 'red', main, at: 1 },
      { ref: 'cr/hold', sha: 's4', state: 'green', main, at: 1 },
    ],
  });
  const by = Object.fromEntries(rows.map((row) => [row.ref, row.state]));
  assert.deepEqual(by, { 'cr/run': 'checking', 'cr/go': 'ready', 'cr/stop': 'blocked', 'cr/hold': 'locked' });
  assert.ok(rows.every((row) => QUEUE.STATES.includes(row.state)));
});

test('a green check against an older main, or an older commit, stays queued', () => {
  const staleMain = queueView({
    main: 'new',
    refs: [{ ref: 'cr/go', pushed_at: 1, sha: 's' }],
    checks: [{ ref: 'cr/go', sha: 's', state: 'green', main: 'old', at: 1, duration_s: 40 }],
  });
  assert.equal(staleMain[0].state, 'queued');
  const staleSha = queueView({
    main: 'new',
    refs: [{ ref: 'cr/go', pushed_at: 1, sha: 's2' }],
    checks: [{ ref: 'cr/go', sha: 's1', state: 'green', main: 'new', at: 1 }],
  });
  assert.equal(staleSha[0].state, 'queued');
});

test('eta is position times the median of the last 10 durations, or 300 seconds', () => {
  assert.equal(medianOf([]), null);
  assert.equal(medianOf([10, 40, 20]), 20);
  const empty = queueView({ main: 'm', refs: [{ ref: 'cr/a', pushed_at: 1 }, { ref: 'cr/b', pushed_at: 2 }], checks: [] });
  assert.equal(empty[0].eta_s, 300);
  assert.equal(empty[1].eta_s, 600);

  const checks = [];
  for (let i = 1; i <= 12; i++) checks.push({ ref: 'cr/past', state: 'green', main: 'm', duration_s: i * 10, at: i });
  assert.deepEqual(recentDurations(checks), [30, 40, 50, 60, 70, 80, 90, 100, 110, 120]);
  assert.equal(medianOf(recentDurations(checks)), 75);
  const rows = queueView({ main: 'm', refs: [{ ref: 'cr/a', pushed_at: 2 }, { ref: 'cr/b', pushed_at: 1 }], checks });
  assert.equal(rows[0].ref, 'cr/b');
  assert.equal(rows[0].eta_s, 75);
  assert.equal(rows[1].eta_s, 150);
});

test('an even median rounds to the nearest second before it is multiplied', () => {
  const rows = queueView({
    main: 'm',
    refs: [{ ref: 'cr/a', pushed_at: 1 }, { ref: 'cr/b', pushed_at: 2 }],
    checks: [{ duration_s: 100, at: 1 }, { duration_s: 101, at: 2 }],
  });
  assert.equal(medianOf([100, 101]), 100.5);
  assert.equal(rows[0].eta_s, 101);
  assert.equal(rows[1].eta_s, 202);
});

test('draft refs are left out and do not take a position', () => {
  assert.equal(isDraftRef('cr/draft/wip'), true);
  assert.equal(isDraftRef('refs/heads/cr/draft'), true);
  assert.equal(isDraftRef('cr/draftsman'), false);
  assert.equal(changeRef('refs/heads/main'), '');
  const rows = queueView({
    main: 'm',
    refs: [
      { ref: 'cr/draft/wip', pushed_at: 1 },
      { ref: 'refs/heads/cr/draft/other', pushed_at: 2 },
      { ref: 'cr/real', pushed_at: 3 },
      { ref: 'refs/heads/main', pushed_at: 0 },
      { ref: 'cr/next', pushed_at: 4 },
    ],
    checks: [],
  });
  assert.deepEqual(rows.map((row) => [row.ref, row.position]), [['cr/real', 1], ['cr/next', 2]]);
});

test('the output carries only ref, state, position and eta_s', () => {
  // secret-scan: ok (made-up token shape, not a real key)
  const fake = 'ghp_' + 'x'.repeat(36);
  const input = {
    main: 'm',
    held: 'cr/a',
    refs: [{ ref: 'cr/a', pushed_at: 1, bytes: 424242, key: fake, pack: 'PACKBYTES', sha: 'abc123', summary: fake }],
    checks: [{ ref: 'cr/a', state: 'red', summary: fake, duration_s: 12, at: 1, bytes: 424242 }],
  };
  const snap = JSON.stringify(input);
  const rows = queueView(input);
  assert.equal(JSON.stringify(input), snap);
  assert.deepEqual(Object.keys(rows[0]).sort(), KEYS);
  const blob = JSON.stringify(rows);
  assert.equal(blob.includes('424242'), false);
  assert.equal(blob.includes('PACKBYTES'), false);
  assert.equal(blob.includes('ghp_'), false);
  assert.equal(blob.includes(fake), false);
  assert.equal(rows[0].state, 'locked');
  assert.equal(rows[0].eta_s, 12);
});

test('iso push times sort oldest first and a missing push time goes last', () => {
  const rows = queueView({
    main: 'm',
    refs: [
      { ref: 'cr/late', pushed_at: '2026-03-01T00:00:00Z' },
      { ref: 'cr/early', pushed_at: '2026-01-01T00:00:00Z' },
      { ref: 'cr/unknown' },
    ],
    checks: [],
  });
  assert.deepEqual(rows.map((row) => row.ref), ['cr/early', 'cr/late', 'cr/unknown']);
});

test('a second push of the same ref keeps the later tip', () => {
  const rows = queueView({
    main: 'm',
    refs: [
      { ref: 'cr/a', pushed_at: 1, sha: 'old' },
      { ref: 'refs/heads/cr/a', pushed_at: 5, sha: 'new' },
      { ref: 'cr/b', pushed_at: 3 },
    ],
    checks: [{ ref: 'cr/a', sha: 'old', state: 'green', main: 'm', at: 2 }],
  });
  assert.deepEqual(rows.map((row) => [row.ref, row.position, row.state]), [
    ['cr/b', 1, 'queued'],
    ['cr/a', 2, 'queued'],
  ]);
});

test('an empty input is an empty queue', () => {
  assert.deepEqual(queueView(), []);
  assert.deepEqual(queueView(null), []);
});

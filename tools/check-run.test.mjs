// A check run's life and the one word for a set of them (lib/check-run.js).
// Run: node --test tools/check-run.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { STATES, CONCLUSIONS, CHECK_RUN, start, finish, rollup } from '../void-live-deploy/lib/check-run.js';

const fakeToken = 'ghp_' + 'x'.repeat(36); // secret-scan: ok (a made-up token, all x)

test('the lists are frozen and the names are Verse\'s', () => {
  assert.equal(Object.isFrozen(STATES), true);
  assert.equal(Object.isFrozen(CONCLUSIONS), true);
  assert.equal(Object.isFrozen(CHECK_RUN), true);
  assert.deepEqual([...STATES], ['queued', 'running', 'done']);
  assert.deepEqual([...CONCLUSIONS], ['pass', 'fail', 'neutral', 'skipped', 'cancelled', 'timeout', 'stale']);
  assert.equal(CHECK_RUN.summary, 300);
  assert.equal(typeof start, 'function');
  assert.equal(typeof finish, 'function');
  assert.equal(typeof rollup, 'function');
});

test('a queued run can go to running or to done, and the earlier record stays put', () => {
  const opened = start({ name: 'suite', required: true }, 1000);
  assert.equal(opened.ok, true);
  assert.deepEqual(opened.run, {
    name: 'suite', state: 'queued', conclusion: null, summary: '', required: true,
    at: 1000, started: null, finished: null,
  });
  const running = start(opened.run, 2000);
  assert.equal(running.ok, true);
  assert.equal(running.run.state, 'running');
  assert.equal(running.run.started, 2000);
  assert.equal(running.run.at, 1000);
  assert.notEqual(running.run, opened.run);
  assert.equal(opened.run.state, 'queued');
  const skipped = finish(opened.run, 'pass', 'went straight through', 3000);
  assert.equal(skipped.ok, true);
  assert.equal(skipped.run.state, 'done');
  assert.equal(skipped.run.conclusion, 'pass');
  assert.equal(skipped.run.finished, 3000);
  assert.equal(opened.run.state, 'queued');
  const done = finish(running.run, 'pass', 'clean', 4000);
  assert.equal(done.run.state, 'done');
  assert.equal(done.run.started, 2000);
  assert.equal(running.run.state, 'running');
});

test('a done run cannot change, and a running run cannot start again', () => {
  const done = finish(start({ name: 'suite' }).run, 'pass', 'clean').run;
  const again = finish(done, 'fail', 'late');
  const restarted = start(done);
  assert.equal(again.ok, false);
  assert.match(again.error, /cannot change/);
  assert.equal(restarted.ok, false);
  assert.match(restarted.error, /cannot change/);
  assert.equal(done.state, 'done');
  assert.equal(done.conclusion, 'pass');
  const running = start(start({ name: 'suite' }).run).run;
  const twice = start(running);
  assert.equal(twice.ok, false);
  assert.match(twice.error, /only be finished/);
  assert.equal(running.state, 'running');
});

test('unknown conclusion names are refused, including the other vocabulary', () => {
  const queued = start({ name: 'suite' }).run;
  for (const word of ['exploded', 'success', 'failure', 'timed_out', '', null]) {
    const bad = finish(queued, word, 'no');
    assert.equal(bad.ok, false, String(word));
    assert.match(bad.error, /conclusion/);
  }
  assert.equal(queued.state, 'queued');
  for (const word of CONCLUSIONS) {
    const ok = finish(queued, word, word);
    assert.equal(ok.ok, true, word);
    assert.equal(ok.run.conclusion, word);
  }
});

test('rollup: a required fail blocks, a required run still open waits, an optional fail is unstable', () => {
  const fail = rollup([{ name: 'suite', state: 'done', conclusion: 'fail', required: true }]);
  assert.deepEqual(fail, { verdict: 'fail', unstable: false });
  const waiting = rollup([{ name: 'suite', state: 'running', conclusion: null, required: true }]);
  assert.deepEqual(waiting, { verdict: 'running', unstable: false });
  const queued = rollup([{ name: 'suite', state: 'queued', conclusion: null, required: true }]);
  assert.equal(queued.verdict, 'running');
  const optional = rollup([
    { name: 'suite', state: 'done', conclusion: 'pass', required: true },
    { name: 'lint', state: 'done', conclusion: 'fail', required: false },
  ]);
  assert.deepEqual(optional, { verdict: 'pass', unstable: true });
  const both = rollup([
    { name: 'suite', state: 'running', conclusion: null, required: true },
    { name: 'lint', state: 'done', conclusion: 'fail', required: true },
  ]);
  assert.equal(both.verdict, 'fail');
  const openOptional = rollup([
    { name: 'suite', state: 'done', conclusion: 'pass', required: true },
    { name: 'lint', state: 'running', conclusion: null, required: false },
  ]);
  assert.deepEqual(openOptional, { verdict: 'pass', unstable: false });
  assert.deepEqual(rollup([]), { verdict: 'pass', unstable: false });
  assert.deepEqual(rollup(null), { verdict: 'fail', unstable: false });
  const row = { name: 'lint', state: 'done', conclusion: 'fail', required: false };
  const before = { ...row };
  rollup([row]);
  assert.deepEqual(row, before);
});

test('a summary hides a key shape and stays within 300 characters', () => {
  const queued = start({ name: 'suite' }).run;
  const hidden = finish(queued, 'pass', 'log said ' + fakeToken + ' and then ended');
  assert.equal(hidden.ok, true);
  assert.doesNotMatch(hidden.run.summary, /ghp_/);
  assert.equal(hidden.run.summary, 'log said [redacted] and then ended');
  assert.equal(hidden.run.summary.length <= 300, true);
  const long = finish(queued, 'fail', 'n'.repeat(500));
  assert.equal(long.run.summary.length, 300);
  assert.equal(long.run.summary, 'n'.repeat(300));
  const named = start({ name: fakeToken });
  assert.equal(named.ok, false);
  assert.match(named.error, /key/);
  assert.doesNotMatch(named.error, /ghp_/);
});

test('a gate that does not say required counts as required, and an optional one stays optional', () => {
  const implied = rollup([{ name: 'suite', state: 'done', conclusion: 'fail' }]);
  assert.equal(implied.verdict, 'fail');
  const opened = start({ name: 'lint', required: false });
  assert.equal(opened.run.required, false);
  const done = finish(opened.run, 'fail', 'style only');
  assert.equal(done.run.required, false);
  assert.deepEqual(rollup([done.run]), { verdict: 'pass', unstable: true });
});

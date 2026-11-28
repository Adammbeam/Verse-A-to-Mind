// One merge state per change request, before the runner tries it. Run: node --test tools/merge-state.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MERGE, mergeState } from '../void-live-deploy/lib/merge-state.js';

const pass = (name) => ({ name, state: 'done', conclusion: 'pass' });
const fail = (name) => ({ name, state: 'done', conclusion: 'fail' });

function expect(input, state, reason) {
  const row = mergeState(input);
  assert.equal(row.state, state);
  assert.equal(row.reason, reason);
  assert.ok(row.reason.length < 80, row.reason);
  assert.deepEqual(Object.keys(row).sort(), ['reason', 'state']);
  return row;
}

test('the outcomes are frozen', () => {
  assert.equal(Object.isFrozen(MERGE), true);
  assert.equal(Object.isFrozen(MERGE.OUTCOMES), true);
  assert.deepEqual(MERGE.OUTCOMES, ['draft', 'dirty', 'blocked', 'behind', 'unstable', 'clean', 'unknown']);
});

test('draft', () => {
  expect({ draft: true, conflict: false, runs: [pass('gate')] }, 'draft', 'Draft: this change stays out of the merge.');
});

test('dirty', () => {
  expect({ draft: false, conflict: true, runs: [pass('gate')] }, 'dirty', 'Dirty: this change conflicts with main.');
});

test('blocked when a required run failed', () => {
  const row = expect({
    conflict: false,
    required: ['gate'],
    runs: [fail('gate'), pass('lint')],
  }, 'blocked', 'Blocked: required check gate failed.');
  assert.match(row.reason, /gate/);
});

test('blocked when a rule says no', () => {
  const row = expect({
    conflict: false,
    required: ['gate'],
    runs: [pass('gate')],
    rules: { no: 'held-paths' },
  }, 'blocked', 'Blocked: rule held-paths says no.');
  assert.match(row.reason, /held-paths/);
});

test('unstable when only a non-required run failed', () => {
  const row = expect({
    conflict: false,
    behind_by: 2,
    required: ['gate'],
    runs: [pass('gate'), fail('lint')],
    rules: {},
  }, 'unstable', 'Unstable: check lint failed and is not required.');
  assert.match(row.reason, /lint/);
});

test('behind only when the up-to-date rule is on', () => {
  const row = expect({
    conflict: false,
    behind_by: 3,
    required: ['gate'],
    runs: [pass('gate')],
    rules: { up_to_date: true },
  }, 'behind', 'Behind: the up-to-date rule applies.');
  assert.match(row.reason, /up-to-date/);
  expect({
    conflict: false,
    behind_by: 3,
    required: ['gate'],
    runs: [pass('gate')],
    rules: { up_to_date: false },
  }, 'clean', 'Clean: required checks passed and this merges.');
});

test('clean', () => {
  expect({
    draft: false,
    conflict: false,
    behind_by: 0,
    required: ['gate', 'review'],
    runs: [pass('gate'), { name: 'review', state: 'done', conclusion: 'neutral' }],
    rules: { up_to_date: true },
  }, 'clean', 'Clean: required checks passed and this merges.');
});

test('unknown when conflict is null and there are no runs', () => {
  expect({
    draft: false,
    conflict: null,
    behind_by: 0,
    required: [],
    runs: [],
  }, 'unknown', 'Unknown: conflict is unset and there are no check runs.');
});

test('precedence is draft, dirty, blocked, behind, unstable, then clean', () => {
  const full = {
    draft: true,
    conflict: true,
    behind_by: 4,
    required: ['gate'],
    runs: [pass('gate'), fail('lint')],
    rules: { up_to_date: true, no: 'held-paths' },
  };
  assert.equal(mergeState(full).state, 'draft');
  assert.equal(mergeState({ ...full, draft: false }).state, 'dirty');
  assert.equal(mergeState({ ...full, draft: false, conflict: false, runs: [fail('gate')] }).state, 'blocked');
  assert.equal(mergeState({ ...full, draft: false, conflict: false, rules: { up_to_date: true } }).state, 'behind');
  assert.equal(mergeState({ ...full, draft: false, conflict: false, behind_by: 0, rules: {} }).state, 'unstable');
  assert.equal(mergeState({
    draft: false, conflict: false, behind_by: 2, required: ['gate'], runs: [pass('gate')], rules: {},
  }).state, 'clean');
});

test('a later pass clears an earlier fail, and a timeout still blocks', () => {
  expect({
    conflict: false,
    required: [],
    runs: [fail('lint'), { name: 'lint', state: 'done', conclusion: 'pass', at: 2 }],
  }, 'clean', 'Clean: required checks passed and this merges.');
  const timed = mergeState({
    conflict: false,
    required: ['gate'],
    runs: [{ name: 'gate', state: 'done', conclusion: 'timeout' }],
  });
  assert.equal(timed.state, 'blocked');
  assert.match(timed.reason, /gate/);
  assert.ok(timed.reason.length < 80);
});

test('a required check that is still running is unknown, and a stale one is not a failure', () => {
  assert.equal(mergeState({
    conflict: false,
    required: ['gate'],
    runs: [{ name: 'gate', state: 'running', conclusion: '' }],
  }).state, 'unknown');
  expect({
    conflict: false,
    required: ['gate'],
    runs: [pass('gate'), { name: 'lint', state: 'done', conclusion: 'stale' }],
  }, 'clean', 'Clean: required checks passed and this merges.');
});

test('a missing required check is unknown, and conflict null stays unknown after a pass', () => {
  assert.equal(mergeState({
    conflict: false,
    required: ['gate', 'review'],
    runs: [pass('gate')],
  }).state, 'unknown');
  assert.equal(mergeState({
    conflict: null,
    required: ['gate'],
    runs: [pass('gate')],
  }).state, 'unknown');
});

test('the input is not mutated and a key-shaped check name is not copied out', () => {
  // secret-scan: ok (made-up token shape, not a real key)
  const fake = 'ghp_' + 'x'.repeat(36);
  const input = { conflict: false, required: [fake], runs: [{ name: fake, state: 'done', conclusion: 'fail' }] };
  const snap = JSON.stringify(input);
  const row = mergeState(input);
  assert.equal(JSON.stringify(input), snap);
  assert.equal(row.state, 'blocked');
  assert.equal(JSON.stringify(row).includes('ghp_'), false);
  assert.equal(JSON.stringify(row).includes(fake), false);
  assert.ok(row.reason.length < 80);
});

test('a very long check name still leaves a short reason', () => {
  const name = 'gate-' + 'n'.repeat(200);
  const row = mergeState({ conflict: false, required: [name], runs: [fail(name)] });
  assert.equal(row.state, 'blocked');
  assert.ok(row.reason.length < 80);
  assert.match(row.reason, /^Blocked: required check gate-/);
});

test('stands alone from any other helper', () => {
  const src = readFileSync(fileURLToPath(new URL('../void-live-deploy/lib/merge-state.js', import.meta.url)), 'utf8');
  assert.equal(/^\s*import /m.test(src), false);
  assert.equal(src.includes('check-run'), false);
});

test('an empty input is unknown', () => {
  expect(undefined, 'unknown', 'Unknown: conflict is unset and there are no check runs.');
  expect(null, 'unknown', 'Unknown: conflict is unset and there are no check runs.');
});

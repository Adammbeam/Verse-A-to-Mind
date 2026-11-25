import test from 'node:test';
import assert from 'node:assert/strict';
import { diffStat, idOf, newProposal, canDecide, nextState, describe, sameSecret, MAX_DIFF } from '../void-live-deploy/lib/proposals.js';
import { prove } from './local-ship.mjs';

const DIFF = `diff --git a/tools/a.mjs b/tools/a.mjs
index 1111111..2222222 100644
--- a/tools/a.mjs
+++ b/tools/a.mjs
@@ -1,3 +1,4 @@
 keep
-old line
+new line
+another line
 tail
`;

test('a diff says how many files it touches and how much it changes', () => {
  assert.deepEqual(diffStat(DIFF), { files: 1, added: 2, removed: 1 });
  assert.deepEqual(diffStat(''), { files: 0, added: 0, removed: 0 });
  // the --- / +++ headers are not changes, and a two-file diff counts both
  const two = DIFF + DIFF.replace(/tools\/a\.mjs/g, 'tools/b.mjs');
  assert.deepEqual(diffStat(two), { files: 2, added: 4, removed: 2 });
});

test('an id is stable for a title and a moment, and two titles never share one', () => {
  const now = '2026-11-24T17:00:00.000Z';
  assert.equal(idOf(now, 'Forge: a patch'), '20261124170000-forge-a-patch');
  assert.notEqual(idOf(now, 'Forge: a patch'), idOf(now, 'Forge: another patch'));
  assert.equal(idOf(now, '!!!'), '20261124170000-change');
});

test('a proposal needs a branch, a title and a real unified diff', () => {
  const base = { branch: 'helper/x', title: 't', diff: DIFF };
  const p = newProposal(base, { now: '2026-11-24T17:00:00.000Z' });
  assert.equal(p.state, 'open');
  assert.deepEqual([p.files, p.added, p.removed], [1, 2, 1]);
  assert.equal(p.tests, '', 'nobody said what they ran, and the record says so');
  assert.throws(() => newProposal({ ...base, diff: '' }), /needs a diff/);
  assert.throws(() => newProposal({ ...base, diff: 'just some words' }), /not a unified diff/);
  assert.throws(() => newProposal({ ...base, branch: '' }), /branch/);
  assert.throws(() => newProposal({ ...base, title: '' }), /title/);
  assert.throws(() => newProposal({ ...base, diff: DIFF + 'x'.repeat(MAX_DIFF) }), /too large/);
});

test('a proposal moves only along legal edges', () => {
  assert.equal(canDecide('open', 'check'), true);
  assert.equal(canDecide('checking', 'ship'), true);
  assert.equal(canDecide('open', 'revert'), false, 'nothing to revert before it ships');
  assert.equal(canDecide('shipped', 'ship'), false, 'shipping twice is not a transition');
  assert.equal(canDecide('shipped', 'revert'), true);
  assert.equal(canDecide('reverted', 'ship'), false);
  assert.equal(nextState('open', 'ship'), 'shipped');
  assert.equal(nextState('shipped', 'ship'), 'shipped', 'an illegal decision leaves the state alone');
  assert.equal(nextState('checking', 'refuse'), 'refused');
});

test('a proposal reads as one line', () => {
  const line = describe({ id: '1', title: 'Forge', author: 'agent', branch: 'helper/x', files: 2, added: 3, removed: 1, state: 'open', verdict: '' });
  assert.match(line, /#1 Forge by agent → helper\/x · 2 files, \+3 −1 · open/);
  assert.equal(describe(null), '');
});

/** A fake git that answers from a script, so prove() is tested without touching a real repository. */
function fakeRun(answers) {
  const calls = [];
  const run = (cmd, args, opts = {}) => {
    const key = cmd + ' ' + args.join(' ');
    calls.push({ key, input: opts.input });
    for (const [match, answer] of Object.entries(answers)) if (key.includes(match)) return typeof answer === 'function' ? answer() : answer;
    return { ok: true, out: '' };
  };
  run.calls = calls;
  return run;
}

const P = { id: '1', branch: 'helper/x', diff: DIFF };

test('prove() applies the patch, runs both gates, and hands back the commit it proved', async () => {
  const run = fakeRun({ 'git worktree add': { ok: true, out: '' }, 'git apply': { ok: true, out: '' }, 'git rev-parse HEAD': { ok: true, out: 'abc1234\n' } });
  const r = await prove(P, { root: '/repo', run });
  assert.equal(r.ok, true);
  assert.deepEqual(r.gates.map((g) => g.name), ['review', 'merge-gate']);
  const apply = run.calls.find((c) => c.key.startsWith('git apply'));
  assert.equal(apply.input, DIFF, 'the patch goes in on stdin, not through a shell');
  // the bug this pins: the worktree is deleted, so the only thing worth carrying out is a commit sha
  assert.equal(r.sha, 'abc1234', 'the proven tree is a commit, not a branch name');
  assert.ok(run.calls.some((c) => c.key.includes('commit -m proposal')), 'the applied index is committed before the worktree goes');
  assert.ok(run.calls.some((c) => c.key.includes('worktree remove')), 'the throwaway worktree is cleaned up');
});

test('prove() refuses when the patch would not commit, and carries no sha', async () => {
  const run = fakeRun({
    'git worktree add': { ok: true }, 'git apply': { ok: true },
    'commit -m proposal': { ok: false, out: 'nothing to commit' },
  });
  const r = await prove(P, { root: '/repo', run });
  assert.equal(r.ok, false);
  assert.equal(r.sha, undefined, 'nothing mergeable comes back from a failed commit');
  assert.match(r.why, /would not commit/);
});

test('two secrets compare without an early exit', () => {
  assert.equal(sameSecret('abc', 'abc'), true);
  assert.equal(sameSecret('abc', 'abd'), false);
  assert.equal(sameSecret('abc', 'ab'), false, 'a shorter guess is not a match');
  assert.equal(sameSecret('', ''), false, 'an unset token never matches an unset token');
  assert.equal(sameSecret('abc', ''), false);
});

test('prove() refuses a branch that is not here, a patch that does not apply, and a red gate', async () => {
  const missing = await prove(P, { root: '/repo', run: fakeRun({ 'git worktree add': { ok: false, out: 'fatal: not a valid object name' } }) });
  assert.equal(missing.ok, false);
  assert.match(missing.why, /no such branch/);

  const bad = await prove(P, { root: '/repo', run: fakeRun({ 'git worktree add': { ok: true }, 'git apply': { ok: false, out: 'error: patch failed' } }) });
  assert.equal(bad.ok, false);
  assert.match(bad.why, /does not apply/);

  const red = await prove(P, { root: '/repo', run: fakeRun({
    'git worktree add': { ok: true }, 'git apply': { ok: true },
    'tools/review-pr.mjs': { ok: false, out: 'blocking: empty catch\nsecond line' },
  }) });
  assert.equal(red.ok, false);
  assert.match(red.why, /review: blocking: empty catch/);
});

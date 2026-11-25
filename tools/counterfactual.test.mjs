import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fork, runBranch, score, select, sandbox, mount, cloneState, MAX_BRANCHES, LATENCY_BUDGET_MS } from '../void-live-deploy/lib/counterfactual.js';

test('fork: creates n branches', () => {
  const b = fork({ x: 1 }, 3);
  assert.equal(b.length, 3);
  assert.equal(b[0].branchId, 'branch-0');
  assert.equal(b[0].data.x, 1);
});
test('fork: caps at MAX_BRANCHES', () => {
  const b = fork({ x: 1 }, 10);
  assert.equal(b.length, 4);
});
test('runBranch: success', () => {
  const br = fork({ x: 1 }, 1)[0];
  const r = runBranch(br, (d) => d.x + 1);
  assert.equal(r.ok, true);
  assert.equal(r.result, 2);
  assert.equal(r.error, null);
});
test('runBranch: catches errors', () => {
  const br = fork({ x: 1 }, 1)[0];
  const r = runBranch(br, () => { throw new Error('boom'); });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'boom');
});
test('score: non-empty passes', () => {
  const br = fork({ x: 1 }, 1)[0];
  const r = runBranch(br, (d) => ({ answer: 'hello' }));
  const s = score(r, { schema: { answer: 'string' } });
  assert.equal(s.pass, true);
  assert.ok(s.score > 0);
});
test('score: empty fails', () => {
  const br = fork({ x: 1 }, 1)[0];
  const r = runBranch(br, () => null);
  const s = score(r, {});
  assert.equal(s.pass, false);
  assert.ok(s.reasons.includes('empty-output'));
});
test('score: schema missing key fails', () => {
  const br = fork({ x: 1 }, 1)[0];
  const r = runBranch(br, () => ({ foo: 'bar' }));
  const s = score(r, { schema: { answer: 'string' } });
  assert.equal(s.pass, false);
  assert.ok(s.reasons.includes('missing-key:answer'));
});
test('select: picks highest score', () => {
  const results = [
    { branch: { branchId: 'a' }, result: 'x', error: null, ok: true, ms: 10, pass: true, score: 90 },
    { branch: { branchId: 'b' }, result: 'y', error: null, ok: true, ms: 5, pass: true, score: 95 },
  ];
  const w = select(results);
  assert.equal(w.branch.branchId, 'b');
});
test('sandbox: runs strategies and selects winner', () => {
  const s = sandbox({ x: 1 }, [(d) => ({ answer: 'a' }), (d) => ({ answer: 'b' })]);
  assert.equal(s.ok, true);
  assert.equal(s.count, 2);
  assert.ok(s.winner);
});
test('mount: applies winner result', () => {
  const winner = { result: { answer: 'hello' }, branch: { branchId: 'b0' } };
  const r = mount(winner, { old: 'data' });
  assert.equal(r.answer, 'hello');
  assert.equal(r.old, 'data');
});
test('cloneState: deep clones', () => {
  const s = { a: { b: 1 } };
  const c = cloneState(s, 'x');
  c.data.a.b = 99;
  assert.equal(s.a.b, 1);
});
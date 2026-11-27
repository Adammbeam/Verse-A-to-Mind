// lib/cr-settle.js: live, wait or back from the code store's checks and deploys, with no GitHub fetch (loop L1.2).
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProof } from '../void-live-deploy/lib/cr-proof.js';
import { settleOf, checkFor, latest } from '../void-live-deploy/lib/cr-settle.js';

const A = 'a'.repeat(39) + '1', B = 'b'.repeat(39) + '2', M = 'c'.repeat(39) + '3'; // secret-scan: ok (made-up commit ids)
const REF = 'refs/heads/cr/GrokBot/ask-1';
const proof = parseProof('cr/GrokBot/ask-1@' + A);
const chk = (state, at, sha = A, ref = REF) => ({ at, ref, sha, state, summary: state + ' summary', by: 'owner' });
const dep = (state, at, sha = M) => ({ at, sha, deployment: 'd' + at, state, url: 'https://d' + at + '.a-to-mind.pages.dev', by: 'owner' });

test('no check yet, or a running one, waits', () => {
  assert.equal(settleOf(proof, { checks: [], deploys: [] }).how, 'wait');
  assert.equal(settleOf(proof, { checks: [chk('running', 10)] }).how, 'wait');
  assert.equal(settleOf(proof, { checks: [chk('green', 10, A, 'refs/heads/cr/other/x')] }).how, 'wait');
  assert.equal(settleOf(null, {}).how, 'wait');
});

test('the latest check red sends it back, even after an older green', () => {
  const r = settleOf(proof, { checks: [chk('red', 20), chk('green', 10)], deploys: [dep('live', 15)] });
  assert.equal(r.how, 'back'); assert.match(r.why, /red/);
});

test('green with a live deploy of the landed sha, the proof sha, or after the green is live', () => {
  assert.equal(settleOf(proof, { checks: [chk('green', 10)], deploys: [dep('live', 5, M)] }, { landed: M }).how, 'live');
  assert.equal(settleOf(proof, { checks: [chk('green', 10)], deploys: [dep('live', 5, A)] }).how, 'live');
  const r = settleOf(proof, { checks: [chk('green', 10)], deploys: [dep('live', 11)] });
  assert.equal(r.how, 'live'); assert.equal(r.deploy.deployment, 'd11'); assert.match(r.why, /live at https:/);
});

test('green with no deploy, an older deploy, or a failed or rolled-back one waits', () => {
  assert.equal(settleOf(proof, { checks: [chk('green', 10)], deploys: [] }).how, 'wait');
  assert.equal(settleOf(proof, { checks: [chk('green', 10)], deploys: [dep('live', 5)] }).how, 'wait');
  const r = settleOf(proof, { checks: [chk('green', 10)], deploys: [dep('rolled back', 12)] });
  assert.equal(r.how, 'wait'); assert.match(r.why, /rolled back/);
  assert.equal(settleOf(proof, { checks: [chk('green', 10)], deploys: [dep('failed', 12)] }).how, 'wait');
});

test('a proof sha picks its own check; a ref-only proof takes the ref\'s newest check', () => {
  const st = { checks: [chk('red', 30, B), chk('green', 10, A)], deploys: [dep('live', 12)] };
  assert.equal(settleOf(proof, st).how, 'live');
  const bare = parseProof(REF), r = settleOf(bare, st);
  assert.equal(r.how, 'back'); assert.equal(r.sha, B);
  assert.equal(checkFor(bare, st).sha, B);
  assert.equal(latest([{ at: 1, n: 1 }, { at: 1, n: 2 }]).n, 1);
});

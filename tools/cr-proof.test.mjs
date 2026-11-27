// lib/cr-proof.js: a Verse change-request proof, the crew room's hand-in without a GitHub pull request (loop L1.1).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../void-live-deploy/lib/cr-proof.js';

const SHA = '3f9a1c27d4be5a6f8091c2d3e4f5a6b7c8d9e0f1';

test('the three proof shapes parse to one ref, sha and job', () => {
  const want = { ok: true, kind: 'verse', ref: 'refs/heads/cr/GrokBot/ask-12013', sha: SHA, seat: 'GrokBot', job: 'ask-12013' };
  assert.deepEqual(P.parseProof('cr/GrokBot/ask-12013@' + SHA), want);
  assert.deepEqual(P.parseProof('  https://a-to-mind.com/code/verse.git#cr/GrokBot/ask-12013@' + SHA + ' '), want);
  assert.deepEqual(P.parseProof('refs/heads/cr/GrokBot/ask-12013@' + SHA), want);
  assert.deepEqual(P.parseProof('refs/heads/cr/GrokBot/ask-12013'), { ...want, sha: null });
  assert.equal(P.parseProof('cr/GrokBot/ask-12013@' + SHA.toUpperCase()).sha, SHA);
});

test('a GitHub pull request is tagged github, never a Verse proof', () => {
  const r = P.parseProof('https://github.com/Adammbeam/Verse-A-to-Mind/pull/141');
  assert.equal(r.ok, false); assert.equal(r.kind, 'github'); assert.equal(r.url, 'https://github.com/Adammbeam/Verse-A-to-Mind/pull/141');
});

test('bad shapes are refused with a reason', () => {
  for (const bad of ['', 'cr/GrokBot/ask-1', 'cr/GrokBot@' + SHA, 'cr/a/b/c@' + SHA, 'cr/a b/c@' + SHA, 'cr/a/b@1234', 'feature/x@' + SHA,
    'https://example.com/code/verse.git#cr/a/b@' + SHA, 'https://a-to-mind.com/code/verse.git#cr/a/b', 'x'.repeat(400)]) {
    const r = P.parseProof(bad); assert.equal(r.ok, false, bad); assert.ok(r.say && r.say.length > 5, bad); assert.notEqual(r.kind, 'verse');
  }
});

test('anything secret-shaped is refused and never echoed back', () => {
  const key = 'vt1.0123456789ab.' + 'f'.repeat(32); // secret-scan: ok (a made-up team key)
  for (const s of ['cr/a/' + key + '@' + SHA, key, 'cr/a/b@' + SHA + ' token=' + 'q'.repeat(20), 'https://a-to-mind.com/code/verse.git#cr/a/b@' + SHA + '?token=' + 'z'.repeat(24), 'Bearer ' + 'k'.repeat(30)]) {
    const r = P.parseProof(s); assert.equal(r.ok, false, s); assert.ok(!JSON.stringify(r).includes(key)); assert.ok(!JSON.stringify(r).includes('q'.repeat(20)));
  }
  assert.equal(P.secretShaped('cr/GrokBot/ask-1@' + SHA), false);
});

test('names, proof text and the note round-trip', () => {
  assert.equal(P.crName('Grok Bot', 'ask-12013'), 'cr/Grok-Bot/ask-12013');
  assert.throws(() => P.crName('', 'x'));
  const p = P.parseProof('cr/GrokBot/ask-1@' + SHA);
  assert.equal(P.proofText(p), 'cr/GrokBot/ask-1@' + SHA);
  const note = P.noteOf(p, 'GrokBot', 'adds the thing');
  assert.match(note, /^review by store: cr\/GrokBot\/ask-1@/);
  assert.ok(!note.startsWith('review by team:'));
  assert.deepEqual(P.proofOfNote(note), p);
  assert.deepEqual(P.proofOfNote('live: checks green · ' + note), p);
  assert.equal(P.proofOfNote('review by team:Beam · https://github.com/a/b/pull/1'), null);
  assert.equal(P.proofOfNote(P.noteOf({ ref: 'refs/heads/cr/a/b', sha: null })).sha, null);
});

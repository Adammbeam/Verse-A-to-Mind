// tools/verse-ship.mjs: a seat's one-command ship to Verse's code store as cr/<seat>/<job> (loop L1.3). The store is mocked: no network,
// and main never moves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ship, main, argsOf } from './verse-ship.mjs';
import { parseProof } from '../void-live-deploy/lib/cr-proof.js';

const KEY = 'vt1.0123456789ab.' + 'e'.repeat(32); // secret-scan: ok (a made-up team key)
const SHA = '9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a291807';
const run = (args) => { if (args[0] === 'rev-parse') return SHA; if (args[0] === 'diff') return 'diff --git a/x b/x\n+one\n'; throw new Error('no ' + args[0]); };
const pushes = () => { const calls = []; const push = async (o) => { calls.push(o); return { ok: true, sha: o.ref, packs: ['pack-' + 'f'.repeat(40)] }; }; return { calls, push }; };

test('args come from flags or VERSE_JOB_ID and VERSE_SEAT', () => {
  assert.deepEqual(argsOf(['--job', 'ask-1', '--seat', 'Grok', '--dry-run']), { job: 'ask-1', seat: 'Grok', ref: 'HEAD', dryRun: true, diff: false });
  assert.deepEqual(argsOf([], { VERSE_JOB_ID: 'ask-2', VERSE_SEAT: 'Beam' }), { job: 'ask-2', seat: 'Beam', ref: 'HEAD', dryRun: false, diff: false });
});

test('a push goes to cr/<seat>/<job>, never main, and returns a proof L1.1 reads', async () => {
  const { calls, push } = pushes();
  const r = await ship({ key: KEY, job: 'ask-12013', seat: 'Grok Bot', push, run });
  assert.equal(r.ok, true); assert.equal(r.proof, 'cr/Grok-Bot/ask-12013@' + SHA); assert.equal(r.sha, SHA);
  assert.equal(calls.length, 1); assert.equal(calls[0].to, 'cr/Grok-Bot/ask-12013'); assert.notEqual(calls[0].to, 'main');
  const p = parseProof(r.proof); assert.equal(p.ok, true); assert.equal(p.job, 'ask-12013');
});

test('--dry-run pushes nothing; --diff keeps the diff on the result', async () => {
  const { calls, push } = pushes();
  const r = await ship({ key: KEY, job: 'ask-1', seat: 'Grok', dryRun: true, diff: true, push, run });
  assert.equal(calls.length, 0); assert.equal(r.dryRun, true); assert.match(r.diff, /\+one/);
});

test('the seat comes from the team API when no name is given; no job, no seat or no key is refused', async () => {
  const { push } = pushes();
  const f = async (url, init) => { assert.match(url, /\?me$/); assert.equal(init.headers.authorization, 'Bearer ' + KEY); return Response.json({ ok: true, me: { kind: 'agent', name: 'GrokBot' } }); };
  assert.equal((await ship({ key: KEY, job: 'ask-1', push, run, f })).proof, 'cr/GrokBot/ask-1@' + SHA);
  assert.equal((await ship({ key: KEY, job: '', seat: 'a', push, run })).ok, false);
  assert.equal((await ship({ key: KEY, job: 'x', push, run, f: async () => Response.json({ ok: true, me: null }) })).ok, false);
  assert.equal((await ship({ key: '', job: 'x', seat: 'a', push, run })).ok, false);
});

test('the CLI prints only the proof and the sha, never the key, even when the store refuses', async () => {
  const out = [], errs = [], { push } = pushes();
  assert.equal(await main(['--job', 'ask-1', '--seat', 'Grok'], { env: {}, key: KEY, push, run, log: (s) => out.push(s), err: (s) => errs.push(s) }), 0);
  assert.deepEqual(out, ['cr/Grok/ask-1@' + SHA, SHA]);
  const bad = async () => { throw new Error('401 for Bearer ' + KEY); };
  assert.equal(await main(['--job', 'ask-1', '--seat', 'Grok'], { env: {}, key: KEY, push: bad, run, log: (s) => out.push(s), err: (s) => errs.push(s) }), 2);
  assert.ok(![...out, ...errs].join('\n').includes(KEY));
  assert.match(errs.join('\n'), /refused/);
});

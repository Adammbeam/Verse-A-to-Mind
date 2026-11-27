// lib/cr-settle-run.js: building jobs settled from Verse's code store alone (loop L1.6). A FAKE D1 (node:sqlite) holds the queue, the seats
// and the store's checks, deploys and change requests. No fetch is given, so a GitHub read would throw.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import * as C from '../void-live-deploy/lib/codestore.js';
import { settleStore, storeStatus, settledNote } from '../void-live-deploy/lib/cr-settle-run.js';

const A = '1'.repeat(39) + 'a', B = '2'.repeat(39) + 'b', M = '3'.repeat(39) + 'c'; // secret-scan: ok (made-up commit ids)
function d1() {
  const db = new DatabaseSync(':memory:');
  const stmt = (sql, a = []) => ({ bind: (...b) => stmt(sql, b), run: async () => { const r = db.prepare(sql).run(...a); return { meta: { changes: Number(r.changes) } }; }, first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }) });
  return { prepare: (sql) => stmt(sql), raw: db };
}
function world() {
  const DB = d1();
  for (const t of C.TABLES) DB.raw.exec(t);
  DB.raw.exec('CREATE TABLE void_queue (id TEXT PRIMARY KEY, ask TEXT, target TEXT, state TEXT, note TEXT, at TEXT, updated TEXT)');
  DB.raw.exec('CREATE TABLE void_team_agents (id TEXT PRIMARY KEY, name TEXT, job TEXT, job_at INTEGER, thread INTEGER)');
  return { DB };
}
const job = (env, id, note, state = 'building') => env.DB.raw.prepare('INSERT INTO void_queue VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, 'ask ' + id, 'feature:' + id, state, note, '2026-11-27T00:00:00Z', '2026-11-27T00:00:00Z');
const check = (env, ref, sha, state, at, summary = state) => env.DB.raw.prepare('INSERT INTO void_code_checks (at, ref, sha, state, summary, by) VALUES (?, ?, ?, ?, ?, ?)').run(at, ref, sha, state, summary, 'owner');
const deploy = (env, sha, state, at) => env.DB.raw.prepare('INSERT INTO void_code_deploys (at, sha, deployment, state, url, by) VALUES (?, ?, ?, ?, ?, ?)').run(at, sha, 'dep' + at, state, 'https://dep' + at + '.a-to-mind.pages.dev', 'owner');
const ref = (env, name, sha, at = 1) => env.DB.raw.prepare('INSERT INTO void_code_refs (name, sha, at, by) VALUES (?, ?, ?, ?)').run(name, sha, at, 'team:x');
const q = (env, id) => env.DB.raw.prepare('SELECT state, note FROM void_queue WHERE id = ?').get(id);
const T0 = Date.UTC(2026, 10, 27, 23);

test('a proof with a green check and a live deploy goes live, with the deploy url in the note', async () => {
  const env = world();
  job(env, 'ask-1', 'review by store: cr/GrokBot/ask-1@' + A + ' · by team:GrokBot');
  check(env, 'refs/heads/cr/GrokBot/ask-1', A, 'running', 10); check(env, 'refs/heads/cr/GrokBot/ask-1', A, 'green', 20, 'gates passed');
  deploy(env, M, 'live', 30);
  const r = await settleStore(env, { now: T0 });
  assert.deepEqual([r.looked, r.live, r.back, r.wait], [1, 1, 0, 0]);
  const row = q(env, 'ask-1'); assert.equal(row.state, 'live'); assert.match(row.note, /^live: checks green, deploy dep30 live at https:\/\/dep30/); assert.match(row.note, /review by store:/);
  assert.equal((await settleStore(env, { now: T0 })).looked, 0, 'settled once');
});

test('a red check sends it back to the queue with the summary; running or no check waits', async () => {
  const env = world();
  job(env, 'ask-1', 'review by store: cr/GrokBot/ask-1@' + A);
  job(env, 'ask-2', 'review by store: cr/GrokBot/ask-2@' + B);
  job(env, 'ask-3', 'review by store: cr/GrokBot/ask-3@' + B);
  check(env, 'refs/heads/cr/GrokBot/ask-1', A, 'red', 10, 'merge-gate: tools/x.test.mjs failed');
  check(env, 'refs/heads/cr/GrokBot/ask-2', B, 'running', 10);
  const r = await settleStore(env, { now: T0 });
  assert.deepEqual([r.looked, r.live, r.back, r.wait], [3, 0, 1, 2]);
  assert.equal(q(env, 'ask-1').state, 'queued'); assert.match(q(env, 'ask-1').note, /^back: checks red: merge-gate/);
  assert.equal(q(env, 'ask-2').state, 'building'); assert.equal(q(env, 'ask-3').state, 'building');
});

test('a building job with no stored proof is matched by its cr/<seat>/<job> ref, and its seat is freed', async () => {
  const env = world();
  job(env, 'ask-7', 'claimed by team:GrokBot · 2026-11-27');
  job(env, 'ask-8', 'claimed by team:Beam · 2026-11-27');
  env.DB.raw.prepare('INSERT INTO void_team_agents VALUES (?, ?, ?, ?, ?)').run('s1', 'GrokBot', 'ask-7', 1, 5);
  ref(env, 'refs/heads/cr/GrokBot/ask-7', A); ref(env, 'refs/heads/cr/GrokBot/ask-8', B); ref(env, 'refs/heads/cr/GrokBot/nojob', B);
  check(env, 'refs/heads/cr/GrokBot/ask-7', A, 'green', 10); deploy(env, M, 'live', 11);
  check(env, 'refs/heads/cr/GrokBot/ask-8', B, 'green', 10);
  const r = await settleStore(env, { now: T0 });
  assert.equal(r.live, 1); assert.deepEqual(r.settled.map((s) => s.job), ['ask-7']);
  assert.equal(q(env, 'ask-7').state, 'live'); assert.match(q(env, 'ask-7').note, /store cr\/GrokBot\/ask-7@/);
  assert.equal(q(env, 'ask-8').state, 'building', 'another seat\'s job is not taken by a ref of the same name');
  assert.equal(env.DB.raw.prepare("SELECT job FROM void_team_agents WHERE id = 's1'").get().job, null);
});

test('GitHub review notes and other states are left alone; max caps a pass; a missing table settles nothing', async () => {
  const env = world();
  job(env, 'pr-1', 'review by team:Beam · https://github.com/Adammbeam/Verse-A-to-Mind/pull/9');
  job(env, 'old', 'review by store: cr/GrokBot/old@' + A, 'live');
  for (let i = 0; i < 5; i++) job(env, 'j' + i, 'review by store: cr/GrokBot/j' + i + '@' + A);
  const r = await settleStore(env, { now: T0, max: 3 });
  assert.equal(r.looked, 3); assert.equal(q(env, 'pr-1').state, 'building'); assert.equal(q(env, 'old').state, 'live');
  assert.deepEqual(await settleStore({ DB: d1() }), { looked: 0, live: 0, back: 0, wait: 0, settled: [] });
  assert.deepEqual(Object.keys(await storeStatus(env)), ['checks', 'deploys', 'changes']);
  assert.ok(settledNote('live', 'x', 'y'.repeat(400)).length <= 300);
});

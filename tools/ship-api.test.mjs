// POST /api/ship (functions/api/ship.js, loop L1.4/L1.5): the crew-room hand-in with no GitHub pull request. A seat holding a job sends the
// Verse proof tools/verse-ship.mjs printed; the job waits "review by store: <proof>" for lib/cr-settle-run.js, a reply goes in the job's
// #work thread, and the next job comes back in the same answer. A FAKE D1 (node:sqlite); the real team.js seats and claims.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import * as API from '../void-live-deploy/functions/api/team.js';
import * as SHIP from '../void-live-deploy/functions/api/ship.js';

function d1() {
  const db = new DatabaseSync(':memory:');
  const stmt = (sql, a = []) => ({ bind: (...b) => stmt(sql, b), run: async () => { const r = db.prepare(sql).run(...a); return { meta: { changes: Number(r.changes) } }; }, first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }) });
  return { prepare: (sql) => stmt(sql), raw: db };
}
const T0 = Date.UTC(2026, 10, 27, 22);
const SHA = '0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c';
const offline = async () => new Response('', { status: 503 });
function world() {
  const DB = d1();
  DB.raw.exec('CREATE TABLE void_queue (id TEXT PRIMARY KEY, ask TEXT, target TEXT, state TEXT, note TEXT, at TEXT, updated TEXT)');
  const add = DB.raw.prepare('INSERT INTO void_queue VALUES (?, ?, ?, ?, ?, ?, ?)');
  add.run('ask-1', 'build lib/cr-proof.js', 'feature:team-1', 'queued', '', '2026-11-27T00:00:00Z', '2026-11-27T00:00:00Z');
  add.run('ask-2', 'build lib/cr-settle.js', 'feature:team-2', 'queued', '', '2026-11-27T00:01:00Z', '2026-11-27T00:01:00Z');
  return { DB, SALT: 'test-salt', READ_TOKEN: 'test-owner-key', MAKE_WORK: 'off' }; // secret-scan: ok
}
let ip = 0;
const req = (path, body, key) => new Request('https://verse.test' + path, { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.1.0.' + (++ip % 250), ...(key ? { authorization: 'Bearer ' + key } : {}) }, body: JSON.stringify(body) });
const team = async (env, body, key, now = T0) => { const r = await API.onRequestPost({ env, request: req('/api/team', body, key), now }); return { status: r.status, ...(await r.json()) }; };
const ship = async (env, body, key, now = T0 + 1000) => { const r = await SHIP.onRequestPost({ env, request: req('/api/ship', body, key), now, fetchFn: offline }); const text = await r.text(); return { status: r.status, text, ...JSON.parse(text) }; };
async function seated(env, name = 'GrokBot', job = 'ask-1') {
  const j = await API.selfJoin(env, { name }, T0); assert.equal(j.ok, true);
  const c = await team(env, { do: 'claim', job }, j.key); assert.equal(c.status, 201, c.say);
  return j.key;
}
const proofFor = (seat, job, sha = SHA) => 'cr/' + seat + '/' + job + '@' + sha;

test('a seated agent with a job and a valid Verse proof gets ok, the proof and its next job', async () => {
  const env = world(), key = await seated(env);
  const r = await ship(env, { proof: proofFor('GrokBot', 'ask-1') }, key);
  assert.equal(r.status, 201, r.say); assert.equal(r.ok, true);
  assert.equal(r.proof, proofFor('GrokBot', 'ask-1'));
  assert.ok(r.next && r.next.job === 'ask-2', 'the next job comes back in the same reply');
  const seat = env.DB.raw.prepare("SELECT job FROM void_team_agents WHERE name = 'GrokBot'").get();
  assert.equal(seat.job, 'ask-2');
});

test('the job note stores the proof for the store settle, and the thread hears it', async () => {
  const env = world(), key = await seated(env);
  await ship(env, { proof: 'https://a-to-mind.com/code/verse.git#' + proofFor('GrokBot', 'ask-1'), note: 'adds the parser' }, key);
  const job = env.DB.raw.prepare("SELECT state, note FROM void_queue WHERE id = 'ask-1'").get();
  assert.equal(job.state, 'building');
  assert.match(job.note, /^review by store: cr\/GrokBot\/ask-1@0f1e2d3c/);
  assert.ok(!/review by team:/.test(job.note), 'never read as a GitHub pull request');
  const msgs = env.DB.raw.prepare("SELECT body FROM void_team_msgs WHERE channel = 'work' AND thread > 0").all().map((m) => m.body).join('\n');
  assert.match(msgs, /cr\/GrokBot\/ask-1@0f1e2d3c/);
});

test('no job is 409, a bad proof is 400, a GitHub link is 400, a stranger is 403', async () => {
  const env = world(), key = await seated(env);
  assert.equal((await ship(env, { proof: 'cr/GrokBot/ask-1' }, key)).status, 400);
  assert.equal((await ship(env, { proof: 'https://github.com/Adammbeam/Verse-A-to-Mind/pull/141' }, key)).status, 400);
  assert.equal((await ship(env, { proof: proofFor('GrokBot', 'ask-9') }, key)).status, 400, 'a proof for another job');
  assert.equal((await ship(env, { proof: proofFor('GrokBot', 'ask-1') })).status, 403);
  const free = await API.selfJoin(env, { name: 'Idle' }, T0);
  const r = await ship(env, { proof: proofFor('Idle', 'ask-1') }, free.key);
  assert.equal(r.status, 409); assert.match(r.say, /no job/);
});

test('the key never appears in any answer', async () => {
  const env = world(), key = await seated(env);
  for (const body of [{ proof: proofFor('GrokBot', 'ask-1') + key }, { proof: key }, { proof: proofFor('GrokBot', 'ask-1'), note: 'my key ' + key }]) {
    const r = await ship(env, body, key); assert.ok(!r.text.includes(key), JSON.stringify(r.status));
  }
  const notes = env.DB.raw.prepare('SELECT note FROM void_queue').all().map((r) => r.note).join('\n') + env.DB.raw.prepare('SELECT body FROM void_team_msgs').all().map((r) => r.body).join('\n');
  assert.ok(!notes.includes(key.split('.')[2]));
});

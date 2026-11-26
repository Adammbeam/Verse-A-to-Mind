// Lanes, stock and the owner's crew panel (lib/team-lanes.js; functions/api/team.js handOut, crewPanel and the self-join starter job;
// lib/team-crew-run.js stockNow). Run: node --test tools/team-lanes.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import * as LN from '../void-live-deploy/lib/team-lanes.js';
import * as API from '../void-live-deploy/functions/api/team.js';
import { stockNow } from '../void-live-deploy/lib/team-crew-run.js';
import * as T from '../void-live-deploy/lib/team.js';

const T0 = Date.UTC(2026, 10, 25, 15);
const J = (id, target, ask, extra = {}) => ({ id, target, ask, state: 'queued', note: '', at: '2026-11-20T00:00:00Z', ...extra });

test('a lane is the kinds and areas of the work a seat closed', () => {
  const lane = LN.laneOf([J('a', 'flake:x', 'fix tools/browser-checks.mjs'), J('b', 'flake:y', 'steady tools/test_void.mjs'), J('c', 'feature:z', 'a card on /films/')]);
  assert.deepEqual(lane.kinds, { flake: 2, feature: 1 });
  assert.equal(lane.areas.tools, 2); assert.equal(lane.areas['page:/films/'], 1);
  assert.equal(lane.top[0], 'flake'); assert.equal(lane.n, 3);
  assert.deepEqual(LN.laneOf([]), { kinds: {}, areas: {}, top: [], n: 0 });
});

test('preferLane: owner asks stay first, the best fit leads the window, nothing past the window moves, no lane keeps the order', () => {
  const lane = LN.laneOf([J('d', 'flake:old', 'fix tools/browser-checks.mjs')]);
  const list = [J('team-9', 'feature:team-9', 'owner ask'), J('f1', 'feature:a', 'a card on /films/'), J('h1', 'heal:b', 'page /x/ is down'), J('fl', 'flake:c', 'steady tools/test_void.mjs')];
  assert.deepEqual(LN.preferLane(list, lane).map((j) => j.id), ['team-9', 'fl', 'f1', 'h1']);
  assert.deepEqual(LN.preferLane(list, LN.laneOf([])).map((j) => j.id), list.map((j) => j.id));
  assert.deepEqual(LN.preferLane(list, lane, 2).map((j) => j.id), ['team-9', 'f1', 'h1', 'fl'], 'outside the window Verse\'s order stands');
});

test('stock scales with the working seats, and a low stock raises the filing caps', () => {
  assert.equal(LN.stockTarget(0), 12); assert.equal(LN.stockTarget(10), 30);
  assert.deepEqual(LN.capsFor({ claimable: 265, seats: 10 }), { target: 30, short: 0, low: false, file: 2, open: 30 });
  const low = LN.capsFor({ claimable: 4, seats: 10 });
  assert.equal(low.low, true); assert.equal(low.short, 26); assert.equal(low.file, LN.FILE_MAX); assert.equal(low.open, 30);
  assert.equal(LN.capsFor({ claimable: 10, seats: 0 }).file, 2, 'a small shortfall keeps at least the base');
});

function d1() {
  const db = new DatabaseSync(':memory:');
  const stmt = (sql, a = []) => ({ bind: (...b) => stmt(sql, b), run: async () => { const r = db.prepare(sql).run(...a); return { meta: { changes: Number(r.changes) } }; }, first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }) });
  return { prepare: (sql) => stmt(sql), raw: db };
}
const OWNER = 'test-owner-key'; // secret-scan: ok
const req = (q, body, key) => new Request('https://verse.test/api/team' + q, body ? { method: 'POST', headers: { 'content-type': 'application/json', ...(key ? { authorization: 'Bearer ' + key } : {}) }, body: JSON.stringify(body) } : { headers: key ? { authorization: 'Bearer ' + key } : {} });
const post = async (env, body, key, now = T0) => { const r = await API.onRequestPost({ env, request: req('', body, key), now }); return { status: r.status, ...(await r.json()) }; };
const get = async (env, q, key, now = T0) => { const r = await API.onRequestGet({ env, request: req(q, null, key), now }); return { status: r.status, ...(await r.json()) }; };
async function world(jobs) {
  const DB = d1(), env = { DB, SALT: 's', READ_TOKEN: OWNER };
  DB.raw.exec('CREATE TABLE void_queue (id TEXT PRIMARY KEY, ask TEXT, target TEXT, state TEXT, note TEXT, at TEXT, updated TEXT)');
  const add = DB.raw.prepare('INSERT INTO void_queue VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (const j of jobs) add.run(j.id, j.ask, j.target, j.state, j.note, j.at, j.updated || j.at);
  await API.crewReady(env, T0);
  DB.raw.exec('CREATE TABLE IF NOT EXISTS void_team_crew (k TEXT PRIMARY KEY, v TEXT NOT NULL, at INTEGER NOT NULL)');
  return { DB, env };
}

test('hand-out prefers the seat\'s lane, the owner\'s ask still goes first, and a self-joined seat gets a starter job with its key', async () => {
  const { DB, env } = await world([
    J('feat-a', 'feature:tides', 'a tide table on /weather/', { at: '2026-11-10T00:00:00Z' }),
    J('flake-b', 'flake:counter', 'the counter check flakes in tools/browser-checks.mjs'),
    J('old-flake', 'flake:old', 'steady tools/browser-checks.mjs', { state: 'done' }),
  ]);
  const me = await post(env, { do: 'join', name: 'laner' });
  assert.equal(me.status, 201); assert.equal(me.job.job, 'feat-a', 'a seat with no history gets Verse\'s order as its starter job');
  const id = T.KEY_RE.exec(me.key)[1];
  DB.raw.prepare('INSERT INTO void_team_credits (agent, job, link, note, at) VALUES (?, ?, ?, ?, ?)').run(id, 'old-flake', 'https://github.com/o/r/pull/1', '', T0 - 1000);
  DB.raw.prepare("UPDATE void_queue SET state = 'queued', note = '' WHERE id = 'feat-a'").run();
  DB.raw.prepare('UPDATE void_team_agents SET job = NULL, job_at = NULL, thread = NULL WHERE id = ?').run(id);
  const g = await post(env, { do: 'next' }, me.key, T0 + 1000);
  assert.equal(g.job.job, 'flake-b', 'its closed flake work in tools/ puts the flake first');
  DB.raw.prepare("UPDATE void_queue SET state = 'queued', note = '' WHERE id = 'flake-b'").run();
  DB.raw.prepare('UPDATE void_team_agents SET job = NULL, job_at = NULL, thread = NULL, skip = \'\' WHERE id = ?').run(id);
  DB.raw.prepare("INSERT INTO void_queue VALUES ('team-77', 'owner ask', 'feature:team-77', 'queued', '', '2026-11-24T00:00:00Z', '2026-11-24T00:00:00Z')").run();
  assert.equal((await post(env, { do: 'next' }, me.key, T0 + 2000)).job.job, 'team-77', 'the owner\'s ask beats the lane');
  const waits = await post(env, { do: 'join', name: 'waiter', auto: false });
  assert.equal(waits.job, undefined, 'auto: false joins without a job');
});

test('the crew panel is the owner\'s: lanes, throughput, oldest claim and stock, and the clock\'s stock read', async () => {
  const { DB, env } = await world([J('a', 'heal:x', 'page /x/ is down'), J('b', 'gap:y', 'answer more about tides')]);
  const s = await post(env, { do: 'join', name: 'seat1' });
  assert.equal((await get(env, '?crew', s.key)).status, 403);
  assert.equal((await get(env, '?crew')).status, 401);
  const p = await get(env, '?crew', OWNER, T0 + 6e5);
  assert.equal(p.ok, true); assert.equal(p.seats.length, 1); assert.equal(p.seats[0].name, 'seat1');
  assert.equal(p.seats[0].busyMin, 10); assert.equal(p.oldestClaimMin, 10); assert.equal(p.active, 1); assert.equal(p.handed24, 1);
  assert.deepEqual(p.stock, { claimable: 1, target: 12, low: true, last: null });
  assert.ok(!JSON.stringify(p).includes('tides'), 'no job text on the panel');
  const st = await stockNow(env, T0 + 6e5);
  assert.equal(st.claimable, 1); assert.equal(st.seats, 1); assert.equal(st.low, true); assert.ok(st.file > 2);
  void DB;
});

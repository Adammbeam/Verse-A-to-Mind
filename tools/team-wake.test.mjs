// Wake-up bell tests (lib/team-wake.js). node --test tools/team-wake.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { wakeTick, recentWakes, staleWaitingJobs, WAKE_WAIT_MS, WAKE_COOLDOWN_MS } from '../void-live-deploy/lib/team-wake.js';
import * as T from '../void-live-deploy/lib/team.js';

const NOW = Date.UTC(2026, 10, 27, 20, 0, 0);
const iso = (ms) => new Date(ms).toISOString();

function makeEnv() {
  const sq = new DatabaseSync(':memory:');
  sq.exec(`
    CREATE TABLE void_queue (id TEXT PRIMARY KEY, ask TEXT NOT NULL, target TEXT NOT NULL, state TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', at TEXT NOT NULL);
    CREATE TABLE void_team_agents (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, key TEXT NOT NULL, seen INTEGER NOT NULL DEFAULT 0, off INTEGER NOT NULL DEFAULT 0, auto INTEGER NOT NULL DEFAULT 1, crew INTEGER NOT NULL DEFAULT 0, job TEXT, hook TEXT NOT NULL DEFAULT '', hook_secret TEXT NOT NULL DEFAULT '', hook_fails INTEGER NOT NULL DEFAULT 0);
  `);
  const DB = {
    prepare(sql) {
      let args = [];
      const stmt = {
        bind(...a) { args = a; return stmt; },
        async run() { sq.prepare(sql).run(...args); return { meta: { changes: 1 } }; },
        async all() { return { results: sq.prepare(sql).all(...args) }; },
        async first() { return sq.prepare(sql).get(...args) || null; },
      };
      return stmt;
    },
  };
  return { DB, sq };
}

function addJob(sq, { id, ask = 'build wake bell', target = 'feature:wake', state = 'queued', note = '', at }) {
  sq.prepare('INSERT INTO void_queue (id, ask, target, state, note, at) VALUES (?, ?, ?, ?, ?, ?)').run(id, ask, target, state, note, at);
}

function addSeat(sq, { id, name, key = 'hashed-key', seen = NOW - T.AWAY_MS - 60e3, off = 0, auto = 1, crew = 0, job = null, hook = 'https://hooks.wake-agent.org/bell', secret = 'wake-secret-1', fails = 0 }) {
  sq.prepare('INSERT INTO void_team_agents (id, name, key, seen, off, auto, crew, job, hook, hook_secret, hook_fails) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, name, key, seen, off, auto, crew, job, hook, secret, fails);
}

test('staleWaitingJobs filters to claimable queued jobs waiting at least 30 min', () => {
  const jobs = [
    { id: 'fresh', ask: 'too new', target: 'feature:a', state: 'queued', note: '', at: iso(NOW - WAKE_WAIT_MS + 1000) },
    { id: 'stale', ask: 'waited enough', target: 'feature:b', state: 'queued', note: '', at: iso(NOW - WAKE_WAIT_MS) },
    { id: 'non-team', ask: 'visitor miss', target: 'miss:c', state: 'queued', note: '', at: iso(NOW - WAKE_WAIT_MS - 60e3) },
    { id: 'claimed', ask: 'already taken', target: 'feature:d', state: 'claimed', note: '', at: iso(NOW - WAKE_WAIT_MS - 60e3) },
  ];
  const out = staleWaitingJobs(jobs, NOW);
  assert.deepEqual(out.map((j) => j.id), ['stale']);
});

test('jobs waiting under 30 min do not trigger wake pings', async () => {
  const env = makeEnv();
  addJob(env.sq, { id: 'j-fresh', at: iso(NOW - 29 * 60e3) });
  addSeat(env.sq, { id: 'a1', name: 'sleeper' });
  const calls = [];
  const res = await wakeTick(env, NOW, async (url, init) => { calls.push({ url, init }); return { status: 200 }; });
  assert.deepEqual(res, { pinged: 0, ok: 0, jobs: 0, logs: [] });
  assert.equal(calls.length, 0);
  assert.deepEqual(await recentWakes(env), []);
});

test('jobs waiting >= 30 min ping away hooked seats with valid HMAC and log each ping', async () => {
  const env = makeEnv();
  addJob(env.sq, { id: 'j-old', ask: 'ship the wake bell', target: 'feature:wake', at: iso(NOW - 45 * 60e3) });
  addSeat(env.sq, { id: 'a1', name: 'nightowl', hook: 'https://hooks.wake-agent.org/owl', secret: 'owl-secret-42' }); // secret-scan: ok
  const calls = [];
  const res = await wakeTick(env, NOW, async (url, init) => {
    calls.push({ url, init });
    return { status: 204 };
  });

  assert.equal(res.pinged, 1);
  assert.equal(res.ok, 1);
  assert.equal(res.jobs, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://hooks.wake-agent.org/owl');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.redirect, 'manual');
  assert.equal(calls[0].init.headers['x-verse-event'], 'wake');

  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.type, 'wake');
  assert.equal(body.agent, 'nightowl');
  assert.equal(body.waiting, 1);
  assert.equal(body.job.id, 'j-old');
  assert.equal(body.job.waitingMin, 45);
  assert.equal(body.api, 'https://a-to-mind.com/api/team');

  const valid = await T.hookVerify('owl-secret-42', calls[0].init.headers['x-verse-time'], calls[0].init.body, calls[0].init.headers['x-verse-signature'], NOW);
  assert.equal(valid, true, 'x-verse-signature must verify with T.hookVerify');

  const logs = await recentWakes(env);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].agent, 'nightowl');
  assert.equal(logs[0].job, 'j-old');
  assert.equal(logs[0].status, 204);
  assert.equal(logs[0].ok, true);
});

test('present, busy, hookless, crew, disabled, and maxed-fail seats are not pinged', async () => {
  const env = makeEnv();
  addJob(env.sq, { id: 'j-old', at: iso(NOW - 40 * 60e3) });
  addSeat(env.sq, { id: 'ok', name: 'eligible' });
  addSeat(env.sq, { id: 'p', name: 'present', seen: NOW - 60e3 });
  addSeat(env.sq, { id: 'b', name: 'busy', job: 'other-job' });
  addSeat(env.sq, { id: 'nh', name: 'hookless', hook: '' });
  addSeat(env.sq, { id: 'c', name: 'crewbot', crew: 1 });
  addSeat(env.sq, { id: 'o', name: 'turnedoff', off: 1 });
  addSeat(env.sq, { id: 'f', name: 'brokenhook', fails: T.HOOK.tries });
  const pinged = [];
  const res = await wakeTick(env, NOW, async (_url, init) => { pinged.push(JSON.parse(init.body).agent); return { status: 200 }; });
  assert.equal(res.pinged, 1);
  assert.deepEqual(pinged, ['eligible']);
});

test('cooldown prevents duplicate pings within 30 min and resumes after', async () => {
  const env = makeEnv();
  addJob(env.sq, { id: 'j-old', at: iso(NOW - 60 * 60e3) });
  addSeat(env.sq, { id: 'a1', name: 'sleeper', seen: NOW - 2 * 60 * 60e3 });
  let count = 0;
  const fakeFetch = async () => { count++; return { status: 200 }; };

  const first = await wakeTick(env, NOW, fakeFetch);
  assert.equal(first.pinged, 1);

  const within = await wakeTick(env, NOW + WAKE_COOLDOWN_MS - 1000, fakeFetch);
  assert.equal(within.pinged, 0);
  assert.equal(count, 1);

  const after = await wakeTick(env, NOW + WAKE_COOLDOWN_MS, fakeFetch);
  assert.equal(after.pinged, 1);
  assert.equal(count, 2);
});

test('failed webhook responses (500 and network errors) are logged with ok = 0 and never crash wakeTick', async () => {
  const env = makeEnv();
  addJob(env.sq, { id: 'j-old', at: iso(NOW - 50 * 60e3) });
  addSeat(env.sq, { id: 'a1', name: 'err500', hook: 'https://hooks.wake-agent.org/fail500', seen: NOW - 20 * 60e3 });
  addSeat(env.sq, { id: 'a2', name: 'neterr', hook: 'https://hooks.wake-agent.org/throw', seen: NOW - 25 * 60e3 });

  const res = await wakeTick(env, NOW, async (url) => {
    if (url.endsWith('/fail500')) return { status: 500 };
    throw new Error('ECONNRESET');
  });

  assert.equal(res.pinged, 2);
  assert.equal(res.ok, 0);
  const logs = await recentWakes(env, 10);
  assert.equal(logs.length, 2);
  const byAgent = Object.fromEntries(logs.map((l) => [l.agent, l]));
  assert.equal(byAgent.err500.status, 500);
  assert.equal(byAgent.err500.ok, false);
  assert.equal(byAgent.neterr.status, 0);
  assert.equal(byAgent.neterr.ok, false);
});

// Tests for lib/team-claim-board.js: single-claim enforcement and planning board split.
// Run: node --test tools/team-claim-board.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  holderOf,
  claimConflictSay,
  planningBoard,
  checkClaimConflict,
} from '../void-live-deploy/lib/team-claim-board.js';

function makeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE void_team_agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      off INTEGER NOT NULL DEFAULT 0,
      job TEXT,
      job_at INTEGER
    );
    CREATE TABLE void_queue (
      id TEXT PRIMARY KEY,
      ask TEXT NOT NULL DEFAULT '',
      target TEXT NOT NULL DEFAULT 'feature:x',
      state TEXT NOT NULL DEFAULT 'queued',
      note TEXT NOT NULL DEFAULT '',
      at TEXT NOT NULL DEFAULT '',
      updated TEXT NOT NULL DEFAULT ''
    );
  `);
  const stmt = (sql, args = []) => ({
    bind: (...b) => stmt(sql, b),
    run: async () => { db.prepare(sql).run(...args); return {}; },
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    first: async () => db.prepare(sql).get(...args) || null,
  });
  return { DB: { prepare: (sql) => stmt(sql), exec: (s) => db.exec(s) } };
}

test('holderOf reads active agent row or queue note and returns null when unclaimed', () => {
  const agents = [
    { name: 'Ada', off: 0, job: 'job-1' },
    { name: 'Ghost', off: 1, job: 'job-2' },
  ];
  assert.equal(holderOf({ id: 'job-1', note: '' }, agents), 'Ada');
  assert.equal(holderOf({ id: 'job-2', note: 'claimed by team:Bea · working' }, agents), 'Bea');
  assert.equal(holderOf({ id: 'job-3', note: 'review by team:Cy · PR: https://github.com/Adammbeam/Verse-A-to-Mind/pull/99' }, []), 'Cy');
  assert.equal(holderOf({ id: 'job-4', note: 'tries 1 · waiting' }, agents), null);
  assert.equal(holderOf(null, agents), null);
});

test('claimConflictSay names the job and holder in plain words', () => {
  const say = claimConflictSay('job-7', 'Ada');
  assert.match(say, /job-7/);
  assert.match(say, /already claimed by @Ada/);
});

test('checkClaimConflict enforces one claim per job via active seat and queue state', async () => {
  const env = makeD1();
  await env.DB.prepare("INSERT INTO void_team_agents (id, name, off, job, job_at) VALUES ('a1', 'Ada', 0, 'job-10', 1000)").run();
  await env.DB.prepare("INSERT INTO void_team_agents (id, name, off, job, job_at) VALUES ('a2', 'OffSeat', 1, 'job-11', 1000)").run();
  await env.DB.prepare("INSERT INTO void_queue (id, state, note) VALUES ('job-10', 'building', 'claimed by team:Ada · started')").run();
  await env.DB.prepare("INSERT INTO void_queue (id, state, note) VALUES ('job-11', 'queued', '')").run();
  await env.DB.prepare("INSERT INTO void_queue (id, state, note) VALUES ('job-12', 'building', 'claimed by team:Ada · queued only')").run();

  const refused = await checkClaimConflict(env, 'job-10', 'Bea');
  assert.equal(refused.ok, false);
  assert.equal(refused.holder, 'Ada');
  assert.match(refused.say, /already claimed by @Ada/);

  const sameSeat = await checkClaimConflict(env, 'job-10', 'ada');
  assert.deepEqual(sameSeat, { ok: true });

  const openJob = await checkClaimConflict(env, 'job-11', 'Bea');
  assert.deepEqual(openJob, { ok: true });

  const queueFallback = await checkClaimConflict(env, 'job-12', 'Cy');
  assert.equal(queueFallback.ok, false);
  assert.equal(queueFallback.holder, 'Ada');
  assert.match(queueFallback.say, /already claimed by @Ada/);
});

test('planningBoard separates open vs claimed jobs, tracks elapsed minutes, and never duplicates', () => {
  const now = Date.UTC(2026, 10, 27, 20, 0, 0);
  const tEarly = now - 45 * 60e3;
  const tLate = now - 10 * 60e3;
  const jobs = [
    { id: 'job-a', ask: 'Add search filter', target: 'feature:search', state: 'queued', note: '', at: new Date(now - 3600e3).toISOString() },
    { id: 'job-b', ask: 'Fix clock drift', target: 'gap:clock', state: 'building', note: 'claimed by team:Bea · WIP', at: new Date(now - 7200e3).toISOString(), updated: new Date(tLate).toISOString() },
    { id: 'job-c', ask: 'Build claim board', target: 'feature:claim', state: 'queued', note: '', at: new Date(now - 5400e3).toISOString() },
    { id: 'job-d', ask: 'Review PR note', target: 'review:pr', state: 'building', note: 'claimed by team:Cy · checking', at: new Date(now - 9000e3).toISOString(), updated: new Date(tEarly).toISOString() },
  ];
  const agents = [
    { name: 'Ada', off: 0, job: 'job-c', job_at: tEarly - 15 * 60e3 },
    { name: 'Bea', off: 0, job: 'job-b', job_at: tLate },
    { name: 'Retired', off: 1, job: 'job-a', job_at: tEarly },
  ];

  const board = planningBoard({ jobs, agents, now });
  assert.deepEqual(board.open.map((r) => r.id), ['job-a']);
  assert.deepEqual(board.claimed.map((r) => r.id), ['job-c', 'job-d', 'job-b']);
  assert.equal(board.claimed[0].holder, 'Ada');
  assert.equal(board.claimed[0].waitingMin, 60);
  assert.equal(board.claimed[1].holder, 'Cy');
  assert.equal(board.claimed[1].waitingMin, 45);
  assert.equal(board.claimed[2].holder, 'Bea');
  assert.equal(board.claimed[2].waitingMin, 10);
  assert.equal(board.summary, '1 open · 3 claimed (Ada, Cy, Bea)');

  const openIds = new Set(board.open.map((r) => r.id));
  for (const c of board.claimed) assert.equal(openIds.has(c.id), false, 'no job appears in both open and claimed');

  const noneClaimed = planningBoard({ jobs: [jobs[0]], agents: [], now });
  assert.equal(noneClaimed.summary, '1 open · 0 claimed');
});

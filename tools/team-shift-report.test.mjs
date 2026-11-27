// Deterministic tests for void-live-deploy/lib/team-shift-report.js using node:sqlite.
// Run: node --test tools/team-shift-report.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  SHIFT_HOUR_UTC,
  STUCK_MS,
  buildShiftReport,
  shiftReportTick,
  latestShiftReport,
} from '../void-live-deploy/lib/team-shift-report.js';

function fakeD1() {
  const db = new DatabaseSync(':memory:');
  const stmt = (sql, a = []) => ({
    bind: (...b) => stmt(sql, b),
    run: async () => {
      const r = db.prepare(sql).run(...a);
      return { meta: { changes: Number(r.changes) } };
    },
    first: async () => db.prepare(sql).get(...a) || null,
    all: async () => ({ results: db.prepare(sql).all(...a) }),
  });
  return { prepare: (sql) => stmt(sql), raw: db };
}

function makeEnv() {
  const DB = fakeD1();
  DB.raw.exec('CREATE TABLE void_team_agents (id TEXT PRIMARY KEY, name TEXT NOT NULL)');
  DB.raw.exec('CREATE TABLE void_queue (id TEXT PRIMARY KEY, ask TEXT, state TEXT, at TEXT, updated TEXT, tries INTEGER DEFAULT 0)');
  DB.raw.exec('CREATE TABLE void_team_credits (agent TEXT, job TEXT, link TEXT, note TEXT, state TEXT, at INTEGER)');
  return { DB };
}

test('buildShiftReport summarizes landed, worked, and stuck items in plain words', () => {
  const now = Date.UTC(2026, 10, 27, 12, 0, 0);
  const report = buildShiftReport({
    now,
    agents: [
      { id: 'a1', name: 'Beam' },
      { id: 'a2', name: 'GrokBot' },
    ],
    credits: [
      { agent: 'a1', job: 'j-live', state: 'live', link: 'https://github.com/Adammbeam/Verse-A-to-Mind/pull/101', at: now - 3600e3 },
      { agent: 'a1', job: 'j-done', state: 'done', link: '', at: now - 2 * 3600e3 },
      { agent: 'a2', job: 'j-rev', state: 'review', link: 'https://github.com/Adammbeam/Verse-A-to-Mind/pull/102', at: now - 4 * 3600e3 },
      { agent: 'a2', job: 'j-old', state: 'live', link: '', at: now - 30 * 3600e3 },
      { agent: 'a2', job: 'j-fail', state: 'failed', link: '', at: now - 1000e3 },
    ],
    jobs: [
      { id: 'j-stuck-build', ask: 'Fix weather cache', state: 'building', updated: new Date(now - STUCK_MS - 3600e3).toISOString(), tries: 1 },
      { id: 'j-fresh-build', ask: 'Add unit tests', state: 'building', updated: new Date(now - 30 * 60e3).toISOString(), tries: 0 },
      { id: 'j-stuck-queue', ask: 'Repair feed parser', state: 'queued', updated: new Date(now - 10 * 60e3).toISOString(), tries: 3 },
      { id: 'j-fresh-queue', ask: 'Polish layout', state: 'queued', updated: new Date(now - 10 * 60e3).toISOString(), tries: 1 },
    ],
  });

  assert.equal(report.day, '2026-11-27');
  assert.deepEqual(report.worked, [
    { name: 'Beam', count: 2 },
    { name: 'GrokBot', count: 1 },
  ]);
  assert.deepEqual(report.landed, [
    { name: 'Beam', job: 'j-live', link: 'https://github.com/Adammbeam/Verse-A-to-Mind/pull/101' },
    { name: 'Beam', job: 'j-done', link: '' },
  ]);
  assert.deepEqual(report.stuck, [
    { id: 'j-stuck-build', ask: 'Fix weather cache', why: 'building for 3h' },
    { id: 'j-stuck-queue', ask: 'Repair feed parser', why: 'queued after 3 tries' },
  ]);
  assert.match(report.summary, /^Morning shift report \(2026-11-27 UTC\)/);
  assert.match(report.summary, /Who did what: Beam \(2\), GrokBot \(1\)\./);
  assert.match(report.summary, /Landed live: Beam - j-live \(https:\/\/github\.com\/Adammbeam\/Verse-A-to-Mind\/pull\/101\); Beam - j-done\./);
  assert.match(report.summary, /Stuck: j-stuck-build \(Fix weather cache - building for 3h\); j-stuck-queue \(Repair feed parser - queued after 3 tries\)\./);
});

test('buildShiftReport handles empty inputs cleanly', () => {
  const now = Date.UTC(2026, 10, 27, 12, 0, 0);
  const report = buildShiftReport({ now });
  assert.equal(report.day, '2026-11-27');
  assert.deepEqual(report.landed, []);
  assert.deepEqual(report.worked, []);
  assert.deepEqual(report.stuck, []);
  assert.match(report.summary, /Who did what: No hand-ins in the last 24 hours\./);
  assert.match(report.summary, /Landed live: Nothing landed live in the last 24 hours\./);
  assert.match(report.summary, /Stuck: Nothing stuck\./);
});

test('shiftReportTick respects SHIFT_HOUR_UTC, is idempotent per day, and stores for the Tower', async () => {
  const env = makeEnv();
  const morning = Date.UTC(2026, 10, 27, SHIFT_HOUR_UTC, 5, 0);
  const early = Date.UTC(2026, 10, 27, SHIFT_HOUR_UTC - 1, 59, 0);
  const nextMorning = Date.UTC(2026, 10, 28, SHIFT_HOUR_UTC, 0, 0);

  env.DB.raw.prepare('INSERT INTO void_team_agents (id, name) VALUES (?, ?)').run('a1', 'Beam');
  env.DB.raw.prepare('INSERT INTO void_queue (id, ask, state, at, updated, tries) VALUES (?, ?, ?, ?, ?, ?)')
    .run('j-1', 'Ship morning report', 'live', new Date(morning - 7200e3).toISOString(), new Date(morning - 3600e3).toISOString(), 0);
  env.DB.raw.prepare('INSERT INTO void_queue (id, ask, state, at, updated, tries) VALUES (?, ?, ?, ?, ?, ?)')
    .run('j-2', 'Stuck build job', 'building', new Date(morning - 4 * 3600e3).toISOString(), new Date(morning - 3 * 3600e3).toISOString(), 1);
  env.DB.raw.prepare('INSERT INTO void_team_credits (agent, job, link, note, state, at) VALUES (?, ?, ?, ?, ?, ?)')
    .run('a1', 'j-1', 'https://github.com/Adammbeam/Verse-A-to-Mind/pull/120', '', 'live', morning - 1800e3);

  const posts = [];
  const postFn = async (msg) => { posts.push(msg); };

  assert.equal(await latestShiftReport(env), null);

  const before = await shiftReportTick(env, early, postFn);
  assert.equal(before.posted, false);
  assert.equal(before.day, '2026-11-27');
  assert.equal(posts.length, 0);
  assert.equal(await latestShiftReport(env), null);

  const first = await shiftReportTick(env, morning, postFn);
  assert.equal(first.posted, true);
  assert.equal(first.day, '2026-11-27');
  assert.equal(posts.length, 1);
  assert.equal(posts[0].c, 'general');
  assert.equal(posts[0].now, morning);
  assert.match(posts[0].body, /Beam \(1\)/);
  assert.match(posts[0].body, /j-2 \(Stuck build job - building for 3h\)/);

  const stored = await latestShiftReport(env);
  assert.equal(stored.day, '2026-11-27');
  assert.equal(stored.at, morning);
  assert.equal(stored.landed.length, 1);
  assert.equal(stored.stuck.length, 1);

  const second = await shiftReportTick(env, morning + 15 * 60e3, postFn);
  assert.equal(second.posted, false);
  assert.equal(second.day, '2026-11-27');
  assert.equal(posts.length, 1);

  const dayTwo = await shiftReportTick(env, nextMorning, postFn);
  assert.equal(dayTwo.posted, true);
  assert.equal(dayTwo.day, '2026-11-28');
  assert.equal(posts.length, 2);
});

// Quiet-agent nudge (lib/team-quiet-nudge.js): talk-only seats get one clear nudge per cooldown and drop in rankings.
// Run: node --test tools/team-quiet-nudge.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  QUIET_WINDOW_MS,
  NUDGE_COOLDOWN_MS,
  PENALTY_PER_NUDGE,
  NUDGE_TABLE,
  findTalkOnlySeats,
  nudgeLine,
  applyNudgePenalty,
  quietNudgeTick,
} from '../void-live-deploy/lib/team-quiet-nudge.js';

function makeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE void_team_agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      joined INTEGER NOT NULL,
      off INTEGER NOT NULL DEFAULT 0,
      crew INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE void_team_msgs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel TEXT NOT NULL,
      at INTEGER NOT NULL,
      by TEXT NOT NULL,
      body TEXT NOT NULL
    );
    CREATE TABLE void_team_credits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent TEXT NOT NULL,
      job TEXT NOT NULL,
      link TEXT NOT NULL,
      at INTEGER NOT NULL
    );
  `);
  const stmt = (sql, a = []) => ({
    bind: (...b) => stmt(sql, b),
    run: async () => { db.prepare(sql).run(...a); return {}; },
    all: async () => ({ results: db.prepare(sql).all(...a) }),
    first: async () => db.prepare(sql).get(...a) || null,
  });
  return { prepare: (sql) => stmt(sql), raw: db };
}

test('constants match the 2-hour window, 2-hour cooldown, and 30-point penalty', () => {
  assert.equal(QUIET_WINDOW_MS, 2 * 3600e3);
  assert.equal(NUDGE_COOLDOWN_MS, 2 * 3600e3);
  assert.equal(PENALTY_PER_NUDGE, 30);
  assert.match(NUDGE_TABLE, /CREATE TABLE IF NOT EXISTS void_team_nudges/);
});

test('findTalkOnlySeats detects talk-only active non-crew seats and skips shippers, crew, off, and newcomers', () => {
  const now = Date.UTC(2026, 10, 27, 20, 0, 0);
  const agents = [
    { id: 'a1', name: 'chatter', joined: now - 3 * 3600e3, off: 0, crew: 0 },
    { id: 'a2', name: 'shipper', joined: now - 3 * 3600e3, off: 0, crew: 0 },
    { id: 'a3', name: 'house-bot', joined: now - 5 * 3600e3, off: 0, crew: 1 },
    { id: 'a4', name: 'paused', joined: now - 5 * 3600e3, off: 1, crew: 0 },
    { id: 'a5', name: 'newbie', joined: now - 30 * 60e3, off: 0, crew: 0 },
    { id: 'a6', name: 'quiet-one', joined: now - 4 * 3600e3, off: 0, crew: 0 },
  ];
  const messages = [
    { by: 'chatter', at: now - 90 * 60e3 },
    { by: 'chatter', at: now - 45 * 60e3 },
    { by: 'chatter', at: now - 10 * 60e3 },
    { by: 'shipper', at: now - 80 * 60e3 },
    { by: 'shipper', at: now - 20 * 60e3 },
    { by: 'house-bot', at: now - 50 * 60e3 },
    { by: 'house-bot', at: now - 15 * 60e3 },
    { by: 'paused', at: now - 50 * 60e3 },
    { by: 'paused', at: now - 15 * 60e3 },
    { by: 'newbie', at: now - 20 * 60e3 },
    { by: 'newbie', at: now - 5 * 60e3 },
    { by: 'quiet-one', at: now - 10 * 60e3 },
  ];
  const credits = [
    { agent: 'a2', at: now - 30 * 60e3 },
  ];

  const found = findTalkOnlySeats({ agents, messages, credits, now });
  assert.equal(found.length, 1);
  assert.deepEqual(found[0], {
    id: 'a1',
    name: 'chatter',
    posts: 3,
    since: now - 90 * 60e3,
  });
});

test('nudgeLine names the seat, post count, zero hand-ins, and ranking drop', () => {
  const line = nudgeLine('chatter', 4);
  assert.match(line, /@chatter/);
  assert.match(line, /\b4 posts\b/);
  assert.match(line, /0 hand-ins/);
  assert.match(line, /2 hours/);
  assert.match(line, /rankings/i);
});

test('applyNudgePenalty drops a nudged seat below a seat that shipped work and floors at 0', () => {
  const board = [
    { id: 'a1', name: 'chatter', points: 70 },
    { id: 'a2', name: 'shipper', points: 55 },
    { id: 'a3', name: 'heavy-talker', points: 20 },
  ];
  const ranked = applyNudgePenalty(board, { chatter: 1, 'heavy-talker': 2 });
  assert.deepEqual(ranked.map((r) => [r.name, r.points, r.nudges]), [
    ['shipper', 55, 0],
    ['chatter', 40, 1],
    ['heavy-talker', 0, 2],
  ]);
  assert.equal(board[0].points, 70, 'does not mutate caller rows');
});

test('quietNudgeTick nudges talk-only seats once per cooldown and skips seats with a PR hand-in', async () => {
  const db = makeD1();
  const env = { DB: db };
  const now = Date.UTC(2026, 10, 27, 20, 0, 0);

  db.raw.prepare('INSERT INTO void_team_agents (id, name, joined, off, crew) VALUES (?, ?, ?, 0, 0)').run('a1', 'chatter', now - 3 * 3600e3);
  db.raw.prepare('INSERT INTO void_team_agents (id, name, joined, off, crew) VALUES (?, ?, ?, 0, 0)').run('a2', 'shipper', now - 3 * 3600e3);
  for (const [by, offsetMin] of [['chatter', 100], ['chatter', 40], ['shipper', 90], ['shipper', 20]]) {
    db.raw.prepare("INSERT INTO void_team_msgs (channel, at, by, body) VALUES ('general', ?, ?, 'hello')").run(now - offsetMin * 60e3, by);
  }
  db.raw.prepare("INSERT INTO void_team_credits (agent, job, link, at) VALUES ('a2', 'j1', 'https://github.com/Adammbeam/Verse-A-to-Mind/pull/1', ?)").run(now - 25 * 60e3);

  const posted = [];
  const postFn = async (msg) => { posted.push(msg); };

  const first = await quietNudgeTick(env, now, postFn);
  assert.equal(first.seats.length, 1);
  assert.equal(first.nudged.length, 1);
  assert.equal(first.nudged[0].name, 'chatter');
  assert.equal(posted.length, 1);
  assert.equal(posted[0].c, 'general');
  assert.match(posted[0].body, /@chatter/);

  const second = await quietNudgeTick(env, now + 30 * 60e3, postFn);
  assert.equal(second.nudged.length, 0, 'cooldown prevents duplicate nudge');
  assert.equal(posted.length, 1);

  const stored = db.raw.prepare('SELECT agent, posts, at FROM void_team_nudges').all();
  assert.equal(stored.length, 1);
  assert.equal(stored[0].agent, 'chatter');
  assert.equal(stored[0].posts, 2);

  const later = now + NUDGE_COOLDOWN_MS + 60e3;
  db.raw.prepare("INSERT INTO void_team_msgs (channel, at, by, body) VALUES ('general', ?, 'chatter', 'still talking')").run(later - 30 * 60e3);
  db.raw.prepare("INSERT INTO void_team_msgs (channel, at, by, body) VALUES ('general', ?, 'chatter', 'more talk')").run(later - 5 * 60e3);
  const third = await quietNudgeTick(env, later, postFn);
  assert.equal(third.nudged.length, 1, 'nudges again once cooldown elapses');
  assert.equal(posted.length, 2);
});

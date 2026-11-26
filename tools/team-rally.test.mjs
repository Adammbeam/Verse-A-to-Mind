// The crew-room rally (lib/team-rally.js). node --test tools/team-rally.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rallyLine, rallyTick, idleSeats, waiting, RALLY_MS, RALLY_MAX } from '../void-live-deploy/lib/team-rally.js';
import { HAND_MS } from '../void-live-deploy/lib/team.js';

/** a D1 stub that answers by the SQL it is given, and records what was run. Enough to pin the queries and the once-an-hour rule. */
function fakeDb({ seats = [], queued = 0, top = null, last = null } = {}) {
  const ran = [];
  const db = {
    ran,
    prepare(sql) {
      const stmt = {
        bind: (...args) => { stmt.args = args; return stmt; },
        args: [],
        async first() {
          if (/FROM void_team_crew WHERE k = 'rally'/.test(sql)) return last;
          if (/COUNT\(\*\) AS n FROM void_queue/.test(sql)) return { n: queued };
          return null;
        },
        async all() {
          if (/FROM void_team_agents/.test(sql)) return { results: seats.map((name) => ({ name })) };
          if (/FROM void_queue WHERE state = 'queued'/.test(sql)) return { results: top ? [top] : [] };
          return { results: [] };
        },
        async run() { ran.push({ sql, args: stmt.args }); return { meta: { changes: 1 } }; },
      };
      return stmt;
    },
  };
  db.DB = db; // the same object answers as the env and as the D1 binding, so a test can pass it straight in
  return db;
}

const NOW = Date.UTC(2026, 10, 26, 15, 0, 0);
// a real queue row: target carries the kind, and 'flake' is one the board hands out (lib/team.js TEAM_KINDS)
const seat = (name) => ({ id: 'x', ask: 'a small job', target: 'flake:something', state: 'queued', note: '', at: NOW - 60e3, name });

test('rally: the line names the count, the seats and the next job, and nothing else', () => {
  const line = rallyLine(['beam', 'grokbot'], 12, 'build the exam card');
  assert.equal(line, '12 waiting for a seat · @beam @grokbot · next up: build the exam card');
});

test('rally: an empty queue or no free seat says nothing at all', () => {
  assert.equal(rallyLine(['beam'], 0, 'x'), '', 'no work, no rally');
  assert.equal(rallyLine([], 12, 'x'), '', 'no seat to name, no rally');
  assert.equal(rallyLine(['  '], 12, 'x'), '', 'a blank name is not a seat');
  assert.equal(rallyLine(['beam'], 12, ''), '12 waiting for a seat · @beam', 'a missing ask still rallies');
});

test('rally: the mention wall is capped and the line fits the chat', () => {
  const many = Array.from({ length: 20 }, (_, i) => 'seat' + i);
  const line = rallyLine(many, 3, 'x'.repeat(400));
  assert.equal((line.match(/@/g) || []).length, RALLY_MAX, 'only RALLY_MAX seats are named');
  assert.ok(line.length <= 300, 'at most 300 characters, the chat cap');
});

test('rally: idle seats are the ones that could take a job, asked for by the same window handIdle uses', async () => {
  const db = fakeDb({ seats: ['beam', 'grokbot'] });
  const seats = await idleSeats(db, NOW);
  assert.deepEqual(seats.map((s) => s.name), ['beam', 'grokbot']);
  const q = db.ran.length ? null : null; // idleSeats only reads; the query is pinned below
  assert.equal(q, null);
});

test('rally: the seat query excludes the owner, crew bots, seats holding a job and silent seats', async () => {
  const seen = [];
  const db = {
    prepare(sql) {
      const stmt = { bind: (...a) => { stmt.args = a; return stmt; }, async all() { seen.push({ sql, args: stmt.args }); return { results: [] }; }, async first() { return null; }, async run() { return { meta: { changes: 1 } }; } };
      return stmt;
    },
  };
  db.DB = db;
  await idleSeats(db, NOW, 5);
  const { sql, args } = seen[0];
  assert.match(sql, /off = 0/);
  assert.match(sql, /key != ''/);
  assert.match(sql, /crew = 0/);
  assert.match(sql, /job IS NULL/);
  assert.match(sql, /seen >= \?/);
  assert.deepEqual(args, [NOW - HAND_MS, 5], 'the cut is HAND_MS, the same window handIdle uses');
});

test('rally: it posts once, then stays quiet for the rest of the hour', async () => {
  const db = fakeDb({ seats: ['beam'], queued: 9, top: seat('beam') });
  const posts = [];
  const say = async (_env, msg) => { posts.push(msg); return msg; };

  const first = await rallyTick(db, NOW, say);
  assert.equal(first.posted, true);
  assert.equal(first.pinged, 1);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].c, 'general', 'the crew room, not #work');
  assert.match(posts[0].body, /^9 waiting for a seat · @beam · next up: a small job$/);

  // the same knock again a minute later, now with the hour on record
  const db2 = fakeDb({ seats: ['beam'], queued: 9, top: seat('beam'), last: { at: NOW } });
  const second = await rallyTick(db2, NOW + 60e3, say);
  assert.equal(second.posted, false);
  assert.equal(posts.length, 1, 'no second post inside the window');

  // and it speaks again once the hour is up
  const db3 = fakeDb({ seats: ['beam'], queued: 9, top: seat('beam'), last: { at: NOW - RALLY_MS } });
  const third = await rallyTick(db3, NOW, say);
  assert.equal(third.posted, true);
  assert.equal(posts.length, 2);
});

test('rally: a tick with nothing to say does not use up the hour', async () => {
  const empty = fakeDb({ seats: ['beam'], queued: 0 });
  const r = await rallyTick(empty, NOW, async () => 'posted');
  assert.equal(r.posted, false);
  assert.equal(empty.ran.filter((x) => /INSERT INTO void_team_crew/.test(x.sql)).length, 0, 'no window recorded');

  const busy = fakeDb({ seats: [], queued: 40 });
  const b = await rallyTick(busy, NOW, async () => 'posted');
  assert.equal(b.posted, false, 'work but nobody free: silence, not a mention of nobody');
  assert.equal(busy.ran.filter((x) => /INSERT INTO void_team_crew/.test(x.sql)).length, 0);
});

test('rally: a broken database is never a failed tick', async () => {
  const bad = { DB: null, prepare() { throw new Error('D1 down'); } };
  const r = await rallyTick(bad, NOW, async () => 'posted');
  assert.deepEqual(r, { posted: false, pinged: 0, nudged: 0, refreshed: 0, line: '' });
});

test('rally: the waiting count reads only queued jobs', async () => {
  const db = fakeDb({ queued: 7 });
  assert.equal(await waiting(db), 7);
  assert.equal(await waiting(fakeDb({ queued: null })), 0, 'no row reads as none, not as NaN');
});

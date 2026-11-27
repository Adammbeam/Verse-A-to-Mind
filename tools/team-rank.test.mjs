// Live rankings board, Employee of the Month, mission briefings, S/A/B/C grades, points,
// real seat upgrades shop, teammate gifts and shares, streaks, and weekly race on /team/.
// Run: node --test --test-concurrency=1 tools/team-rank.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import * as R from '../void-live-deploy/lib/team-rank.js';
import * as T from '../void-live-deploy/lib/team.js';
import * as API from '../void-live-deploy/functions/api/team.js';

const T0 = Date.UTC(2026, 10, 26, 18); // Thursday Nov 26 2026 18:00 UTC
const DAY = 864e5;
const OWNER = 'owner-rank-test'; // secret-scan: ok

function d1() {
  const db = new DatabaseSync(':memory:');
  const stmt = (sql, a = []) => ({
    bind: (...b) => stmt(sql, b),
    run: async () => { const r = db.prepare(sql).run(...a); return { meta: { changes: Number(r.changes) } }; },
    first: async () => db.prepare(sql).get(...a) || null,
    all: async () => ({ results: db.prepare(sql).all(...a) }),
  });
  return { prepare: (sql) => stmt(sql), raw: db };
}

function world(jobs = []) {
  const DB = d1();
  DB.raw.exec('CREATE TABLE void_queue (id TEXT PRIMARY KEY, ask TEXT, target TEXT, state TEXT, note TEXT, at TEXT, updated TEXT)');
  const add = DB.raw.prepare('INSERT INTO void_queue VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (const j of jobs) add.run(j.id, j.ask, j.target, j.state || 'queued', j.note || '', j.at || '2026-11-25T00:00:00Z', j.at || '2026-11-25T00:00:00Z');
  return { DB, SALT: 'rank-salt', READ_TOKEN: OWNER, MAKE_WORK: 'off' };
}

const req = (method, q = '', body, key) => new Request('https://verse.test/api/team' + q, {
  method,
  headers: {
    'content-type': 'application/json',
    'cf-connecting-ip': '10.9.0.1',
    ...(key ? { authorization: 'Bearer ' + key } : {}),
  },
  body: body ? JSON.stringify(body) : undefined,
});
const get = async (env, q, key, now = T0) => {
  const r = await API.onRequestGet({ env, request: req('GET', q, null, key), now });
  return { status: r.status, ...(await r.json()) };
};
const post = async (env, body, key, now = T0) => {
  const r = await API.onRequestPost({ env, request: req('POST', '', body, key), now });
  return { status: r.status, ...(await r.json()) };
};

test('pure rankBoard uses real metrics, grades S/A/B/C, streaks, weekly race, Employee of the Month, and puts new seats at the bottom', () => {
  assert.equal(R.QUIET_LINE, 'Verse gamifies the universe.');
  assert.deepEqual(R.streakOf([T0 - 2 * DAY, T0 - DAY, T0], T0), { current: 3, best: 3 });
  assert.deepEqual(R.streakOf([T0 - 6 * DAY, T0 - 5 * DAY, T0 - 3 * DAY], T0), { current: 0, best: 2 });

  const agents = [
    { id: 'a1', name: 'Ada', role: 'agent', crew: 0, off: 0, joined: T0 - 10 * DAY, done: 5 },
    { id: 'a2', name: 'Bea', role: 'member', crew: 0, off: 0, joined: T0 - 8 * DAY, done: 2 },
    { id: 'a3', name: 'Cy', role: 'agent', crew: 0, off: 0, joined: T0 - 5 * DAY, done: 1 },
    { id: 'a4', name: 'Newbie', role: 'self', crew: 0, off: 0, joined: T0, done: 0 },
    { id: 'c1', name: 'StatusWatch', role: 'agent', crew: 1, off: 0, joined: T0 - 20 * DAY, done: 99 },
  ];
  const credits = [
    // Ada: 5 shipped (3 consecutive days ending T0 -> 3d streak => 5*100 + 3*15 = 545 pts => Grade S)
    { agent: 'a1', job: 'j1', at: T0 - 2 * DAY, state: 'live' },
    { agent: 'a1', job: 'j2', at: T0 - 2 * DAY + 3600e3, state: 'done' },
    { agent: 'a1', job: 'j3', at: T0 - DAY, state: 'live' },
    { agent: 'a1', job: 'j4', at: T0 - DAY + 3600e3, state: 'live' },
    { agent: 'a1', job: 'j5', at: T0, state: 'live' },
    // Bea: 2 shipped on T0 (1d streak => 2*100 + 1*15 = 215 pts => Grade A)
    { agent: 'a2', job: 'j6', at: T0 - 1000, state: 'live' },
    { agent: 'a2', job: 'j7', at: T0, state: 'done' },
    // Cy: 1 in-review credit on T0 (1d streak => 40 + 15 = 55 pts => Grade B)
    { agent: 'a3', job: 'j8', at: T0, state: 'building' },
  ];
  const board = R.rankBoard({ agents, credits, gifts: [], upgrades: [], now: T0 });
  assert.equal(board.rankings.length, 4, 'crew bots are excluded from worker rankings');
  assert.deepEqual(board.rankings.map((r) => [r.rank, r.name, r.grade, r.points, r.gap, r.gapTo]), [
    [1, 'Ada', 'S', 545, 0, null],
    [2, 'Bea', 'A', 215, 330, 'Ada'],
    [3, 'Cy', 'B', 55, 160, 'Bea'],
    [4, 'Newbie', 'C', 0, 55, 'Cy'],
  ]);
  assert.equal(board.eotm.name, 'Ada');
  assert.equal(board.eotm.monthlyPoints, 500);
  assert.equal(board.weeklyRace.weekOf, '2026-11-23');
  assert.deepEqual(board.weeklyRace.leaders.map((l) => l.name), ['Ada', 'Bea', 'Cy']);

  const empty = R.rankBoard({ agents: [{ id: 'x', name: 'Zero', role: 'self', crew: 0, off: 0, joined: T0, done: 0 }], credits: [], now: T0 });
  assert.equal(empty.eotm, null, 'no Employee of the Month when nobody has monthly hand-ins');
  assert.equal(empty.rankings[0].grade, 'C');
});

test('ordinary replies (join, next, done, here, me) carry rank, gap, points and upgrades; owner me stays exact', async () => {
  const jobs = Array.from({ length: 6 }, (_, i) => ({
    id: 'j' + (i + 1),
    ask: 'build feature ' + (i + 1),
    target: 'feature:f' + (i + 1),
    at: '2026-11-25T00:00:00Z',
  }));
  const env = world(jobs);

  // Vet joins first and hands in a PR (gains points)
  const vetJoin = await post(env, { do: 'join', name: 'Vet', auto: false }, null, T0 - DAY);
  assert.equal(vetJoin.status, 201);
  assert.equal(vetJoin.rank, 1);
  assert.equal(vetJoin.points, 0);
  assert.deepEqual(vetJoin.upgrades, []);

  const vetHere = await post(env, { do: 'here' }, vetJoin.key, T0 - DAY + 2000);
  assert.equal(vetHere.status, 200);
  assert.equal(vetHere.rank, 1);
  assert.equal(vetHere.gap, 0);

  const vetDone = await post(env, {
    do: 'done',
    ok: true,
    link: 'https://github.com/Adammbeam/Verse-A-to-Mind/pull/1',
    note: 'first pr',
  }, vetJoin.key, T0 - DAY + 4000);
  assert.equal(vetDone.status, 200);
  assert.equal(vetDone.rank, 1);
  assert.ok(vetDone.points > 0, 'done with PR earned real points');

  // Newbie joins via invite link later -> starts at bottom (rank 2 behind Vet)
  const inv = await post(env, { do: 'invite', name: 'Rookie' }, OWNER, T0);
  const rookJoin = await post(env, { do: 'join', code: T.joinCode(inv.join) }, null, T0 + 1000);
  assert.equal(rookJoin.status, 201);
  assert.equal(rookJoin.rank, 2, 'new seat starts at the bottom');
  assert.equal(rookJoin.gapTo, 'Vet');
  assert.equal(rookJoin.gap, vetDone.points);
  assert.equal(rookJoin.points, 0);
  assert.deepEqual(rookJoin.upgrades, []);
  assert.match(rookJoin.mission, /Rank #2 of 2/);

  const rookMe = await get(env, '?me', rookJoin.key, T0 + 2000);
  assert.equal(rookMe.rank, 2);
  assert.equal(rookMe.gap, vetDone.points);
  assert.deepEqual(rookMe.upgrades, []);

  const rookNext = await post(env, { do: 'next' }, rookJoin.key, T0 + 3000);
  assert.equal(rookNext.status, 200);
  assert.equal(rookNext.rank, 2);
  assert.equal(rookNext.gap, vetDone.points);
  assert.ok(Array.isArray(rookNext.upgrades));

  const ownerMe = await get(env, '?me', OWNER, T0 + 4000);
  assert.deepEqual(ownerMe.me, { kind: 'owner', name: 'Owner' });
});

test('seat upgrades shop unlocks real effects (fast-claim, flair-badge, extra-files, lease-boost, skip-shield) and teammate gifts/shares transfer real spendable points', async () => {
  const jobs = Array.from({ length: 14 }, (_, i) => ({
    id: 'job-' + (i + 1),
    ask: 'work item number ' + (i + 1) + ' on /team/',
    target: 'feature:w' + (i + 1),
    at: '2026-11-24T00:00:00Z',
  }));
  const env = world(jobs);

  const a = await post(env, { do: 'join', name: 'Alpha', auto: false }, null, T0 - 2 * DAY);
  const b = await post(env, { do: 'join', name: 'Beta', auto: false }, null, T0);

  // Alpha earns points across 2 days + shipped PRs so Alpha has > 500 spendable pts
  for (let d = 0; d < 2; d++) {
    const t = T0 - (1 - d) * DAY;
    await post(env, { do: 'here' }, a.key, t);
    const closed = await post(env, {
      do: 'done',
      ok: true,
      auto: false,
      link: 'https://github.com/Adammbeam/Verse-A-to-Mind/pull/' + (10 + d),
    }, a.key, t + 2000);
    assert.equal(closed.status, 200);
  }
  // Mark Alpha's PR jobs live to reflect merged PRs -> 2*100 + 2*15 = 230 pts
  env.DB.raw.prepare("UPDATE void_queue SET state = 'live' WHERE state = 'building'").run();

  // Beta has 0 points: cannot buy an upgrade
  const broke = await post(env, { do: 'upgrade', item: 'flair-badge', motto: 'tiny' }, b.key, T0 + 3000);
  assert.equal(broke.status, 400);

  // Alpha buys flair-badge (40 pts) + fast-claim (60 pts) -> real choices array in next/here!
  const u1 = await post(env, { do: 'upgrade', item: 'flair-badge', motto: 'ships fast' }, a.key, T0 + 4000);
  assert.equal(u1.status, 201, u1.say);
  assert.deepEqual(u1.upgrades, ['flair-badge']);
  assert.equal(u1.balance, 190);

  const u2 = await post(env, { do: 'upgrade', item: 'fast-claim' }, a.key, T0 + 5000);
  assert.equal(u2.status, 201, u2.say);
  assert.equal(u2.balance, 130);
  assert.deepEqual(u2.upgrades, ['flair-badge', 'fast-claim']);

  const peek = await post(env, { do: 'here' }, a.key, T0 + 6000);
  assert.equal(peek.status, 200);
  assert.ok(Array.isArray(peek.choices) && peek.choices.length === 3, 'fast-claim unlocks 3 queue choices');

  // Alpha gifts 30 pts and shares 20 pts with Beta -> Alpha balance drops by 50 (to 80), Beta spendable rises to 50 while Beta work points stay 0!
  const g1 = await post(env, { do: 'gift', to: 'Beta', amount: 30, note: 'nice review' }, a.key, T0 + 7000);
  assert.equal(g1.status, 201, g1.say);
  assert.equal(g1.balance, 100);

  const s1 = await post(env, { do: 'share', to: 'Beta', amount: 20, job: 'job-1', note: 'paired on fix' }, a.key, T0 + 8000);
  assert.equal(s1.status, 201, s1.say);
  assert.equal(s1.balance, 80);

  // Self-gift and overspending are refused
  assert.equal((await post(env, { do: 'gift', to: 'Alpha', amount: 10 }, a.key, T0 + 9000)).status, 400);
  assert.equal((await post(env, { do: 'gift', to: 'Beta', amount: 90 }, a.key, T0 + 10000)).status, 400);

  // Beta now has 50 spendable pts from teammate gift/share -> can buy flair-badge (40 pts)!
  const bBuy = await post(env, { do: 'upgrade', item: 'flair-badge', motto: 'helped out' }, b.key, T0 + 11000);
  assert.equal(bBuy.status, 201, bBuy.say);
  assert.equal(bBuy.balance, 10);
  assert.equal(bBuy.points, 0, 'gifted points do not inflate work rank points');

  // Public ?rankings exposes real standings, EOTM, weekly race, upgrades, motto, gifts, and quietLine
  const pub = await get(env, '?rankings', null, T0 + 12000);
  assert.equal(pub.status, 200);
  assert.equal(pub.quietLine, 'Verse gamifies the universe.');
  assert.equal(pub.eotm.name, 'Alpha');
  assert.equal(pub.rankings[0].name, 'Alpha');
  assert.equal(pub.rankings[0].motto, 'ships fast');
  assert.equal(pub.rankings[1].name, 'Beta');
  assert.equal(pub.rankings[1].giftsIn, 50);
  assert.equal(pub.rankings[1].sharesIn, 20);

  // Verify extra-files (120 pts) and lease-boost (180 pts) real effects
  // Give Alpha one more shipped PR on T0 + 13000 to fund extra-files + lease-boost
  await post(env, { do: 'done', ok: true, auto: false, link: 'https://github.com/Adammbeam/Verse-A-to-Mind/pull/12' }, a.key, T0 + 13000);
  env.DB.raw.prepare("UPDATE void_queue SET state = 'live' WHERE state = 'building'").run();
  // Alpha now has +100 pts (balance = 180) -> buy extra-files (120)
  const u3 = await post(env, { do: 'upgrade', item: 'extra-files' }, a.key, T0 + 14000);
  assert.equal(u3.status, 201, u3.say);
  // Alpha can file 7 jobs in one day (default cap is 6)
  for (let i = 0; i < 7; i++) {
    const f = await post(env, { do: 'file', body: 'Extra file test task number ' + (i + 1) + ' unique ask' }, a.key, T0 + 15000 + i * 1100);
    assert.equal(f.status, 201, 'file #' + (i + 1) + ': ' + f.say);
  }

  // Test lease-boost real effect in sweep: 20 min silent seat with lease-boost keeps its job (30 min window), normal seat loses at 15 min
  const c = await post(env, { do: 'join', name: 'LeaseOwner' }, null, T0);
  const d = await post(env, { do: 'join', name: 'NormalSeat' }, null, T0);
  assert.equal(c.status, 201); assert.equal(d.status, 201);
  // Seed real shipped credits so LeaseOwner buys lease-boost (180 pts)
  env.DB.raw.prepare("INSERT INTO void_team_credits (agent, job, link, note, at) VALUES (?, 'job-9', 'https://github.com/Adammbeam/Verse-A-to-Mind/pull/91', '', ?)").run(
    env.DB.raw.prepare("SELECT id FROM void_team_agents WHERE name = 'LeaseOwner'").get().id, T0,
  );
  env.DB.raw.prepare("INSERT INTO void_team_credits (agent, job, link, note, at) VALUES (?, 'job-10', 'https://github.com/Adammbeam/Verse-A-to-Mind/pull/92', '', ?)").run(
    env.DB.raw.prepare("SELECT id FROM void_team_agents WHERE name = 'LeaseOwner'").get().id, T0,
  );
  env.DB.raw.prepare("UPDATE void_queue SET state = 'live' WHERE id IN ('job-9', 'job-10')").run();
  const u4 = await post(env, { do: 'upgrade', item: 'lease-boost' }, c.key, T0 + 1000);
  assert.equal(u4.status, 201, u4.say);
  // Advance 20 minutes: NormalSeat loses its job, LeaseOwner keeps its job
  await API.sweep(env, T0 + 20 * 60e3);
  const cRow = env.DB.raw.prepare("SELECT job FROM void_team_agents WHERE name = 'LeaseOwner'").get();
  const dRow = env.DB.raw.prepare("SELECT job FROM void_team_agents WHERE name = 'NormalSeat'").get();
  assert.ok(cRow.job, 'lease-boost seat keeps job at 20 minutes');
  assert.equal(dRow.job, null, 'normal seat releases job after 15 minutes');
});

test('/team/ page renders live rankings board, Employee of the Month, mission briefings, grades, shop, gifts/shares, weekly race, and quiet line', () => {
  const html = readFileSync(new URL('../void-live-deploy/team/index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../void-live-deploy/team/app.js', import.meta.url), 'utf8');
  assert.match(html, /id="rankBox"/);
  assert.match(html, /Employee of the Month/);
  assert.match(html, /Weekly race/);
  assert.match(html, /Mission briefing/);
  assert.match(html, /Seat upgrades shop/);
  assert.match(html, /Teammate gifts &amp; shares/);
  assert.match(html, /Verse gamifies the universe\./);
  assert.match(app, /drawRankings/);
  assert.match(app, /\?rankings/);
  assert.match(app, /data-upgrade/);
  assert.match(app, /giftForm/);
});

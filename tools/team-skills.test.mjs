// Tests for void-live-deploy/lib/team-skills.js: skill tag parsing, job classification,
// skill-aware job ordering (with owner asks pinned first), and D1 round-trip persistence.
// Run: node --test tools/team-skills.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  SKILL_TAGS,
  parseSkills,
  jobSkills,
  matchJobsToSkills,
  skillsTableSql,
  getSeatSkills,
  setSeatSkills,
} from '../void-live-deploy/lib/team-skills.js';

const d1 = () => {
  const db = new DatabaseSync(':memory:');
  const stmt = (sql, args = []) => ({
    bind: (...b) => stmt(sql, b),
    run: async () => { db.prepare(sql).run(...args); return {}; },
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    first: async () => db.prepare(sql).get(...args) || null,
  });
  return { prepare: (sql) => stmt(sql), exec: (s) => db.exec(s) };
};

test('SKILL_TAGS is frozen with the five canonical tags', () => {
  assert.ok(Object.isFrozen(SKILL_TAGS));
  assert.deepEqual(SKILL_TAGS, ['code', 'review', 'design', 'video', 'tests']);
});

test('parseSkills filters unknown tags, deduplicates, and handles strings and arrays', () => {
  assert.deepEqual(parseSkills('tests, CODE, bogus, code  design'), ['code', 'design', 'tests']);
  assert.deepEqual(parseSkills(['Video', 'review', 'video', 'ops', '']), ['review', 'video']);
  assert.deepEqual(parseSkills('  review,tests,video,design,code  '), ['code', 'review', 'design', 'video', 'tests']);
  assert.deepEqual(parseSkills('unknown-only'), []);
  assert.deepEqual(parseSkills(null), []);
  assert.deepEqual(parseSkills([]), []);
});

test('jobSkills classifies review, tests, video, design, and code jobs accurately', () => {
  assert.deepEqual(jobSkills({ target: 'review:job-42', ask: 'Review the hand-in PR' }), ['review']);
  assert.deepEqual(jobSkills({ target: 'flake:timer-card', ask: 'Stabilize flaky timer spec' }), ['tests']);
  assert.deepEqual(jobSkills({ target: 'gap:assert-suite', ask: 'Add unit test assertions for parser' }), ['tests']);
  assert.deepEqual(jobSkills({ target: 'feature:studio-trim', ask: 'Add clip trimmer and audio fade to video studio' }), ['video']);
  assert.deepEqual(jobSkills({ target: 'feature:home-css', ask: 'Improve CSS layout and accessibility styling' }), ['design']);
  assert.deepEqual(jobSkills({ target: 'feature:api-cache', ask: 'Add cache header to queue endpoint' }), ['code']);
  assert.deepEqual(jobSkills({ target: 'heal:main-build', ask: 'Fix broken module import' }), ['code']);
  assert.deepEqual(jobSkills({ target: 'gap:routing', ask: 'Wire fallback route' }), ['code']);
  assert.deepEqual(jobSkills({}), ['code']);
});

test('matchJobsToSkills prioritizes matching jobs while keeping owner asks first', () => {
  const jobs = [
    { id: 'team-101', target: 'feature:team-101', ask: 'Build the new queue view' },
    { id: 'gap-1', target: 'gap:api-route', ask: 'Add health endpoint' },
    { id: 'rev-1', target: 'review:job-9', ask: 'Review the hand-in PR' },
    { id: 'flk-1', target: 'flake:board', ask: 'Fix flaky board test spec' },
    { id: 'ui-1', target: 'feature:card-ui', ask: 'Polish CSS layout and accessibility' },
    { id: 'team-102', target: 'feature:team-102', ask: 'Tighten deploy script' },
    { id: 'vid-1', target: 'feature:reel', ask: 'Export short film clip with audio' },
  ];

  const forReview = matchJobsToSkills(jobs, ['review']);
  assert.deepEqual(
    forReview.map((j) => j.id),
    ['team-101', 'team-102', 'rev-1', 'gap-1', 'flk-1', 'ui-1', 'vid-1'],
  );

  const forTests = matchJobsToSkills(jobs, 'tests');
  assert.deepEqual(
    forTests.map((j) => j.id),
    ['team-101', 'team-102', 'flk-1', 'gap-1', 'rev-1', 'ui-1', 'vid-1'],
  );

  const forDesign = matchJobsToSkills(jobs, ['design']);
  assert.deepEqual(
    forDesign.map((j) => j.id),
    ['team-101', 'team-102', 'ui-1', 'gap-1', 'rev-1', 'flk-1', 'vid-1'],
  );

  const forMulti = matchJobsToSkills(jobs, ['design', 'video']);
  assert.deepEqual(
    forMulti.map((j) => j.id),
    ['team-101', 'team-102', 'ui-1', 'vid-1', 'gap-1', 'rev-1', 'flk-1'],
  );
});

test('matchJobsToSkills leaves order unchanged when seat has no skill tags', () => {
  const jobs = [
    { id: 'gap-1', target: 'gap:api', ask: 'Wire handler' },
    { id: 'team-5', target: 'feature:team-5', ask: 'Priority ask' },
    { id: 'rev-2', target: 'review:job-2', ask: 'Review PR' },
  ];
  const sameEmpty = matchJobsToSkills(jobs, []);
  const sameUnknown = matchJobsToSkills(jobs, 'unknown');
  assert.deepEqual(sameEmpty.map((j) => j.id), ['gap-1', 'team-5', 'rev-2']);
  assert.deepEqual(sameUnknown.map((j) => j.id), ['gap-1', 'team-5', 'rev-2']);
  assert.notEqual(sameEmpty, jobs, 'returns a fresh array copy');
});

test('getSeatSkills and setSeatSkills round-trip cleanly in D1', async () => {
  const env = { DB: d1() };
  assert.match(skillsTableSql, /CREATE TABLE IF NOT EXISTS void_team_skills/);

  assert.deepEqual(await getSeatSkills(env, 'seat-alpha'), []);

  const saved = await setSeatSkills(env, 'seat-alpha', ['tests', 'CODE', 'invalid', 'tests'], 1700000000000);
  assert.deepEqual(saved, ['code', 'tests']);
  assert.deepEqual(await getSeatSkills(env, 'seat-alpha'), ['code', 'tests']);

  const updated = await setSeatSkills(env, 'seat-alpha', 'video, design', 1700000005000);
  assert.deepEqual(updated, ['design', 'video']);
  assert.deepEqual(await getSeatSkills(env, 'seat-alpha'), ['design', 'video']);

  const row = await env.DB.prepare('SELECT agent, tags, updated FROM void_team_skills WHERE agent = ?')
    .bind('seat-alpha')
    .first();
  assert.deepEqual({ ...row }, { agent: 'seat-alpha', tags: 'design,video', updated: 1700000005000 });

  assert.deepEqual(await setSeatSkills(env, 'seat-alpha', [], 1700000010000), []);
  assert.deepEqual(await getSeatSkills(env, 'seat-alpha'), []);
});

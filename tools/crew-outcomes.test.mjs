// Alien Speed's first honest slice (lib/crew-outcomes.js, functions/api/crew-outcomes.js, functions/api/team.js, tools/team-gate.mjs):
// work is counted in verified outcomes, one row per job per site, and "could not tell" is its own verdict — never silently "not done".
// Run: node --test tools/crew-outcomes.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import * as O from '../void-live-deploy/lib/crew-outcomes.js';
import { reviewNote } from '../void-live-deploy/lib/team.js';
import * as API from '../void-live-deploy/functions/api/team.js';
import { onRequestGet, onRequestPost } from '../void-live-deploy/functions/api/crew-outcomes.js';

test('site is the tenant column from the first schema: a fixed host list, never an arbitrary address', () => {
  assert.equal(O.hostOf('https://preview.pages.dev/x'), 'preview.pages.dev');
  const env = { CREW_SITE: 'a-to-mind.com, tenant.example', CF_PAGES_URL: 'https://preview.pages.dev' };
  assert.equal(O.siteOf(env), 'a-to-mind.com');
  assert.ok(O.siteOk('tenant.example', env) && O.siteOk('preview.pages.dev', env) && O.siteOk('a-to-mind.com', env));
  assert.equal(O.siteOk('https://someone.else/', env), false);
});

test('the three events are fixed SQL, and the live verdict refuses a bad site, job or verdict', () => {
  const env = { CREW_SITE: 'tenant.example' };
  const hand = O.handoffOf('tenant.example', 'idea-7675', 'BigPickle2', 1000);
  assert.match(hand.sql, /INSERT INTO void_crew_outcomes/);
  assert.ok(!/1000|BigPickle2/.test(hand.sql), 'values are binds, not SQL');
  assert.deepEqual(hand.binds, ['tenant.example', 'idea-7675', 'BigPickle2', 1000]);
  const inRecord = O.handInOf('tenant.example', 'idea-7675', 2000, 'https://github.com/Adammbeam/Verse-A-to-Mind/pull/200');
  assert.deepEqual(inRecord.binds, ['tenant.example', 'idea-7675', 2000, 2000, 'https://github.com/Adammbeam/Verse-A-to-Mind/pull/200']);
  assert.equal(O.reportOf({ site: 'evil.example', job: 'idea-7675', verdict: 'verified' }, env), null);
  assert.equal(O.reportOf({ site: 'tenant.example', job: 'a b', verdict: 'verified' }, env), null);
  assert.equal(O.reportOf({ site: 'tenant.example', job: 'idea-7675', verdict: 'done' }, env), null);
  const ok = O.reportOf({ site: 'tenant.example', job: 'idea-7675', verdict: 'could-not-tell' }, env);
  assert.equal(ok, null); // the third verdict is called "unknown" everywhere, so nothing guesses a new word
  assert.equal(O.reportOf({ site: 'tenant.example', job: 'idea-7675', verdict: 'unknown', at: 3000 }, env).binds[4], 'unknown');
});

test('a merged pull request is only could-not-tell; a later live check can upgrade it and a late merge reading cannot downgrade it', async () => {
  const DB = d1(), env = { DB, CREW_SITE: 'a-to-mind.com' };
  DB.raw.exec('CREATE TABLE void_queue (id TEXT PRIMARY KEY, note TEXT, state TEXT, updated TEXT)');
  DB.raw.prepare('INSERT INTO void_queue VALUES (?, ?, ?, ?)').run('j9', reviewNote('Scout', 'https://github.com/Adammbeam/Verse-A-to-Mind/pull/201'), 'building', new Date(1000).toISOString());
  const fetchFn = async () => ({ ok: true, json: async () => ({ state: 'closed', merged_at: '2026-11-28T00:00:00Z', merge_commit_sha: 'abc' }) });
  assert.equal(await API.settleReviews(env, 2000, fetchFn, 1), 1);
  const merged = DB.raw.prepare('SELECT verdict, note FROM void_crew_outcomes WHERE job = ?').get('j9');
  assert.equal(merged.verdict, 'unknown'); assert.match(merged.note, /live page check still to come/);

  const v = O.reportOf({ site: 'a-to-mind.com', job: 'j9', verdict: 'verified', at: 3000 }, env);
  await env.DB.prepare(v.sql).bind(...v.binds).run();
  assert.equal(DB.raw.prepare('SELECT verdict, verified_at FROM void_crew_outcomes WHERE job = ?').get('j9').verdict, 'verified');
  // the next settle tick sees the same merge again: it must not turn a checked job back into a question
  const late = O.reportOf({ site: 'a-to-mind.com', job: 'j9', verdict: 'unknown', at: 4000 }, env);
  await env.DB.prepare(late.sql).bind(...late.binds).run();
  const after = DB.raw.prepare('SELECT verdict, verified_at FROM void_crew_outcomes WHERE job = ?').get('j9');
  assert.equal(after.verdict, 'verified'); assert.equal(after.verified_at, 3000);
});

test('the numbers: jobs handed, verified live, a separate could-not-tell, and median hand-out to verified', () => {
  const rows = [
    { job: 'a', verdict: 'verified', handed_at: 0, verified_at: 60000 },
    { job: 'b', verdict: 'verified', handed_at: 1000, verified_at: 181000 },
    { job: 'c', verdict: 'unknown', handed_at: 2000, verified_at: null },
    { job: 'd', verdict: 'not-verified', handed_at: 3000, verified_at: null },
    { job: 'e', verdict: 'pending', handed_at: 4000, verified_at: null },
  ];
  const s = O.summarize(rows, 'a-to-mind.com', 1000000);
  assert.equal(s.handed, 5);
  assert.equal(s.verified, 2);
  assert.equal(s.couldNotTell, 1);
  assert.equal(s.counts['not-verified'], 1, 'a failed check is not the same as a check that could not tell');
  assert.equal(s.counts.pending, 1);
  assert.equal(s.medianMs, 120000, 'only verified rows have a hand-out-to-verified span');
  assert.equal(O.duration(s.medianMs), '2 min');
  assert.match(O.lineOf(s), /5 jobs handed · 2 verified live · 1 not verified · 1 could not tell · 1 still in work · median hand-out to verified 2 min/);
  assert.match(O.lineOf({ ok: false }), /could not be read/);
  assert.equal(O.summarize([{ job: 'x', verdict: 'unknown', handed_at: 0, verified_at: 9 }], 'x').medianMs, null, 'unknown never gets a verified span');
});

function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(O.TABLE);
  const stmt = (sql, a = []) => ({ bind: (...b) => stmt(sql, b), run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...a).changes) } }),
    first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }) });
  return { prepare: (sql) => stmt(sql), raw: db };
}

test('the route: anyone reads counts; only the owner writes a verdict, for a known site, and the numbers move', async () => {
  const DB = d1(), env = { DB, READ_TOKEN: 'secret-scan: ok-owner', CREW_SITE: 'a-to-mind.com' };
  const hand = O.handoffOf('a-to-mind.com', 'idea-7675', 'BigPickle2', Date.now() - 60000);
  await env.DB.prepare(hand.sql).bind(...hand.binds).run();
  const before = await (await onRequestGet({ env })).json();
  assert.equal(before.handed, 1); assert.equal(before.counts.pending, 1);

  const post = (body, auth) => onRequestPost({ env, request: new Request('https://a-to-mind.com/api/crew-outcomes', {
    method: 'POST', headers: auth ? { authorization: 'Bearer ' + auth } : {}, body: JSON.stringify(body) }) });
  const body = { site: 'a-to-mind.com', job: 'idea-7675', verdict: 'verified', note: 'checked /team/', at: Date.now() };
  assert.equal((await post(body, '')).status, 401);
  assert.equal((await post({ ...body, site: 'evil.example' }, 'secret-scan: ok-owner')).status, 400);
  const saved = await post(body, 'secret-scan: ok-owner');
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).verdict, 'verified');

  const after = await (await onRequestGet({ env })).json();
  assert.equal(after.handed, 1, 'one row per job, not a second hand-out');
  assert.equal(after.counts.verified, 1);
  assert.ok(after.medianMs >= 59000 && after.medianMs <= 61000);
  assert.equal(DB.raw.prepare('SELECT note FROM void_crew_outcomes WHERE job = ?').get('idea-7675').note, 'checked /team/');
  const mergeOnly = await post({ ...body, verdict: 'unknown', note: 'merged; live page check still to come' }, 'secret-scan: ok-owner');
  assert.equal(mergeOnly.status, 200);
  const still = await (await onRequestGet({ env })).json();
  assert.equal(still.counts.verified, 1, 'a merge alone never downgrades a live check');
  assert.equal(still.counts.unknown, 0);
  assert.equal(DB.raw.prepare('SELECT note FROM void_crew_outcomes WHERE job = ?').get('idea-7675').note, 'checked /team/');
  assert.equal((await onRequestGet({ env: {} })).status, 503);
});

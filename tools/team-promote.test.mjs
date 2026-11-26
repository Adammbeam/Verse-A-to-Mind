// Verse makes #ideas proposals jobs on its own clock, guards only (lib/team-promote.js; functions/api/team.js promoteIdeas and the lead
// seat's direct filing). Run: node --test tools/team-promote.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import * as PM from '../void-live-deploy/lib/team-promote.js';
import * as API from '../void-live-deploy/functions/api/team.js';
import * as T from '../void-live-deploy/lib/team.js';

const T0 = Date.UTC(2026, 10, 25, 15);
const GOOD = 'Proposal: Fix tools/open-tool.test.mjs on main: toolAsk(\'kanban board tool\') returns null; it must open /kanban/. Acceptance: node --test tools/open-tool.test.mjs passes (5/5). Small PR (<400 lines), honest tests.';

test('the gate is the Acceptance line, or the sentence that names a passing check; none means no job', () => {
  assert.equal(PM.gateOf(GOOD), 'node --test tools/open-tool.test.mjs passes (5/5).');
  assert.match(PM.gateOf('Make the toolkit card list /convert/. Done when node --test tools/toolkit-skill.test.mjs passes.'), /^Done when node --test/);
  assert.equal(PM.gateOf('Scope a pack for one profession. Plan in domains/ plus a PR.'), '');
});

test('a salvage proposal names a reusable license; the lists are autosalvage\'s own', async () => {
  const U = await import('./autosalvage/unify.mjs');
  assert.deepEqual(PM.PERMISSIVE, U.PERMISSIVE); assert.deepEqual(PM.SHARE_ALIKE, U.SHARE_ALIKE);
  const find = (lic) => 'Proposal: AutoSalvage GitHub find. Repo: https://github.com/visgl/deck.gl ' + lic + ' What to integrate: arcs on /flights/map/. Acceptance: node --test tools/flights-ui.test.mjs passes.';
  assert.equal(PM.vet(find('License: MIT')).ok, true);
  assert.match(PM.vet(find('')).why, /names no license/);
  assert.match(PM.vet(find('License: GPL-3.0')).why, /share-alike/);
  assert.equal(PM.vet(find('License: GPL-3.0, kept isolated as a separate service')).ok, true);
  assert.match(PM.vet(find('License: WTFPL')).why, /not on the reviewed list/);
});

test('the guards: a secret, no gate, a duplicate, the caps; rival hosts leave the public text; a commit id is not a secret', () => {
  assert.equal(PM.vet(GOOD).ok, true);
  const v = PM.vet(GOOD, { id: 7669 }); assert.match(v.ask, /Acceptance: node --test tools\/open-tool\.test\.mjs passes/); assert.match(v.ask, /#ideas thread 7669/);
  assert.match(PM.vet(GOOD + ' token: ' + 'ghp_' + 'a'.repeat(36)).why, /secret/); // secret-scan: ok
  assert.match(PM.vet(GOOD + ' vj1-' + '0'.repeat(32)).why, /join link/);
  assert.match(PM.vet('Proposal: scope a vertical visibility pack for one profession, plan in domains/ plus a PR').why, /no acceptance gate/);
  assert.equal(PM.vet(GOOD, { openKeys: new Set([T.askKey(T.clean(GOOD.replace(/^Proposal:\s*/, ''), 1000))]) }).dup, true);
  assert.equal(PM.vet(GOOD, { promotedOpen: PM.PROMOTE.open }).wait, true);
  assert.equal(PM.vet(GOOD, { authorToday: PM.PROMOTE.perAuthorDay }).wait, true);
  const r = PM.vet('Proposal: Match the scores page on rival.example.com: show live minutes. Acceptance: node --test tools/scores.test.mjs passes.', { rivals: ['rival.example.com'] });
  assert.ok(r.ok && !/rival\.example\.com/.test(r.ask) && /a rival site/.test(r.ask), r.ask);
  assert.equal(PM.leaks('it failed and healed with no revert (74c3a1f0e9b2c4d5e6f708192a3b4c5d6e7f8091)'), false);
  assert.equal(PM.isLead({ role: 'self' }, 3), true); assert.equal(PM.isLead({ role: 'self' }, 2), false); assert.equal(PM.isLead({ role: 'lead' }, 0), true); assert.equal(PM.isLead({ role: 'member' }, 9), false);
});

function d1() {
  const db = new DatabaseSync(':memory:');
  const stmt = (sql, a = []) => ({ bind: (...b) => stmt(sql, b), run: async () => { const r = db.prepare(sql).run(...a); return { meta: { changes: Number(r.changes) } }; }, first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }) });
  return { prepare: (sql) => stmt(sql), raw: db };
}
const req = (body, key, ip = '10.9.0.1') => new Request('https://verse.test/api/team', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, ...(key ? { authorization: 'Bearer ' + key } : {}) }, body: JSON.stringify(body) });
const post = async (env, body, key, now = T0, ip) => { const r = await API.onRequestPost({ env, request: req(body, key, ip), now }); return { status: r.status, ...(await r.json()) }; };
async function world() {
  const DB = d1(), env = { DB, SALT: 's', READ_TOKEN: 'owner-test' };
  DB.raw.exec('CREATE TABLE void_queue (id TEXT PRIMARY KEY, ask TEXT, target TEXT, state TEXT, note TEXT, at TEXT, updated TEXT)');
  await API.crewReady(env, T0);
  return { DB, env };
}

test('the tick promotes proposals that pass, replies once to one that does not, never twice, and a lead seat files directly', async () => {
  const { DB, env } = await world();
  const s = await post(env, { do: 'join', name: 'proposer', auto: false });
  const good = await post(env, { do: 'propose', body: GOOD.replace(/^Proposal: /, '') }, s.key, T0 + 2000);
  const vague = await post(env, { do: 'propose', body: 'Scope a vertical visibility pack for one local profession, plan in domains/ plus a PR.' }, s.key, T0 + 4000);
  assert.equal(good.status, 201); assert.equal(vague.status, 201);
  const out = await API.promoteIdeas(env, T0 + 60e3);
  assert.equal(out.length, 1); const id = out[0].job;
  const job = DB.raw.prepare('SELECT * FROM void_queue WHERE id = ?').get(id);
  assert.equal(job.state, 'queued'); assert.equal(job.target, 'feature:' + id); assert.match(job.note, /^proposed in #ideas by team:proposer · made a job by Verse/);
  assert.ok(T.rank([job], T0 + 60e3).length === 1, 'the job is claimable');
  const replies = DB.raw.prepare("SELECT thread, body FROM void_team_msgs WHERE by = 'verse' AND channel = 'ideas' AND thread > 0").all();
  assert.equal(replies.length, 2); assert.ok(replies.some((r) => /^Not a job yet: it has no acceptance gate.*\(try 1 of 3\)/.test(r.body)));
  assert.deepEqual(await API.promoteIdeas(env, T0 + 120e3), [], 'nothing twice in one window: the job is filed, the vague one was answered');
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM void_team_msgs WHERE by = 'verse' AND channel = 'ideas'").get().n, 2);
  await API.promoteIdeas(env, T0 + 30 * 60e3); // try 2
  const third = await API.promoteIdeas(env, T0 + 60 * 60e3); // try 3: dropped with the reason, never left waiting
  assert.equal(third.dropped, 1);
  const last = DB.raw.prepare("SELECT body FROM void_team_msgs WHERE by = 'verse' AND channel = 'ideas' ORDER BY id DESC LIMIT 1").get().body;
  assert.match(last, /^Dropped by Verse's guards: it has no acceptance gate.*\(3 tries\)/);
  assert.equal(DB.raw.prepare("SELECT job FROM void_team_msgs WHERE id = ?").get(vague.id).job, 'dropped');
  assert.deepEqual(await API.promoteIdeas(env, T0 + 120 * 60e3), [], 'a dropped proposal is not tried again');
  assert.equal((await post(env, { do: 'file', body: 'Fix the map check. Acceptance: node --test tools/map-coverage.test.mjs passes.' }, s.key, T0 + 200e3)).status, 403, 'a self seat with nothing shipped proposes');
  const sid = T.KEY_RE.exec(s.key)[1], add = DB.raw.prepare('INSERT INTO void_team_credits (agent, job, link, note, at) VALUES (?, ?, ?, ?, ?)');
  for (let i = 0; i < PM.LEAD_SHIPPED; i++) add.run(sid, 'x' + i, 'https://github.com/o/r/pull/' + (i + 1), '', T0);
  const f = await post(env, { do: 'file', body: 'Fix the map check. Acceptance: node --test tools/map-coverage.test.mjs passes.' }, s.key, T0 + 300e3);
  assert.equal(f.status, 201, f.say); assert.match(f.job, /^ask-\d+$/, 'a seat that shipped ' + PM.LEAD_SHIPPED + ' files directly');
});

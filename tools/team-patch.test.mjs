// A seat that cannot push hands in its job as a diff (lib/team-patch.js; functions/api/team.js 'patch'): it lands in Verse's proposals
// for the runner (tools/local-ship.mjs), and the runner's ship or refuse settles the job (functions/api/proposals.js).
// Run: node --test tools/team-patch.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import * as PA from '../void-live-deploy/lib/team-patch.js';
import * as API from '../void-live-deploy/functions/api/team.js';
import * as PROP from '../void-live-deploy/functions/api/proposals.js';

const T0 = Date.UTC(2026, 10, 25, 20);
const DIFF = 'diff --git a/docs/hello.md b/docs/hello.md\nnew file mode 100644\n--- /dev/null\n+++ b/docs/hello.md\n@@ -0,0 +1 @@\n+hello from a seat\n';

test('the diff checks: a git diff, small, inside the repo, no workflow, no secret, no wipe', () => {
  assert.equal(PA.patchProblem(DIFF), '');
  assert.deepEqual(PA.statsOf(DIFF), { files: [{ path: 'docs/hello.md', from: 'docs/hello.md', deleted: false, added: true }], added: 1, removed: 0 });
  assert.match(PA.patchProblem('just words'), /git diff/);
  assert.match(PA.patchProblem(DIFF.replace(/docs\/hello\.md/g, '../etc/x')), /leaves the repository/);
  assert.match(PA.patchProblem(DIFF.replace(/docs\/hello\.md/g, '.github/workflows/x.yml')), /workflows stay parked/);
  assert.match(PA.patchProblem(DIFF.replace('+hello from a seat', '+token: ghp_' + 'b'.repeat(36))), /secret/); // secret-scan: ok
  assert.match(PA.patchProblem(DIFF + Array.from({ length: 401 }, (_, i) => '+l' + i).join('\n')), /changed lines/);
  const wipe = Array.from({ length: 51 }, (_, i) => 'diff --git a/f' + i + ' b/f' + i + '\ndeleted file mode 100644\n').join('');
  assert.match(PA.patchProblem(wipe), /more than 40 files|wipe guard/);
});

function d1() {
  const db = new DatabaseSync(':memory:');
  const stmt = (sql, a = []) => ({ bind: (...b) => stmt(sql, b), run: async () => { const r = db.prepare(sql).run(...a); return { meta: { changes: Number(r.changes) } }; }, first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }) });
  return { prepare: (sql) => stmt(sql), raw: db };
}
const OWNER = 'owner-test'; // secret-scan: ok
const post = async (env, body, key, now = T0) => { const r = await API.onRequestPost({ env, now, request: new Request('https://verse.test/api/team', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.8.0.1', ...(key ? { authorization: 'Bearer ' + key } : {}) }, body: JSON.stringify(body) }) }); return { status: r.status, ...(await r.json()) }; };
const decide = async (env, body) => (await PROP.onRequestPatch({ env, request: new Request('https://verse.test/api/proposals', { method: 'PATCH', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + OWNER }, body: JSON.stringify(body) }) })).json();

test('a seat joins, gets a job, hands in a diff: it is a proposal for the runner, the seat gets its next job, and ship closes the job', async () => {
  const DB = d1(), env = { DB, SALT: 's', READ_TOKEN: OWNER, VOID_OWNER_TOKEN: OWNER };
  DB.raw.exec('CREATE TABLE void_queue (id TEXT PRIMARY KEY, ask TEXT, target TEXT, state TEXT, note TEXT, at TEXT, updated TEXT)');
  for (const id of ['j1', 'j2', 'j3']) DB.raw.prepare("INSERT INTO void_queue VALUES (?, ?, 'heal:hello-' || ?, 'queued', '', '2026-11-20T00:00:00Z', '2026-11-20T00:00:00Z')").run(id, 'note number ' + id, id);
  const me = await post(env, { do: 'join', name: 'nopush' });
  assert.equal(me.status, 201); const job = me.job.job;
  assert.equal((await post(env, { do: 'patch', diff: 'nope' }, me.key, T0 + 2000)).status, 400);
  const h = await post(env, { do: 'patch', diff: DIFF, note: 'hello note' }, me.key, T0 + 4000);
  assert.equal(h.status, 201, h.say); assert.match(h.proposal, /^team-/); assert.ok(h.next && h.next.job && h.next.job !== job, 'the next job at once');
  const pr = DB.raw.prepare('SELECT * FROM void_proposals WHERE id = ?').get(h.proposal);
  assert.equal(pr.state, 'open'); assert.equal(pr.author, 'team:nopush'); assert.equal(pr.files, 1); assert.equal(pr.diff, DIFF);
  assert.match(DB.raw.prepare('SELECT note FROM void_queue WHERE id = ?').get(job).note, /^patch by team:nopush · proposal team-/);
  const shipped = await decide(env, { id: h.proposal, action: 'ship', verdict: 'green' });
  assert.equal(shipped.state, 'shipped');
  const row = DB.raw.prepare('SELECT state, note FROM void_queue WHERE id = ?').get(job);
  assert.equal(row.state, 'done'); assert.match(row.note, /shipped from proposal team-.* by team:nopush/);
  // a refused patch puts its job back with a failed try
  const h2 = await post(env, { do: 'patch', diff: DIFF.replace(/hello/g, 'second') }, me.key, T0 + 8000);
  await decide(env, { id: h2.proposal, action: 'refuse', verdict: 'does not apply' });
  const back = DB.raw.prepare('SELECT state, note FROM void_queue WHERE id = ?').get(h.next.job);
  assert.equal(back.state, 'queued'); assert.match(back.note, /^tries 1 · proposal team-.* refused: does not apply/);
});

test('a seat can hand in a thirteenth diff in the same day; only the size and pending checks remain', async () => {
  const DB = d1(), env = { DB, SALT: 's', READ_TOKEN: OWNER, VOID_OWNER_TOKEN: OWNER };
  DB.raw.exec('CREATE TABLE void_queue (id TEXT PRIMARY KEY, ask TEXT, target TEXT, state TEXT, note TEXT, at TEXT, updated TEXT)');
  for (let i = 1; i <= 20; i++) DB.raw.prepare("INSERT INTO void_queue VALUES (?, ?, 'heal:hello-' || ?, 'queued', '', '2026-11-20T00:00:00Z', '2026-11-20T00:00:00Z')").run('j' + i, 'note ' + i, 'j' + i);
  const me = await post(env, { do: 'join', name: 'many' });
  assert.equal(me.status, 201);
  assert.equal(PA.PATCH.perSeatDay, undefined, 'no daily cap is left in the rules');
  for (let i = 0; i < 13; i++) {
    const diff = DIFF.replace('hello from a seat', 'hand-in number ' + (i + 1));
    const r = await post(env, { do: 'patch', diff }, me.key, T0 + 1000 + i * 1100);
    assert.equal(r.status, 201, 'hand-in ' + (i + 1) + ': ' + (r.say || ''));
  }
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM void_proposals WHERE author = 'team:many'").get().n, 13);
  // the size check still works after thirteen legal hand-ins
  assert.equal((await post(env, { do: 'patch', diff: DIFF + Array.from({ length: 401 }, (_, i) => '+l' + i).join('\n') }, me.key, T0 + 20000)).status, 400);
});

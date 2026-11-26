// Proposals: patches, checked by a runner, shipped by wrangler. No pull request in the loop.
// (Not skills/forge.js, which makes 3D things.)
//
//   POST  { branch, title, diff, author?, tests?, id? }   a patch arrives. Bearer VOID_FORGE_TOKEN (an outside agent) or the owner.
//   GET   ?state=open                                      what is waiting. Owner only: a diff is not public.
//   PATCH { id, action, verdict? }                          check | ship | refuse | revert. Owner only; the runner is the owner.
//
// The Worker never applies a patch. It cannot: there is no git here, and applying a diff inside a request would be a way to run
// arbitrary code on the edge. The runner (tools/local-ship.mjs) does that on a machine that has git, and reports back.
import { ownerOk } from '../../lib/guard.js';
import { newProposal, canDecide, nextState, sameSecret } from '../../lib/proposals.js';

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

const SCHEMA = `create table if not exists void_proposals (
  id text primary key, created_at text not null, author text not null default '',
  branch text not null, title text not null default '', diff text not null,
  tests text not null default '', files integer not null default 0,
  added integer not null default 0, removed integer not null default 0,
  state text not null default 'open', verdict text not null default '', decided_at text
)`;
let ready = false;
async function ensure(db) { if (!ready) { await db.prepare(SCHEMA).run(); ready = true; } }

const row = (r) => r && ({
  id: r.id, created_at: r.created_at, author: r.author, branch: r.branch, title: r.title, tests: r.tests,
  files: r.files, added: r.added, removed: r.removed, state: r.state, verdict: r.verdict, decided_at: r.decided_at,
});

/** An outside agent holds a submit token; the owner holds the account. Either may submit, neither may decide. */
async function maySubmit(request, env) {
  if (await ownerOk(request, env)) return true;
  const want = String(env.VOID_PROPOSAL_TOKEN || '');
  const got = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  return sameSecret(got, want);
}

export async function onRequestPost({ request, env }) {
  if (!(await maySubmit(request, env))) return json({ error: 'a forge token or the owner' }, 401);
  if (!env.DB) return json({ error: 'no database bound' }, 503);
  let body = null; try { body = JSON.parse(await request.text()); } catch (err) { console.warn('proposals: the body is not json:', String(err && err.message || err).slice(0, 120)); body = null; }
  let p;
  try { p = newProposal(body); } catch (e) { return json({ error: String(e.message || e) }, 400); }
  await ensure(env.DB);
  const dup = await env.DB.prepare('select id from void_proposals where id = ?').bind(p.id).first();
  if (dup) return json({ error: 'that id is taken', id: p.id }, 409);
  await env.DB.prepare(
    `insert into void_proposals (id, created_at, author, branch, title, diff, tests, files, added, removed, state, verdict, decided_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(p.id, p.created_at, p.author, p.branch, p.title, p.diff, p.tests, p.files, p.added, p.removed, p.state, p.verdict, p.decided_at).run();
  return json({ ok: true, id: p.id, files: p.files, added: p.added, removed: p.removed, state: p.state }, 201);
}

export async function onRequestGet({ request, env }) {
  if (!(await ownerOk(request, env))) return json({ error: 'owner only' }, 401);
  if (!env.DB) return json({ error: 'no database bound' }, 503);
  await ensure(env.DB);
  const url = new URL(request.url);
  const one = url.searchParams.get('id');
  if (one) {
    // the runner needs the patch itself; a listing never carries it
    const full = await env.DB.prepare('select * from void_proposals where id = ?').bind(one).first();
    return full ? json({ proposal: { ...row(full), diff: full.diff } }) : json({ error: 'no such proposal' }, 404);
  }
  const state = url.searchParams.get('state') || '';
  const q = state
    ? env.DB.prepare('select id, created_at, author, branch, title, tests, files, added, removed, state, verdict, decided_at from void_proposals where state = ? order by created_at asc limit 50').bind(state)
    : env.DB.prepare('select id, created_at, author, branch, title, tests, files, added, removed, state, verdict, decided_at from void_proposals order by created_at desc limit 50');
  const out = await q.all();
  return json({ proposals: (out?.results || []).map(row) });
}

/** The runner reports what it found, and moves the proposal. Only a legal transition is written. */
export async function onRequestPatch({ request, env }) {
  if (!(await ownerOk(request, env))) return json({ error: 'owner only' }, 401);
  if (!env.DB) return json({ error: 'no database bound' }, 503);
  let body = null; try { body = JSON.parse(await request.text()); } catch (err) { console.warn('proposals: the body is not json:', String(err && err.message || err).slice(0, 120)); body = null; }
  const id = String((body && body.id) || '');
  const action = String((body && body.action) || '');
  if (!id || !action) return json({ error: 'id and action are needed' }, 400);
  await ensure(env.DB);
  const cur = await env.DB.prepare('select state from void_proposals where id = ?').bind(id).first();
  if (!cur) return json({ error: 'no such proposal' }, 404);
  if (!canDecide(cur.state, action)) return json({ error: 'cannot ' + action + ' a proposal that is ' + cur.state }, 409);
  const next = nextState(cur.state, action);
  const verdict = String((body && body.verdict) || '').slice(0, 500);
  const at = new Date().toISOString();
  await env.DB.prepare('update void_proposals set state = ?, verdict = ?, decided_at = ? where id = ?').bind(next, verdict, at, id).run();
  if (next === 'shipped' || next === 'refused') await settleTeamJob(env, id, next, verdict, at).catch(() => null);
  return json({ ok: true, id, state: next, verdict });
}

/** a team seat's patch (functions/api/team.js 'patch' notes its job "patch by team:<name> · proposal <id>"): shipped closes the job and counts
 *  for the seat; refused puts the job back on the queue with a failed try and the reason */
async function settleTeamJob(env, id, state, verdict, at) {
  const job = await env.DB.prepare("select id, note from void_queue where state = 'building' and note like ?").bind('patch by team:% · proposal ' + id + '%').first();
  if (!job) return;
  const name = (/^patch by team:([^ ·]+)/.exec(job.note) || [])[1] || '';
  if (state === 'shipped') {
    await env.DB.prepare("update void_queue set state = 'done', note = ?, updated = ? where id = ?").bind(('shipped from proposal ' + id + ' by team:' + name).slice(0, 300), at, job.id).run();
    await env.DB.prepare('update void_team_agents set done = done + 1 where name = ?').bind(name).run().catch(() => null);
  } else {
    const tries = (Number((/\btries (\d+)\b/.exec(job.note) || [])[1]) || 0) + 1;
    await env.DB.prepare("update void_queue set state = 'queued', note = ?, updated = ? where id = ?").bind(('tries ' + tries + ' · proposal ' + id + ' refused: ' + (verdict || 'it did not pass the gates')).slice(0, 300), at, job.id).run();
  }
}

/** The diff itself, for the runner that has to apply it. Owner only, and never cached. */
export async function onRequestOptions() { return json({ ok: true, methods: ['GET', 'POST', 'PATCH'] }); }

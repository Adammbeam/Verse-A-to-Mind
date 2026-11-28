// a-to-mind.com/code/verse.git/...: Verse's code store over git's dumb HTTP protocol (lib/codestore.js has the rules).
//   GET  info/refs | HEAD | objects/info/packs | objects/pack/pack-<sha>.(pack|idx)   what `git clone` and `git fetch` read
//   GET  status                                   -> { main, github, sync, packs, bytes, log }  (the Tower code page reads this)
//   PUT  objects/pack/pack-<sha>.(pack|idx)       one pack or its index (a real pack or index header, at most PACK_MAX); never overwritten
//   POST refs  { ref, old, new, packs }           moves a branch from `old` to `new` (compare and swap); every named pack must be stored
//   POST checks { ref, sha, state, summary }      the runner's check result on a change request (owner key only)
//   POST deploys { sha, deployment, state, url }  the runner's Pages deploy, live / failed / rolled back (owner key only)
// WHAT A STRANGER COULD MAKE THIS DO: nothing. Every method answers 404 unless the owner's key or session or a team agent's key is sent.
// A team agent pushes change requests (refs/heads/cr/<name>) and may only move main to the commit GitHub's main is at now (it mirrors);
// the owner's key (tools/verse-runner.mjs) moves main to a checked merge, and reports checks and deploys.
// Git checks every object's hash on clone, so a bad pack fails loudly on the reader's side and cannot pass for other code.
import { whoIs } from '../api/team.js';
import * as C from '../../lib/codestore.js';
import { settleStore } from '../../lib/cr-settle-run.js';

const H = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' };
const json = (o, status = 200) => Response.json(o, { status, headers: H });
const text = (s, type = 'text/plain; charset=utf-8') => new Response(s, { headers: { ...H, 'content-type': type } });
const missing = () => new Response('Not found', { status: 404, headers: H });

async function ready(env) { for (const t of C.TABLES) await env.DB.prepare(t).run(); }
const refsOf = async (env) => (await env.DB.prepare('SELECT name, sha FROM void_code_refs').all()).results || [];
const packsOf = async (env) => (await env.DB.prepare('SELECT name, bytes, tip, at FROM void_code_packs ORDER BY at ASC').all()).results || [];
const log = (env, by, what, bytes = 0, now = Date.now()) => env.DB.prepare('INSERT INTO void_code_log (at, by, what, bytes) VALUES (?, ?, ?, ?)').bind(now, by, what.slice(0, 200), bytes).run();
export async function githubMain(fetchFn = fetch) {
  try { const r = await fetchFn(C.GITHUB_REFS, { headers: { 'user-agent': 'git/2.45 verse-codestore' }, signal: AbortSignal.timeout(6000) }); return r.ok ? C.mainOf(await r.text()) : null; } catch (_) { return null; }
}
async function who(request, env) { const me = await whoIs(request, env).catch(() => null); return me && (me.kind === 'owner' || me.kind === 'agent') ? me : null; }
const byOf = (me) => (me.kind === 'owner' ? 'owner' : 'team:' + me.agent.name);
const pathOf = (params) => (Array.isArray(params && params.path) ? params.path : [params && params.path].filter(Boolean)).join('/');

// after a check or deploy report: settle shipped jobs from the store (L1.7); in the background when the platform allows, never failing the report
function settleAfter(env, now, waitUntil) {
  const run = settleStore(env, { now }).catch(() => null);
  if (typeof waitUntil === 'function') { try { waitUntil(run); return null; } catch (_) { /* run goes on */ } }
  return run;
}
export async function onRequest({ request, env, params, fetchFn = fetch, now = Date.now(), waitUntil }) {
  const me = await who(request, env);
  const store = C.bucketOf(env);
  if (!me || !store || !env.DB) return missing();
  const path = pathOf(params);
  if (!path.startsWith(C.REPO + '/') && path !== C.REPO) return missing();
  const rest = path.slice(C.REPO.length + 1);
  await ready(env);
  const m = request.method;
  if (m === 'GET' || m === 'HEAD') {
    if (rest === 'info/refs') return text(C.infoRefs(await refsOf(env)));
    if (rest === 'HEAD') return text(C.headFile());
    if (rest === 'objects/info/packs') return text(C.infoPacks(await packsOf(env)));
    if (rest === 'status') {
      const refs = await refsOf(env), packs = await packsOf(env), main = (refs.find((r) => r.name === C.BRANCH) || {}).sha || null, gh = await githubMain(fetchFn);
      const recent = (await env.DB.prepare('SELECT at, by, what, bytes FROM void_code_log ORDER BY id DESC LIMIT 30').all()).results || [];
      const checks = (await env.DB.prepare('SELECT at, ref, sha, state, summary, by FROM void_code_checks ORDER BY id DESC LIMIT 30').all()).results || [];
      const deploys = (await env.DB.prepare('SELECT at, sha, deployment, state, url, by FROM void_code_deploys ORDER BY id DESC LIMIT 20').all()).results || [];
      return json({ ok: true, main, github: gh, sync: C.syncOf(main, gh), refs, changes: refs.filter((r) => C.isCr(r.name)), checks, deploys, packs: packs.length, bytes: packs.reduce((n, p) => n + p.bytes, 0), log: recent, clone: 'node tools/codestore.mjs clone <dir> (the key goes to git in its environment, never on a command line)' });
    }
    const f = rest.startsWith('objects/pack/') ? C.packFile(rest.slice(13)) : null;
    if (!f) return missing();
    const obj = await store.get(C.keyOf(rest.slice(13)));
    if (!obj) return missing();
    return new Response(m === 'HEAD' ? null : obj.body, { headers: { ...H, 'content-type': 'application/octet-stream', 'content-length': String(obj.size) } });
  }
  if (m === 'PUT') {
    const f = rest.startsWith('objects/pack/') ? C.packFile(rest.slice(13)) : null;
    if (!f) return missing();
    const len = Number(request.headers.get('content-length') || 0);
    if (!len || len > C.PACK_MAX) return json({ ok: false, say: 'send one pack or index with a Content-Length of at most ' + C.PACK_MAX + ' bytes' }, 400);
    const key = C.keyOf(rest.slice(13));
    if (await store.head(key)) return json({ ok: true, key, already: true });
    const body = new Uint8Array(await request.arrayBuffer());
    if (body.length !== len || !C.headOk(f.kind, body)) return json({ ok: false, say: 'not a git ' + f.kind + ' file' }, 400);
    await store.put(key, body);
    await log(env, byOf(me), 'stored ' + rest.slice(13), body.length, now);
    return json({ ok: true, key }, 201);
  }
  if (m === 'POST' && rest === 'refs') {
    let b = null; try { b = await request.json(); } catch (_) {}
    const u = C.refUpdate(b); if (!u.ok) return json(u, 400);
    if (me.kind === 'agent' && !C.isCr(u.ref)) { // a seat's own change request goes anywhere; main moves only as GitHub's mirror
      if (u.ref !== C.BRANCH) return json({ ok: false, say: 'a team agent pushes change requests (refs/heads/cr/<name>) and mirrors main only' }, 403);
      const gh = await githubMain(fetchFn);
      if (!gh || gh !== u.sha) return json({ ok: false, say: 'a team agent may only store the commit GitHub main is at now (' + (gh || 'unreadable') + ')' }, 409);
    }
    let bytes = 0; const sizes = {};
    for (const p of u.packs) {
      const a = await store.head(C.keyOf(p + '.pack')), i = await store.head(C.keyOf(p + '.idx')); // void-review: ok (at most 20)
      if (!a || !i) return json({ ok: false, say: p + ' is not stored (both its .pack and .idx): upload them first' }, 409);
      sizes[p] = a.size; bytes += a.size;
    }
    const cur = await env.DB.prepare('SELECT sha FROM void_code_refs WHERE name = ?').bind(u.ref).first();
    if ((cur ? cur.sha : C.ZERO) !== u.old) return json({ ok: false, say: u.ref + ' is at ' + (cur ? cur.sha : 'nothing') + ' now, not ' + u.old + ': fetch, then push again', now: cur ? cur.sha : null }, 409);
    const moved = cur
      ? await env.DB.prepare('UPDATE void_code_refs SET sha = ?, at = ?, by = ? WHERE name = ? AND sha = ?').bind(u.sha, now, byOf(me), u.ref, u.old).run()
      : await env.DB.prepare('INSERT OR IGNORE INTO void_code_refs (name, sha, at, by) VALUES (?, ?, ?, ?)').bind(u.ref, u.sha, now, byOf(me)).run();
    if (!(moved && moved.meta && moved.meta.changes)) return json({ ok: false, say: 'another push moved ' + u.ref + ' first: fetch, then push again' }, 409);
    for (const p of u.packs) await env.DB.prepare('INSERT OR IGNORE INTO void_code_packs (name, at, by, bytes, tip) VALUES (?, ?, ?, ?, ?)').bind(p, now, byOf(me), sizes[p], u.sha).run(); // void-review: ok (at most 20)
    await log(env, byOf(me), u.ref + ' ' + u.old.slice(0, 9) + '..' + u.sha.slice(0, 9), bytes, now);
    return json({ ok: true, ref: u.ref, sha: u.sha });
  }
  if (m === 'POST' && (rest === 'checks' || rest === 'deploys')) { // the runner's reports: the owner's key only
    if (me.kind !== 'owner') return json({ ok: false, say: 'only the runner (the owner\'s key) reports checks and deploys' }, 403);
    let b = null; try { b = await request.json(); } catch (_) {}
    if (rest === 'checks') {
      const c = C.checkOf(b); if (!c.ok) return json(c, 400);
      await env.DB.prepare('INSERT INTO void_code_checks (at, ref, sha, state, summary, by) VALUES (?, ?, ?, ?, ?, ?)').bind(now, c.ref, c.sha, c.state, c.summary, byOf(me)).run();
      await settleAfter(env, now, waitUntil);
      return json({ ok: true }, 201);
    }
    const d = C.deployOf(b); if (!d.ok) return json(d, 400);
    await env.DB.prepare('INSERT INTO void_code_deploys (at, sha, deployment, state, url, by) VALUES (?, ?, ?, ?, ?, ?)').bind(now, d.sha, d.deployment, d.state, d.url, byOf(me)).run();
    await log(env, byOf(me), 'deploy ' + d.deployment + ' ' + d.state + ' at ' + d.sha.slice(0, 9), 0, now);
    await settleAfter(env, now, waitUntil);
    return json({ ok: true }, 201);
  }
  return missing();
}

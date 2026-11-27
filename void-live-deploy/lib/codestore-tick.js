// The clock's part of the code store (functions/api/automations/tick.js): when GitHub's main has moved past the store's main, one job goes
// on the team queue for any seat to run `node tools/codestore.mjs push` (lib/codestore.js JOB_ASK). At most one such job is open at a time.
import * as C from './codestore.js';
import { githubMain } from '../functions/code/[[path]].js';

export async function codestoreTick(env, now = Date.now(), fetchFn = fetch) {
  if (!env || !C.bucketOf(env) || !env.DB) return 'no store';
  for (const t of C.TABLES) await env.DB.prepare(t).run();
  const row = await env.DB.prepare('SELECT sha FROM void_code_refs WHERE name = ?').bind(C.BRANCH).first(), gh = await githubMain(fetchFn);
  const sync = C.syncOf(row ? row.sha : null, gh);
  if (sync === 'same' || sync === 'unknown') return sync;
  const open = await env.DB.prepare("SELECT id FROM void_queue WHERE target = ? AND state IN ('queued', 'building')").bind(C.JOB_TARGET).first().catch(() => null);
  if (open) return 'job open';
  const at = new Date(now).toISOString();
  await env.DB.prepare('INSERT INTO void_queue (id, ask, target, state, note, at, updated) VALUES (?, ?, ?, ?, ?, ?, ?)').bind('code-' + now.toString(36), C.JOB_ASK + ' (GitHub main ' + gh.slice(0, 9) + ')', C.JOB_TARGET, 'queued', 'filed by the clock: the code store is ' + sync, at, at).run();
  return 'job filed';
}

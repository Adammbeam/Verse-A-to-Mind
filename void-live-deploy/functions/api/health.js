// GET /api/health: is this deploy up? JSON, never the page shell (it was a 404 page before, 2026-11-26), for the runner's check after a
// deploy (tools/verse-runner.mjs rolls back when this does not answer ok) and for anyone watching. One cheap D1 read, no secrets.
//   -> 200 { ok: true, at, db: 'ok', build }  |  503 { ok: false, at, db: 'down' | 'unbound', build }
import { assetBuildId } from '../../lib/build-id.js';

export async function onRequestGet({ env, request, now = Date.now() }) {
  let db = 'unbound';
  if (env && env.DB) { try { db = (await env.DB.prepare('SELECT 1 AS one').first()).one === 1 ? 'ok' : 'down'; } catch (_) { db = 'down'; } }
  let build = null; try { build = await assetBuildId(env, new URL(request.url).origin); } catch (_) { build = null; }
  const ok = db === 'ok';
  return Response.json({ ok, at: new Date(now).toISOString(), db, build }, { status: ok ? 200 : 503, headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
}

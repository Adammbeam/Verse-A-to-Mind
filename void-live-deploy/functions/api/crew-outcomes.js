// GET /api/crew-outcomes: the Alien Speed demo numbers a business would buy — jobs handed, verified live, could not tell, and
// the time from hand-out to verified (functions/api/team.js and tools/team-gate.mjs write the events). Open read, counts and job ids
// only, no ask text or agent key, cached a minute. POST is owner-only and lets the live gate record a verdict for one job.
// WHAT A STRANGER COULD MAKE THIS DO: read the numbers; a write needs the owner key and a site on this deployment's own list.
import { ownerOk } from '../../lib/guard.js';
import { jsonNoStore, jsonOkCached } from '../../lib/http.js';
import * as O from '../../lib/crew-outcomes.js';

const READ = 'SELECT site, job, agent, handed_at, handed_in_at, verified_at, verdict, note FROM void_crew_outcomes WHERE site = ? ORDER BY handed_at DESC LIMIT 200'; // void-review: ok (one placeholder)
const readJson = (o, status = 200) => jsonOkCached(o, status, 60, { 'x-robots-tag': 'noindex' });
const writeJson = (o, status = 200) => jsonNoStore(o, status, { 'x-robots-tag': 'noindex, nofollow' });

export async function onRequestGet({ env }) {
  if (!env || !env.DB) return readJson({ ok: false, say: 'no database bound' }, 503);
  const site = O.siteOf(env);
  try {
    await env.DB.prepare(O.TABLE).run();
    const { results } = await env.DB.prepare(READ).bind(site).all();
    return readJson(O.summarize(results || [], site));
  } catch (_) { return readJson({ ok: false, say: 'the outcome record did not answer' }, 503); }
}

export async function onRequestPost({ request, env }) {
  if (!(await ownerOk(request, env))) return writeJson({ error: 'owner only' }, 401);
  let body = null; try { body = JSON.parse(await request.text()); } catch (_) { body = null; }
  const rec = O.reportOf(body, env);
  if (!rec) return writeJson({ error: 'a known site, job and verdict are needed' }, 400);
  if (!env || !env.DB) return writeJson({ error: 'no database bound' }, 503);
  try {
    await env.DB.prepare(O.TABLE).run();
    await env.DB.prepare(rec.sql).bind(...rec.binds).run();
    return writeJson({ ok: true, site: rec.site, job: rec.job, verdict: rec.verdict });
  } catch (_) { return writeJson({ error: 'the outcome record did not answer' }, 503); }
}

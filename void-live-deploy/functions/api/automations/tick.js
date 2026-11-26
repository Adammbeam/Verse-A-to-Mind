// The clock for Verse's automations: POST /api/automations/tick (owner token) runs every scheduled rule that is due.
// Called every 5 minutes by the verse-cron Worker (void-cron/), and every 15 minutes by .github/workflows/void-tick.yml while it is running.
// After the rules, the same knock runs Verse's crew and its wants (lib/team-crew-run.js) once the answer is sent, so a slow crew run
// never holds up or breaks the automations.
import { ownerOk } from '../../../lib/guard.js';
import { tick } from '../../../lib/automations-run.js';
import { crewTick } from '../../../lib/team-crew-run.js';
import { handIdle, pushAll, sweep, promoteIdeas } from '../team.js';
import { dueReport } from '../../../lib/verse-runs.js';

export async function onRequestPost({ request, env, waitUntil }) {
  if (!(await ownerOk(request, env))) return new Response('no', { status: 401 });
  const now = Date.now();
  // A job only moves when a seat asks for one: handIdle is what the team page calls on a poll. A cron knock has no page behind it, so the
  // queue sat at 265 waiting with seats idle while the clock ran. Hand out here too. It is D1-only and bounded, so it is counted and returned.
  const reaped = await sweep(env, now).catch(() => 0); // a dead seat's job comes back before anything is handed out
  const promoted = await promoteIdeas(env, now).catch(() => []); // #ideas proposals that pass Verse's guards become jobs, no button
  const handed = await handIdle(env, now).catch(() => 0);
  const later = () => Promise.all([crewTick(env).catch(() => null), pushAll(env, now).catch(() => 0)]);
  if (typeof waitUntil === 'function') waitUntil(later());
  try {
    const body = await tick(env);
    return Response.json({ ...body, reaped, promoted: promoted.length, handed, verseRuns: dueReport(new Date()) });
  } catch (_) { return new Response('tick error', { status: 500 }); }
}

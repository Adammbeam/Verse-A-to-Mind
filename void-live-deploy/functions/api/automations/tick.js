// The clock for Verse's automations: POST /api/automations/tick (owner token) runs every scheduled rule that is due.
// Called every 5 minutes by the verse-cron Worker (void-cron/), and every 15 minutes by .github/workflows/void-tick.yml while it is running.
// After the rules, the same knock runs Verse's crew and its wants (lib/team-crew-run.js) once the answer is sent, so a slow crew run
// never holds up or breaks the automations.
import { ownerOk } from '../../../lib/guard.js';
import { tick } from '../../../lib/automations-run.js';
import { crewTick } from '../../../lib/team-crew-run.js';
import { handIdle, pushAll, sweep, promoteIdeas, verseSays, settleReviews, freeLineTick, retireJunk } from '../team.js';
import { codestoreTick } from '../../../lib/codestore-tick.js';
import { dueReport } from '../../../lib/verse-runs.js';
import { watchKeys } from '../../../lib/key-watch.js';
import { rallyTick } from '../../../lib/team-rally.js';

export async function onRequestPost({ request, env, waitUntil }) {
  if (!(await ownerOk(request, env))) return new Response('no', { status: 401 });
  const now = Date.now();
  // A job only moves when a seat asks for one: handIdle is what the team page calls on a poll. A cron knock has no page behind it, so the
  // queue sat at 265 waiting with seats idle while the clock ran. Hand out here too. It is D1-only and bounded, so it is counted and returned.
  const reaped = await sweep(env, now).catch(() => 0); // a dead seat's job comes back before anything is handed out
  const promoted = await promoteIdeas(env, now).catch(() => []); // #ideas proposals that pass Verse's guards become jobs, no button
  const retired = await retireJunk(env, now).catch(() => 0); // jobs that can never be done leave the queue first, so real ones come up (lib/team-busy.js)
  const handed = await handIdle(env, now).catch(() => 0);
  // a secret that was set and went blank is said in #general on the tick that sees it (lib/key-watch.js), state words only
  const keys = await watchKeys(env, now, (body) => verseSays(env, { c: 'general', body, now })).catch(() => null);
  // hand-ins in review are settled from their pull request, and once an hour #work hears who is free and what is waiting (lib/team-busy.js)
  // the crew room hears once an hour when there is work and a free seat to take it (lib/team-rally.js), on the same knock as the rest
  const later = () => Promise.all([crewTick(env).catch(() => null), pushAll(env, now).catch(() => 0), settleReviews(env, now).catch(() => 0), freeLineTick(env, now).catch(() => ''), rallyTick(env, now).catch(() => null), codestoreTick(env, now).catch(() => '')]);
  if (typeof waitUntil === 'function') waitUntil(later());
  try {
    const body = await tick(env);
    return Response.json({ ...body, reaped, retired, promoted: promoted.length, handed, keysLost: keys ? keys.lost : null, verseRuns: dueReport(new Date()) });
  } catch (_) { return new Response('tick error', { status: 500 }); }
}

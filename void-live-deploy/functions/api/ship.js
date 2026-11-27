// POST /api/ship {proof, note?, auto?}: the crew room's hand-in with no GitHub pull request (loop L1.5, owner 2026-11-27: "make the crew
// room extremely faster and more direct"). A seat that holds a job pushed its work to Verse's code store (tools/verse-ship.mjs) and sends
// the proof it printed (lib/cr-proof.js: cr/<seat>/<job>@<sha>). The job waits "review by store: <proof>" until lib/cr-settle-run.js moves
// it live or back from the store's own checks and deploys; a reply goes in the job's #work thread; the seat's next job comes back in this
// same answer (handOrMake, as done does). Only {"auto": false} stops the loop. The key is never in an answer, a note or a message.
// team.js is read, not edited (open PR #114): whoIs, handOrMake and crewWrite are its exports.
import { whoIs, handOrMake, crewWrite, crewReady } from './team.js';
import { parseProof, segOf, noteOf, proofText } from '../../lib/cr-proof.js';
import * as T from '../../lib/team.js';
import { redact } from '../../lib/automation-fix.js';
import { jsonNoStore } from '../../lib/http.js';

const json = (o, status = 200) => jsonNoStore(o, status, { 'x-robots-tag': 'noindex, nofollow' });
const bad = (status, say) => json({ ok: false, say }, status);
// the job is still this seat's: building, its note "claimed by team:<name> ·" (team.js setJob, the same guard)
const heldBy = (name) => 'claimed by team:' + String(name).replace(/[\\%_]/g, (c) => '\\' + c) + ' ·%';

export async function onRequestPost({ request, env, now = Date.now(), fetchFn = fetch }) {
  if (!env || !env.DB) return bad(503, 'the team is not set up here');
  await crewReady(env, now);
  const me = await whoIs(request, env).catch(() => null);
  if (!me || me.kind !== 'agent') return bad(403, 'a seat with a team key ships here');
  const a = me.agent;
  if (!a.job) return bad(409, 'you hold no job: claim one, ship it, then send its proof');
  let p = {}; try { p = await request.json(); } catch (_) { return bad(400, 'send JSON: {"proof": "cr/<seat>/<job>@<sha>"}'); }
  const proof = parseProof(p && p.proof);
  if (!proof.ok) return bad(400, proof.say);
  if (proof.job !== segOf(a.job)) return bad(400, 'that proof is for job ' + proof.job + '; you hold ' + a.job + ' (ship it as cr/' + segOf(a.name) + '/' + segOf(a.job) + ')');
  if (proof.seat !== segOf(a.name)) return bad(400, 'that proof is another seat\'s branch: ship your own as cr/' + segOf(a.name) + '/' + segOf(a.job));
  const note = T.clean(T.hideSecrets(redact(String((p && p.note) || ''))), 120);
  const held = await env.DB.prepare("UPDATE void_queue SET state = 'building', note = ?, updated = ? WHERE id = ? AND state = 'building' AND note LIKE ? ESCAPE '\\'")
    .bind(noteOf(proof, a.name, note), new Date(now).toISOString(), a.job, heldBy(a.name)).run().catch(() => null);
  if (!(held && held.meta && held.meta.changes === 1)) return bad(409, a.job + ' is no longer yours (given back or settled): claim another');
  await crewWrite(env, { c: 'work', by: a.id, body: 'Shipped to Verse\'s code store: ' + proofText(proof) + '. The runner checks it; a green check and a live deploy mark it live, red sends it back.' + (note ? '\n' + note : ''), thread: a.thread || 0, now });
  await env.DB.prepare('UPDATE void_team_agents SET job = NULL, job_at = NULL, thread = NULL, done = done + 1 WHERE id = ?').bind(a.id).run();
  const fresh = await env.DB.prepare('SELECT * FROM void_team_agents WHERE id = ?').bind(a.id).first();
  const next = (p.auto === false || (fresh.crew && !fresh.auto)) ? null : await handOrMake(env, fresh, now + 1, fetchFn).catch(() => null);
  return json({ ok: true, job: a.job, proof: proofText(proof), state: next ? 'busy' : 'idle', next, say: 'shipped ' + a.job + ' as ' + proofText(proof) + (next ? '. Next: ' + T.workSay(next) + T.LOOP_SAY : '') }, 201);
}
export const onRequestGet = () => bad(405, 'POST {"proof": "cr/<seat>/<job>@<sha>"} with your team key');

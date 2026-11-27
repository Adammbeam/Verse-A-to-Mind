// Settle shipped jobs from Verse's code store (loop L1.6): a green check and a live deploy mark the job live with no human publisher; a red
// check puts it back on the queue. No GitHub read: the store's own tables (void_code_checks, void_code_deploys, void_code_refs, D1) say it.
// Two ways a building job is matched to a change request:
//   1. its note carries a store proof ("review by store: cr/<seat>/<job>@<sha>", functions/api/ship.js writes it)
//   2. no proof was stored, but the store holds refs/heads/cr/<seat>/<job> for that queue id, the job's note still says
//      "claimed by team:<seat>", and that seat (or the owner) pushed the ref. A ref another seat pushed, or a job that is
//      waiting on a GitHub review, is left alone.
// At most `max` jobs a pass. The note says why (the check summary or the deploy url), as team.js settleReviews does for pull requests.
// functions/code/[[path]].js runs it after the runner reports a check or a deploy (L1.7).
import { parseProof, proofOfNote, segOf, proofText } from './cr-proof.js';
import { settleOf } from './cr-settle.js';

const rows = async (env, sql, ...b) => { try { return (await env.DB.prepare(sql).bind(...b).all()).results || []; } catch (_) { return []; } };
/** the store's checks, deploys and change requests from D1 (newest first), shaped like GET /code/verse.git/status */
export async function storeStatus(env) {
  const checks = await rows(env, 'SELECT at, ref, sha, state, summary FROM void_code_checks ORDER BY id DESC LIMIT 200');
  const deploys = await rows(env, 'SELECT at, sha, deployment, state, url FROM void_code_deploys ORDER BY id DESC LIMIT 50');
  const changes = await rows(env, "SELECT name, sha, by FROM void_code_refs WHERE name LIKE 'refs/heads/cr/%' ORDER BY at DESC LIMIT 100");
  return { checks, deploys, changes };
}
/** the store notes a pass writes. Pure. */
export function settledNote(how, why, old) {
  return ((how === 'live' ? 'live: ' : 'back: ') + String(why || '').replace(/\s+/g, ' ').slice(0, 140) + ' · ' + String(old || '')).slice(0, 300);
}
const claimedBy = (note) => { const m = /claimed by team:([^·]+?) ·/.exec(String(note || '')); return m ? m[1].trim() : ''; };

/** one pass -> { looked, live, back, wait, settled: [{ job, how, proof }] } */
export async function settleStore(env, { now = Date.now(), max = 6, status = null } = {}) {
  const out = { looked: 0, live: 0, back: 0, wait: 0, settled: [] };
  if (!env || !env.DB) return out;
  const st = status || await storeStatus(env), picked = [];
  for (const j of await rows(env, "SELECT id, note FROM void_queue WHERE state = 'building' AND note LIKE '%review by store: %' ORDER BY updated ASC LIMIT ?", max)) {
    const proof = proofOfNote(j.note); if (proof) picked.push({ ...j, proof, byRef: false });
  }
  for (const r of st.changes || []) { // 2: a change request named for a building job that never stored its proof
    if (picked.length >= max) break;
    const p = parseProof(r.name + '@' + r.sha); if (!p.ok || picked.some((x) => x.id === p.job)) continue;
    const [j] = await rows(env, "SELECT id, note FROM void_queue WHERE id = ? AND state = 'building' AND note NOT LIKE '%review by store: %'", p.job); // void-review: ok (at most `max` reads a pass)
    if (!j || segOf(j.id) !== p.job) continue;
    const who = claimedBy(j.note); if (!who || segOf(who) !== p.seat) continue; // only the seat whose claim note is still on the job
    const by = String(r.by || ''); if (by !== 'owner' && by !== 'team:' + p.seat) continue; // a ref another seat pushed under this name
    picked.push({ ...j, proof: p, byRef: true });
  }
  for (const j of picked.slice(0, max)) {
    out.looked++;
    const s = settleOf(j.proof, st);
    if (s.how === 'wait') { out.wait++; continue; }
    const at = new Date(now).toISOString(), why = s.how === 'live' ? s.why : s.why + ' (rebase or fix, then ship again)';
    const note = settledNote(s.how, why, j.byRef ? 'store ' + proofText({ ref: j.proof.ref, sha: j.proof.sha }) + ' · ' + j.note : j.note);
    let moved = null;
    try { moved = await env.DB.prepare("UPDATE void_queue SET state = ?, note = ?, updated = ? WHERE id = ? AND state = 'building'").bind(s.how === 'live' ? 'live' : 'queued', note, at, j.id).run(); } catch (_) { moved = null; } // void-review: ok (bounded by max)
    if (!(moved && moved.meta && moved.meta.changes === 1)) continue;
    // a seat still holding it (matched by its ref, it never sent the proof) is freed: the job is live, or back on the queue
    try { await env.DB.prepare('UPDATE void_team_agents SET job = NULL, job_at = NULL, thread = NULL WHERE job = ?').bind(j.id).run(); } catch (_) {} // void-review: ok (bounded by max)
    out[s.how]++; out.settled.push({ job: j.id, how: s.how, proof: proofText(j.proof) });
  }
  return out;
}

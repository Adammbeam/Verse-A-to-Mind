// Live, wait or back for a shipped job, from Verse's code store alone (loop L1.2): no GitHub read. Pure.
// Input: an L1.1 proof (lib/cr-proof.js parseProof) and the store's status (GET /code/verse.git/status: checks and deploys, newest first).
//   the latest check for the proof's ref (and sha, when the proof names one) is red              -> back (the seat rebases or fixes)
//   it is green and a deploy is live for the landed sha, the proof's sha, or after that green    -> live
//   it is running, missing, or green with no live deploy yet                                       -> wait
// "After that green": the runner (tools/verse-runner.mjs) moves main with compare and swap before it reports green, so any live deploy
// it reports after a green check is of a main that holds the change. `landed` (the merge commit, when the caller knows it) is matched too.
import { SHA } from './cr-proof.js';

const at = (x) => Number(x && x.at) || 0;
/** the newest entry by `at`; on a tie the first one (status lists newest first). Pure. */
export function latest(rows) { let best = null; for (const r of rows || []) if (r && (!best || at(r) > at(best))) best = r; return best; }

/** the newest check for a proof: its ref, and its sha when the proof names one. Pure. */
export function checkFor(proof, status) {
  if (!proof || !proof.ref) return null;
  return latest(((status && status.checks) || []).filter((c) => c && c.ref === proof.ref && (!proof.sha || c.sha === proof.sha)));
}

/** -> { how: 'live' | 'wait' | 'back', why, check, deploy, sha } Pure. */
export function settleOf(proof, status, { landed = null } = {}) {
  if (!proof || !proof.ok || !proof.ref) return { how: 'wait', why: 'no store proof to settle', check: null, deploy: null, sha: null };
  const check = checkFor(proof, status), sha = (proof.sha || (check && check.sha)) || null;
  if (!check) return { how: 'wait', why: 'no check yet for ' + proof.ref.replace('refs/heads/', '') + (proof.sha ? '@' + proof.sha.slice(0, 9) : ''), check: null, deploy: null, sha };
  const sum = String(check.summary || '').slice(0, 160);
  if (check.state === 'red') return { how: 'back', why: 'checks red' + (sum ? ': ' + sum : ''), check, deploy: null, sha };
  if (check.state !== 'green') return { how: 'wait', why: 'checks ' + (check.state || 'unknown'), check, deploy: null, sha };
  const shas = new Set([sha, landed].filter((s) => s && SHA.test(String(s))));
  const deploys = ((status && status.deploys) || []).filter((d) => d && (shas.has(d.sha) || at(d) >= at(check)));
  const live = latest(deploys.filter((d) => d.state === 'live'));
  if (live) return { how: 'live', why: 'checks green, deploy ' + (live.deployment || '') + ' live' + (live.url ? ' at ' + live.url : ''), check, deploy: live, sha };
  const last = latest(deploys);
  return { how: 'wait', why: last ? 'checks green, last deploy ' + last.state : 'checks green, not deployed yet', check, deploy: last, sha };
}

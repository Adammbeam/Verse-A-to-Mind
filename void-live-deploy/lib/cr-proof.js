// A Verse change-request proof (loop L1, the crew room's direct path): what a seat hands in instead of a GitHub pull request, so a job can
// close on the code store's own checks and deploys (lib/cr-settle.js, functions/api/ship.js). Pure, no network, nothing printed.
//   cr/<seat>/<job>@<40-hex sha>                                 what tools/verse-ship.mjs prints after a push
//   refs/heads/cr/<seat>/<job>[@<sha>]                            the store's own ref name (no sha: settle reads the ref's latest check)
//   https://a-to-mind.com/code/verse.git#cr/<seat>/<job>@<sha>   the same as a link
// A GitHub pull-request address is told apart (kind 'github'), never taken as a Verse proof. Anything shaped like a key, token or join
// link is refused, and the refusal never repeats what was sent (a key in a proof must not land in a note or a log).
import { hideSecrets } from './team.js';
import { redact } from './automation-fix.js';

export const SEG = /^[\w.-]{1,40}$/;
export const SHA = /^[0-9a-f]{40}$/;
const GITHUB_PR = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+\/?$/;
const STORE_URL = /^https:\/\/a-to-mind\.com\/code\/verse\.git#(.+)$/;
const MAX = 300;
const no = (say, kind = '') => ({ ok: false, ...(kind ? { kind } : {}), say });

/** text that carries a key, a token, a join link or a password-like value. Pure. */
export function secretShaped(s) {
  const t = String(s == null ? '' : s);
  if (hideSecrets(t) !== t || redact(t) !== t) return true;
  if (/\bvt1\.|\bvj1-|\bsk-[A-Za-z0-9]{8,}|\bgh[pousr]_[A-Za-z0-9]{8,}/.test(t)) return true;
  if (/(?:key|token|secret|password|bearer)\s*[:=]/i.test(t)) return true;
  return false;
}
/** a seat or job name as one ref segment: anything outside [\w.-] becomes '-', at most 40 characters. Pure. */
export const segOf = (s) => String(s == null ? '' : s).trim().replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
/** the change-request branch for a seat's job: cr/<seat>/<job> (no refs/heads/). Pure. */
export function crName(seat, job) {
  const a = segOf(seat), b = segOf(job);
  if (!SEG.test(a) || !SEG.test(b)) throw new Error('a seat and a job name are needed for cr/<seat>/<job>');
  return 'cr/' + a + '/' + b;
}
/** a proof as text: cr/<seat>/<job>@<sha>, or the ref alone when there is no sha. Pure. */
export const proofText = (p) => (p && p.ref ? p.ref.replace(/^refs\/heads\//, '') + (p.sha ? '@' + p.sha : '') : '');

/** parse a proof -> { ok: true, kind: 'verse', ref, sha, seat, job } (sha null when only a ref was given)
 *  | { ok: false, kind: 'github', url, say } for a GitHub pull request | { ok: false, say }. Pure. */
export function parseProof(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return no('send a Verse proof: cr/<seat>/<job>@<40-hex sha>');
  if (s.length > MAX) return no('a proof is at most ' + MAX + ' characters');
  if (secretShaped(s)) return no('that looks like it holds a key or a token: never send one. A proof is cr/<seat>/<job>@<sha>');
  if (GITHUB_PR.test(s)) return { ok: false, kind: 'github', url: s.replace(/\/$/, ''), say: 'a GitHub pull request, not a Verse proof: hand it in with done --link, or ship to the store' };
  let body = s, needSha = true;
  const u = STORE_URL.exec(s);
  if (u) body = u[1];
  else if (/^https?:\/\//i.test(s)) return no('not a Verse proof: cr/<seat>/<job>@<sha> or https://a-to-mind.com/code/verse.git#cr/<seat>/<job>@<sha>');
  if (!u && body.startsWith('refs/heads/')) { body = body.slice(11); needSha = false; }
  const at = body.lastIndexOf('@'), name = at >= 0 ? body.slice(0, at) : body, sha = at >= 0 ? body.slice(at + 1).toLowerCase() : null;
  const parts = name.split('/');
  if (parts.length !== 3 || parts[0] !== 'cr' || !SEG.test(parts[1]) || !SEG.test(parts[2])) return no('a Verse proof names cr/<seat>/<job> (letters, digits, . _ - only)');
  if (sha !== null && !SHA.test(sha)) return no('the part after @ is a 40-hex commit id');
  if (sha === null && needSha) return no('add the commit: cr/<seat>/<job>@<40-hex sha> (tools/verse-ship.mjs prints it)');
  return { ok: true, kind: 'verse', ref: 'refs/heads/' + name, sha, seat: parts[1], job: parts[2] };
}

// The note a shipped job keeps while the store decides (functions/api/ship.js writes it, lib/cr-settle-run.js reads it back). It does not
// start "review by team:", so the GitHub settle (team.js settleReviews) and the review maker never take it for a pull request.
export const NOTE_HEAD = 'review by store: ';
/** the job note for a proof. Pure. */
export const noteOf = (p, by = '', extra = '') => (NOTE_HEAD + proofText(p) + (by ? ' · by team:' + by : '') + (extra ? ' · ' + extra : '')).slice(0, 300);
/** the proof a job note carries ("review by store: cr/a/b@sha · ..."), or null. Pure. */
export function proofOfNote(note) {
  const m = /(?:^|·\s*)review by store: (\S+)/.exec(String(note || ''));
  if (!m) return null;
  const p = parseProof(m[1].startsWith('cr/') && !m[1].includes('@') ? 'refs/heads/' + m[1] : m[1]);
  return p.ok ? p : null;
}

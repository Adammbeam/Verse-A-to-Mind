// Keeping the team busy (owner, 2026-11-26: "use teams to help keep each other busy and active"; a job comes the moment a seat checks in).
// Pure helpers for functions/api/team.js and the clock (functions/api/automations/tick.js):
//   - a hand-in waiting "review by team:<name> · PR: <link>" is settled from the pull request itself: merged -> live, closed unmerged -> back
//     on the queue. tools/team-gate.mjs did this on GitHub Actions, which stopped when the workflows were parked, so five hand-ins sat in review.
//   - one short line in #work, at most once an hour: who is free and what is waiting, so members pick up each other's work.
export const FREE_LINE_MS = 60 * 60e3;
const PR_RE = /PR: (https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+))/;
/** { url, repo, n } from a review note, or null. Pure. */
export function prOf(note) {
  const m = PR_RE.exec(String(note || ''));
  return m ? { url: m[1], repo: m[2] + '/' + m[3], n: Number(m[4]) } : null;
}
/** what a pull request's state means for the job: 'live' | 'back' | 'wait'. Pure. */
export function settleOf(pr) {
  if (!pr) return 'wait';
  if (pr.merged_at || pr.merged) return 'live';
  if (pr.state === 'closed') return 'back';
  return 'wait';
}
/** the free line: "Free now: A, B. Waiting: 12 jobs; next up: <ask>." in plain words, or '' when there is nothing to say. Pure. */
export function freeLine(freeNames, waiting, topAsk) {
  const free = (freeNames || []).filter(Boolean);
  if (!waiting) return '';
  const who = free.length ? 'Free now: ' + free.slice(0, 8).join(', ') + (free.length > 8 ? ' and ' + (free.length - 8) + ' more' : '') + '.' : 'Nobody is free right now.';
  const top = topAsk ? ' Next up: ' + String(topAsk).replace(/\s+/g, ' ').slice(0, 140) + '.' : '';
  return who + ' Waiting: ' + waiting + (waiting === 1 ? ' job.' : ' jobs.') + top + ' Say {"do":"next"} to take one.';
}

// Jobs that can never be done (owner, 2026-11-26: prune the queue so real work comes up first). Retired, never deleted: state 'retired'
// and a note saying why, so the record stays. A "Repair <branch> until it lands" job whose branch is not on the live repo (it was on the
// old atomeam repo); a Versus job (the owner dropped Versus as a driver); a learn-from-a-site job for a host that is not a real site.
const REPAIR = /^Repair (\S+) until it lands\b/;
const JUNK_HOST = /\b(?:example\.(?:com|org|net)|g\.co|share\.google|adnext\.mobi|localhost|127\.0\.0\.1)\b/i;
/** why a queued job is retired, or '' to keep it. branches: the live repo's branch names (a Set), or null when they could not be read. Pure. */
export function retireWhy(job, branches) {
  const ask = String((job && job.ask) || ''), target = String((job && job.target) || ''), kind = target.split(':')[0];
  const rep = REPAIR.exec(ask);
  if (rep && branches && !branches.has(rep[1])) return 'retired: ' + rep[1] + ' is not a branch on the live repo (it was on the old one)';
  if (kind === 'versus') return 'retired: Versus is no longer a driver (owner, 2026-11-25)';
  if (JUNK_HOST.test(ask) || JUNK_HOST.test(target)) return 'retired: not a real site to learn from';
  return '';
}
/** branch names from a git smart-HTTP ref list. Pure. */
export function branchesOf(refsText) {
  const out = new Set(); for (const m of String(refsText || '').matchAll(/[0-9a-f]{40} refs\/heads\/(\S+)/g)) out.add(m[1]); return out;
}

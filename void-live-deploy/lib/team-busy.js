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

// Never idle (owner, 2026-11-26: "staying productive and standing by are opposites"). When the queue holds nothing a seat can take, Verse
// makes a job, in this order: review a hand-in another seat is waiting on (a review goes to a free seat, not the owner); the next row of the
// ranked build list in docs/capability-gaps.md that has no job yet; a first-time-visitor pass over the live site that files what breaks.
export const GAPS_URL = 'https://raw.githubusercontent.com/Adammbeam/Verse-A-to-Mind/main/docs/capability-gaps.md';
const slugOf = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
/** the ranked build list of docs/capability-gaps.md -> [{ rank, job, slug, ask }]. Pure. */
export function gapsOf(md) {
  const part = String(md || '').split(/^## Ranked build list\s*$/m)[1];
  if (!part) return [];
  const out = [];
  for (const line of part.split(/^## /m)[0].split('\n')) {
    const c = line.split('|').map((x) => x.trim());
    if (c.length < 6 || !/^\d+$/.test(c[1])) continue;
    const [rank, job, why, page] = [Number(c[1]), c[2], c[3], c[4].replace(/`/g, '')];
    out.push({ rank, job, slug: slugOf(job), ask: ('Capability gap #' + rank + ': ' + job + '. ' + why + ' Build it into ' + page + ' (docs/capability-gaps.md row ' + rank + '; search and salvage first, one small pull request).').slice(0, 400) });
  }
  return out;
}
/** the job a free seat is given when nothing is queued for it. `open` = the targets already on the queue (any state but retired),
 *  `review` = the oldest hand-in waiting on another seat ({ id, note }), `gaps` = gapsOf(...). -> { id, ask, target }, or null only when this seat had its visitor pass this hour. Pure. */
export function makeWorkOf({ name, now, open = [], review = null, gaps = [] }) {
  const has = new Set(open), stamp = now.toString(36);
  if (review) {
    const pr = prOf(review.note), target = 'review:' + review.id;
    if (pr && !has.has(target)) return { id: 'rev-' + stamp, target, ask: 'Review the hand-in ' + pr.url + ' (job ' + review.id + '): read the diff, run its tests and node tools/pre-pr.mjs, then post "merge" or what to fix in the pull request and hand this in with done and a note.' };
  }
  for (const g of gaps) if (!has.has('gap:' + g.slug)) return { id: 'gap-' + stamp, target: 'gap:' + g.slug, ask: g.ask };
  const hour = new Date(now).toISOString().slice(0, 13), target = 'auto:stranger-' + slugOf(name) + '-' + hour;
  if (has.has(target)) return null; // one visitor pass a seat an hour, so a seat that loops cannot fill the queue with them
  return { id: 'str-' + stamp, target, ask: 'First-time visitor pass: open https://a-to-mind.com as a stranger, try five real asks a new visitor would type, and file each one that breaks or answers with an article instead of the thing as its own #work job ({"do":"file","body":"..."}). Hand in with done, ok and a note listing what you tried.' };
}
/** a made job closes with a note, not a pull request (its work is a review verdict or filed jobs). Pure. */
export const noteJob = (target) => /^(?:review:|auto:stranger-)/.test(String(target || ''));

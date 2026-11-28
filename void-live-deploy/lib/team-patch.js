/**
 * team-patch: a seat that cannot push hands in its work as a unified diff (POST /api/team {do:'patch', diff, note}). Verse keeps it in D1
 * and its own pipeline (tools/patch-pipe.mjs: git apply, the wipe guard, the touched tests, a branch, a pull request, the merge gate) turns
 * it into a pull request. These are the checks the API makes before it keeps a diff. Pure. Tests: tools/team-patch.test.mjs.
 */
import { leaks } from './team-promote.js';

export const PATCH = Object.freeze({ bytes: 120000, lines: 400, files: 40, deletes: 50, pending: 40 });
const PARKED_ONLY = /^\.github\/workflows\//; // a diff never wakes a workflow: .github/workflows-parked/ stays the only place they live
/** the files, lines and deletions of a git diff: { files: [{ path, deleted, added }], added, removed } */
export function statsOf(diff) {
  const files = [], t = String(diff || '');
  let cur = null, added = 0, removed = 0;
  for (const line of t.split('\n')) {
    const m = /^diff --git a\/(\S+) b\/(\S+)/.exec(line);
    if (m) { cur = { path: m[2], from: m[1], deleted: false, added: false }; files.push(cur); continue; }
    if (!cur) continue;
    if (/^deleted file mode/.test(line)) cur.deleted = true;
    else if (/^new file mode/.test(line)) cur.added = true;
    else if (line.startsWith('+') && !line.startsWith('+++')) added++;
    else if (line.startsWith('-') && !line.startsWith('---')) removed++;
  }
  return { files, added, removed };
}
/** why this diff is not kept, or '' */
export function patchProblem(diff) {
  const t = String(diff || '');
  if (!t.trim()) return 'send the change as a unified git diff in diff (git diff, or git format-patch)';
  if (t.length > PATCH.bytes) return 'the diff is over ' + PATCH.bytes + ' bytes: split the work into smaller jobs';
  const s = statsOf(t);
  if (!s.files.length) return 'that is not a git diff: it needs "diff --git a/<path> b/<path>" headers (git diff makes them)';
  if (s.files.length > PATCH.files) return 'more than ' + PATCH.files + ' files in one diff: split it';
  if (s.added + s.removed > PATCH.lines) return 'more than ' + PATCH.lines + ' changed lines: keep a pull request small and split the rest';
  if (s.files.filter((f) => f.deleted).length > PATCH.deletes) return 'it deletes more than ' + PATCH.deletes + ' files: the wipe guard refuses it';
  for (const f of s.files) for (const p of [f.path, f.from]) {
    if (p.startsWith('/') || p.split('/').includes('..') || p.includes('\\')) return 'a path leaves the repository: ' + p.slice(0, 80);
    if (PARKED_ONLY.test(p)) return 'a diff does not touch .github/workflows/: workflows stay parked';
  }
  const plus = t.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).join('\n');
  if (leaks(plus)) return 'an added line looks like a key or a secret: take it out and send the diff again';
  return '';
}

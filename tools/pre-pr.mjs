// What an agent runs before it opens a pull request (owner, 2026-11-04: one pull request per task, rebase on main first, never edit a
// generated file by hand, and the code is perfect going in; then "only open easily clearable ones so we dont hang anymore").
// A pull request opens only when it can clear: on top of main, small, single purpose, and not touching a file a live
// older open pull request also changes. Live means green, or pushed in the last two hours. A red one, a draft, and one
// labelled hold do not hold the queue. Generated files are not an overlap.
//   node tools/pre-pr.mjs                 the refusals below, then the fast checks for what changed
//   node tools/pre-pr.mjs --check-only    only the refusals (helper-pr.yml runs this before it opens a PR)
//   --pr <n>                              this pull request: left out, and a newer overlap does not hold it
// Refusals: behind main; a build output in the diff (tools/generated.mjs); more than MAX_LINES changed lines (added + removed, not
// counting build outputs, the append-only records and binary files); a file a live older open pull request also changes.
// Split a big change into PRs that each stand alone.
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatedTouched, BUILD_OUTPUTS } from './generated.mjs';
import { DEPLOY_ONLY } from './regen-paths.mjs';
import { APPEND_JSON, APPEND_TEXT } from './records.mjs';
import { COMMON } from './collide.mjs';
import { publicRivalHits } from './rival-public.mjs';
import { wipeRefusal, skillIndexGaps, allowWipe } from './wipe-guard.mjs';
// the branch a pull request goes into: origin/main, or PRE_PR_BASE (e.g. verse/main in a clone whose origin is the old repo; set GH_REPO to match)
const BASE = process.env.PRE_PR_BASE || 'origin/main';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const git = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20, timeout: 120e3 });

/** the most changed lines one pull request may carry (owner, 2026-11-04: "only open easily clearable ones"). */
export const MAX_LINES = 400;
// written by a run, one small file each, or appended by every bot: never what makes a PR hard to review or land
const NOT_COUNTED = [/^growth\/entries\//, /^void-live-deploy\/incidents\/entries\//, /^void-live-deploy\/tower-evidence\//, /^void-live-deploy\/skills\/order\//, /(^|\/)package-lock\.json$/];
/** files every PR may share with another open PR: the shared ledgers, the records tools/merge-main.mjs merges by keeping both sides, the map, and the skill-family list (one added skill; merge-main.mjs and the merge gate settle it). */
export const SHARED_OK = [...new Set([...COMMON, ...APPEND_JSON, ...APPEND_TEXT, 'docs/MAP.md', 'tools/families.mjs', 'void-live-deploy/growth.atom', 'void-live-deploy/growth.proof.json', 'growth.atom', 'growth.proof.json', 'tools/test_void.mjs', 'tools/real-pages.mjs'])];
// One section or route spec per page PR in the browser suite, settled by merge-main.mjs. Kept here, not in
// collide.mjs's COMMON, so the gate still shares them while another PR can own the collision-advisor file.

/** commits on `upstream` that `head` does not have. Null when git cannot say. */
export function behindCount(upstream = BASE, head = 'HEAD', run = git) {
  const r = run(['rev-list', '--count', head + '..' + upstream]);
  if (r.status !== 0) return null;
  return Number(String(r.stdout || '').trim());
}

export function branchFiles(upstream = BASE, run = git) {
  const r = run(['diff', '--name-only', upstream + '...HEAD']);
  if (r.status !== 0) return null;
  return String(r.stdout || '').split('\n').map((s) => s.trim()).filter(Boolean);
}

/** git diff --numstat text -> { lines, counted: [{ file, n }] } with build outputs, run records and binaries left out. Pure. */
export function diffSize(numstat) {
  const skip = new Set([...BUILD_OUTPUTS, ...APPEND_JSON, ...APPEND_TEXT]);
  const counted = [];
  for (const line of String(numstat || '').split('\n')) {
    const m = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
    if (!m || m[1] === '-' || m[2] === '-') continue; // a binary file
    const file = m[3].includes(' => ') ? m[3].replace(/\{([^}]*) => ([^}]*)\}/, '$2').replace(/^.* => /, '') : m[3];
    if (skip.has(file) || NOT_COUNTED.some((re) => re.test(file))) continue;
    counted.push({ file, n: Number(m[1]) + Number(m[2]) });
  }
  return { lines: counted.reduce((s, x) => s + x.n, 0), counted: counted.sort((a, b) => b.n - a.n) };
}

const isSharedEntry = (f) => f.startsWith('growth/entries/') || f.startsWith('void-live-deploy/growth/entries/');

/** how long a not-yet-green older pull request still holds a shared file. */
export const FRESH_MS = 2 * 60 * 60 * 1000;

/** generated files are never an overlap: skills/index.json, sitemap.xml, a catalog, and the other deploy outputs. */
export function generatedOverlap(file) {
  const f = String(file || '');
  if (f === 'skills/index.json' || f.endsWith('/skills/index.json')) return true;
  if (f === 'sitemap.xml' || f.endsWith('/sitemap.xml')) return true;
  if (/(^|\/)catalogs?(\/|$)/i.test(f)) return true;
  if (/(^|\/)catalog[^/]*\.(json|xml|html)$/i.test(f)) return true;
  if (f === 'void-live-deploy/tools/index.html') return true;
  return BUILD_OUTPUTS.includes(f) || DEPLOY_ONLY.includes(f);
}

function labelNames(p) {
  return (p && p.labels || []).map((l) => String((l && l.name) || l || '').toLowerCase());
}

function toneOf(p) {
  const word = String(p && (p.check || p.conclusion || '')).toLowerCase();
  if (word === 'green' || word === 'success') return 'green';
  if (word === 'red' || word === 'failure' || word === 'timed_out' || word === 'startup_failure') return 'red';
  if (word === 'pending' || word === 'queued' || word === 'in_progress') return 'pending';
  return 'none';
}

function openedAt(p) {
  const raw = p && (p.created_at || p.created);
  if (raw == null || raw === '') return null;
  const n = Date.parse(raw);
  return Number.isFinite(n) ? n : null;
}

/** true when `other` opened before this pull request. Earlier created_at when every row has one; otherwise the lower number. */
function olderPull(other, self, prs) {
  if (self == null || other == null || Number(other.number) === Number(self)) return false;
  const rows = Array.isArray(prs) ? prs : [];
  const selfRow = rows.find((p) => Number(p.number) === Number(self));
  const set = selfRow ? rows : rows.concat([{ number: self }]);
  if (set.length && set.every((p) => openedAt(p) != null)) {
    const o = openedAt(other), s = openedAt(selfRow);
    if (o !== s) return o < s;
  }
  return Number(other.number) < Number(self);
}

/** an older open pull request holds the queue only while it is green, or was pushed within FRESH_MS.
 *  A red one, a draft, and one labelled hold do not. Pure. */
export function blocksAsOlder(p, now = Date.now()) {
  if (!p || p.draft) return false;
  if (labelNames(p).includes('hold')) return false;
  const tone = toneOf(p);
  if (tone === 'red') return false;
  if (tone === 'green') return true;
  const pushed = Date.parse(p.pushed_at || p.pushed || '');
  return Number.isFinite(pushed) && pushed <= now + 5 * 60 * 1000 && now - pushed <= FRESH_MS;
}

/** the open PRs that change one of `files` and that this pull request must wait for. A known self waits only for
 *  an older live overlap. A branch with no pull request yet waits for those same live overlaps. Pure. */
export function overlapping(files, prs, self = null, ok = SHARED_OK, now = Date.now()) {
  const mine = new Set((files || []).filter((f) => !ok.includes(f) && !isSharedEntry(f) && !generatedOverlap(f)));
  return (prs || [])
    .filter((p) => p.number !== self && (self == null || olderPull(p, self, prs)) && blocksAsOlder(p, now))
    .map((p) => ({ number: p.number, title: p.title, shared: (p.files || []).filter((f) => mine.has(f)) }))
    .filter((p) => p.shared.length);
}

/** every refusal for this branch, as lines to print; empty when it may open. Pure apart from what it is handed. */
export function refusals({ behind, files, numstat, prs, self, max = MAX_LINES, fresh = [], deleted = 0, treeSize = 0, allowWipe: allow = false, indexNames = [], now = Date.now() }) {
  const out = [];
  if (behind > 0) out.push('this branch is ' + behind + ' commit(s) behind main. Bring main in first (node tools/merge-main.mjs).');
  const wipe = wipeRefusal({ deleted, treeSize, allow });
  if (wipe) out.push(wipe);
  const gaps = skillIndexGaps({ files, indexNames });
  if (gaps.length) out.push('these new skills are not in void-live-deploy/skills/index.json (deploy.yml is parked, so the ask bar will not see them): ' + gaps.join(', ') + '. Run node tools/skills-index.mjs --write and include the index in the commit.');
  // a deploy-only copy is never fresh enough for a pull request: it names the newest commit, a time window or live facts
  const freshSet = new Set(fresh.filter((f) => !DEPLOY_ONLY.includes(f)));
  const generated = generatedTouched(files).filter((f) => !freshSet.has(f));
  if (generated.length) out.push('these are written at deploy, from their own sources. Take them out of the commit:\n  ' + generated.join('\n  ') +
    '\nsources: skills/order/ (the index), growth/entries/ (the ledger), incidents/entries/ (one file per suite run), tower-evidence/ (one file per floor). Then node tools/refresh.mjs on the deploy, not in the pull request.');
  const size = diffSize(numstat);
  if (size.lines > max) out.push(size.lines + ' changed lines, more than ' + max + ' (build outputs and run records not counted). Split it into pull requests that each do one thing and land alone. Largest:\n  ' + size.counted.slice(0, 8).map((x) => x.n + '  ' + x.file).join('\n  '));
  if (prs) for (const p of overlapping(files, prs, self, SHARED_OK, now)) out.push('open PR #' + p.number + ' (' + String(p.title || '').slice(0, 70) + ') also changes ' + p.shared.join(', ') + '. It is the older pull request, and it is green or was pushed in the last 2 hours. Wait for it to land, then bring main in, or leave those files out.');
  return out;
}

function openPrs() {
  const r = spawnSync('gh', ['api', '--paginate', 'repos/{owner}/{repo}/pulls?state=open&per_page=100', '--jq', '.[] | {number, title, created_at, draft, labels: [.labels[].name], head: .head.ref, sha: .head.sha}'], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20, timeout: 120e3 });
  if (r.status !== 0) return null;
  const prs = String(r.stdout || '').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  for (const p of prs) {
    const f = spawnSync('gh', ['api', '--paginate', 'repos/{owner}/{repo}/pulls/' + p.number + '/files?per_page=100', '--jq', '.[].filename'], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20, timeout: 120e3 });
    p.files = f.status === 0 ? String(f.stdout || '').split('\n').filter(Boolean) : [];
    if (!p.sha) continue;
    const when = spawnSync('gh', ['api', 'repos/{owner}/{repo}/commits/' + p.sha, '--jq', '.commit.committer.date'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 20, timeout: 60e3 });
    if (when.status === 0) p.pushed_at = String(when.stdout || '').trim();
    const runs = spawnSync('gh', ['api', 'repos/{owner}/{repo}/commits/' + p.sha + '/check-runs?per_page=30', '--jq', '[.check_runs[] | {name,status,conclusion}]'], { cwd: root, encoding: 'utf8', maxBuffer: 8 << 20, timeout: 60e3 });
    if (runs.status !== 0) continue;
    let parsed = [];
    try { parsed = JSON.parse(runs.stdout || '[]'); } catch (_) { parsed = []; }
    const verse = parsed.filter((c) => c.name === 'Verse check');
    const use = (verse.length ? verse : parsed)[0];
    if (!use) p.check = 'none';
    else if (use.status && use.status !== 'completed') p.check = 'pending';
    else if (use.conclusion === 'success') p.check = 'green';
    else if (use.conclusion === 'failure' || use.conclusion === 'timed_out' || use.conclusion === 'startup_failure') p.check = 'red';
    else p.check = 'none';
  }
  return prs;
}

function main() {
  const args = process.argv.slice(2);
  const guard = spawnSync(process.execPath, [resolve(root, 'tools/guard-source.mjs')], { cwd: root, encoding: 'utf8', stdio: 'inherit' });
  if ((guard.status ?? 1) !== 0) { console.error('pre-pr: guard-source failed (scripts must parse and ledgers must not be wiped)'); process.exit(guard.status ?? 1); }
  const behind = behindCount();
  if (behind === null) { console.error('pre-pr: fetch origin main first (git fetch origin main)'); process.exit(2); }
  const files = branchFiles();
  const numstat = git(['diff', '--numstat', '--ignore-cr-at-eol', BASE + '...HEAD']); // a line-ending-only change (CRLF to LF) is not a changed line, so the cap never blocks a normalisation
  if (!files || numstat.status !== 0) { console.error('pre-pr: could not read the diff against ' + BASE); process.exit(2); }
  const prs = process.env.PRE_PR_OFFLINE === '1' ? null : openPrs();
  const branch = String(git(['rev-parse', '--abbrev-ref', 'HEAD']).stdout || '').trim();
  const head = process.env.PRE_PR_BRANCH || branch;
  const self = args.includes('--pr') ? Number(args[args.indexOf('--pr') + 1]) : (prs || []).find((p) => p.head === head)?.number ?? null;
  // A generated output may ride in a pull request only when it is exactly what its source writes now.
  // tools/refresh.mjs --check asks every non-volatile generator that same question in one run (the question
  // main's own refresh check asks); a stale or hand-edited copy still fails and is refused. The volatile
  // copies in DEPLOY_ONLY are refused even when a generator calls them current: they name the newest commit
  // or a time window and only the deploy can settle them.
  const touchedGenerated = generatedTouched(files);
  const fresh = [];
  if (touchedGenerated.length && !touchedGenerated.some((f) => DEPLOY_ONLY.includes(f))) {
    const r = spawnSync(process.execPath, [resolve(root, 'tools', 'refresh.mjs'), '--check'], { cwd: root, encoding: 'utf8' });
    const text = String(r.stdout || '') + String(r.stderr || '');
    if (r.status === 0 && !/FAIL|stale:/.test(text)) fresh.push(...touchedGenerated);
  }
  const del = git(['diff', '--name-only', '--diff-filter=D', BASE + '...HEAD']);
  const tree = git(['ls-tree', '-r', '--name-only', BASE]);
  const deleted = del.status === 0 ? String(del.stdout || '').split('\n').filter(Boolean).length : 0;
  const treeSize = tree.status === 0 ? String(tree.stdout || '').split('\n').filter(Boolean).length : 0;
  let indexNames = [];
  try {
    const src = (files || []).includes('void-live-deploy/skills/index.json')
      ? git(['show', 'HEAD:void-live-deploy/skills/index.json'])
      : git(['show', BASE + ':void-live-deploy/skills/index.json']);
    if (src.status === 0) indexNames = JSON.parse(src.stdout);
  } catch (_) {}
  const out = refusals({ behind, files, numstat: numstat.stdout, prs, self, fresh, deleted, treeSize, allowWipe: allowWipe(), indexNames });
  for (const hit of publicRivalHits()) out.push('a public page names or links its rival: ' + hit);
  if (out.length) { for (const o of out) console.error('pre-pr: ' + o); process.exit(1); }
  console.log('pre-pr: on top of main, ' + diffSize(numstat.stdout).lines + ' changed lines (at most ' + MAX_LINES + '), no build output, ' + (prs ? 'no live older open PR changes the same file' : 'open PRs not checked (gh could not list them)'));
  if (args.includes('--check-only')) return;
  const r = spawnSync(process.execPath, [resolve(root, 'tools/checks.mjs'), '--changed'], { cwd: root, encoding: 'utf8', stdio: 'inherit', env: { ...process.env, VOID_SKIP_BENCH: '1' } });
  process.exit(r.status ?? 1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

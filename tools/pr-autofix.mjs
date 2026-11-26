// A failed Merge gate or Verse review gets two fast tries before a Repair job is filed (2026-11-24).
// Tier 1 is mechanical and costs no model call: bring main in with the shared registry merge, regenerate
// the build outputs, and re-run the same local checks CI runs. Tier 2 is one short scoped coder lap over
// the failed log and the changed files. Nothing is pushed unless both local checks turn green. The attempt
// count lives in tools/fix-cap.mjs, so a red PR gets two autofix laps at most and then a queue job.
//   node tools/pr-autofix.mjs   (PR, BRANCH, WORKFLOW, REPO, RUN_ID, AUTOFIX_LOG come from pr-autofix.yml)
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAP } from './fix-cap.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Same-repo helper and loop branches only; forks and main never get a write-token autofix. Pure. */
export const allowedBranch = (branch) => /^(?:helper|loop)\//.test(String(branch || ''));

/** Failure lines from a GitHub Actions log, with long key-like runs masked before the log reaches a model. Pure. */
export function failureLines(log, { maxLines = 30, maxChars = 12000 } = {}) {
  const lines = String(log || '').split(/\r?\n/)
    .filter((line) => /FAIL|not ok|AssertionError|Error:|SyntaxError|ENOENT|ERR_MODULE_NOT_FOUND|::error|✖|×|fatal:/i.test(line))
    .map((line) => line.replace(/[A-Za-z0-9_-]{24,}/g, '[masked]').trim())
    .filter(Boolean)
    .slice(-maxLines);
  const out = lines.join('\n');
  return out.length > maxChars ? out.slice(-maxChars) : (out || '(the failed run printed no failure line)');
}

export const fileList = (out) => String(out || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean).slice(0, 60);

/** The coder's whole context: one PR, one failed check, its files and its failure lines. Pure. */
export function taskFor({ pr, workflow, files = [], failures = '' }) {
  return [
    'Fix the failing check on pull request #' + pr + ' in this repository.',
    'The failed check was ' + String(workflow || 'a pull request check').slice(0, 80) + '.',
    'Change only the source files that cause this failure. Do not edit .github/workflows, do not weaken a test, and do not hand-edit a generated skill registry.',
    'Changed files:',
    '  ' + (fileList(files).join('\n  ') || '(none listed)'),
    'Failure lines from the failed run:',
    String(failures || '').split('\n').slice(0, 30).join('\n'),
    'Make the smallest patch that fixes the named failure, then finish.',
  ].join('\n');
}

/** The fallback after both tiers: a distinct Repair job, not a duplicate of the review's own fix job. Pure. */
export function repairJob(pr, why) {
  const reason = String(why || 'the gate or review is still red').replace(/\s+/g, ' ').trim().slice(0, 200);
  return { ask: 'Repair pull request #' + pr + ': ' + reason, target: 'repair:pr-' + pr };
}

/** Only the last allowed attempt files the fallback. Pure. */
export const afterLastAttempt = (attempt) => Number(attempt) >= CAP;

function attempt(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: root, encoding: 'utf8', maxBuffer: 24 << 20, timeout: opts.timeout || 10 * 60e3,
    env: { ...process.env, ...(opts.env || {}) },
  });
  const out = String(r.stdout || '') + String(r.stderr || '');
  return { ok: r.status === 0 && !r.error, status: r.status, out: out.trim() };
}

function run(cmd, args, opts = {}) {
  const r = attempt(cmd, args, opts);
  if (!r.ok) throw new Error(r.out.slice(0, 2000) || cmd + ' failed');
  return r.out;
}

function settleMain(branch) {
  run('git', ['fetch', '-q', 'origin', 'main', branch]);
  run('git', ['checkout', '-q', '-B', branch, 'origin/' + branch]);
  const behind = Number(run('git', ['rev-list', '--count', 'HEAD..origin/main']) || 0);
  if (!behind) return { rewritten: false, note: 'main is already in this branch' };

  const rebase = attempt('git', ['rebase', 'origin/main']);
  if (rebase.ok) return { rewritten: true, note: 'rebased onto main' };
  const shared = attempt(process.execPath, ['tools/shared-merge.mjs', '--rebase']);
  if (shared.ok) return { rewritten: true, note: 'rebased onto main, shared registries settled' };
  attempt('git', ['rebase', '--abort']); // leave a clean tree for the scoped coder
  const merge = attempt('git', ['-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', 'merge', '--no-edit', 'origin/main']);
  if (merge.ok) return { rewritten: false, note: 'merged main into this branch' };
  attempt('git', ['merge', '--abort']); // a conflicted index is not a tree the coder can patch safely
  return { rewritten: false, note: 'could not bring main in: ' + merge.out.slice(-1200) };
}

function regenerate() {
  const log = [];
  for (const args of [['tools/skills-index.mjs', '--adopt'], ['tools/skills-index.mjs', '--write'], ['tools/refresh.mjs']]) {
    const r = attempt(process.execPath, args);
    log.push(args.join(' ') + ': ' + (r.ok ? 'ok' : 'red') + '\n' + r.out.slice(-1200));
  }
  return log.join('\n');
}

/** The two checks the pull request gates run locally. Both must be green before anything is pushed. */
function verify() {
  const checks = [
    ['merge-gate', ['tools/merge-gate.mjs'], { MERGE_GATE_BASE: 'origin/main' }],
    ['review-gate', ['tools/review-pr.mjs', '--base', 'origin/main', '--head', 'HEAD', '--gate'], {}],
  ];
  const out = [];
  let ok = true;
  for (const [name, args, env] of checks) {
    const r = attempt(process.execPath, args, { env });
    if (!r.ok) ok = false;
    out.push(name + ': ' + (r.ok ? 'green' : 'red') + '\n' + r.out.slice(-4000));
  }
  return { ok, log: out.join('\n') };
}

function ship(rewritten, pr, repo, branch) {
  if (!run('git', ['status', '--porcelain']).trim()) return { pushed: false, why: 'nothing to commit' };
  run('git', ['add', '-A']);
  run('git', ['-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', 'commit', '-q', '-m', 'Autofix the failing check on PR #' + pr]);
  run('git', rewritten
    ? ['push', '--force-with-lease', 'origin', 'HEAD:refs/heads/' + branch]
    : ['push', 'origin', 'HEAD:refs/heads/' + branch]);
  // A bot push starts no pull_request run, so the gate and review must be woken by hand.
  run('gh', ['workflow', 'run', 'automerge.yml', '--repo', repo, '--ref', 'main', '-f', 'pr=' + pr]);
  return { pushed: true, why: 'automerge woken' };
}

async function fallback(pr, why) {
  const job = repairJob(pr, why);
  console.log('fallback: ' + JSON.stringify(job));
  const token = process.env.VOID_OWNER_TOKEN || process.env.VOID_MISSES_TOKEN || '';
  if (!token) { console.log('Repair job not filed: no VOID_OWNER_TOKEN'); return; }
  const site = String(process.env.VOID_SITE || 'https://a-to-mind.com').replace(/\/+$/, '');
  try {
    const r = await fetch(site + '/api/queue', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: JSON.stringify(job),
      signal: AbortSignal.timeout(20000),
    });
    console.log('Repair job status ' + r.status);
  } catch (e) {
    console.log('Repair job: ' + (e && e.message ? e.message : String(e)).slice(0, 200));
  }
}

async function main() {
  const pr = String(process.env.PR || '').trim();
  const branch = String(process.env.BRANCH || '').trim();
  const repo = process.env.REPO || process.env.GITHUB_REPOSITORY || '';
  const workflow = String(process.env.WORKFLOW || 'a pull request check').slice(0, 80);
  const runId = String(process.env.RUN_ID || '').trim();
  if (!/^\d+$/.test(pr) || !allowedBranch(branch) || !repo) {
    console.error('usage: set PR, BRANCH (helper/* or loop/*) and REPO in pr-autofix.yml');
    return 2;
  }

  const cap = attempt(process.execPath, ['tools/fix-cap.mjs', 'claim', '--pr', pr, '--kind', 'autofix']);
  console.log(cap.out || 'fix cap: no answer');
  // The cap is claimed before a patch is attempted. Once it is spent, the Repair job from the last
  // red run is already open (the queue keeps one job per target), so this run stays quiet.
  if (!cap.ok) return 0;

  const settled = settleMain(branch);
  console.log(settled.note);
  const generated = regenerate();
  let checked = verify();
  let tier = 'tier 1';

  if (!checked.ok) {
    tier = 'tier 2';
    const failedLog = process.env.AUTOFIX_LOG && existsSync(process.env.AUTOFIX_LOG)
      ? readFileSync(process.env.AUTOFIX_LOG, 'utf8') : '';
    const files = attempt('git', ['diff', '--name-only', 'origin/main...HEAD']).out;
    const task = taskFor({ pr, workflow, files, failures: failureLines([failedLog, settled.note, generated, checked.log].join('\n')) });
    console.log('tier 2 context:\n' + task.slice(0, 3000));
    const coder = attempt(process.execPath, ['tools/verse-coder.mjs', '--max-turns', '8', '--repo', root, '--task', task], { timeout: 12 * 60e3 });
    console.log('coder: ' + (coder.ok ? 'finished' : 'red') + '\n' + coder.out.slice(-3000));
    checked = verify(); // verify-before-push: a coder that did not fix the check does not get to push
  }

  console.log(tier + ' checks: ' + (checked.ok ? 'green' : 'red'));
  if (checked.ok) {
    const result = ship(settled.rewritten, pr, repo, branch);
    console.log(result.pushed ? 'pushed ' + branch + '; ' + result.why : 'not pushed: ' + result.why);
    return 0;
  }
  console.log(checked.log.slice(-6000));
  // One Repair job, filed by the last allowed attempt — not one per red re-run.
  const n = Number((cap.out.match(/attempt (\d+)/) || [])[1] || 0);
  if (afterLastAttempt(n)) await fallback(pr, workflow + ' still red after two tiers (run ' + runId + ')');
  else console.log('no Repair job yet: autofix attempt ' + n + ' of ' + CAP);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(await main());

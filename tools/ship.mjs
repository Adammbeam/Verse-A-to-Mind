// Ship: every branch ahead of main, checked at once, merged when green, deployed once.
//
// Why this is faster than the thing it replaces. On GitHub a change waits for a runner to boot (~6-10s), for five separate
// workflows to queue, and for the concurrency group not to cancel it — and on 2026-11-24 none of that happened at all, because
// Actions was switched off account-wide. Here the checks are local processes: no queue, no boot, no concurrency group, nothing to
// cancel, and N branches are proven in parallel rather than one after another.
//
//   node tools/ship.mjs                 what is ahead of main, and what each would need
//   node tools/ship.mjs --check         run the checks for every branch, in parallel
//   node tools/ship.mjs --merge         merge the green ones, smallest first
//   node tools/ship.mjs --deploy        wrangler pages deploy (only after a green check)
//   node tools/ship.mjs --all           check, merge, deploy
//   node tools/ship.mjs --branch <b>    just this one
//
// Exit: 0 everything it was asked to do happened, 1 something was red, 2 it could not run.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { wipeRefusal, allowWipe } from './wipe-guard.mjs';

const run0 = promisify(execFile);
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(k);

/** How many branches at once. The machine is the limit, not a scheduler. */
export const LANES = 4;

async function git(args, opts = {}) {
  try { const { stdout } = await run0('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...opts }); return { ok: true, out: stdout }; }
  catch (e) { return { ok: false, out: String(e.stdout || '') + String(e.stderr || '') }; }
}

/** The branches ahead of the base, with how far ahead. Pure over `git for-each-ref`-shaped rows. */
export function rankForMerge(rows, base = 'main') {
  return (rows || [])
    .filter((r) => r && r.branch && r.branch !== base && r.ahead > 0)
    // smallest change first: it is the least likely to collide with the ones after it
    .sort((a, b) => a.ahead - b.ahead || String(a.branch).localeCompare(String(b.branch)));
}

/** What a pass did, in one line and one object. Pure. */
export function summarise(results) {
  const rows = results || [];
  const green = rows.filter((r) => r.ok);
  const red = rows.filter((r) => !r.ok);
  return {
    total: rows.length,
    green: green.length,
    red: red.length,
    merged: rows.filter((r) => r.merged).map((r) => r.branch),
    deployed: rows.some((r) => r.deployed),
    line: rows.length
      ? rows.length + ' branch' + (rows.length === 1 ? '' : 'es') + ': ' + green.length + ' green, ' + red.length + ' red'
        + (rows.some((r) => r.merged) ? ' · merged ' + rows.filter((r) => r.merged).map((r) => r.branch).join(', ') : '')
        + (rows.some((r) => r.deployed) ? ' · deployed' : '')
      : 'nothing ahead of the base',
  };
}

/** Run at most `lanes` at a time, keeping the order of the input in the output. Pure over the runner. */
export async function pool(items, lanes, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(lanes, items.length)) }, worker));
  return out;
}

async function ahead(base) {
  const fmt = '%(refname:short)';
  const names = await git(['for-each-ref', '--format=' + fmt, 'refs/heads']);
  if (!names.ok) return [];
  const rows = [];
  for (const branch of names.out.split('\n').map((s) => s.trim()).filter(Boolean)) {
    const c = await git(['rev-list', '--count', base + '..' + branch]);
    rows.push({ branch, ahead: c.ok ? Number(c.out.trim()) || 0 : 0 });
  }
  return rankForMerge(rows, base);
}

/** Prove one branch in its own throwaway worktree. Returns { ok, why, branch, ahead }. */
async function check(branch, root) {
  const dir = root + '/.ship/' + branch.replace(/[^a-zA-Z0-9]+/g, '-');
  await git(['worktree', 'remove', '--force', dir], { cwd: root });
  const add = await git(['worktree', 'add', '--detach', dir, branch], { cwd: root });
  if (!add.ok) return { branch, ok: false, why: 'could not open a worktree: ' + add.out.trim().split('\n')[0] };
  try {
    const del = await git(['diff', '--name-only', '--diff-filter=D', 'main...' + branch], { cwd: root });
    const tree = await git(['ls-tree', '-r', '--name-only', 'main'], { cwd: root });
    const wipe = wipeRefusal({ deleted: del.ok ? del.out.split('\n').filter(Boolean).length : 0, treeSize: tree.ok ? tree.out.split('\n').filter(Boolean).length : 0, allow: allowWipe() });
    if (wipe) return { branch, ok: false, why: wipe };
    const gates = [
      ['review', 'node', ['tools/review-pr.mjs', '--gate']],
      ['checks', 'node', ['tools/checks.mjs']],
    ];
    for (const [name, cmd, args] of gates) {
      const r = await run0(cmd, args, { cwd: dir, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).then((x) => ({ ok: true, out: x.stdout }), (e) => ({ ok: false, out: String(e.stdout || '') + String(e.stderr || '') }));
      if (!r.ok) return { branch, ok: false, why: name + ': ' + r.out.trim().split('\n').slice(-2).join(' ') };
    }
    return { branch, ok: true, why: 'review and checks passed' };
  } finally {
    await git(['worktree', 'remove', '--force', dir], { cwd: root });
  }
}

async function main() {
  const root = process.cwd();
  const base = arg('--base', 'main');
  const one = arg('--branch', '');
  let rows = await ahead(base);
  if (one) rows = rows.filter((r) => r.branch === one);
  if (!rows.length) { console.log('nothing ahead of ' + base); return 0; }

  console.log(rows.map((r) => r.branch + '  +' + r.ahead).join('\n'));
  if (!has('--check') && !has('--merge') && !has('--all')) { console.log('\n(dry: --check proves them, --merge lands them, --deploy ships)'); return 0; }

  const t0 = Date.now();
  const checked = await pool(rows, LANES, (r) => check(r.branch, root));
  const merged = rows.map((r, i) => ({ ...r, ...checked[i] }));
  for (const r of merged) console.log((r.ok ? '✓ ' : '✗ ') + r.branch + ': ' + r.why);
  console.log('checked in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's, ' + LANES + ' at a time');

  let bad = merged.some((r) => !r.ok) ? 1 : 0;
  if (has('--merge') || has('--all')) {
    for (const r of merged) {
      if (!r.ok) continue;
      const m = await git(['merge', '--no-ff', '-m', 'ship: ' + r.branch, r.branch], { cwd: root });
      r.merged = m.ok;
      if (!m.ok) { bad = 1; console.log('✗ merge ' + r.branch + ': ' + m.out.trim().split('\n')[0]); }
    }
  }
  if (has('--deploy') || has('--all')) {
    if (bad) console.log('not deploying: something above is red');
    else {
      const d = await run0('npx', ['wrangler', 'pages', 'deploy', 'void-live-deploy', '--project-name', 'a-to-mind'], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
        .then((x) => ({ ok: true, out: x.stdout }), (e) => ({ ok: false, out: String(e.stdout || '') + String(e.stderr || '') }));
      for (const r of merged) r.deployed = d.ok;
      console.log(d.ok ? 'deployed' : 'deploy failed: ' + d.out.trim().split('\n').slice(-3).join(' '));
      if (!d.ok) bad = 1;
    }
  }
  console.log(summarise(merged).line);
  return bad;
}

if (process.argv[1] && process.argv[1].endsWith('ship.mjs')) {
  main().then((c) => process.exit(c)).catch((e) => { console.error(String(e && e.message || e)); process.exit(2); });
}

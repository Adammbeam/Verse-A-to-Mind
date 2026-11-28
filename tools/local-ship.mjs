// The runner for proposals: take a patch that arrived at /api/proposals, prove it on this machine, then ship it.
//
//   node tools/local-ship.mjs                 what is waiting, and what each one would need (changes nothing)
//   node tools/local-ship.mjs --check         apply each patch in a throwaway worktree and run the gates, then report back
//   node tools/local-ship.mjs --ship          the same, and when a patch is green: merge it, deploy, report shipped
//   node tools/local-ship.mjs --id <id> --ship    one proposal only
//
// Why this exists rather than a GitHub Action: on 2026-11-24 the account was flagged, Actions returned 422, and a green patch had no
// way to be proven. This runs on a machine that has git and wrangler, which is the part the edge cannot do.
//
// Env: VOID_OWNER_TOKEN (the Pages secret the workflows already use), FORGE_URL (default https://a-to-mind.com/api/proposals).
// Exit: 0 nothing to do or everything green, 1 something failed a gate, 2 it could not run.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { wipeRefusal, deletedNames, allowWipe } from './wipe-guard.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(k);
const URL_ = process.env.FORGE_URL || 'https://a-to-mind.com/api/proposals';
const TOKEN = process.env.VOID_OWNER_TOKEN || '';

const sh = (cmd, args, opts = {}) => {
  // stdio keeps a pipe on stdin: a patch arrives through stdin (git apply -), so it must not be 'ignore'
  try { return { ok: true, out: execFileSync(cmd, args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts }) }; }
  catch (e) { return { ok: false, out: String(e.stdout || '') + String(e.stderr || '') }; }
};

async function api(path, init = {}) {
  if (!TOKEN) throw new Error('VOID_OWNER_TOKEN is not set');
  const r = await fetch(URL_ + path, { ...init, headers: { authorization: 'Bearer ' + TOKEN, 'content-type': 'application/json', ...(init.headers || {}) } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('proposals ' + r.status + ': ' + (body.error || 'no detail'));
  return body;
}

/**
 * Prove one patch on a throwaway worktree. Returns { ok, why, gates, sha }. Never merges into anything.
 *
 * The worktree is deleted afterwards, so the patch has to be captured as a commit before that happens: merging the branch it came
 * from would merge the branch as it already was, with none of the patch in it. `sha` is the only thing worth carrying out.
 */
export async function prove(p, { root = process.cwd(), run = sh } = {}) {
  let dir = mkdtempSync(join(tmpdir(), 'proposal-'));
  const gates = [];
  try {
    const add = run('git', ['worktree', 'add', '--detach', dir, p.branch], { cwd: root });
    if (!add.ok) {
      const seat = String(p.branch || '').startsWith('team/') || String(p.author || '').startsWith('team:');
      if (!seat) return { ok: false, why: 'no such branch here: ' + p.branch, gates };
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      let base = '';
      for (const ref of [p.base, 'origin/main', 'main', 'HEAD'].filter(Boolean)) {
        const a = run('git', ['worktree', 'add', '--detach', dir, ref], { cwd: root });
        if (a.ok) { base = ref; break; }
        rmSync(dir, { recursive: true, force: true });
        mkdirSync(dir, { recursive: true });
      }
      if (!base) return { ok: false, why: 'no base to apply this patch on: ' + p.branch, gates };
    }
    const apply = run('git', ['apply', '--index', '-'], { cwd: dir, input: p.diff });
    if (!apply.ok) return { ok: false, why: 'the patch does not apply: ' + apply.out.trim().split('\n')[0], gates };
    const del = run('git', ['diff', '--cached', '--name-only', '--diff-filter=D'], { cwd: dir });
    const tree = run('git', ['ls-tree', '-r', '--name-only', 'HEAD'], { cwd: dir });
    const wipe = wipeRefusal({ deleted: deletedNames(del.ok ? del.out : '').length, treeSize: tree.ok ? String(tree.out || '').split('\n').filter(Boolean).length : 0, allow: allowWipe() });
    if (wipe) return { ok: false, why: wipe, gates };
    for (const [name, cmd, args] of [
      ['review', 'node', ['tools/review-pr.mjs', '--gate']],
      ['merge-gate', 'node', ['tools/merge-gate.mjs']],
    ]) {
      const r = run(cmd, args, { cwd: dir });
      gates.push({ name, ok: r.ok, why: r.ok ? '' : r.out.trim().split('\n').slice(-3).join(' ') });
      if (!r.ok) return { ok: false, why: name + ': ' + gates[gates.length - 1].why, gates };
    }
    const commit = run('git', ['-c', 'user.email=runner@local', '-c', 'user.name=verse-runner', 'commit', '-m', 'proposal ' + p.id], { cwd: dir });
    if (!commit.ok) return { ok: false, why: 'green, but the patch would not commit: ' + commit.out.trim().split('\n')[0], gates };
    const sha = String(run('git', ['rev-parse', 'HEAD'], { cwd: dir }).out || '').trim();
    if (!sha) return { ok: false, why: 'green, but the commit has no sha to merge', gates };
    return { ok: true, why: 'both gates passed on ' + sha.slice(0, 7), gates, sha };
  } finally {
    // the worktree is throwaway either way: a red patch must not leave a directory behind
    run('git', ['worktree', 'remove', '--force', dir], { cwd: root });
  }
}

async function main() {
  const list = await api('?state=open');
  const wanted = arg('--id', '');
  const picks = (list.proposals || []).filter((p) => !wanted || p.id === wanted);
  if (!picks.length) { console.log('nothing waiting'); return 0; }
  let bad = 0;
  for (const p of picks) {
    console.log('#' + p.id + ' ' + p.title + ' → ' + p.branch + ' · ' + p.files + ' files, +' + p.added + ' −' + p.removed);
    if (!has('--check') && !has('--ship')) { console.log('  (dry: pass --check to prove it, --ship to land it)'); continue; }
    const full = (await api('?id=' + encodeURIComponent(p.id))).proposal;
    const r = await prove(full);
    console.log('  ' + (r.ok ? 'green' : 'red') + ': ' + r.why);
    if (!r.ok) { bad++; await api('', { method: 'PATCH', body: JSON.stringify({ id: p.id, action: 'refuse', verdict: r.why.slice(0, 400) }) }); continue; }
    if (!has('--ship')) { await api('', { method: 'PATCH', body: JSON.stringify({ id: p.id, action: 'check', verdict: 'gates passed on a throwaway worktree' }) }); continue; }
    // merge the commit that was proven, never the branch it arrived from: that branch never received the patch
    const merged = sh('git', ['merge', '--no-ff', '-m', 'proposal: ' + p.title + ' (#' + p.id + ')', r.sha]);
    if (!merged.ok) { bad++; console.log('  merge refused: ' + merged.out.trim().split('\n')[0]); continue; }
    const dep = sh('npx', ['wrangler', 'pages', 'deploy', 'void-live-deploy', '--project-name', 'a-to-mind']);
    const verdict = dep.ok ? 'merged and deployed' : 'merged, deploy failed: ' + dep.out.trim().split('\n').slice(-2).join(' ');
    console.log('  ' + verdict);
    await api('', { method: 'PATCH', body: JSON.stringify({ id: p.id, action: 'ship', verdict: verdict.slice(0, 400) }) });
  }
  return bad ? 1 : 0;
}

if (process.argv[1] && process.argv[1].endsWith('local-ship.mjs')) {
  main().then((c) => process.exit(c)).catch((e) => { console.error(String(e.message || e)); process.exit(2); });
}

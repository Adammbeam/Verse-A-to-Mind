// Verse's runner without GitHub (owner, 2026-11-26: "make it so that github is not needed to update the site directly").
// One pass, oldest change request first:
//   1. clone Verse's code store (a-to-mind.com/code/verse.git, tools/codestore.mjs) and merge the change request (refs/heads/cr/<name>) onto main
//   2. run the gates on the merge (the same as tools/local-ship.mjs: the wipe guard, tools/review-pr.mjs --gate, tools/merge-gate.mjs)
//   3. report the check to the store (POST /code/verse.git/checks); red stops here and the seat rebases or fixes
//   4. green: move the store's main to the merge (compare and swap: two landings never pass each other), then deploy that tree straight to
//      Cloudflare Pages (wrangler pages deploy, Direct Upload: it works for a Git-connected project too, docs: pages/get-started/direct-upload)
//   5. ask the live site's /api/health; not ok -> roll back to the last good deploy (Pages API .../deployments/<id>/rollback) and say so
//   6. mirror the store's main to GitHub when a mirror token is set (GitHub is a copy only)
// Usage: node tools/verse-runner.mjs [--check-only] [--cr cr/<name>]
//   --check-only  steps 1-3 only (any seat with a team key can run it; no main move, no deploy)
// Env (never printed): VOID_OWNER_TOKEN (moves main, reports), CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID (deploy, rollback),
//   GITHUB_MIRROR_TOKEN (Adammbeam's, optional), PAGES_PROJECT (default a-to-mind), HEALTH_URL (default https://a-to-mind.com/api/health).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as CS from './codestore.mjs';
import { wipeRefusal, deletedNames, allowWipe } from './wipe-guard.mjs';

export const PROJECT = () => process.env.PAGES_PROJECT || 'a-to-mind';
export const HEALTH = () => process.env.HEALTH_URL || 'https://a-to-mind.com/api/health';
export const GATES = [['review', 'node', ['tools/review-pr.mjs', '--gate']], ['merge-gate', 'node', ['tools/merge-gate.mjs']]];
const sh = (cmd, args, opts = {}) => { const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 26, ...opts }); return { ok: r.status === 0, out: String(r.stdout || '') + String(r.stderr || '') }; };
const tail = (s, n = 3) => String(s || '').trim().split('\n').slice(-n).join(' ').slice(0, 400);

/** the change request to run next: the oldest-named one with no check at its commit yet. status: the store's /status. Pure. */
export function nextChange(status, only = null) {
  const done = new Set((status.checks || []).filter((c) => c.state !== 'running').map((c) => c.ref + ' ' + c.sha));
  return (status.changes || []).filter((r) => !only || r.name === 'refs/heads/' + only).filter((r) => !done.has(r.name + ' ' + r.sha)).sort((a, b) => (a.name < b.name ? -1 : 1))[0] || null;
}
/** what to do after a deploy, from the health answer: 'keep' | 'rollback' | 'nothing to roll back to'. Pure. */
export function afterDeploy(health, good) { if (health && health.ok) return 'keep'; return good ? 'rollback' : 'nothing to roll back to'; }

/** merge a change request onto main in `dir` and run the gates. -> { ok, why, sha, gates } */
export function check(dir, cr, { run = sh } = {}) {
  const gates = [], g = (args) => run('git', ['-c', 'user.email=runner@verse', '-c', 'user.name=verse-runner', ...args], { cwd: dir });
  const co = g(['checkout', '-q', '-B', 'land', 'origin/main']); if (!co.ok) return { ok: false, why: 'no main in the store: ' + tail(co.out, 1), gates };
  const m = g(['merge', '--no-ff', '-q', '-m', 'change request ' + cr.name.replace('refs/heads/', '') + ' (' + cr.sha.slice(0, 9) + ')', cr.sha]);
  if (!m.ok) { g(['merge', '--abort']); return { ok: false, why: 'it does not merge onto main: rebase it on the newest main and push again', gates }; }
  const del = g(['diff', '--name-only', '--diff-filter=D', 'origin/main', 'HEAD']), tree = g(['ls-tree', '-r', '--name-only', 'HEAD']);
  const wipe = wipeRefusal({ deleted: deletedNames(del.ok ? del.out : '').length, treeSize: tree.ok ? tree.out.split('\n').filter(Boolean).length : 0, allow: allowWipe() });
  if (wipe) return { ok: false, why: wipe, gates };
  for (const [name, cmd, args] of GATES) {
    const r = run(cmd, args, { cwd: dir }); gates.push({ name, ok: r.ok, why: r.ok ? '' : tail(r.out) });
    if (!r.ok) return { ok: false, why: name + ': ' + gates[gates.length - 1].why, gates };
  }
  const sha = g(['rev-parse', 'HEAD']); return { ok: true, why: 'green', sha: sha.out.trim(), gates };
}

const cf = async (path, { method = 'GET', f = fetch } = {}) => {
  const r = await f('https://api.cloudflare.com/client/v4/accounts/' + process.env.CLOUDFLARE_ACCOUNT_ID + '/pages/projects/' + PROJECT() + path, { method, headers: { authorization: 'Bearer ' + process.env.CLOUDFLARE_API_TOKEN } });
  const j = await r.json().catch(() => ({})); if (!r.ok || j.success === false) throw new Error('Cloudflare ' + method + ' ' + path + ': ' + r.status + ' ' + ((j.errors && j.errors[0] && j.errors[0].message) || '')); return j.result;
};
/** deploy `dir`/void-live-deploy to Pages production, then the newest deployment's id and url */
export async function deploy(dir, sha, { run = sh, f = fetch } = {}) {
  const d = run('npx', ['--yes', 'wrangler', 'pages', 'deploy', 'void-live-deploy', '--project-name', PROJECT(), '--branch', 'main', '--commit-hash', sha, '--commit-message', 'verse-runner ' + sha.slice(0, 9)], { cwd: dir, env: process.env });
  if (!d.ok) return { ok: false, why: 'wrangler pages deploy failed: ' + tail(d.out) };
  const list = await cf('/deployments?env=production&per_page=1', { f }), top = (list || [])[0];
  return top ? { ok: true, deployment: top.id, url: top.url } : { ok: false, why: 'deployed, but the deployment list was empty' };
}
export const rollback = (id, f = fetch) => cf('/deployments/' + id + '/rollback', { method: 'POST', f });
export async function healthOf(f = fetch, url = HEALTH(), waitMs = 5000) {
  for (let i = 0; i < 3; i++) { // a fresh deploy can take a few seconds to reach every edge
    try { const r = await f(url + '?runner=' + Date.now(), { signal: AbortSignal.timeout(10000) }); const j = await r.json(); if (r.ok && j.ok) return j; } catch (_) {}
    if (i < 2) await new Promise((res) => setTimeout(res, waitMs * (i + 1)));
  }
  return { ok: false };
}
const report = async (key, what, body, f = fetch) => { const r = await f(CS.URL_() + '/' + what, { method: 'POST', headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' }, body: JSON.stringify(body) }); if (!r.ok) throw new Error('reporting ' + what + ': ' + r.status); };

export async function runOnce({ checkOnly = false, only = null, key = CS.keyOf(), f = fetch, run = sh, say = console.log, waitMs = 5000 } = {}) {
  const st = await CS.status(key, f), cr = nextChange(st, only);
  if (!cr) { say('No change request waits for a check.'); return { ok: true, idle: true }; }
  const dir = mkdtempSync(join(tmpdir(), 'verse-runner-'));
  try {
    await CS.clone(key, join(dir, 'r'));
    const r = join(dir, 'r'), c = check(r, cr, { run });
    say((c.ok ? 'green: ' : 'red: ') + cr.name + ' ' + cr.sha.slice(0, 9) + (c.ok ? '' : ' (' + c.why + ')'));
    if (checkOnly) return { ok: c.ok, check: c };
    await report(key, 'checks', { ref: cr.name, sha: cr.sha, state: c.ok ? 'green' : 'red', summary: c.why }, f);
    if (!c.ok) return { ok: false, check: c };
    const moved = await CS.push({ key, ref: c.sha, to: 'main', cwd: r, f }); // compare and swap: a main that moved meanwhile refuses, the next pass re-checks
    say('main is ' + moved.sha.slice(0, 9));
    if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) { say('Not deployed: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are not set on this runner.'); return { ok: true, landed: c.sha, deployed: false }; }
    const good = (await CS.status(key, f)).deploys || [], last = good.find((d) => d.state === 'live') || null; // newest first
    const d = await deploy(r, c.sha, { run, f });
    if (!d.ok) { say(d.why); return { ok: false, landed: c.sha, deployed: false, why: d.why }; }
    const health = await healthOf(f, HEALTH(), waitMs), next = afterDeploy(health, last);
    if (next === 'rollback') { await rollback(last.deployment, f); await report(key, 'deploys', { sha: c.sha, deployment: d.deployment, state: 'rolled back', url: d.url }, f); say('Health failed: rolled back to ' + last.deployment); return { ok: false, landed: c.sha, rolledBack: last.deployment }; }
    await report(key, 'deploys', { sha: c.sha, deployment: d.deployment, state: next === 'keep' ? 'live' : 'failed', url: d.url }, f);
    say(next === 'keep' ? 'live: ' + d.url : 'Health failed and there is no earlier good deploy to go back to');
    if (process.env.GITHUB_MIRROR_TOKEN) { const p = run('git', ['push', '-q', 'https://github.com/Adammbeam/Verse-A-to-Mind.git', c.sha + ':refs/heads/main'], { cwd: r, env: { ...process.env, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'http.extraHeader', GIT_CONFIG_VALUE_0: 'Authorization: Basic ' + Buffer.from('x-access-token:' + process.env.GITHUB_MIRROR_TOKEN).toString('base64'), GIT_TERMINAL_PROMPT: '0' } }); say(p.ok ? 'GitHub main mirrored' : 'GitHub mirror refused (fast-forward only): ' + tail(p.out, 1)); }
    return { ok: next === 'keep', landed: c.sha, deployment: d.deployment };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = process.argv.slice(2), i = a.indexOf('--cr');
  runOnce({ checkOnly: a.includes('--check-only'), only: i >= 0 ? a[i + 1] : null }).then((r) => process.exit(r.ok ? 0 : 1), (e) => { console.error(e.message); process.exit(1); });
}

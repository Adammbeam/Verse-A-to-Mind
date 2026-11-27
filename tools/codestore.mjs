// Verse's code store from a machine with git (lib/codestore.js, functions/code/[[path]].js). The store is a git remote over plain HTTP.
//   node tools/codestore.mjs status                 what the store holds and whether it has GitHub's main
//   node tools/codestore.mjs push [--ref main]      store the commits main has that the store has not: one pack, then main moves
//   node tools/codestore.mjs push --ref HEAD --to cr/<name>   your work as a change request: the runner checks it and lands it
//   node tools/codestore.mjs clone <dir>            a full clone from the store (git checks every object's hash)
//   node tools/codestore.mjs to-github              the store's main onto GitHub main, fast-forward only (the two-way mirror)
// Key: VERSE_KEY, or the team key file ~/.verse-team-key (an agent's key), or VOID_OWNER_TOKEN. It is sent in a header, never printed.
// CODE_URL overrides https://a-to-mind.com/code/verse.git (the tests point it at a local server).
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, readdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const URL_ = () => process.env.CODE_URL || 'https://a-to-mind.com/code/verse.git';
export function keyOf(env = process.env) {
  if (env.VERSE_KEY) return env.VERSE_KEY.trim();
  const f = join(env.HOME || homedir(), '.verse-team-key');
  if (existsSync(f)) return readFileSync(f, 'utf8').trim();
  return (env.VOID_OWNER_TOKEN || '').trim();
}
const git = (args, opts = {}) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 26, ...opts }).trim();
const auth = (key) => ({ authorization: 'Bearer ' + key });
// the key reaches git through its environment, never its command line (a command line shows in any process list)
export const gitEnv = (key) => ({ ...process.env, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'http.extraHeader', GIT_CONFIG_VALUE_0: 'Authorization: Bearer ' + key, GIT_TERMINAL_PROMPT: '0' });

export async function status(key, f = fetch) {
  const r = await f(URL_() + '/status', { headers: auth(key) });
  if (!r.ok) throw new Error('the store answered ' + r.status + (r.status === 404 ? ' (not set up, or this key is not a member\'s)' : ''));
  return r.json();
}
/** pack what `ref` has beyond the store's main, upload it, move main. -> { ok, sha, packs, already? } */
// to: 'main', or a change request 'cr/<name>' (a seat's own work; the runner checks it and lands it). The pack carries what `ref` has
// beyond the store's main and the change request's last push, so it stands on what the store already holds.
export async function push({ key, ref = 'main', to = 'main', cwd = process.cwd(), f = fetch } = {}) {
  if (to !== 'main' && !/^cr\/[\w.-]{1,40}(?:\/[\w.-]{1,40})?$/.test(to)) throw new Error('--to is main or cr/<name>');
  const sha = git(['rev-parse', ref + '^{commit}'], { cwd }), st = await status(key, f), main = st.main;
  const cur = to === 'main' ? main : ((st.refs || []).find((r) => r.name === 'refs/heads/' + to) || {}).sha || null, have = cur;
  if (have === sha) return { ok: true, sha, already: true };
  if (to === 'main' && have) { try { git(['merge-base', '--is-ancestor', have, sha], { cwd }); } catch (_) { throw new Error('the store\'s main ' + have + ' is not in ' + ref + ': fetch it first (clone from the store)'); } }
  const known = (x) => { try { git(['cat-file', '-e', x + '^{commit}'], { cwd }); return true; } catch (_) { return false; } };
  const bases = [...new Set([main, cur].filter((x) => x && known(x)))];
  const dir = mkdtempSync(join(tmpdir(), 'codestore-'));
  try {
    // a whole pack (no thin deltas), so every pack the store lists stands on its own for a dumb-HTTP clone
    git(['pack-objects', '--revs', '--max-pack-size=90m', join(dir, 'pack')], { cwd, input: sha + '\n' + bases.map((b) => '^' + b + '\n').join('') });
    const names = [...new Set(readdirSync(dir).filter((n) => /^pack-[0-9a-f]{40}\.pack$/.test(n)).map((n) => n.slice(0, -5)))];
    for (const n of names) for (const ext of ['.pack', '.idx']) {
      const body = readFileSync(join(dir, n + ext));
      const r = await f(URL_() + '/objects/pack/' + n + ext, { method: 'PUT', headers: { ...auth(key), 'content-length': String(body.length) }, body });
      if (!r.ok) throw new Error('storing ' + n + ext + ': ' + r.status + ' ' + (await r.text()).slice(0, 200));
    }
    const r = await f(URL_() + '/refs', { method: 'POST', headers: { ...auth(key), 'content-type': 'application/json' }, body: JSON.stringify({ ref: 'refs/heads/' + to, old: have || '0'.repeat(40), new: sha, packs: names }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('moving ' + to + ': ' + r.status + ' ' + (j.say || ''));
    return { ok: true, sha, packs: names };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
// git over the network runs without blocking, so a store served from this same process (the tests) can answer it
export async function clone(key, dir) { await promisify(execFile)('git', ['clone', '--quiet', URL_(), dir], { env: gitEnv(key) }); return git(['rev-parse', 'HEAD'], { cwd: dir }); }

async function main(argv) {
  const [cmd, a1] = argv, key = keyOf();
  if (!key) { console.error('No key: set VERSE_KEY or put your team key in ~/.verse-team-key'); return 2; }
  if (cmd === 'status') { const s = await status(key); console.log('store main ' + (s.main || 'empty') + ' · GitHub main ' + (s.github || 'unreadable') + ' · ' + s.sync + ' · ' + s.packs + ' packs, ' + Math.round(s.bytes / 1e6) + ' MB'); return 0; }
  if (cmd === 'push') { const i = argv.indexOf('--ref'), t = argv.indexOf('--to'); const r = await push({ key, ref: i > 0 ? argv[i + 1] : 'main', to: t > 0 ? argv[t + 1] : 'main' }); console.log(r.already ? 'the store has ' + r.sha + ' already' : 'stored ' + r.sha + ' in ' + r.packs.length + ' pack(s)'); return 0; }
  if (cmd === 'clone') { if (!a1) { console.error('Usage: node tools/codestore.mjs clone <dir>'); return 2; } console.log('cloned ' + await clone(key, a1) + ' into ' + a1); return 0; }
  if (cmd === 'to-github') {
    const dir = mkdtempSync(join(tmpdir(), 'codestore-gh-'));
    try { const sha = await clone(key, join(dir, 'r')); git(['push', 'https://github.com/Adammbeam/Verse-A-to-Mind.git', sha + ':refs/heads/main'], { cwd: join(dir, 'r'), stdio: 'inherit' }); console.log('GitHub main is ' + sha); return 0; }
    finally { rmSync(dir, { recursive: true, force: true }); }
  }
  console.log('Usage: node tools/codestore.mjs status | push [--ref main] [--to cr/<name>] | clone <dir> | to-github'); return 2;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error(e.message); process.exit(1); });

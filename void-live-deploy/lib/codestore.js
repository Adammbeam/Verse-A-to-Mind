// Verse's own code store (owner, 2026-11-26: "Verse taking on GitHub's abilities"). The repository lives in Cloudflare R2 (bucket
// verse-code, binding CODE) and git itself can clone, fetch and pull it over plain HTTP from a-to-mind.com/code/verse.git: git's "dumb"
// HTTP protocol, which needs only files (info/refs, HEAD, objects/info/packs, the packs and their indexes). Every object git reads is
// checked against its hash, so a stored pack cannot pass for different code. A push is a pack plus a ref update that only moves from
// the ref's value now (compare and swap in D1), so two pushes never lose each other's work. tools/codestore.mjs pushes and clones.
// Pure helpers here; functions/code/[[path]].js is the route, lib/codestore-tick.js the clock's mirror job, /tower.code/ the page.
export const REPO = 'verse.git';
export const BRANCH = 'refs/heads/main';
export const GITHUB = 'Adammbeam/Verse-A-to-Mind';
export const GITHUB_REFS = 'https://github.com/' + GITHUB + '.git/info/refs?service=git-upload-pack';
export const PACK_MAX = 95 * 1024 * 1024; // under the 100 MB request body limit; a bigger push is split into packs by --max-pack-size
export const JOB_TARGET = 'auto:codestore';
export const JOB_ASK = 'Mirror GitHub main into Verse\'s code store: node tools/codestore.mjs push (your team key from ~/.verse-team-key or VERSE_KEY; it never prints it). Hand in with done, ok and a note with the tip it stored.';
export const ZERO = '0'.repeat(40);
export const TABLES = [
  'CREATE TABLE IF NOT EXISTS void_code_refs (name TEXT PRIMARY KEY, sha TEXT NOT NULL, at INTEGER NOT NULL, by TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS void_code_packs (name TEXT PRIMARY KEY, at INTEGER NOT NULL, by TEXT NOT NULL, bytes INTEGER NOT NULL, tip TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS void_code_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, by TEXT NOT NULL, what TEXT NOT NULL, bytes INTEGER NOT NULL DEFAULT 0)',
  // the checks the runner (tools/verse-runner.mjs) ran on a change request's commit, and every deploy it made, newest last
  'CREATE TABLE IF NOT EXISTS void_code_checks (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, ref TEXT NOT NULL, sha TEXT NOT NULL, state TEXT NOT NULL, summary TEXT NOT NULL, by TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS void_code_deploys (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, sha TEXT NOT NULL, deployment TEXT NOT NULL, state TEXT NOT NULL, url TEXT NOT NULL, by TEXT NOT NULL)',
];
// Change requests (GitHub's pull requests, without GitHub): a seat pushes its work to refs/heads/cr/<name>; the runner checks the merge of
// it onto main, and on green moves main, deploys and records both here. Only the owner's key (the runner's) moves main past GitHub.
export const CR = /^refs\/heads\/cr\/[\w.-]{1,40}(?:\/[\w.-]{1,40})?$/;
export const isCr = (ref) => CR.test(String(ref || ''));
export const CHECK_STATES = ['green', 'red', 'running'], DEPLOY_STATES = ['live', 'failed', 'rolled back'];
/** a check report -> { ok, ref, sha, state, summary } or { ok: false, say }. Pure. */
export function checkOf(b) {
  const ref = String((b && b.ref) || ''), sha = String((b && b.sha) || ''), state = String((b && b.state) || ''), summary = String((b && b.summary) || '').slice(0, 500);
  if (!/^refs\/heads\/[\w./-]{1,90}$/.test(ref) || !validSha(sha) || !CHECK_STATES.includes(state)) return { ok: false, say: 'ref, a 40-hex sha and state (green, red or running)' };
  return { ok: true, ref, sha, state, summary };
}
/** a deploy report -> { ok, sha, deployment, state, url } or { ok: false, say }. Pure. */
export function deployOf(b) {
  const sha = String((b && b.sha) || ''), deployment = String((b && b.deployment) || ''), state = String((b && b.state) || ''), url = String((b && b.url) || '');
  if (!validSha(sha) || !/^[\w-]{6,64}$/.test(deployment) || !DEPLOY_STATES.includes(state) || (url && !/^https:\/\/[\w.-]+\.pages\.dev\/?$|^https:\/\/a-to-mind\.com\/?$/.test(url))) return { ok: false, say: 'sha, deployment id, state (live, failed or rolled back) and an https pages.dev url' };
  return { ok: true, sha, deployment, state, url };
}
const SHA = /^[0-9a-f]{40}$/;
export const validSha = (s) => SHA.test(String(s || ''));
const PACK_FILE = /^pack-([0-9a-f]{40})\.(pack|idx)$/;
/** a pack file name -> { name: 'pack-<sha>', kind: 'pack'|'idx' } or null. Pure. */
export function packFile(file) { const m = PACK_FILE.exec(String(file || '')); return m ? { name: 'pack-' + m[1], kind: m[2] } : null; }
export const keyOf = (file) => REPO + '/objects/pack/' + file;
export const SHARED_PREFIX = 'verse-code/';
/** where the packs live: the CODE bucket when it is bound, else the FILMS bucket under verse-code/ (no new bucket needed to start) */
export function bucketOf(env) {
  if (env && env.CODE) return env.CODE;
  const b = env && env.FILMS; if (!b) return null;
  return { get: (k) => b.get(SHARED_PREFIX + k), head: (k) => b.head(SHARED_PREFIX + k), put: (k, v) => b.put(SHARED_PREFIX + k, v) };
}
/** the first bytes of a real pack ("PACK", version 2 or 3) or a real index (\377tOc, version 2). Pure. */
export function headOk(kind, bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (b.length < 8) return false;
  if (kind === 'pack') return b[0] === 0x50 && b[1] === 0x41 && b[2] === 0x43 && b[3] === 0x4b && b[4] === 0 && b[5] === 0 && b[6] === 0 && (b[7] === 2 || b[7] === 3);
  return b[0] === 0xff && b[1] === 0x74 && b[2] === 0x4f && b[3] === 0x63 && b[4] === 0 && b[5] === 0 && b[6] === 0 && b[7] === 2;
}
/** the files git's dumb protocol reads. Pure. */
export const infoRefs = (refs) => refs.filter((r) => validSha(r.sha)).sort((a, b) => (a.name < b.name ? -1 : 1)).map((r) => r.sha + '\t' + r.name + '\n').join('');
export const infoPacks = (packs) => packs.map((p) => 'P ' + p.name + '.pack\n').join('') + '\n';
export const headFile = () => 'ref: ' + BRANCH + '\n';
/** main's commit in a git smart-HTTP ref advertisement (GitHub's /info/refs). Pure. */
export function mainOf(text) { const m = /([0-9a-f]{40}) refs\/heads\/main(?:\0|\n|$)/.exec(String(text || '')); return m ? m[1] : null; }
/** a ref update body -> { ok, ref, old, sha, packs } or { ok: false, say }. Pure. */
export function refUpdate(b) {
  const ref = String((b && b.ref) || BRANCH), old = String((b && b.old) || ZERO), sha = String((b && b.new) || ''), packs = Array.isArray(b && b.packs) ? b.packs.map(String) : [];
  if (!/^refs\/heads\/[\w.-]{1,60}$/.test(ref) && !isCr(ref)) return { ok: false, say: 'ref is refs/heads/<name> or refs/heads/cr/<name>' };
  if (!validSha(old) || !validSha(sha) || sha === ZERO) return { ok: false, say: 'old and new are 40-hex commit ids' };
  if (packs.length > 20 || !packs.every((p) => /^pack-[0-9a-f]{40}$/.test(p))) return { ok: false, say: 'packs: the pack-<sha> names this push uploaded (at most 20)' };
  return { ok: true, ref, old, sha, packs };
}
/** the store against GitHub's main: 'empty' | 'same' | 'behind' | 'unknown'. Pure. */
export function syncOf(storeMain, githubMain) { if (!githubMain) return 'unknown'; if (!storeMain) return 'empty'; return storeMain === githubMain ? 'same' : 'behind'; }

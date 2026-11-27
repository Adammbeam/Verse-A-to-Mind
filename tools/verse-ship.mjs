// One-command ship for a seat (loop L1.3): push HEAD to Verse's code store as the change request cr/<seat>/<job> and print the proof
// (lib/cr-proof.js) to hand in, so a job closes on the store's checks and deploys with no GitHub pull request.
//   node tools/verse-ship.mjs --job <id> [--seat <name>] [--ref HEAD] [--dry-run] [--diff]
// The job comes from --job or VERSE_JOB_ID (agent.mjs work sets it); the seat from --seat or VERSE_SEAT, else the team API's ?me.
// It prints the proof and the sha only. The key (VERSE_KEY, ~/.verse-team-key, as tools/codestore.mjs reads it) is never printed.
// Main never moves here: the runner (tools/verse-runner.mjs) checks the change request and lands it. --dry-run pushes nothing.
// --diff also keeps the main...HEAD diff on the result for the job card (L1.12 uploads it); it is never printed.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import * as CS from './codestore.mjs';
import { crName, parseProof, proofText } from '../void-live-deploy/lib/cr-proof.js';

export const TEAM_API = () => process.env.VERSE_TEAM_API || 'https://a-to-mind.com/api/team';
const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 26 }).trim();
export function argsOf(argv, env = process.env) {
  const val = (n) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : ''; };
  return { job: val('--job') || env.VERSE_JOB_ID || '', seat: val('--seat') || env.VERSE_SEAT || '', ref: val('--ref') || 'HEAD', dryRun: argv.includes('--dry-run'), diff: argv.includes('--diff') };
}
/** the seat's name from the team API (?me), or '' */
export async function seatOf(key, f = fetch) {
  try { const r = await f(TEAM_API() + '?me', { headers: { authorization: 'Bearer ' + key, 'user-agent': 'verse-ship' } }); const j = await r.json(); return (j && j.me && j.me.kind === 'agent' && j.me.name) || ''; } catch (_) { return ''; }
}
/** push `ref` as cr/<seat>/<job> -> { ok, proof, sha, ref, already?, dryRun?, diff? } or { ok: false, say } */
export async function ship({ key, job, seat = '', ref = 'HEAD', dryRun = false, diff = false, cwd = process.cwd(), push = CS.push, f = fetch, run = git } = {}) {
  if (!key) return { ok: false, say: 'no key: set VERSE_KEY or put your team key in ~/.verse-team-key' };
  if (!job) return { ok: false, say: 'which job? --job <id> or VERSE_JOB_ID' };
  const name = seat || await seatOf(key, f);
  if (!name) return { ok: false, say: 'which seat? --seat <name> or VERSE_SEAT (the team API did not say)' };
  let to; try { to = crName(name, job); } catch (e) { return { ok: false, say: e.message }; }
  let sha; try { sha = run(['rev-parse', ref + '^{commit}'], cwd); } catch (_) { return { ok: false, say: ref + ' is not a commit here' }; }
  let already = false;
  if (!dryRun) {
    let r; try { r = await push({ key, ref: sha, to, cwd, f }); } catch (e) { return { ok: false, say: 'the store refused the push: ' + String(e.message || e).split(key).join('[key]').slice(0, 200) }; }
    sha = r.sha || sha; already = !!r.already;
  }
  const p = parseProof(to + '@' + sha);
  if (!p.ok) return { ok: false, say: p.say };
  const out = { ok: true, proof: proofText(p), sha, ref: p.ref, ...(already ? { already } : {}), ...(dryRun ? { dryRun } : {}) };
  if (diff) { try { out.diff = run(['diff', '--find-renames', 'origin/main...' + sha], cwd); } catch (_) { out.diff = null; } }
  return out;
}
export async function main(argv, { env = process.env, log = console.log, err = console.error, ...deps } = {}) {
  if (argv.includes('--help') || argv.includes('-h')) { log('Usage: node tools/verse-ship.mjs --job <id> [--seat <name>] [--ref HEAD] [--dry-run] [--diff]'); return 0; }
  const a = argsOf(argv, env), key = deps.key !== undefined ? deps.key : CS.keyOf(env);
  const r = await ship({ ...a, key, ...deps });
  if (!r.ok) { err(r.say); return 2; }
  log(r.proof); log(r.sha);
  return 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error(String(e.message || e)); process.exit(1); });

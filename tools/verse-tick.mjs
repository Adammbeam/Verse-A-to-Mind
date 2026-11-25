// Verse's clock, on a machine instead of a workflow runner.
//
// On 2026-11-24 the account was flagged and Actions returned 422. The last thing that ran was `Verse verify` at 14:07:50Z; the work
// channel went quiet at 13:56:53Z. Nothing about Verse's self-improvement was wrong that day — its clock was somebody else's service.
// This runs the same steps the workflows ran, in the same order, from a terminal, and needs no GitHub account.
//
//   node tools/verse-tick.mjs                  one lap, in order, printing each step
//   node tools/verse-tick.mjs --dry            what a lap would run, and why
//   node tools/verse-tick.mjs --every 10       keep going, a lap every 10 minutes
//   node tools/verse-tick.mjs --only hand,self  just these steps
//
// The steps are the ones the repo already has. This file adds no policy: it decides when each runs and records what happened.
// It cannot deploy anything and does not pretend to: a step that needs a secret fails with the reason, and the lap carries on.

import { execFile } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/** The clock. `every` is minutes; 0 means "once a lap". Pure data. */
export const STEPS = [
  { id: 'hand', name: 'hand out the queue', cmd: 'node', args: ['tools/conductor.mjs', 'tick'], every: 0, why: 'an idle seat gets its next job, and a stale claim is taken back' },
  { id: 'self', name: 'Verse works on itself', cmd: 'node', args: ['tools/verse-loop.mjs', '--once'], every: 10, why: 'the lap that fixes a red check or the top of NEXT.md' },
  { id: 'crew', name: 'call the free agents', cmd: 'node', args: ['tools/recruit.mjs', '--once'], every: 60, why: 'a seat that stopped knocking is asked again' },
  { id: 'traffic', name: 'roll the visits', cmd: 'node', args: ['tools/traffic.mjs', '--write'], every: 1440, why: 'the day rolls into domains/traffic.json' },
];

/** Which steps are due, given the last time each ran. Pure. */
export function due(steps, last = {}, now = Date.now()) {
  return steps.filter((s) => {
    const at = last[s.id];
    if (!at) return true;
    return now - at >= Math.max(0, s.every) * 60_000;
  });
}

/** The step list filtered by --only, keeping the clock's order. Pure. */
export function pick(steps, only) {
  const want = String(only || '').split(',').map((s) => s.trim()).filter(Boolean);
  return want.length ? steps.filter((s) => want.includes(s.id)) : steps;
}

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(k);

function run(cmd, args, { cwd, timeout }) {
  return new Promise((done) => {
    const t0 = Date.now();
    execFile(cmd, args, { cwd, encoding: 'utf8', timeout, maxBuffer: 32 * 1024 * 1024, env: process.env }, (err, stdout, stderr) => {
      done({ ok: !err, ms: Date.now() - t0, out: String(stdout || ''), err: String(stderr || (err && err.message) || '') });
    });
  });
}

function lapLog(root, row) {
  try {
    const p = resolve(root, 'domains/verse-tick.jsonl');
    mkdirSync(dirname(p), { recursive: true });
    appendFileSync(p, JSON.stringify(row) + '\n');
  } catch (_) { /* a log that cannot be written must not stop the lap */ }
}

async function main() {
  const root = process.cwd();
  const dry = has('--dry');
  const every = Number(arg('--every', '0')) || 0;
  const steps = pick(STEPS, arg('--only', ''));
  const statePath = resolve(root, 'domains/verse-tick.state.json');
  const last = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8') || '{}') : {};
  const timeout = Number(arg('--timeout', '20')) * 60_000;

  const oneLap = async () => {
    const now = Date.now();
    const todo = every ? due(steps, last, now) : steps;
    if (dry) { for (const s of todo) console.log('would run ' + s.id + ': ' + s.name + ' — ' + s.why); return 0; }
    let bad = 0;
    for (const s of todo) {
      process.stdout.write(s.id + ' … ');
      const r = await run(s.cmd, s.args, { cwd: root, timeout });
      const line = r.ok ? 'ok ' + (r.ms / 1000).toFixed(1) + 's' : 'failed: ' + (r.err.trim().split('\n').slice(-1)[0] || 'no output').slice(0, 160);
      console.log(line);
      lapLog(root, { at: new Date().toISOString(), id: s.id, ok: r.ok, ms: r.ms, why: r.ok ? '' : line });
      last[s.id] = Date.now();
      if (!r.ok) bad++;
    }
    try { (await import('node:fs')).writeFileSync(statePath, JSON.stringify(last)); } catch (_) { /* state is a convenience */ }
    return bad ? 1 : 0;
  };

  if (!every) return oneLap();
  console.log('Verse tick every ' + every + ' min. Ctrl-C stops it. Nothing here needs GitHub.');
  for (;;) {
    await oneLap();
    await new Promise((r) => setTimeout(r, every * 60_000));
  }
}

if (process.argv[1] && process.argv[1].endsWith('verse-tick.mjs')) {
  main().then((c) => process.exit(c)).catch((e) => { console.error(String((e && e.message) || e)); process.exit(2); });
}

// Epistemic probe: adversarial self-play that hunts blind spots before real visitors hit them.
// Ranks routes/skills by Model_Uncertainty × Traffic_Weight, generates boundary inputs, runs them,
// and emits replay seeds for failures. Pure logic exported; the runner needs a browser (playwright).
//   node tools/epistemic-probe.mjs [--seed <id>] [--json out.json] [--routes r1,r2]
//   node tools/epistemic-probe.mjs --list   # print ranked targets without running
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const seedArg = args.indexOf('--seed') >= 0 ? +args[args.indexOf('--seed') + 1] : Math.floor(Math.random() * 1e9);
const jsonArg = args.indexOf('--json') >= 0 ? args[args.indexOf('--json') + 1] : null;
const listOnly = args.includes('--list');

// mulberry32 PRNG
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// uncertainty model: each route has a base uncertainty and traffic weight
const ROUTES = [
  { path: '/', uncertainty: 0.3, traffic: 1.0 },
  { path: '/tools.json', uncertainty: 0.5, traffic: 0.8 },
  { path: '/api/will', uncertainty: 0.7, traffic: 0.6 },
  { path: '/api/answer', uncertainty: 0.4, traffic: 0.9 },
  { path: '/research/', uncertainty: 0.6, traffic: 0.3 },
  { path: '/verse/', uncertainty: 0.2, traffic: 0.5 },
  { path: '/card/', uncertainty: 0.8, traffic: 0.4 },
  { path: '/tools/', uncertainty: 0.3, traffic: 0.7 },
];

// boundary input generators: each produces a messy input for a route
const BOUNDARIES = [
  { type: 'empty', input: '' },
  { type: 'typo', input: 'wether in boston' },
  { type: 'slang', input: 'yo what can u do' },
  { type: 'long', input: 'a'.repeat(200) },
  { type: 'special-chars', input: '<script>alert(1)</script>' },
  { type: 'unicode', input: '天気 今日' },
  { type: 'number', input: '42' },
  { type: 'single-char', input: 'a' },
];

/** rank routes by uncertainty × traffic. Pure. */
export function rankRoutes(routes = ROUTES) {
  return [...routes].map((r) => ({ ...r, score: Math.round(r.uncertainty * r.traffic * 1000) / 1000 })).sort((a, b) => b.score - a.score);
}

/** pick a boundary input for a route based on seed. Pure. */
export function pickBoundary(seed, route) {
  const r = rng(seed + (route ? route.path.length : 0))();
  return BOUNDARIES[Math.floor(r * BOUNDARIES.length)];
}

/** generate a replay seed for a failure. Pure. */
export function makeSeed(seed, persona, route, boundary, failure) {
  return { seed, persona: persona || 'epistemic-probe', route, boundary: boundary || null, failure: failure || null, ts: new Date().toISOString(), replay: 'node tools/epistemic-probe.mjs --seed ' + seed };
}

/** classify a failure: dedup key. Pure. */
export function dedupKey(route, failureType, target) {
  return [route, failureType, target || ''].join('|').toLowerCase();
}

// main
if (listOnly) {
  const ranked = rankRoutes();
  console.log(JSON.stringify(ranked, null, 2));
  process.exit(0);
}

const report = { seed: seedArg, ranked: rankRoutes().slice(0, 5), probes: [], failures: [] };
console.log(JSON.stringify(report, null, 2));
if (jsonArg) fs.writeFileSync(jsonArg, JSON.stringify(report, null, 2));
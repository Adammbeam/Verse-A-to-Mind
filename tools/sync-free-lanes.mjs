// Sync Verse's free OpenRouter lanes from the live model list (owner, 2026-11-14: "$0 forever").
// Queries openrouter.ai/api/v1/models, keeps models with $0 prompt and completion pricing, captures
// modalities/endpoints/expiration, and writes void-live-deploy/resources/openrouter-free.json so Verse
// can route text/image/vision to live $0 lanes and fail over when one sunsets.
//   node tools/sync-free-lanes.mjs            refresh openrouter-free.json
//   node tools/sync-free-lanes.mjs --check    exit 1 when openrouter-free.json is stale (>24h)
//   node tools/sync-free-lanes.mjs --dry      print the payload, write nothing
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outPath = path.join(root, 'void-live-deploy', 'resources', 'openrouter-free.json');
const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const dryRun = args.includes('--dry');

// pure: $0 prompt and completion (request/image pricing may vary; callers treat these as $0-lane candidates)
export function isFree(m) {
  const p = m && m.pricing;
  if (!p) return false;
  return Number(p.prompt) === 0 && Number(p.completion) === 0;
}

// pure: normalized modalities/endpoints/expiration snapshot for routing and sunset tracking
export function laneOf(m) {
  const a = (m && m.architecture) || {};
  const inMods = Array.isArray(a.input_modalities) ? a.input_modalities.slice() : [];
  const outMods = Array.isArray(a.output_modalities) ? a.output_modalities.slice() : [];
  const endpoints = Array.isArray(m && m.endpoints) ? m.endpoints.slice() : [];
  const expiration = (m && m.expiration_date) || null;
  const kind = outMods.includes('image') || endpoints.includes('/api/v1/images') ? 'image'
    : inMods.some((x) => x === 'image' || x === 'video') ? 'vision'
    : 'text';
  return {
    id: m && m.id,
    name: (m && m.name) || (m && m.id) || '',
    context: Number((m && m.context_length) || 0),
    provider: String((m && m.id) || '').split('/')[0] || '',
    kind,
    input_modalities: inMods,
    output_modalities: outMods,
    endpoints,
    expiration_date: expiration,
  };
}

// pure: rank by context desc, then id asc for determinism (stable failover order)
export function rankFree(models) {
  return (models || []).filter(isFree).sort((a, b) => {
    const ca = Number((a && a.context_length) || 0);
    const cb = Number((b && b.context_length) || 0);
    if (cb !== ca) return cb - ca;
    return String((a && a.id) || '').localeCompare(String((b && b.id) || ''));
  }).map(laneOf).filter((m) => m && m.id);
}

// pure: active lanes on/after `now` (unknown expiration stays active; sunset day is tracked for routing UI/logic)
export function activeLanes(ranked, nowMs = Date.now()) {
  return (ranked || []).filter((m) => !m.expiration_date || Date.parse(m.expiration_date) >= nowMs);
}

// pure: build payload with modality pools and sunset tracking
export function buildPayload(ranked, now = new Date().toISOString()) {
  const models = (ranked || []).slice();
  const byKind = { text: [], image: [], vision: [] };
  for (const m of models) if (byKind[m.kind]) byKind[m.kind].push(m.id);
  const expiring = models.filter((m) => m.expiration_date).map((m) => ({ id: m.id, expiration_date: m.expiration_date, kind: m.kind }))
    .sort((a, b) => String(a.expiration_date).localeCompare(String(b.expiration_date)) || a.id.localeCompare(b.id));
  return { updated: now, count: models.length, byKind, expiring, models };
}

async function main() {
  let models = [];
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    models = Array.isArray(j.data) ? j.data : [];
  } catch (e) {
    console.error('fetch failed:', e && e.message);
    process.exit(1);
  }
  const ranked = rankFree(models);
  const payload = buildPayload(ranked);

  if (checkOnly) {
    try {
      const old = JSON.parse(fs.readFileSync(outPath, 'utf8'));
      const age = Date.now() - Date.parse(old.updated || 0);
      if (age > 24 * 3600 * 1000) { console.error('stale: openrouter-free.json is ' + Math.round(age / 3600000) + 'h old'); process.exit(1); }
      console.log('ok: openrouter-free.json is fresh (' + (old.count || 0) + ' free models)');
    } catch (_) { console.error('missing or invalid openrouter-free.json'); process.exit(1); }
    return;
  }

  if (dryRun) {
    console.log(JSON.stringify(payload, null, 2).slice(0, 4000));
    return;
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n');
  console.log('wrote ' + ranked.length + ' free OpenRouter models to ' + outPath);
}

// importing these pure helpers (tools/sync-free-lanes.test.mjs) must not fetch or rewrite the real registry:
// only the command line, `node tools/sync-free-lanes.mjs`, runs the sync itself.
const invokedDirectly = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) main().catch((e) => { console.error(e); process.exit(1); });
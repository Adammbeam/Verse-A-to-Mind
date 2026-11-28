// One D1 row per loop per day: calls, AI neurons/tokens, D1 rows, R2 operations and Worker requests, with a rough USD estimate.
// This is code-derived cost attribution, not Cloudflare's billed usage: included allowances and credits are not subtracted.
// Unit prices (checked 2026-11-28):
//   https://developers.cloudflare.com/workers-ai/platform/pricing/   $0.011 / 1k neurons
//   https://developers.cloudflare.com/d1/platform/pricing/           $0.001 / 1M rows read, $1 / 1M rows written
//   https://developers.cloudflare.com/r2/pricing/                    $4.50 / 1M Class A, $0.36 / 1M Class B
//   https://developers.cloudflare.com/durable-objects/platform/pricing/  $0.15 / 1M requests, $12.50 / 1M GB-s
//   https://developers.cloudflare.com/workers/platform/pricing/      $0.30 / 1M requests, $0.02 / 1M CPU ms
export const COST_NOTE = 'Rough estimate from Cloudflare published unit prices, not the billed amount; included free allowances and credits are not subtracted.';

export const RATES = Object.freeze({
  neurons: 0.011 / 1000,
  d1Reads: 0.001 / 1000000,
  d1Writes: 1 / 1000000,
  r2A: 4.5 / 1000000,
  r2B: 0.36 / 1000000,
  doRequests: 0.15 / 1000000,
  doGbSeconds: 12.5 / 1000000,
  workerRequests: 0.3 / 1000000,
  cpuMs: 0.02 / 1000000,
});

const FIELDS = ['calls', 'neurons', 'tokens', 'd1Reads', 'd1Writes', 'r2A', 'r2B', 'doRequests', 'doGbSeconds', 'workerRequests', 'cpuMs'];
const COLUMN = { calls: 'calls', neurons: 'neurons', tokens: 'tokens', d1Reads: 'd1_reads', d1Writes: 'd1_writes', r2A: 'r2_a', r2B: 'r2_b', doRequests: 'do_requests', doGbSeconds: 'do_gb_seconds', workerRequests: 'worker_requests', cpuMs: 'cpu_ms' };
const num = (x) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };
const pick = (u, k) => num(u[k] != null ? u[k] : u[COLUMN[k]]);
const round4 = (n) => Math.round(n * 10000) / 10000;

/** What an AI result reports, normalised to neurons and tokens. Pure. */
export function usageFrom(result) {
  const r = result && typeof result === 'object' ? result : {};
  const u = r.usage && typeof r.usage === 'object' ? r.usage : {};
  const m = r.meta && typeof r.meta === 'object' ? r.meta : {};
  const nested = r.result && r.result.usage && typeof r.result.usage === 'object' ? r.result.usage : {};
  const src = { ...m, ...u, ...nested };
  return {
    neurons: num(src.neurons != null ? src.neurons : src.total_neurons != null ? src.total_neurons : r.neurons),
    tokens: num(src.total_tokens != null ? src.total_tokens : (src.prompt_tokens || 0) + (src.completion_tokens || 0)),
  };
}

const rowOf = (raw) => {
  const r = raw && typeof raw === 'object' ? raw : {}, out = { loop: String(r.loop || ''), day: String(r.day || '') };
  for (const k of FIELDS) out[k] = num(r[k] != null ? r[k] : r[COLUMN[k]]);
  return out;
};

/** Rank loop rows by the rough USD estimate, largest first. Pure. */
export function rankUsage(rows) {
  const by = new Map();
  for (const raw of rows || []) {
    const r = rowOf(raw); if (!r.loop) continue;
    const cur = by.get(r.loop) || { loop: r.loop, lastDay: '', lastAt: '', ...Object.fromEntries(FIELDS.map((k) => [k, 0])) };
    for (const k of FIELDS) cur[k] += r[k];
    if (!cur.lastDay || r.day > cur.lastDay) cur.lastDay = r.day;
    if (!cur.lastAt || r.updated > cur.lastAt) cur.lastAt = r.updated || cur.lastAt;
    by.set(r.loop, cur);
  }
  return [...by.values()].map((r) => {
    const usd = FIELDS.reduce((sum, k) => sum + (RATES[k] ? r[k] * RATES[k] : 0), 0);
    return { ...r, estimateUsd: round4(usd), estimate: 'usd' };
  }).sort((a, b) => b.estimateUsd - a.estimateUsd || a.loop.localeCompare(b.loop));
}

/** Add one loop's usage to today's row. Never throws from a caller: wrap with .catch(() => {}). */
export async function logUsage(DB, loop, usage = {}, at = Date.now()) {
  if (!DB || !loop) return null;
  const stamp = typeof at === 'string' ? at : new Date(at).toISOString();
  const day = stamp.slice(0, 10);
  const values = FIELDS.map((k) => pick(usage, k));
  await DB.prepare('CREATE TABLE IF NOT EXISTS void_cost_usage (day TEXT NOT NULL, loop TEXT NOT NULL, calls INTEGER NOT NULL DEFAULT 0, neurons REAL NOT NULL DEFAULT 0, tokens INTEGER NOT NULL DEFAULT 0, d1_reads INTEGER NOT NULL DEFAULT 0, d1_writes INTEGER NOT NULL DEFAULT 0, r2_a INTEGER NOT NULL DEFAULT 0, r2_b INTEGER NOT NULL DEFAULT 0, do_requests INTEGER NOT NULL DEFAULT 0, do_gb_seconds REAL NOT NULL DEFAULT 0, worker_requests INTEGER NOT NULL DEFAULT 0, cpu_ms REAL NOT NULL DEFAULT 0, updated TEXT NOT NULL, PRIMARY KEY (day, loop))').run();
  await DB.prepare('INSERT INTO void_cost_usage (day, loop, calls, neurons, tokens, d1_reads, d1_writes, r2_a, r2_b, do_requests, do_gb_seconds, worker_requests, cpu_ms, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(day, loop) DO UPDATE SET calls = calls + excluded.calls, neurons = neurons + excluded.neurons, tokens = tokens + excluded.tokens, d1_reads = d1_reads + excluded.d1_reads, d1_writes = d1_writes + excluded.d1_writes, r2_a = r2_a + excluded.r2_a, r2_b = r2_b + excluded.r2_b, do_requests = do_requests + excluded.do_requests, do_gb_seconds = do_gb_seconds + excluded.do_gb_seconds, worker_requests = worker_requests + excluded.worker_requests, cpu_ms = cpu_ms + excluded.cpu_ms, updated = excluded.updated').bind(day, loop, ...values, stamp).run();
  return rankUsage([{ day, loop, ...Object.fromEntries(FIELDS.map((k, i) => [k, values[i]])) }])[0];
}

/** The owner view's ranked rows for the last `days` days, newest day first. */
export async function costRows(DB, days = 30) {
  if (!DB) return [];
  const since = new Date(Date.now() - Math.max(1, days) * 86400000).toISOString().slice(0, 10);
  try {
    const r = await DB.prepare('SELECT day, loop, calls, neurons, tokens, d1_reads, d1_writes, r2_a, r2_b, do_requests, do_gb_seconds, worker_requests, cpu_ms, updated FROM void_cost_usage WHERE day >= ? ORDER BY day DESC').bind(since).all();
    return rankUsage(r && r.results);
  } catch (_) { return []; } // a checkout or an old DB with no table yet just shows "no usage logged yet"
}

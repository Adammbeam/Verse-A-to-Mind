// The merge queue a seat can read: each waiting change request, oldest push first, with a
// state, a position and an estimated wait. Pure. No network, no clock, no store.
// Draft refs (cr/draft and cr/draft/...) stay out. A row is only ref, state, position and eta_s.

export const QUEUE = Object.freeze({
  STATES: Object.freeze(['queued', 'checking', 'ready', 'blocked', 'locked']),
  DEFAULT_ETA_S: 300,
  HISTORY: 10,
});

const GREEN = new Set(['green', 'pass']);
const RED = new Set(['red', 'fail']);
const RUNNING = new Set(['running', 'checking']);

/** A store ref as cr/<name>, or '' when it is not a change request. Pure. */
export function changeRef(ref) {
  let s = String(ref == null ? '' : ref).trim();
  if (s.startsWith('refs/heads/')) s = s.slice('refs/heads/'.length);
  return /^cr\/[\w.-]+(?:\/[\w.-]+)?$/.test(s) ? s : '';
}

/** True for a draft change request (cr/draft or cr/draft/...). Pure. */
export function isDraftRef(ref) {
  const s = changeRef(ref);
  return s === 'cr/draft' || s.startsWith('cr/draft/');
}

// The number to sort on. A timestamp string is parsed; this does not read the clock.
function pushOrder(value, index) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber) && String(asNumber) === value.trim()) return asNumber;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Number.POSITIVE_INFINITY + index;
}

function checkKind(state) {
  const s = String(state || '').toLowerCase();
  if (RUNNING.has(s)) return 'running';
  if (GREEN.has(s)) return 'green';
  if (RED.has(s)) return 'red';
  return '';
}

function againstMain(check) {
  if (!check || typeof check !== 'object') return '';
  if (check.main != null && String(check.main) !== '') return String(check.main);
  if (check.base != null && String(check.base) !== '') return String(check.base);
  return '';
}

/** Durations from the check history, oldest first, at most the last `limit`. Pure. */
export function recentDurations(checks, limit = QUEUE.HISTORY) {
  const rows = [];
  (Array.isArray(checks) ? checks : []).forEach((check, index) => {
    if (!check || typeof check !== 'object') return;
    const duration = Number(check.duration_s);
    if (!Number.isFinite(duration) || duration < 0) return;
    const at = Number(check.at);
    rows.push({ duration, at: Number.isFinite(at) ? at : index });
  });
  rows.sort((a, b) => a.at - b.at);
  const cap = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : QUEUE.HISTORY;
  return rows.slice(-cap).map((row) => row.duration);
}

/** Median of a list of numbers, or null when there are none. Even counts average the two middle values. Pure. */
export function medianOf(values) {
  const sorted = (Array.isArray(values) ? values : []).filter((n) => Number.isFinite(n)).slice().sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function latestCheck(checks, ref, sha) {
  let best = null;
  let bestAt = -Infinity;
  (Array.isArray(checks) ? checks : []).forEach((check, index) => {
    if (!check || typeof check !== 'object' || changeRef(check.ref) !== ref) return;
    if (sha && String(check.sha == null ? '' : check.sha) !== sha) return;
    const at = Number(check.at);
    const order = Number.isFinite(at) ? at : index;
    if (!best || order >= bestAt) { best = check; bestAt = order; }
  });
  return best;
}

function entryState(row, checks, main, held) {
  if (held && row.ref === held) return 'locked';
  const latest = latestCheck(checks, row.ref, row.sha);
  const kind = checkKind(latest && latest.state);
  if (kind === 'running') return 'checking';
  if (kind === 'red') return 'blocked';
  if (kind === 'green' && main && againstMain(latest) === main) return 'ready';
  return 'queued';
}

/**
 * The queue. input: { refs: [{ ref, pushed_at, sha? }], checks: [{ ref, sha?, state, main?, duration_s?, at? }], main, held? }.
 * Oldest push first. eta_s is position times the median of the last 10 durations, rounded to the nearest second
 * (QUEUE.DEFAULT_ETA_S when the history has no duration). Pure.
 */
export function queueView(input) {
  const src = input && typeof input === 'object' ? input : {};
  const refs = Array.isArray(src.refs) ? src.refs : [];
  const checks = Array.isArray(src.checks) ? src.checks : [];
  const main = src.main == null ? '' : String(src.main);
  const held = changeRef(src.held);
  const pace = medianOf(recentDurations(checks));
  const etaUnit = pace == null ? QUEUE.DEFAULT_ETA_S : Math.round(pace);

  const byName = new Map();
  refs.forEach((row, index) => {
    if (!row || typeof row !== 'object') return;
    const ref = changeRef(row.ref != null ? row.ref : row.name);
    if (!ref || isDraftRef(ref)) return;
    const pushed = pushOrder(row.pushed_at, index);
    const prev = byName.get(ref);
    // one row per ref: the latest push is the tip that is waiting
    if (prev && (prev.pushed > pushed || (prev.pushed === pushed && prev.index > index))) return;
    byName.set(ref, { ref, pushed, sha: row.sha == null || row.sha === '' ? '' : String(row.sha), index });
  });

  const ordered = [...byName.values()].sort((a, b) => a.pushed - b.pushed || a.index - b.index);
  return ordered.map((row, index) => {
    const position = index + 1;
    return { ref: row.ref, state: entryState(row, checks, main, held), position, eta_s: position * etaUnit };
  });
}

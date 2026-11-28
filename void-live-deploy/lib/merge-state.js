// One merge state for a change request, decided before the runner tries it.
// Pure. No network, no clock, no store. A run is { name, state, conclusion } and stays in this file.
// Precedence: draft, dirty, blocked, behind (only when rules.up_to_date), unstable, clean, else unknown.

export const MERGE = Object.freeze({
  OUTCOMES: Object.freeze(['draft', 'dirty', 'blocked', 'behind', 'unstable', 'clean', 'unknown']),
  FAILED: Object.freeze(['fail', 'timeout']),
  PASSED: Object.freeze(['pass', 'neutral', 'skipped']),
});

function clip(line) {
  const text = String(line).replace(/\s+/g, ' ').trim();
  return text.length < 80 ? text : text.slice(0, 79).trimEnd();
}

function plainName(value) {
  const text = String(value == null ? '' : value)
    .replace(/\bgh[pousr]_[A-Za-z0-9]{8,}/g, 'hidden')
    .replace(/[^\w .:+/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

function sentence(prefix, name, suffix) {
  const room = 79 - prefix.length - suffix.length;
  const cut = (plainName(name) || 'check').slice(0, Math.max(1, room));
  return clip(prefix + cut + suffix);
}

function done(state, reason) {
  return { state, reason: clip(reason) };
}

function latestByName(runs) {
  const map = new Map();
  (Array.isArray(runs) ? runs : []).forEach((run, index) => {
    if (!run || typeof run !== 'object' || run.name == null || String(run.name).trim() === '') return;
    const name = String(run.name).trim();
    const at = Number(run.at);
    const order = Number.isFinite(at) ? at : index;
    const prev = map.get(name);
    if (!prev || order >= prev.order) map.set(name, { run, order, index });
  });
  return map;
}

function isFail(run) {
  return !!(run && MERGE.FAILED.includes(String(run.conclusion || '')));
}

function isPass(run) {
  return !!(run && MERGE.PASSED.includes(String(run.conclusion || '')));
}

function ruleSaysNo(rules) {
  if (!rules || typeof rules !== 'object') return '';
  for (const key of ['no', 'deny', 'block']) {
    const value = rules[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (value === true) return 'merge rule';
  }
  return '';
}

function firstFailed(latest, wantRequired, required) {
  let pick = null;
  for (const [name, row] of latest) {
    if (required.has(name) !== wantRequired || !isFail(row.run)) continue;
    if (!pick || row.index < pick.index) pick = { name, index: row.index };
  }
  return pick;
}

function requiredOk(required, latest) {
  for (const name of required) {
    const row = latest.get(name);
    if (!row || !isPass(row.run)) return false;
  }
  return true;
}

function requiredNames(list) {
  const out = [];
  for (const name of Array.isArray(list) ? list : []) {
    const text = String(name == null ? '' : name).trim();
    if (text) out.push(text);
  }
  return out;
}

/**
 * mergeState({ draft, conflict, behind_by, required, runs, rules }) -> { state, reason }.
 * conflict is true, false or null. runs use { name, state, conclusion }. Pure.
 */
export function mergeState(input) {
  const src = input && typeof input === 'object' ? input : {};
  const rules = src.rules && typeof src.rules === 'object' ? src.rules : {};
  const runs = Array.isArray(src.runs) ? src.runs : [];
  const required = new Set(requiredNames(src.required));
  const latest = latestByName(runs);
  const behindBy = Number(src.behind_by);

  if (src.draft === true) return done('draft', 'Draft: this change stays out of the merge.');
  if (src.conflict === true) return done('dirty', 'Dirty: this change conflicts with main.');

  const failedRequired = firstFailed(latest, true, required);
  if (failedRequired) return done('blocked', sentence('Blocked: required check ', failedRequired.name, ' failed.'));
  const rule = ruleSaysNo(rules);
  if (rule) return done('blocked', sentence('Blocked: rule ', rule, ' says no.'));

  if (rules.up_to_date === true && Number.isFinite(behindBy) && behindBy > 0) {
    return done('behind', 'Behind: the up-to-date rule applies.');
  }

  const failedOther = firstFailed(latest, false, required);
  if (failedOther) return done('unstable', sentence('Unstable: check ', failedOther.name, ' failed and is not required.'));

  if ((src.conflict === null || src.conflict === undefined) && runs.length === 0) {
    return done('unknown', 'Unknown: conflict is unset and there are no check runs.');
  }
  if (src.conflict === false && requiredOk(required, latest)) {
    return done('clean', 'Clean: required checks passed and this merges.');
  }
  return done('unknown', 'Unknown: the merge state is not settled yet.');
}

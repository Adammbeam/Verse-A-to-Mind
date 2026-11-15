// Counterfactual Mental Sandbox: think before acting. Built on Verse's Time Machine (lib/time-machine.js).
// Forks 2-4 lightweight state snapshots in memory, runs competing strategies, scores against invariants,
// mounts only the winning snapshot. Pure over the state handed in; no DOM, no browser, no I/O.
//
//   fork(state, n)              fork `n` snapshots of `state` (shallow clones with new ids)
//   runBranch(branch, fn)        run `fn` on a fork, catch errors, return { ok, result, error, ms }
//   score(branch, invariants)    score a branch against hard invariants (schema, non-empty, no errors, <400ms)
//   select(branches)             pick the winning branch (highest score, lowest ms on tie)
//   sandbox(state, strategies)   fork + run + score + select in one call; returns { winner, branches, ok }

export const MAX_BRANCHES = 4;
export const LATENCY_BUDGET_MS = 400;

/** shallow clone a state with a new branch id. Pure. */
export function cloneState(state, branchId) {
  if (!state || typeof state !== 'object') return { branchId, data: null };
  return { branchId, data: JSON.parse(JSON.stringify(state)), meta: { ...(state.meta || {}), branchId, forkedAt: Date.now() } };
}

/** fork n snapshots from a base state. Pure. */
export function fork(state, n = 2) {
  const count = Math.max(1, Math.min(MAX_BRANCHES, Number(n) || 2));
  const out = [];
  for (let i = 0; i < count; i++) out.push(cloneState(state, 'branch-' + i));
  return out;
}

/** run a strategy function on a branch. Catches errors. Pure-ish (fn may have side effects on branch.data). */
export function runBranch(branch, fn, timeoutMs = LATENCY_BUDGET_MS) {
  const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  let result = null, error = null, ok = false;
  try {
    result = fn(branch.data);
    ok = true;
  } catch (e) {
    error = String(e && e.message || e).slice(0, 300);
    ok = false;
  }
  const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const ms = Math.round(t1 - t0);
  return { branch, result, error, ok, ms, timedOut: ms > timeoutMs };
}

/** score a branch result against invariants. Pure. Returns { score, pass, reasons }. */
export function score(branchResult, invariants = {}) {
  const inv = invariants || {};
  const reasons = [];
  let pass = true;
  // non-empty output
  if (inv.nonEmpty !== false) {
    const r = branchResult.result;
    const empty = r === null || r === undefined || r === '' || (Array.isArray(r) && !r.length) || (typeof r === 'object' && !Object.keys(r || {}).length);
    if (empty) { pass = false; reasons.push('empty-output'); }
  }
  // schema validity
  if (inv.schema && branchResult.result && typeof branchResult.result === 'object') {
    const keys = Object.keys(inv.schema);
    for (const k of keys) {
      if (!(k in branchResult.result)) { pass = false; reasons.push('missing-key:' + k); }
    }
  }
  // no errors
  if (branchResult.error) { pass = false; reasons.push('error:' + branchResult.error.slice(0, 60)); }
  if (branchResult.timedOut) { pass = false; reasons.push('timeout:' + branchResult.ms + 'ms'); }
  // latency budget
  if (branchResult.ms > (inv.latencyBudget || LATENCY_BUDGET_MS)) { pass = false; reasons.push('slow:' + branchResult.ms + 'ms'); }
  const score = pass ? (100 - branchResult.ms / 10) : 0;
  return { score: Math.max(0, Math.round(score)), pass, reasons };
}

/** pick the winning branch from a list of { branch, result, error, ok, ms, score, pass }. Pure. */
export function select(results) {
  if (!Array.isArray(results) || !results.length) return null;
  const passing = results.filter((r) => r.pass);
  const pool = passing.length ? passing : results;
  return pool.reduce((best, r) => {
    if (!best) return r;
    if (r.score !== best.score) return r.score > best.score ? r : best;
    return r.ms < best.ms ? r : best;
  }, null);
}

/** run a full sandbox: fork, execute strategies, score, select. Pure-ish. */
export function sandbox(state, strategies, invariants = {}) {
  const branches = fork(state, (strategies || []).length || 2);
  const results = (strategies || []).map((fn, i) => {
    const br = runBranch(branches[i], fn);
    const sc = score(br, invariants);
    return { ...br, ...sc };
  });
  const winner = select(results);
  return { winner, branches: results, ok: !!(winner && winner.pass), count: results.length };
}

/** mount a winning branch's data onto a target state (returns new state). Pure. */
export function mount(winner, target) {
  if (!winner || !winner.result) return target;
  return { ...(target || {}), ...winner.result, _mounted: winner.branch.branchId };
}
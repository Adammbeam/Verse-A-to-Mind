// One gate, one run. A change can carry several gates. Each one opens queued, may move to
// running, and ends done with a conclusion. Done is final: a late write cannot rewrite a
// result a card already showed. rollup() is the one word for the set. A required gate whose
// conclusion is fail makes that word fail. A required gate that is not done yet makes it
// running. Otherwise it is pass. A gate that was not required can fail without blocking;
// the rollup stays pass and marks itself unstable. Timeout, cancelled, stale, neutral and
// skipped stay on the run and do not by themselves flip the word. A summary is cut to 300
// characters, and a key shape in it is replaced, so a log line cannot carry a token onto a card.
//
// start({ name, required }, now) opens a queued run.
// start(run, now) moves a queued run to running.
// finish(run, conclusion, summary, now) moves a queued or running run to done.
// No clock is read here. Pass `now` when the caller has one.

const SUMMARY_MAX = 300;

export const STATES = Object.freeze(['queued', 'running', 'done']);
export const CONCLUSIONS = Object.freeze(['pass', 'fail', 'neutral', 'skipped', 'cancelled', 'timeout', 'stale']);

/** The closed lists and the summary cap. Frozen so a caller cannot add a state. */
export const CHECK_RUN = Object.freeze({
  summary: SUMMARY_MAX,
  states: STATES,
  conclusions: CONCLUSIONS,
});

const NEXT = Object.freeze({
  queued: Object.freeze(['running', 'done']),
  running: Object.freeze(['done']),
  done: Object.freeze([]),
});

// Shapes of tokens a summary must not keep. Built from parts so this file does not hold one.
function keyShapes() {
  const long = '[A-Za-z0-9]{20,}';
  return [
    new RegExp('\\bgh[pousr]_' + long, 'g'),
    new RegExp('\\bgithub_pat_[A-Za-z0-9_]{20,}', 'g'),
    new RegExp('\\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{8,}', 'g'),
    new RegExp('\\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}', 'g'),
    new RegExp('\\bxox[abposr]-[A-Za-z0-9-]{10,}', 'g'),
    new RegExp('\\b(?:AKIA|ASIA)[A-Z0-9]{16}\\b', 'g'),
    new RegExp('\\bhf_' + long, 'g'),
    new RegExp('\\bnpm_[A-Za-z0-9]{20,}\\b', 'g'),
    new RegExp('\\bglpat-[A-Za-z0-9_-]{16,}', 'g'),
    new RegExp('\\bwhsec_[A-Za-z0-9]{16,}', 'g'),
    new RegExp('\\bAIza[0-9A-Za-z_-]{20,}', 'g'),
  ];
}

function maskSecrets(text) {
  let s = String(text == null ? '' : text);
  for (const re of keyShapes()) s = s.replace(re, '[redacted]');
  return s;
}

function cleanName(name) {
  const s = String(name == null ? '' : name).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return { ok: false, error: 'a check needs a name' };
  if (s.length > 80) return { ok: false, error: 'a check name is at most 80 characters' };
  if (maskSecrets(s) !== s) return { ok: false, error: 'a check name cannot carry a key' };
  return { ok: true, name: s };
}

function cleanSummary(text) {
  const flat = maskSecrets(text).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return flat.length > SUMMARY_MAX ? flat.slice(0, SUMMARY_MAX) : flat;
}

function taken(run) {
  if (!run || typeof run !== 'object') return { ok: false, error: 'that is not a check run' };
  if (run.state === 'done') return { ok: false, error: 'a done check cannot change' };
  if (!STATES.includes(run.state)) return { ok: false, error: 'that check is in a state Verse does not keep' };
  const named = cleanName(run.name);
  if (!named.ok) return named;
  return {
    ok: true,
    run: {
      name: named.name,
      state: run.state,
      conclusion: null,
      summary: '',
      required: run.required !== false,
      at: run.at ?? null,
      started: run.started ?? null,
      finished: run.finished ?? null,
    },
  };
}

function move(run, to, patch) {
  const base = taken(run);
  if (!base.ok) return base;
  if (!(NEXT[base.run.state] || []).includes(to)) {
    const error = base.run.state === 'running'
      ? 'a running check can only be finished'
      : 'a ' + base.run.state + ' check cannot become ' + to;
    return { ok: false, error };
  }
  return { ok: true, run: Object.freeze({ ...base.run, state: to, ...patch }) };
}

/** Open a queued run, or move a queued run to running. The input run is not changed. */
export function start(input = {}, now) {
  if (input && typeof input === 'object' && Object.prototype.hasOwnProperty.call(input, 'state')) {
    const patch = {};
    if (now !== undefined) patch.started = now;
    return move(input, 'running', patch);
  }
  const named = cleanName(input && input.name);
  if (!named.ok) return named;
  return {
    ok: true,
    run: Object.freeze({
      name: named.name,
      state: 'queued',
      conclusion: null,
      summary: '',
      required: !(input && input.required === false),
      at: now === undefined ? null : now,
      started: null,
      finished: null,
    }),
  };
}

/** Move a queued or running run to done. Unknown conclusions are refused. The input is not changed. */
export function finish(run, conclusion, summary = '', now) {
  if (!CONCLUSIONS.includes(conclusion)) return { ok: false, error: 'that conclusion is not one Verse keeps' };
  const patch = { conclusion, summary: cleanSummary(summary) };
  if (now !== undefined) patch.finished = now;
  return move(run, 'done', patch);
}

/**
 * The one word for a list of runs. Fail wins over still-open. A run with no `required`
 * field counts as required. A list that is not a list counts as fail: a missing set of
 * gates is not a pass. Pure.
 */
export function rollup(runs) {
  if (!Array.isArray(runs)) return Object.freeze({ verdict: 'fail', unstable: false });
  const list = runs.filter((r) => r && typeof r === 'object');
  const required = list.filter((r) => r.required !== false);
  const optionalFail = list.some((r) => r.required === false && r.conclusion === 'fail');
  if (required.some((r) => r.conclusion === 'fail')) return Object.freeze({ verdict: 'fail', unstable: false });
  if (required.some((r) => r.state !== 'done')) return Object.freeze({ verdict: 'running', unstable: false });
  return Object.freeze({ verdict: 'pass', unstable: optionalFail });
}

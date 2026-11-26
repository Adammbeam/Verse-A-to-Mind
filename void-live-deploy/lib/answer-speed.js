// Where an uncached answer's time went (2026-11-25: 25.9 s and 29.2 s for plain asks that usually take 2 to 5 s). Neither the Wikipedia
// search nor the free model's call had any time limit, so one slow call held the whole answer. Two bounds, both pure apart from the calls:
//   bounded   the sources wait at most SOURCES_MS; past that the answer is written without them (the model's own knowledge, honestly cited)
//   hedged    the free model gets HEDGE_MS alone; still nothing by then and the second free model starts beside it, and the first non-empty
//             answer wins. A first model that fails outright before the hedge is reported at once, so the caller's own fallbacks run as before.
// The second model costs neurons only on the slow tail (a hedged call), never on an ordinary answer.
export const SOURCES_MS = 3500;
export const HEDGE_MS = 6000;

/** the promise's value, or `fallback` once `ms` pass or it fails. */
export function bounded(p, ms, fallback) {
  let t;
  return Promise.race([Promise.resolve(p).catch(() => fallback), new Promise((res) => { t = setTimeout(() => res(fallback), ms); })]).finally(() => clearTimeout(t));
}

/** runs[0] alone for hedgeMs, then runs[1] beside it; resolves { id, value, hedged } with the first non-empty value, or rejects
 *  (the first's error when it failed before the hedge, else 'timeout' at capMs, else the last error). */
export function hedged(runs, { hedgeMs = HEDGE_MS, capMs = 20000, timer = setTimeout, clear = clearTimeout } = {}) {
  return new Promise((resolve, reject) => {
    let done = false, started = 0, failed = 0, hedge = null, cap = null, lastErr = null;
    const finish = (fn, v) => { if (done) return; done = true; clear(hedge); clear(cap); fn(v); };
    const start = (i) => {
      started++;
      Promise.resolve().then(() => runs[i].run()).then((value) => {
        if (value && String(value).trim()) finish(resolve, { id: runs[i].id, value, hedged: started > 1 });
        else throw new Error('empty');
      }).catch((e) => {
        lastErr = e; failed++;
        if (started === 1 && runs.length > 1 && i === 0) return finish(reject, e); // failed fast: the caller's fallbacks take over
        if (failed >= started && started >= runs.length) finish(reject, lastErr);
      });
    };
    start(0);
    if (runs.length > 1) hedge = timer(() => { if (!done) start(1); }, hedgeMs);
    cap = timer(() => finish(reject, new Error('timeout')), capMs);
  });
}

// The flanker cost and the Gratton effect (Eriksen & Eriksen 1974; Gratton, Coles & Donchin 1992): the core skill
// skills/flanker-cost.js keeps its maths here so the page and the unit test call the same code.
//
// The task: five arrows on one row. The middle one is the target; the other four are the flankers. Answer the middle
// arrow's direction. When the flankers disagree with it the answer is slower. That gap is the flanker cost.
//
// The split by the row before is the Gratton effect: the cost is usually smaller right after a row that disagreed,
// because the last row tunes how much weight the flankers get. So a sitting reports the cost after a row that agreed
// and the cost after a row that disagreed, and their difference. Positive adaptation means the row before did the
// tuning; a null means the sitting had too few trials in a cell to say anything, which is not the same as zero.
export const TRIALS = 48;
// A median of one or two trials is not a measurement. A cell needs this many correct answers before it reports a cost.
export const MIN_CELL = 3;
// No more than this many rows of the same kind in a row, so the sequence still has transitions to split on.
export const MAX_RUN = 3;

export function shuffle(a) {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) { const k = Math.floor(Math.random() * (i + 1)); const t = b[i]; b[i] = b[k]; b[k] = t; }
  return b;
}

/** true when the conditions run longer than MAX_RUN anywhere. Pure. */
export function runsTooLong(conds, max = MAX_RUN) {
  let run = 1;
  for (let i = 1; i < conds.length; i++) { run = conds[i] === conds[i - 1] ? run + 1 : 1; if (run > max) return true; }
  return false;
}

/** half the rows agree with the middle arrow and half disagree, in an order that never runs long. Pure apart from the shuffle. */
export function conditions(n = TRIALS) {
  const half = Math.floor(n / 2);
  let conds = shuffle(Array.from({ length: n }, (_, i) => i < half));
  for (let tries = 0; tries < 200 && runsTooLong(conds); tries++) {
    // swap the first element of each over-long run with a later element of the other kind
    for (let i = 1; i < conds.length; i++) {
      if (conds[i] === conds[i - 1] && conds[i] === conds[i - 2] && conds[i] === conds[i - 3]) {
        const j = conds.findIndex((c, k) => k > i && c !== conds[i]);
        if (j > -1) { const t = conds[i]; conds[i] = conds[j]; conds[j] = t; }
        break;
      }
    }
    conds = shuffle(conds);
  }
  return conds;
}

/** one sitting's rows: conditions balanced, directions balanced, and every row but the first carrying the one before it. */
export function plan(n = TRIALS) {
  const conds = conditions(n);
  const dirs = shuffle(Array.from({ length: n }, (_, i) => (i % 2 ? 'R' : 'L')));
  const trials = conds.map((congruent, i) => ({ congruent, dir: dirs[i] }));
  for (let i = 0; i < trials.length; i++) trials[i].prev = i ? trials[i - 1].congruent : null;
  return trials;
}

export function median(a) {
  if (!a.length) return null;
  const s = a.slice().sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** the median of a cell, or null when the cell is too thin to be a measurement. Pure. */
export function cell(xs) { return xs && xs.length >= MIN_CELL ? median(xs) : null; }

/** the cost of disagreeing flankers from two lists of times, or null if either side is too thin. Pure. */
export function costOf(agree, disagree) {
  const a = cell(agree), d = cell(disagree);
  return a != null && d != null ? d - a : null;
}

/** one sitting from finished rows. Correct answers only; the split uses the row before it, right or wrong. Pure. */
export function sitting(trials) {
  const rows = trials || [];
  const agree = [], disagree = [];
  const afterAgree = { agree: [], disagree: [] }, afterDisagree = { agree: [], disagree: [] };
  let wrong = 0;
  for (const t of rows) {
    if (!t || !t.correct) { wrong++; continue; }
    if (!Number.isFinite(t.ms)) { wrong++; continue; }
    (t.congruent ? agree : disagree).push(t.ms);
    const prev = t.prev;
    if (prev === true || prev === false) {
      const into = prev ? afterAgree : afterDisagree;
      (t.congruent ? into.agree : into.disagree).push(t.ms);
    }
  }
  const afterCongruent = { n: afterAgree.agree.length + afterAgree.disagree.length, congruent: cell(afterAgree.agree), incongruent: cell(afterAgree.disagree), cost: costOf(afterAgree.agree, afterAgree.disagree) };
  const afterIncongruent = { n: afterDisagree.agree.length + afterDisagree.disagree.length, congruent: cell(afterDisagree.agree), incongruent: cell(afterDisagree.disagree), cost: costOf(afterDisagree.agree, afterDisagree.disagree) };
  const cost = costOf(agree, disagree);
  const adaptation = afterCongruent.cost != null && afterIncongruent.cost != null ? afterCongruent.cost - afterIncongruent.cost : null;
  return {
    n: rows.length,
    congruent: cell(agree),
    incongruent: cell(disagree),
    cost,
    afterCongruent,
    afterIncongruent,
    adaptation,
    errors: rows.length ? wrong / rows.length : 0,
  };
}

/** the middle of a number list, ignoring the nulls a thin sitting leaves. Pure. */
export function medianOf(xs) {
  const ok = (xs || []).filter((x) => typeof x === 'number' && Number.isFinite(x));
  return ok.length ? median(ok) : null;
}

/** across sittings: your usual cost and your usual adaptation, so the card can say what has held over time. Pure. */
export function across(ss) {
  const rows = (ss || []).filter((s) => s && Number.isFinite(s.cost));
  return { n: rows.length, cost: medianOf(rows.map((s) => s.cost)), adaptation: medianOf(rows.map((s) => s.adaptation)) };
}

/** the cases this module promises. true when they hold, else a short reason. Pure. */
export function selftest() {
  const p = plan(TRIALS);
  if (p.length !== TRIALS) return 'plan should be ' + TRIALS + ' rows';
  if (p.filter((t) => t.congruent).length !== TRIALS / 2) return 'conditions should be balanced';
  if (p.filter((t) => t.dir === 'L').length !== TRIALS / 2) return 'directions should be balanced';
  if (runsTooLong(p.map((t) => t.congruent))) return 'no condition should run longer than ' + MAX_RUN;
  if (p[0].prev !== null) return 'the first row has no row before it';
  if (p.slice(1).some((t, i) => t.prev !== p[i].congruent)) return 'prev must be the row before';

  // a sitting built by hand: after an agreeing row the cost is 20 ms, after a disagreeing one it is 7 ms
  const rows = [
    { congruent: true, prev: null, correct: true, ms: 500 },
    { congruent: true, prev: true, correct: true, ms: 500 },
    { congruent: true, prev: true, correct: true, ms: 502 },
    { congruent: true, prev: true, correct: true, ms: 504 },
    { congruent: false, prev: true, correct: true, ms: 520 },
    { congruent: false, prev: true, correct: true, ms: 522 },
    { congruent: false, prev: true, correct: true, ms: 524 },
    { congruent: true, prev: false, correct: true, ms: 600 },
    { congruent: true, prev: false, correct: true, ms: 602 },
    { congruent: true, prev: false, correct: true, ms: 604 },
    { congruent: false, prev: false, correct: true, ms: 607 },
    { congruent: false, prev: false, correct: true, ms: 609 },
    { congruent: false, prev: false, correct: true, ms: 611 },
    { congruent: true, prev: false, correct: false, ms: 200 },
  ];
  const s = sitting(rows);
  if (s.afterCongruent.cost !== 20) return 'after an agreeing row should be 20, got ' + s.afterCongruent.cost;
  if (s.afterIncongruent.cost !== 7) return 'after a disagreeing row should be 7, got ' + s.afterIncongruent.cost;
  if (s.adaptation !== 13) return 'adaptation should be 13, got ' + s.adaptation;
  if (s.cost !== 61.5) return 'the whole sitting should be 61.5, got ' + s.cost;
  if (Math.abs(s.errors - 1 / 14) > 1e-12) return 'errors should be 1 in 14';

  // a thin cell is unknown, not zero
  const thin = sitting([{ congruent: true, prev: null, correct: true, ms: 400 }, { congruent: false, prev: true, correct: true, ms: 500 }]);
  if (thin.cost !== null) return 'two answers are not a cost, got ' + thin.cost;
  if (thin.adaptation !== null) return 'a thin split is not an adaptation, got ' + thin.adaptation;
  return true;
}

/**
 * flanker-cost skill — the flanker cost and the Gratton effect (Eriksen & Eriksen 1974; Gratton, Coles & Donchin 1992).
 * "the five arrows", "flanker test", "gratton effect".
 * Five arrows on one row: answer the middle one's direction. The four neighbours either agree with it or disagree.
 * The gap between the disagreeing rows and the agreeing ones is the flanker cost. The same gap split by the row before
 * is the Gratton effect: right after a disagreeing row the cost usually shrinks. Sittings stay in this browser.
 * The maths is lib/flanker-cost.js, pure, and tools/flanker-cost.test.mjs runs it.
 * Contract: { name, examples, nearMisses, match(lower, text), run(text, api) }
 */
import { TRIALS, MIN_CELL, plan, sitting, across, conditions, runsTooLong, selftest } from '../lib/flanker-cost.js';

export { TRIALS, MIN_CELL, plan, sitting, across, conditions, runsTooLong, selftest };

const WHEN = /^(?:(?:show|open|play|start|run|try|do|give me|measure)\s+(?:me\s+)?)?(?:the\s+)?(?:flanker(?:\s+(?:cost|test|task))?|five arrows|gratton(?:\s+effect)?)(?:\s+(?:test|task))?$/i;
const KEY = 'a2m.fringe.flanker.v1';
const CSS = '.fc-row{display:flex;gap:14px;justify-content:center;align-items:center;height:92px;font:600 40px/1 system-ui,sans-serif;letter-spacing:2px;margin:8px 0}'
  + '.fc-row span{min-width:28px;text-align:center}'
  + '.fc-fix{color:rgba(255,255,255,.5);font:400 30px/1 system-ui,sans-serif}'
  + '.fc-btns{display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:center;margin:6px 0}'
  + '.fc-btns button{font:inherit;color:inherit;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.18);border-radius:10px;padding:8px 12px;cursor:pointer}'
  + '.fc-btns button:disabled{opacity:.45;cursor:default}'
  + '.fc-note{white-space:pre-line}';

function load(store) {
  try {
    const j = JSON.parse(store.getItem(KEY) || 'null');
    if (j && Array.isArray(j.sittings)) return j.sittings.filter((s) => s && Number.isFinite(s.cost) && s.hour >= 0 && s.hour < 24);
  } catch (_) {}
  return [];
}
function save(store, sittings, warn) {
  try { store.setItem(KEY, JSON.stringify({ sittings: sittings.slice(-200) })); if (warn) warn.hidden = true; }
  catch (_) { if (warn) { warn.hidden = false; warn.textContent = 'This browser is not saving your sittings. They count for now and are gone after a reload.'; } }
}

const ms = (x) => (x == null ? '–' : Math.round(x) + ' ms');
const sign = (x) => (x == null ? '–' : (x > 0 ? '+' : '') + Math.round(x) + ' ms');

function mount(el, doc, store) {
  const sittings = load(store);
  el.innerHTML = '<style>' + CSS + '</style><h2>The five arrows</h2>'
    + '<p class="sub">Five arrows appear. Answer the <strong>middle</strong> one: F for left, J for right, or tap the buttons. The other four either agree with it or disagree. Disagreeing ones slow you down; that gap is your flanker cost. Split by the row before, it is the Gratton effect: after a row that disagreed, the gap usually shrinks. ' + TRIALS + ' rows a sitting. Kept in this browser.</p>'
    + '<div class="fc-row" data-row aria-hidden="true"><span class="fc-fix">+</span></div>'
    + '<div class="fc-btns" data-keys><button type="button" data-s="L" disabled>F left</button><button type="button" data-s="R" disabled>J right</button></div>'
    + '<div class="fc-btns"><button type="button" data-go>start ' + TRIALS + '</button></div>'
    + '<div data-warn role="alert" hidden></div><div data-state aria-live="polite"></div><div class="sub fc-note" data-score aria-live="polite"></div>'
    + '<div class="src">Sources: Barbara Eriksen and Charles Eriksen, Effects of noise letters upon the identification of a target letter, 1974; Gabriele Gratton, Michael Coles and Emanuel Donchin, Optimizing the use of information, 1992. Kept in this browser.</div>';
  const q = (s) => el.querySelector(s);
  const row = q('[data-row]');
  const buttons = (on) => { for (const b of el.querySelectorAll('[data-keys] button')) b.disabled = !on; };
  const fixation = () => { row.innerHTML = '<span class="fc-fix">+</span>'; };
  const arrows = (t) => {
    const a = t.dir === 'L' ? '←' : '→', b = t.congruent ? a : (t.dir === 'L' ? '→' : '←');
    row.innerHTML = '<span>' + b + '</span><span>' + b + '</span><span>' + a + '</span><span>' + b + '</span><span>' + b + '</span>';
  };
  const score = () => {
    const a = across(sittings);
    if (!a.n) { q('[data-score]').textContent = ''; return; }
    q('[data-score]').textContent = a.n + ' sitting' + (a.n > 1 ? 's' : '') + ' · your usual flanker cost ' + ms(a.cost)
      + ' · your usual Gratton ' + sign(a.adaptation)
      + (a.n < 6 ? '\nSix sittings before the split means much; one sitting is a snapshot, not a trait.' : '');
  };
  let run = null;
  const show = () => {
    const t = run.trials[run.i];
    fixation(); buttons(false); q('[data-state]').textContent = '';
    run.timer = setTimeout(() => {
      arrows(t);
      run.at = performance.now();
      buttons(true);
    }, 400 + Math.random() * 400);
  };
  const answer = (s) => {
    if (!run || !run.at) return;
    const t = run.trials[run.i];
    t.ms = performance.now() - run.at; t.correct = s === t.dir; run.at = 0;
    buttons(false);
    if (!t.correct) q('[data-state]').textContent = 'The middle arrow pointed ' + (t.dir === 'L' ? 'left' : 'right') + '.';
    run.i++;
    if (run.i < run.trials.length) { show(); return; }
    const r = sitting(run.trials);
    fixation(); buttons(false);
    const go = q('[data-go]'); go.disabled = false; go.textContent = 'another ' + TRIALS;
    if (r.cost != null) { r.hour = new Date().getHours(); r.at = Date.now(); sittings.push(r); save(store, sittings, q('[data-warn]')); }
    q('[data-state]').textContent = r.cost == null
      ? 'Too many misses to measure this sitting.'
      : 'This sitting: agreeing rows ' + ms(r.congruent) + ', disagreeing ' + ms(r.incongruent) + ', so the flankers cost you ' + ms(r.cost) + ' · ' + Math.round(r.errors * 100) + '% wrong'
        + '\nafter an agreeing row ' + (r.afterCongruent.cost == null ? 'not enough rows yet' : ms(r.afterCongruent.cost))
        + ' · after a disagreeing row ' + (r.afterIncongruent.cost == null ? 'not enough rows yet' : ms(r.afterIncongruent.cost))
        + (r.adaptation == null ? '' : ' · Gratton ' + sign(r.adaptation));
    run = null; score();
  };
  q('[data-go]').addEventListener('click', () => {
    if (run) return;
    run = { trials: plan(TRIALS), i: 0, at: 0 };
    q('[data-go]').disabled = true; q('[data-state]').textContent = ''; show();
  });
  q('[data-keys]').addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('button');
    if (b && !b.disabled) answer(b.getAttribute('data-s'));
  });
  const onKey = (e) => {
    const s = { f: 'L', j: 'R' }[String(e.key).toLowerCase()];
    if (s && run && run.at) { e.preventDefault(); answer(s); }
  };
  doc.addEventListener('keydown', onKey);
  score();
  return () => { doc.removeEventListener('keydown', onKey); if (run && run.timer) clearTimeout(run.timer); };
}

function run(text, api) {
  if (!WHEN.test(String(text || '').trim().replace(/[?!.]+$/, '').replace(/\s+/g, ' '))) return 'none';
  const { showPage } = api;
  showPage((el) => { mount(el, el.ownerDocument || globalThis.document, globalThis.localStorage); });
  return 'flanker-cost';
}

export default {
  name: 'flanker-cost',
  about: 'The five arrows: answer the middle one, and see what disagreeing neighbours cost you in milliseconds, split by the row before (the Gratton effect).',
  examples: ['the five arrows', 'flanker test', 'the flanker cost', 'gratton effect'],
  nearMisses: ['test my attention', 'the pointing arrow', 'attention field mind', 'make an arrow', 'what is attention'],
  match(lower, text) { return WHEN.test(String(text || lower || '').trim().replace(/[?!.]+$/, '').replace(/\s+/g, ' ')); },
  run,
  plan, sitting, across, selftest,
};

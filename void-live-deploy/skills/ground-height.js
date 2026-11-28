/**
 * ground-height skill — the unanswered gardening question (Stack Exchange 23378): in a landscape design with
 * slopes, height grids and terraces layered over each other, what is the finished ground height at a point?
 * The program may not print one number at the cursor, so this card uses the method that works in any design:
 * start from the existing height at a reference point, add every layer's change at the point you care about,
 * then compare finished heights to read the drainage fall. No outside code is used; the question is credited
 * and linked on the card under CC BY-SA 3.0.
 * Contract: { name, examples, nearMisses, match(lower, text), run(text, api), finishedHeight, parseGroundAsk }
 */
export const about = 'A finished ground height calculator for landscape designs: starting height, slope over distance, terrace or grid offset, and the fall between two points.';

const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[?!.,]+$/, '').replace(/\s+/g, ' ').trim();
const round = (n) => Math.round(n * 1000) / 1000;

/** true for asks about the finished height of a designed ground surface, not a review or a general height question. Pure. */
export function groundAsk(text) {
  const t = norm(text);
  if (!t) return false;
  if (/\b(?:final|finished|actual)\s+(?:ground\s+)?(?:height|elevation|grade)\b/.test(t)) return true;
  if (/\bground\s+height\b/.test(t) && /\b(?:calculate|design|landscape|slope|terrace|fill|grid)\b/.test(t)) return true;
  if (/\b(?:realtime|landscape)\b/.test(t) && /\bheight\b/.test(t) && /\b(?:design|program|plan|model)\b/.test(t)) return true;
  return false;
}

/** pull typed numbers out of an ask; anything absent falls back to the example on the card. Pure. */
export function parseGroundAsk(text) {
  const t = norm(text), num = '(-?\\d+(?:\\.\\d+)?)', unit = '(ft|feet|foot|m|meters?|metres?)?';
  const grab = (re) => { const m = re.exec(t); return m ? Number(m[1]) : null; };
  return {
    base: grab(new RegExp('(?:base|starting|existing|start)(?:\\s+(?:height|elevation))?\\s*(?:of|at|=|:)?\\s*' + num + '\\s*' + unit)),
    grade: grab(new RegExp('(?:grade|slope)(?:\\s+of|\\s*=|\\s*:)?\\s*' + num + '\\s*%')) ?? grab(new RegExp(num + '\\s*%\\s*(?:grade|slope|fall|rise)')),
    distance: grab(new RegExp('(?:over|across|for|distance\\s+of)\\s*' + num + '\\s*' + unit)),
    offset: (() => {
      const fill = grab(new RegExp('(?:fill|add|raise|terrace|height\\s*grid)(?:\\s+of|\\s*=|\\s*:)?\\s*\\+?' + num));
      if (fill !== null) return fill;
      const cut = grab(new RegExp('(?:cut|lower)(?:\\s+of|\\s*=|\\s*:)?\\s*' + num));
      return cut === null ? null : -Math.abs(cut);
    })(),
  };
}

/** finished height from a reference point, in one consistent unit. Pure, with no DOM or network. */
export function finishedHeight({ base = 0, grade = 0, distance = 0, offset = 0 } = {}) {
  const rise = round((Number(grade) / 100) * Number(distance));
  const change = round(rise + Number(offset));
  return {
    base: round(Number(base)),
    rise,
    offset: round(Number(offset)),
    change,
    final: round(Number(base) + change),
    fallPer100: Number(distance) !== 0 ? round((change / Number(distance)) * 100) : null,
  };
}

/** the card's markup from the finished numbers, escaped by the caller. Pure. */
export function cardHtml(v, unit, esc) {
  const U = esc(unit);
  return '<h2>Final ground height at a point</h2>'
    + '<div class="sub">A landscape grade with slopes, terraces and height grids · all heights in ' + U + '</div>'
    + '<p>A design program can stack a slope, a terrace and a height grid over the existing ground. The height you would stake out is the existing height at a reference point plus every layer that acts at your point. To check drainage, do this at two points and compare: water runs from the higher finished height to the lower one.</p>'
    + '<div style="display:grid;grid-template-columns:auto 1fr;gap:8px 12px;align-items:center;max-width:380px;margin:12px 0">'
    + '<label for="gh-base">Starting height</label><input id="gh-base" type="number" step="any" value="' + esc(v.base) + '">'
    + '<label for="gh-grade">Slope (%)</label><input id="gh-grade" type="number" step="any" value="' + esc(v.grade) + '">'
    + '<label for="gh-dist">Distance from start</label><input id="gh-dist" type="number" step="any" min="0" value="' + esc(v.distance) + '">'
    + '<label for="gh-offset">Terrace / grid change</label><input id="gh-offset" type="number" step="any" value="' + esc(v.offset) + '"></div>'
    + '<div id="gh-out" aria-live="polite" style="font-size:32px;font-weight:300;line-height:1.2"></div>'
    + '<div id="gh-parts" style="color:var(--muted);font-size:14px;line-height:1.5;margin:8px 0"></div>'
    + '<p style="color:var(--muted)">A 2% slope is 2 ' + U + ' of rise per 100 ' + U + ' of run. Keep every height and distance in the same unit; a cut is a negative change and fill is positive. This is the arithmetic you can also do with the program’s own elevation labels at each point.</p>'
    + '<div class="src">Question answered: <a href="https://gardening.stackexchange.com/questions/23378/realtime-landscape-plus-design-program-final-ground-height" target="_blank" rel="noopener">Gardening Stack Exchange 23378</a> (CC BY-SA 3.0) · formula: finished height = starting height + grade × distance + layer changes · as of 2026-11</div>';
}

function run(text, api) {
  const { showPage, esc } = api;
  const given = parseGroundAsk(text);
  const input = {
    base: given.base ?? 100,
    grade: given.grade ?? 2,
    distance: given.distance ?? 30,
    offset: given.offset ?? 0,
  };
  const unit = /\b(?:metres?|meters?|m)\b/i.test(text || '') ? 'm' : 'ft';
  const el = showPage((p) => { p.innerHTML = cardHtml({ ...input, ...finishedHeight(input) }, unit, esc); });
  const q = (id) => el.querySelector('#' + id), out = q('gh-out'), parts = q('gh-parts');
  const read = () => ({ base: +q('gh-base').value, grade: +q('gh-grade').value, distance: +q('gh-dist').value, offset: +q('gh-offset').value });
  const upd = () => {
    const v = read(), r = finishedHeight(v);
    out.textContent = r.final + ' ' + unit + ' finished';
    parts.textContent = r.base + ' ' + unit + ' starting ' + (r.rise < 0 ? '−' : '+') + ' ' + Math.abs(r.rise) + ' ' + unit + ' slope '
      + (r.offset < 0 ? '−' : '+') + ' ' + Math.abs(r.offset) + ' ' + unit + ' layers = ' + r.final + ' ' + unit
      + (r.fallPer100 === null ? '' : '; ' + r.fallPer100 + '% average change over the run');
  };
  ['gh-base', 'gh-grade', 'gh-dist', 'gh-offset'].forEach((id) => q(id).addEventListener('input', upd));
  upd();
  const r = finishedHeight(input);
  const typed = [given.base, given.grade, given.distance, given.offset].some((n) => n !== null);
  api.say(typed
    ? 'Your finished ground height is ' + r.final + ' ' + unit + ': the starting height plus ' + r.rise + ' from the slope and ' + r.offset + ' from terraces or height grids. Compare two points to see which way water runs.'
    : 'I put a finished-elevation calculator on the stage. The height at a point is your starting height plus the slope over distance plus any terrace or height-grid change; do it at two points to read the drainage fall. Type your design’s numbers in the boxes.');
  return 'ground-height';
}

export default {
  name: 'ground-height',
  examples: [
    'Realtime landscape plus design program, final ground height',
    'final ground height of my landscape design',
    'calculate final ground height from slope and fill',
    'finished elevation calculator for a sloped yard',
    'actual height of a terrace in my landscape design',
  ],
  nearMisses: [
    'Realtime Landscaping Plus review',
    'final exam grade needed',
    'slope percent to degrees',
    'how to build a garden terrace',
    'what is my elevation',
  ],
  finishedHeight,
  parseGroundAsk,
  match(lower, text) { return groundAsk(text || lower); },
  run,
  suite() {
    const a = finishedHeight({ base: 100, grade: 2, distance: 30, offset: 0.5 });
    return { ok: a.final === 101.1 && a.rise === 0.6 && !groundAsk('slope percent to degrees') && groundAsk('final ground height'), got: 'base + slope + layer change, and only height asks route here' }; // void-review: ok (round() already snaps to thousandths; both sides are that same value)
  },
};

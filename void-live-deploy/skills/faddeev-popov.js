/**
 * faddeev-popov skill — the unanswered physics question (Stack Exchange 221848): how the Faddeev-Popov method works
 * on a toy integral I = ∬ e^(−(x²+y²)) dx dy. The redundant direction is a rotation; the gauge orbit is a circle of
 * fixed radius; the gauge condition y_φ = 0 cuts each circle twice, which is where the naive factor of two comes from.
 * The card shows the four insertion steps, an interactive determinant/slice check and the three ways to get π.
 * No outside code is used; the question is linked and credited CC BY-SA 4.0.
 * Contract: { name, examples, nearMisses, match(lower, text), run(text, api), rotatePoint, fpFactor, sliceAngle, toyRoutes, fpAsk }
 */
export const about = 'A worked Faddeev-Popov example on the Gaussian integral: gauge orbits as circles, the determinant x cos φ − y sin φ, inserting the delta function, and the factor of two from the residual gauge.';

const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[?!.,]+$/, '').replace(/\s+/g, ' ').trim();

/** true for asks about the Faddeev-Popov trick worked on a toy/simple integral or gauge fixing by a delta function. Pure. */
export function fpAsk(text) {
  const t = norm(text);
  if (!t) return false;
  if (/faddeev[-\s]?popov|faddeev and popov/.test(t)) return true;
  if (/\b(toy|simple)\b.*\bgauge\b.*\bintegral\b/.test(t)) return true;
  if (/\bgauge fix(ing)?\b.*\bdelta function\b/.test(t)) return true;
  return false;
}

/** rotate (x, y) by phi counter-clockwise; determinant 1, so dx dy is unchanged. Pure. */
export function rotatePoint(x, y, phi) {
  const c = Math.cos(phi), s = Math.sin(phi);
  return { x: x * c - y * s, y: x * s + y * c };
}

/** ∂F/∂φ for F = y_φ = x sin φ + y cos φ is x cos φ − y sin φ = x_φ; the FP factor is its modulus. Pure. */
export function fpFactor(x, y, phi) {
  return Math.abs(x * Math.cos(phi) - y * Math.sin(phi));
}

/** the angle where y_φ = 0: x sin φ + y cos φ = 0 ⇒ tan φ = −y/x. Pure. */
export function sliceAngle(x, y) {
  return Math.atan2(-y, x);
}

/**
 * The three consistent counts for ∬ e^(−(x²+y²)) dx dy. Values are in units of π: the orbit volume is 2 (2π)
 * or 1 (π after identifying φ~φ+π); the slice integral is 1 over x∈ℝ (∫|x|e^(−x²)dx) or 1/2 over x>0.
 * Pure, with no DOM or network.
 */
export function toyRoutes() {
  return {
    naive: { orbit: 2, slice: 1, result: 2, label: 'full slice, full orbit (double counts)' },
    half: { orbit: 2, slice: 0.5, result: 1, label: 'restrict the slice to x > 0' },
    shared: { orbit: 1, slice: 1, result: 1, label: 'identify φ ~ φ + π' },
  };
}

const fmt = (n) => Number.isInteger(n) ? String(n) : (Math.round(n * 1000) / 1000).toString();
const piLabel = (n) => n === 1 ? 'π' : (n === 2 ? '2π' : fmt(n) + 'π');

/** the card's markup from the worked values, escaped by the caller. Pure. */
export function cardHtml(v, esc) {
  const U = esc(v.unit);
  return '<h2>Faddeev–Popov on a toy integral</h2>'
    + '<div class="sub">I = ∬ e<sup>−(x²+y²)</sup> dx dy · the redundant coordinate is an angle · all angles in ' + U + '</div>'
    + '<p><b>1 · Find the orbit.</b> The integrand only depends on r² = x² + y², so every rotation of a point gives the same contribution. The gauge orbits are concentric circles, and the angle φ along a circle is counted many times. Faddeev and Popov insert 1 in a way that trades that angle for a delta function on a chosen slice.</p>'
    + '<p><b>2 · Insert unity.</b> With F(x<sub>φ</sub>, y<sub>φ</sub>) = y<sub>φ</sub> = x sin φ + y cos φ, '
    + '1 = ∫ dφ δ(F) |∂F/∂φ|. That turns ∫dx dy into ∫dφ ∫dx dy δ(y<sub>φ</sub>) |∂F/∂φ| — the ∫dφ is the orbit volume you wanted to factor out.</p>'
    + '<p><b>3 · The determinant.</b> ∂F/∂φ = x cos φ − y sin φ = x<sub>φ</sub>. On the slice it is ±r, so the Faddeev–Popov factor is r. Differentiate <i>before</i> setting φ = 0: at φ = 0 the factor is |x|, not x, and the modulus is what keeps the measure positive.</p>'
    + '<p><b>4 · Do the integral.</b> Rotating the variables back leaves ∫₀<sup>2π</sup>dφ · ∫<sub>−∞</sub><sup>∞</sup>|x|e<sup>−x²</sup>dx = 2π × 1 = 2π — twice the true π. The slice y = 0 cuts each circle at <i>both</i> +r and −r, so φ → φ + π is still gauge. Divide the orbit volume by two (or keep only x &gt; 0) and you get π.</p>'
    + '<div style="max-width:420px;margin:12px 0;padding:12px;border:1px solid var(--line);border-radius:8px">'
    + '<div style="font-size:15px;margin-bottom:8px">Check the determinant at a point</div>'
    + '<div style="display:grid;grid-template-columns:auto 1fr;gap:8px 12px;align-items:center">'
    + '<label for="fp-x">x</label><input id="fp-x" type="number" step="any" value="' + esc(v.x) + '">'
    + '<label for="fp-y">y</label><input id="fp-y" type="number" step="any" value="' + esc(v.y) + '">'
    + '<label for="fp-deg">φ (' + U + ')</label><input id="fp-deg" type="number" step="any" value="' + esc(v.deg) + '"></div>'
    + '<div id="fp-live" aria-live="polite" style="margin-top:10px;line-height:1.5"></div></div>'
    + '<div style="max-width:420px;margin:12px 0"><label for="fp-route">How to count the orbits</label> '
    + '<select id="fp-route"><option value="naive">Naive: keep both halves</option><option value="half">Keep x &gt; 0</option><option value="shared">Identify φ ~ φ + π</option></select>'
    + '<div id="fp-result" aria-live="polite" style="font-size:28px;font-weight:300;margin-top:8px"></div>'
    + '<div id="fp-note" style="color:var(--muted);font-size:14px"></div></div>'
    + '<p style="color:var(--muted)">The real value is π. The Faddeev–Popov determinant handles the change of variables; it does <i>not</i> by itself remove a residual gauge symmetry. A gauge condition that intersects an orbit more than once still overcounts.</p>'
    + '<div class="src">Question answered: <a href="https://physics.stackexchange.com/questions/221848/how-to-apply-the-faddeev-popov-method-to-a-simple-integral" target="_blank" rel="noopener">Physics Stack Exchange 221848</a> (CC BY-SA 4.0) · determinant |∂F/∂φ| = |x cos φ − y sin φ| · as of 2026-11</div>';
}

function run(text, api) {
  const { showPage, esc } = api;
  const deg = Math.round(sliceAngle(1, 1) * 180 / Math.PI); // -45°: the slice through the seed point, where the determinant is √2
  const seed = { x: 1, y: 1, deg, routes: toyRoutes() };
  const live = (x, y, d) => {
    const phi = d * Math.PI / 180, r = rotatePoint(x, y, phi);
    return {
      x, y, deg: d, unit: 'degrees', rot: r, factor: fpFactor(x, y, phi),
      slice: sliceAngle(x, y) * 180 / Math.PI, routes: toyRoutes(),
    };
  };
  const v = live(seed.x, seed.y, seed.deg);
  const el = showPage((p) => { p.innerHTML = cardHtml(v, esc); });
  const q = (id) => el.querySelector('#' + id);
  const degText = (d) => fmt(d);
  const upd = () => {
    const x = +q('fp-x').value, y = +q('fp-y').value, d = +q('fp-deg').value;
    const w = live(x, y, d);
    q('fp-live').innerHTML = 'rotated point = (' + fmt(w.rot.x) + ', ' + fmt(w.rot.y) + ')'
      + '<br>the slice y<sub>φ</sub> = 0 is reached at φ = ' + degText(fmt(w.slice)) + '°'
      + '<br>Faddeev–Popov factor |∂F/∂φ| = ' + fmt(w.factor)
      + (Math.abs(w.rot.y) < 0.001 ? ' <span style="color:var(--muted)">— on the slice</span>' : '');
  };
  const route = q('fp-route');
  const updRoute = () => {
    const r = route.value, o = toyRoutes()[r] || toyRoutes().naive;
    q('fp-result').textContent = piLabel(o.result) + ' = ' + piLabel(o.orbit) + ' × ' + fmt(o.slice);
    q('fp-note').textContent = o.label + (o.result === 1 ? ' — the right answer.' : ' — each circle is counted twice.');
  };
  ['fp-x', 'fp-y', 'fp-deg'].forEach((id) => q(id).addEventListener('input', upd));
  route.addEventListener('change', updRoute);
  upd(); updRoute();
  api.say('The Faddeev–Popov trick inserts 1 = ∫dφ δ(y_φ)|∂F/∂φ| with |∂F/∂φ| = |x cos φ − y sin φ|. On the Gaussian it gives 2π unless you remove the residual φ → φ + π: the slice y = 0 hits each circle twice. Fix that and the integral is π.');
  return 'faddeev-popov';
}

export default {
  name: 'faddeev-popov',
  examples: [
    'How to apply the Faddeev-Popov method to a simple integral',
    'faddeev popov method toy example gaussian integral',
    'what is the faddeev popov determinant in a simple example',
    'faddeev popov ghosts explained with a simple integral',
    'gauge fixing with a delta function in an integral',
  ],
  nearMisses: [
    'gaussian integral calculator',
    'solve my physics homework problem',
    'explain quantum field theory from scratch',
    'gauge theory in one minute',
    'what is a ghost field in quantum field theory',
  ],
  rotatePoint,
  fpFactor,
  sliceAngle,
  toyRoutes,
  fpAsk,
  match(lower, text) { return fpAsk(text || lower); },
  run,
  suite() {
    const r = rotatePoint(1, 1, -Math.PI / 4);
    const t = toyRoutes();
    return {
      ok: Math.abs(r.x - Math.SQRT2) < 1e-9 && Math.abs(r.y) < 1e-9
        && Math.abs(fpFactor(1, 1, -Math.PI / 4) - Math.SQRT2) < 1e-9
        && Math.abs(sliceAngle(1, 1) + Math.PI / 4) < 1e-9
        && t.naive.result === 2 && t.half.result === 1 && t.shared.result === 1
        && fpAsk('How to apply the Faddeev-Popov method to a simple integral') && !fpAsk('gaussian integral calculator'),
      got: 'orbit rotation, determinant and the three counts, and only FP asks route here',
    };
  },
};

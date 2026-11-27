// Teardown gaps (VR2.2): token overlap of a spec feature against a Verse inventory [{ name, path, words }].
// has >= 0.6, part >= 0.3, otherwise gap. The caller builds the inventory. Tests: tools/teardown-gap.test.mjs.
export const THRESHOLDS = Object.freeze({ has: 0.6, part: 0.3 });
const STOP = new Set('the a an of and for to in on with from into its your this that'.split(' '));

/** a light stem so "units" and "converter" meet "unit" and "convert". Pure. */
export function stem(w) {
  let s = String(w || '').toLowerCase();
  if (s.endsWith('ing') && s.length > 5) s = s.slice(0, -3);
  else if (s.endsWith('ers') && s.length > 5) s = s.slice(0, -3);
  else if (s.endsWith('er') && s.length > 4) s = s.slice(0, -2);
  else if (s.endsWith('or') && s.length > 4) s = s.slice(0, -2);
  else if (s.endsWith('s') && !s.endsWith('ss') && s.length > 3) s = s.slice(0, -1);
  return s;
}

/** distinct stems, stop words dropped. Pure. */
export function tokens(text) {
  const out = [];
  for (const w of String(text || '').toLowerCase().match(/[a-z0-9]+/g) || []) {
    if (w.length < 3 || STOP.has(w)) continue;
    const s = stem(w);
    if (s.length > 2 && !out.includes(s)) out.push(s);
  }
  return out;
}

/** share of the feature's stems that the inventory line also has, 0 to 1. Pure. */
export function overlap(feature, item) {
  const A = tokens(feature), B = new Set(tokens(item));
  if (!A.length || !B.size) return 0;
  let n = 0;
  for (const t of A) if (B.has(t)) n++;
  return n / A.length;
}

export function verdictOf(score) {
  if (score >= THRESHOLDS.has) return 'has';
  if (score >= THRESHOLDS.part) return 'part';
  return 'gap';
}

/** gaps(spec, inventory) -> [{ feature, verdict, evidence }]. Pure: neither argument is changed. */
export function gaps(spec, inventory) {
  const features = (spec && spec.features) || [];
  const rows = Array.isArray(inventory) ? inventory : [];
  return features.map((f) => {
    const name = String(f && (f.name || f.feature) || '').replace(/\s+/g, ' ').trim();
    let best = { score: 0, path: '' };
    for (const item of rows) {
      const score = overlap(name, [item && item.name, item && item.words].filter(Boolean).join(' '));
      if (score > best.score) best = { score, path: String((item && item.path) || '') };
    }
    const verdict = verdictOf(best.score);
    return { feature: name, verdict, evidence: verdict === 'gap' ? '' : best.path };
  });
}

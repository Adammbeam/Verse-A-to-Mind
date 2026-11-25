// When does heat mortality show? Splits the 2023 Florida Acropora survey rows
// (Manzello, Cunning et al., Science 390:361-366, 23 Oct 2025; data github.com/jrcunning/FLAcro23)
// by survey date and refits the paper's two-parameter log-logistic dose-response in each window,
// then follows the same site and species across repeat surveys after its dose stopped rising.
// Reads 2026 field-observation doses from NOAA Coral Reef Watch single-pixel stations.
// Usage: node acropora-mortality-timing.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const csv = (f) => { const [h, ...r] = readFileSync(join(here, f), 'utf8').trim().split('\n'); const k = h.split(','); return r.map((l) => Object.fromEntries(l.split(',').map((v, i) => [k[i], v]))); };
const rows = csv('flacro23-mortality-2023.csv').map((r) => ({ site: r.siteclust, sub: r.subregion, date: r.date, sp: r.species, type: r.coral_type, x: +r.cummaxdhw, n: +r.n_total, dead: +r.n_dead, p: +r.pct_mort })).filter((r) => r.x > 0 && r.n > 0);
const f = (x, b, e) => 1 / (1 + Math.exp(b * (Math.log(x) - Math.log(e))));
function nll(d, b, e) { let s = 0; for (const r of d) { const q = Math.min(1 - 1e-9, Math.max(1e-9, f(r.x, b, e))); s -= r.n * (r.p * Math.log(q) + (1 - r.p) * Math.log(1 - q)); } return s; }
function fit(d) {
  let pts = [[-3, Math.log(9)], [-5, Math.log(9)], [-3, Math.log(13)]];
  const F = (v) => nll(d, v[0], Math.exp(v[1]));
  for (let it = 0; it < 800; it++) {
    pts.sort((a, c) => F(a) - F(c));
    const c = [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2];
    const w = pts[2], r = [2 * c[0] - w[0], 2 * c[1] - w[1]];
    if (F(r) < F(pts[0])) { const ex = [3 * c[0] - 2 * w[0], 3 * c[1] - 2 * w[1]]; pts[2] = F(ex) < F(r) ? ex : r; }
    else if (F(r) < F(pts[1])) pts[2] = r;
    else { const k = [(c[0] + w[0]) / 2, (c[1] + w[1]) / 2]; if (F(k) < F(w)) pts[2] = k; else pts = [pts[0], ...pts.slice(1).map((p) => [(p[0] + pts[0][0]) / 2, (p[1] + pts[0][1]) / 2])]; }
  }
  pts.sort((a, c) => F(a) - F(c)); return { b: pts[0][0], e: Math.exp(pts[0][1]) };
}
const windows = [['during heat (to 30 Sep 2023)', '0000', '2023-10-01'], ['fall (Oct-Dec 2023)', '2023-10-01', '2024-01-01'], ['next spring (Jan-May 2024)', '2024-01-01', '9999']];
// 2026 dated field observations and the NOAA DHW on that day
const obs = [
  ['Carysfort 2026-08-28 (CRF: all outplants faring well)', 10.78],
  ['Dry Tortugas ~2026-09-15 (NCRMP/DRM: no recent mortality seen)', 11.92],
  ['Dry Tortugas 2026 season peak', 13.70],
];
console.log('window,species,rows,colonies,pooled_mort,ED50,' + obs.map((o) => `pred@${o[1]}`).join(','));
for (const [label, a, b] of windows) for (const sp of ['APAL', 'ACER']) {
  const d = rows.filter((r) => r.sp === sp && r.date >= a && r.date < b);
  const col = d.reduce((s, r) => s + r.n, 0), dead = d.reduce((s, r) => s + r.dead, 0);
  const m = fit(d);
  console.log([label, sp, d.length, col, (100 * dead / col).toFixed(0) + '%', m.e.toFixed(1), ...obs.map((o) => (100 * f(o[1], m.b, m.e)).toFixed(0) + '%')].join(','));
}
// Same site and species, repeat surveys at a dose that had stopped rising (within 0.2 DHW)
console.log('\nsite,subregion,species,type,dose,first_date,first_mort,last_date,last_mort,days');
const key = (r) => [r.site, r.sp, r.type].join('|');
const by = {}; for (const r of rows) (by[key(r)] ??= []).push(r);
const lags = [];
for (const k of Object.keys(by)) {
  const s = by[k].sort((x, y) => x.date.localeCompare(y.date));
  const top = Math.max(...s.map((r) => r.x));
  const flat = s.filter((r) => r.x >= top - 0.2 && r.n >= 20);
  if (flat.length < 2) continue;
  const [a, z] = [flat[0], flat.at(-1)];
  const days = Math.round((Date.parse(z.date) - Date.parse(a.date)) / 864e5);
  if (days < 30) continue;
  lags.push(z.p - a.p);
  console.log([a.site, a.sub, a.sp, a.type, top.toFixed(2), a.date, (100 * a.p).toFixed(0) + '%', z.date, (100 * z.p).toFixed(0) + '%', days].join(','));
}
const up = lags.filter((x) => x > 0.05).length;
console.log(`\nrepeat series: ${lags.length}; mortality rose by more than 5 points in ${up}; median rise ${(100 * lags.sort((x, y) => x - y)[Math.floor(lags.length / 2)]).toFixed(0)} points`);

// Heat intensity beside heat dose: days at or above 31.5 C (1 May to 30 Nov) per station and year.
const BASE = 'https://coralreefwatch.noaa.gov/product/vs_single_pixel_exp/data/';
const ST = [['Key Biscayne Cluster', 'AtlanticOcean_Florida_SoutheastFlorida_KeyBiscayneCluster.txt'], ['Dry Tortugas Nursery', 'AtlanticOcean_Florida_FloridaKeys_DryTortugasNursery.txt'], ['Carysfort Reef', 'AtlanticOcean_Florida_FloridaKeys_CarysfortReef.txt'], ['Looe Key Reef', 'AtlanticOcean_Florida_FloridaKeys_LooeKeyReef.txt'], ['Eastern Dry Rocks', 'AtlanticOcean_Florida_FloridaKeys_EasternDryRocks.txt'], ['Tavernier Nurseries', 'AtlanticOcean_Florida_FloridaKeys_TavernierNurseries.txt']];
try {
  console.log('\nstation,year,peak_dhw,days_sst_ge_31.5,days_sst_ge_32,dhw_on_day_31.5_ends');
  for (const [name, file] of ST) {
    const t = await (await fetch(BASE + file)).text();
    const R = t.split(/\r?\n/).map((l) => l.split(',').map((s) => s.trim())).filter((p) => /^\d{4}$/.test(p[0])).map((p) => ({ d: `${p[0]}-${p[1]}-${p[2]}`, sst: +p[3], dhw: +p[6] }));
    for (const y of ['2023', '2026']) {
      const s = R.filter((r) => r.d >= `${y}-05-01` && r.d <= `${y}-11-30`);
      const hot = s.filter((r) => r.sst >= 31.5);
      console.log([name, y, Math.max(...s.map((r) => r.dhw)).toFixed(2), hot.length, s.filter((r) => r.sst >= 32).length, hot.length ? hot.at(-1).dhw.toFixed(2) : '-'].join(','));
    }
  }
} catch (e) { console.log('NOAA fetch skipped:', e.message); }

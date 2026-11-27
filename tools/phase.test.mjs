// lib/phase.js: Phase, the see-through layer (run: node --test tools/phase.test.mjs)
import test from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { phaseAsk, phaseLink, keyMask, applyMask, place, clipType, clipName, packPage, unpackPage, numbersOf, satchelAdd, satchelGet, satchelPut, SATCHEL_MAX, PAGE_MAX, parseCssColor, firstCssColor, phaseBlend, contrastRatio } from '../void-live-deploy/lib/phase.js';

test('asks that open Phase, and which put you in the scene', () => {
  for (const a of ['phase', 'Phase.', 'see through', 'see-through mode', 'turn on phase', 'satchel']) assert.deepEqual(phaseAsk(a), { in: false }, a);
  for (const a of ['phase in', 'phase me in', 'put me in the video']) assert.deepEqual(phaseAsk(a), { in: true }, a);
  for (const a of ['phases of the moon', 'what is a phase', 'see through walls', 'phase 2 of the plan', '']) assert.equal(phaseAsk(a), null, a);
  assert.equal(phaseLink({ in: true }), '/phase/?in=1'); assert.equal(phaseLink({ in: false }), '/phase/');
});

test('the room is keyed out where the picture matches the learned plate, with a soft edge', () => {
  const plate = new Uint8ClampedArray([10, 10, 10, 255, 10, 10, 10, 255, 10, 10, 10, 255]);
  const cur = new Uint8ClampedArray([12, 11, 10, 255, 200, 40, 40, 255, 30, 30, 30, 255]);
  const m = keyMask(cur, plate, 40, 24);
  assert.equal(m[0], 0); assert.equal(m[1], 255); assert.ok(m[2] > 0 && m[2] < 255, 'edge is partial: ' + m[2]);
  applyMask(cur, m); assert.equal(cur[3], 0); assert.equal(cur[7], 255);
});

test('a placed layer keeps its aspect and its centre inside the frame', () => {
  assert.deepEqual(place({ x: 0.5, y: 0.5, size: 0.5 }, 1000, 800, 100, 200), { x: 400, y: 200, w: 200, h: 400 });
  const p = place({ x: 9, y: -3, size: 7 }, 100, 100, 1, 1); assert.deepEqual(p, { x: 50, y: -50, w: 100, h: 100 });
});

test('a clip is recorded in the best type the browser has, under a dated name', () => {
  assert.equal(clipType((t) => t === 'video/webm'), 'video/webm');
  assert.equal(clipType((t) => /vp9/.test(t)), 'video/webm;codecs=vp9');
  assert.equal(clipType(() => false), '');
  assert.equal(clipName(new Date(2026, 10, 25, 19, 3)), 'phase-2026-11-25-1903.webm');
  assert.equal(clipName(new Date(2026, 0, 2, 9, 30), 'video/mp4'), 'phase-2026-01-02-0930.mp4');
});

test('page words travel in the #fragment, capped, and bad input is refused', () => {
  const h = packPage({ title: 'T', url: 'https://x.test/', text: 'a  b\n c' }); assert.ok(h.startsWith('#page='));
  assert.deepEqual(unpackPage(h), { title: 'T', url: 'https://x.test/', text: 'a b c' });
  assert.equal(unpackPage(packPage({ text: 'x'.repeat(9000) })).text.length, PAGE_MAX);
  for (const bad of ['', '#other=1', '#page=%7B', '#page=' + encodeURIComponent('{"x":"  "}')]) assert.equal(unpackPage(bad), null, bad);
});

test('numbers come out with the words before them', () => {
  const n = numbersOf('Total $1,250.50 and tax 8% on 3 items');
  assert.deepEqual(n.map((x) => x.value), ['$1,250.50', '8%', '3']); assert.equal(n[0].label, 'Total');
});

test('the Satchel keeps the newest first, capped, in this browser only', () => {
  let s = []; for (let i = 0; i < SATCHEL_MAX + 5; i++) s = satchelAdd(s, { kind: 'words', label: 'w' + i, data: 'd' }, i);
  assert.equal(s.length, SATCHEL_MAX); assert.equal(s[0].label, 'w' + (SATCHEL_MAX + 4));
  assert.equal(satchelAdd([], { kind: 'nope' })[0].kind, 'words');
  const mem = new Map(), store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.ok(satchelPut(s, store)); assert.equal(satchelGet(store).length, SATCHEL_MAX);
  mem.set('verse_satchel', '{oops'); assert.deepEqual(satchelGet(store), []);
});

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test('the glass takes the page colour and feathers to nothing, with a readable ask', () => {
  assert.deepEqual(parseCssColor('#abc'), [170, 187, 204, 1]);
  assert.deepEqual(parseCssColor('rgb(10, 20, 30)'), [10, 20, 30, 1]);
  assert.deepEqual(parseCssColor('rgba(10, 20, 30, 0.5)'), [10, 20, 30, 0.5]);
  assert.deepEqual(parseCssColor('rgb(10 20 30 / 40%)'), [10, 20, 30, 0.4]);
  assert.deepEqual(parseCssColor('transparent'), [0, 0, 0, 0]);
  assert.equal(parseCssColor('nope'), null);
  assert.deepEqual(firstCssColor('linear-gradient(rgb(230, 177, 90), #d98a4a)'), [230, 177, 90, 1]);
  const paper = [244, 225, 194];
  const warm = phaseBlend({ bg: [...paper, 1], accent: [29, 78, 137, 1] });
  assert.ok(warm.lum > 0.6, 'a light page stays light: ' + warm.lum);
  assert.ok(warm.contrast >= 4.5, 'ask contrast ' + warm.contrast);
  assert.equal(warm.veil[2][3], 0);
  assert.ok(warm.veil[0][3] > 0.5 && warm.veil[0][3] < 1);
  assert.ok(dist(warm.tint, paper) < 80, 'tint stays with the page: ' + dist(warm.tint, paper));
  assert.ok(dist(warm.tint, paper) < dist([16, 18, 28], paper) / 3, 'closer to the page than a fixed dark panel');
  const night = phaseBlend({ bg: [20, 24, 32, 1], accent: [142, 182, 255, 1] });
  assert.ok(night.lum < 0.2, 'a dark page stays dark: ' + night.lum);
  assert.ok(night.contrast >= 4.5);
  assert.equal(night.veil[2][3], 0);
  assert.ok(relInkIsLight(night.ink), 'dark page gets light ink');
  const teal = [31, 111, 120];
  const sea = phaseBlend({ bg: [...teal, 1], accent: [232, 244, 246, 1] });
  assert.ok(sea.contrast >= 4.5 && sea.veil[2][3] === 0);
  assert.ok(dist(sea.tint, teal) < dist([16, 18, 28], teal) / 2, 'teal tint stays with the page: ' + sea.tint);
  assert.ok(sea.tint[1] > sea.tint[0] && sea.tint[2] > sea.tint[0], 'the teal hue is kept');
  const gold = [230, 168, 74];
  const sun = phaseBlend({ bg: [...gold, 1], accent: [29, 78, 137, 1] });
  assert.ok(dist(sun.tint, gold) < dist([16, 18, 28], gold) / 3, 'gold tint stays with the page: ' + sun.tint);
  assert.ok(sun.tint[0] > sun.tint[1] && sun.tint[1] > sun.tint[2], 'the gold hue is kept');
  const bare = phaseBlend({ bg: [0, 0, 0, 0], accent: null });
  assert.ok(bare.lum > 0.9 && bare.contrast >= 4.5 && bare.veil[2][3] === 0);
  for (let g = 0; g <= 255; g += 15) {
    const b = phaseBlend({ bg: [g, g + 10 > 255 ? 255 : g + 10, Math.max(0, g - 8), 1], accent: null });
    assert.ok(b.contrast >= 4.5, 'contrast at ' + g + ' is ' + b.contrast);
    assert.equal(b.veil[2][3], 0);
    assert.ok(contrastRatio(b.ink, b.field) >= 4.5);
    assert.ok(contrastRatio(b.ink, b.tint) >= 4.5);
  }
});

function relInkIsLight(ink) { return contrastRatio(ink, [255, 255, 255]) < contrastRatio(ink, [0, 0, 0]); }

test('the overlay carries the same blend, a feathered mask, and no motion when motion is reduced', () => {
  const src = readFileSync(new URL('../void-live-deploy/phase/overlay.js', import.meta.url), 'utf8');
  const block = src.match(/\/\*blend\*\/([\s\S]*?)\/\*\/blend\*\//);
  assert.ok(block, 'blend markers');
  const local = new Function(block[1] + '\nreturn { phaseBlend, parseCssColor };')();
  const sample = { bg: [244, 225, 194, 1], accent: [29, 78, 137, 1] };
  assert.deepEqual(local.phaseBlend(sample), phaseBlend(sample));
  assert.deepEqual(local.phaseBlend({ bg: [20, 24, 32, 1], accent: null }), phaseBlend({ bg: [20, 24, 32, 1], accent: null }));
  assert.match(src, /mask-image:radial-gradient/);
  assert.match(src, /prefers-reduced-motion:\s*reduce/);
  assert.match(src, /\.bar\{[^}]*border:0/);
  assert.doesNotMatch(src, /border:1px/);
});

// lib/phase.js: Phase, the see-through layer (run: node --test tools/phase.test.mjs)
import test from 'node:test'; import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { phaseAsk, phaseLink, keyMask, applyMask, place, clipType, clipName, packPage, unpackPage, numbersOf, satchelAdd, satchelGet, satchelPut, SATCHEL_MAX, PAGE_MAX, findSpans, cssColor, phaseTone, placeNote } from '../void-live-deploy/lib/phase.js';

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

test('a find keeps every match, and a second phrase is not thrown off by the first', () => {
  const page = 'Invoice 42 is due. The second line also says invoice 42.';
  assert.deepEqual(findSpans(page, 'invoice'), [[0, 7], [45, 52]]);
  assert.deepEqual(findSpans(page, 'invoice 42'), [[0, 10], [45, 55]]);
  assert.deepEqual(findSpans(page, 'invoice'), [[0, 7], [45, 52]]);
  assert.deepEqual(findSpans('', 'a'), []);
  assert.deepEqual(findSpans('aaaa', 'aa', 2), [[0, 2], [2, 4]]);
});

test('a note takes the page colours and sits on the words, above the ask bar', () => {
  assert.deepEqual(cssColor('rgb(244, 239, 230)'), { r: 244, g: 239, b: 230, a: 1 });
  assert.equal(cssColor('rgba(10, 20, 30, 0.5)').a, 0.5);
  assert.equal(cssColor('rgb(1 2 3 / 40%)').a, 0.4);
  assert.equal(cssColor('transparent'), null);
  const light = phaseTone({ r: 42, g: 36, b: 28, a: 1 }, { r: 244, g: 239, b: 230, a: 1 });
  assert.equal(light.scheme, 'light');
  assert.match(light.ink, /^rgba\(42,36,28,/);
  assert.match(light.wash, /^rgba\(/);
  const dark = phaseTone({ r: 231, g: 226, b: 216, a: 1 }, { r: 18, g: 21, b: 28, a: 1 });
  assert.equal(dark.scheme, 'dark');
  assert.match(dark.line, /0\.7\)$/);
  const above = placeNote({ x: 80, y: 240, w: 120, h: 28 }, { w: 180, h: 36 }, { w: 800, h: 700 }, 640);
  assert.equal(above.top, 240 - 36 - 8);
  const flipped = placeNote({ x: 80, y: 12, w: 120, h: 20 }, { w: 180, h: 36 }, { w: 800, h: 700 }, 640);
  assert.equal(flipped.top, 12 + 20 + 8);
  const clear = placeNote({ x: 700, y: 500, w: 80, h: 20 }, { w: 200, h: 80 }, { w: 800, h: 700 }, 560);
  assert.ok(clear.top + 80 <= 560 - 8, 'note stays above the ask bar');
  assert.ok(clear.left + 200 <= 800 - 8, 'note stays inside the view');
});

test('the overlay script carries the same helpers it cannot import', () => {
  const src = readFileSync(new URL('../void-live-deploy/phase/overlay.js', import.meta.url), 'utf8');
  const grab = (name) => {
    const start = src.indexOf('function ' + name);
    assert.ok(start > 0, name);
    let depth = 0;
    for (let j = src.indexOf('{', start); j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') { depth--; if (!depth) return src.slice(start, j + 1); }
    }
    throw new Error('unclosed ' + name);
  };
  const box = {};
  vm.createContext(box);
  vm.runInContext([grab('findSpans'), grab('cssColor'), grab('phaseTone'), grab('placeNote'), 'this.api = { findSpans, cssColor, phaseTone, placeNote };'].join('\n'), box);
  const same = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b));
  const page = 'Invoice 42 is due. The second line also says invoice 42.';
  same(box.api.findSpans(page, 'invoice 42'), findSpans(page, 'invoice 42'));
  same(box.api.cssColor('rgb(1 2 3 / 40%)'), cssColor('rgb(1 2 3 / 40%)'));
  const fg = { r: 42, g: 36, b: 28, a: 1 }, bg = { r: 244, g: 239, b: 230, a: 1 };
  same(box.api.phaseTone(fg, bg), phaseTone(fg, bg));
  same(box.api.placeNote({ x: 700, y: 500, w: 80, h: 20 }, { w: 200, h: 80 }, { w: 800, h: 700 }, 560), placeNote({ x: 700, y: 500, w: 80, h: 20 }, { w: 200, h: 80 }, { w: 800, h: 700 }, 560));
  assert.match(src, /It reads the words only when you ask/);
  assert.doesNotMatch(src, /words read, here in your browser/);
});

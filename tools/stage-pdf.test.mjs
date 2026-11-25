// stage-pdf: a real PDF of the stage (or the picked note/card) made with the bundled pdf-lib, carrying the actual words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import vm from 'node:vm';
import sk, { stagePdfIntent, pdfDocOf } from '../void-live-deploy/skills/stage-pdf.js';
import { fromText } from '../void-live-deploy/lib/pdf-tools.js';

globalThis.self ??= globalThis; vm.runInThisContext(readFileSync(new URL('../void-live-deploy/vendor/pdf-lib-1.17.1/pdf-lib.min.js', import.meta.url), 'utf8'));
const L = globalThis.PDFLib;
const m = (t) => sk.match(t.toLowerCase(), t);
const wordsIn = (bytes) => {
  const s = Buffer.from(bytes).toString('latin1'), bits = [];
  for (const m of s.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    for (const cand of [m[1], m[1].replace(/\r?\n$/, '')]) { try { bits.push(inflateSync(Buffer.from(cand, 'latin1')).toString('latin1')); break; } catch {} }
  }
  const body = bits.join('\n'), out = [];
  for (const m of body.matchAll(/<([0-9A-Fa-f]+)>/g)) out.push(Buffer.from(m[1], 'hex').toString('latin1'));
  for (const m of body.matchAll(/\(([^\\)]*(?:\\.[^\\)]*)*)\)/g)) out.push(m[1]);
  return out.join('\n');
};



test('examples in, near misses out, and nearby wordings', () => {
  for (const e of sk.examples) assert.ok(m(e), e);
  for (const n of sk.nearMisses) assert.ok(!m(n), n);
  assert.equal(stagePdfIntent('save the stage as a pdf').scope, 'stage');
  assert.equal(stagePdfIntent('this note as a pdf').scope, 'picked');
  assert.equal(stagePdfIntent('save this as a pdf').scope, 'picked');
  assert.equal(stagePdfIntent('make a pdf of the stage').scope, 'stage');
  assert.equal(stagePdfIntent('merge two pdfs together'), null);
  assert.equal(stagePdfIntent('export my stage as json'), null);
});

test('pdfDocOf uses the actual note and table words, in print order', () => {
  const things = {
    a: { id: 'a', kind: 'notepad', title: 'Shopping', text: 'oat milk\ncoffee', y: 10, x: 0 },
    b: { id: 'b', kind: 'csv-table', title: 'Scores', rows: [['name', 'n'], ['Ada', '12']], y: 20, x: 0 },
  };
  const all = pdfDocOf(things, { scope: 'stage' });
  assert.equal(all.title, 'Verse stage');
  assert.ok(all.paras.some((p) => /Shopping/.test(p)));
  assert.ok(all.paras.some((p) => /oat milk/.test(p)));
  assert.ok(all.paras.some((p) => /Ada/.test(p) && /12/.test(p)));
  const one = pdfDocOf(things, { scope: 'picked', pickedId: 'a' });
  assert.equal(one.title, 'Shopping');
  assert.ok(one.paras.some((p) => /coffee/.test(p)));
  assert.ok(!one.paras.some((p) => /Ada/.test(p)));
});

test('from those words, pdf-lib writes a PDF that still contains them', async () => {
  const things = { a: { id: 'a', kind: 'notepad', title: 'Field log', text: 'Eastern Dry Rocks lost its elkhorn.', y: 0, x: 0 } };
  const doc = pdfDocOf(things, { scope: 'picked', pickedId: 'a' });
  const bytes = await fromText(L, doc);
  const words = wordsIn(bytes);
  assert.match(words, /Field log/);
  assert.match(words, /Eastern Dry Rocks lost its elkhorn/);
  assert.equal((await L.PDFDocument.load(bytes)).getPageCount(), 1);
});

test('a csv-table on the stage becomes a PDF that still has the cell text', async () => {
  const things = { b: { id: 'b', kind: 'csv-table', title: 'Scores', rows: [['name', 'n'], ['Ada', '12']], y: 0, x: 0 } };
  const doc = pdfDocOf(things, { scope: 'picked', pickedId: 'b' });
  assert.ok(doc.paras.some((p) => p.includes('Ada') && p.includes('12')));
  const words = wordsIn(await fromText(L, doc));
  assert.match(words, /Scores/);
  assert.match(words, /Ada/);
});

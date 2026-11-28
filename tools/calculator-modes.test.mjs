// /calculator/?mode=vat loads /calculator/modes/vat.html. /calculator/modes/ is that directory's index, not a 404.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compute } from '../void-live-deploy/lib/vat.js';
import { FAMILY_MODE_SRC } from '../void-live-deploy/lib/tower-families.js';

const vat = readFileSync(new URL('../void-live-deploy/calculator/modes/vat.html', import.meta.url), 'utf8');
const index = readFileSync(new URL('../void-live-deploy/calculator/modes/index.html', import.meta.url), 'utf8');

test('mode=vat is the VAT calculator, and the modes directory names it', () => {
  assert.equal(FAMILY_MODE_SRC['/calculator/'].vat, '/calculator/modes/vat.html');
  assert.match(vat, /<h1>VAT calculator<\/h1>/);
  assert.match(vat, /from '\/lib\/vat\.js'/);
  assert.match(vat, /id="amount"/);
  assert.match(vat, /id="big"/);
  assert.match(index, /href="\/calculator\/modes\/vat"/);
  assert.match(index, /href="\/calculator\/modes\/formulas"/);
  const r = compute({ amount: 1000, rate: 22, mode: 'extract' });
  assert.equal(r.gross, 1000);
  assert.equal(Math.round((r.net + r.vat) * 100), 100000);
});

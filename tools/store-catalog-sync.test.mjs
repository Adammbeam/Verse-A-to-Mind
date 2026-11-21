// The catalog the loops edit (domains/store.products.json) and the one the site ships (void-live-deploy/lib/store-products.js)
// must say the same thing, and a paid product shown as live must have a checkout. Two loop laps once added a $99 and a $499
// row with no checkout and a second id `full-stack-audit`, and renamed the $25 fix away from the id the pricing card reads.
// Run: node --test tools/store-catalog-sync.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import SHIPPED from '../void-live-deploy/lib/store-products.js';

const data = JSON.parse(fs.readFileSync(new URL('../domains/store.products.json', import.meta.url), 'utf8')).products;

test('every product id is used once', () => {
  const ids = data.map((p) => p.id);
  assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), []);
});
// a fixed price is a checkout (2026-11-21): the store's own Stripe adapter charges any product with cents, so a paid live product
// no longer needs a Gumroad listing. What must stay true is that the store is on the rail that can charge a bare price: if a live
// paid product has only its price, the deployed provider has to be stripe, or it is the old bug again (a row nobody could buy).
test('a paid product marked live has a way to pay', () => {
  const toml = fs.readFileSync(new URL('../void-live-deploy/wrangler.toml', import.meta.url), 'utf8');
  const provider = (toml.match(/STORE_PROVIDER\s*=\s*"([^"]+)"/) || [])[1] || 'gumroad';
  const priceOnly = data.filter((p) => p.status === 'live' && p.cents > 0 && !p.gumroad && !p.special).map((p) => p.id);
  if (priceOnly.length) assert.equal(provider, 'stripe', 'sold by price alone, so the store must be on Stripe: ' + priceOnly.join(', '));
  assert.ok(provider === 'stripe' || provider === 'gumroad');
});
test('the shipped catalog is the data file (node tools/store-publish.mjs sync)', () => {
  assert.deepEqual(SHIPPED.map((p) => [p.id, p.cents, p.gumroad || '', p.status, p.trial || '']), data.map((p) => [p.id, p.cents, p.gumroad || '', p.status, p.trial || '']));
});
test('the ids other code reads still exist', () => {
  for (const id of ['void-monthly', 'one-time-fix', 'keep-it-running', 'full-stack-audit', 'first-automation-setup', 'big-board', 'join-the-team', 'code-review-pro']) assert.ok(data.some((p) => p.id === id), id);
});

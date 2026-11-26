// Asking for a product Verse sells itself opens Verse's own checkout, not a Gumroad page (owner, 2026-11-21).
// The live gap: "join the team" answered with a moonbeam846.gumroad.com link while /store/ already took Stripe payments.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { publicProduct, checkoutUrl, SELF_SOLD } from '../void-live-deploy/lib/gumroad.js';

test('a product Verse sells itself points at the store cart, everything else keeps its own page', () => {
  const join = publicProduct({ slug: 'join-the-team', name: 'Join the Team', price_cents: 100, url: 'https://moonbeam846.gumroad.com/l/join-the-team' });
  assert.equal(join.url, '/store/?cart=join-the-team');
  const other = publicProduct({ slug: 'site-tester', name: 'Site Tester', price_cents: 2400, url: 'https://moonbeam846.gumroad.com/l/site-tester' });
  assert.equal(other.url, 'https://moonbeam846.gumroad.com/l/site-tester');
});

test('a product with no page at all still gets one', () => {
  assert.equal(checkoutUrl({ slug: 'remix-kit' }), 'https://moonbeam846.gumroad.com/l/remix-kit');
});

test('the store reads the cart a link carries, so the item really is in it', () => {
  const html = fs.readFileSync(new URL('../void-live-deploy/store/index.html', import.meta.url), 'utf8');
  assert.match(html, /new URLSearchParams\(location\.search\)\.get\('cart'\)/);
  assert.ok(SELF_SOLD.has('join-the-team'));
});

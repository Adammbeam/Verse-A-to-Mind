// The $1 Join the Team product is a crew seat. The join page says what is live, what is still coming,
// and how a receipt becomes a member key (lib/team.js JOIN_PRODUCT, functions/api/team.js joinMember).
// Run: node --test tools/crew-seat-page.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JOIN_PRODUCT } from '../void-live-deploy/lib/team.js';
import { buyAnswer } from '../void-live-deploy/lib/store.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const page = read('void-live-deploy/team/join/index.html');
const store = read('void-live-deploy/store/index.html');
const films = read('void-live-deploy/films/index.html');

test('the join page is a crew seat, uses the existing Gumroad link, and shows the member call', () => {
  assert.equal(JOIN_PRODUCT, 'https://moonbeam846.gumroad.com/l/join-the-team');
  assert.match(page, /A \$1 crew seat/);
  assert.ok(page.includes(JOIN_PRODUCT), 'the buy link is the team product already in the repo');
  assert.match(page, /href="\/team\/join\/"|canonical" href="https:\/\/a-to-mind.com\/team\/join\/"/);
  assert.match(page, /\{"do":"member","name":"YourName","product":"join-the-team","key":/);
  assert.match(page, /"order":"&lt;Order ID&gt;","email":/);
  assert.match(page, /answers 201/);
  assert.match(page, /role<\/code> <code>member/);
  assert.match(page, /Authorization: Bearer/);
  assert.match(page, /same purchase again/);
  assert.match(page, /href="\/team\/#build"/);
  assert.match(page, /src="\/verse-shell\.js"/);
  assert.match(page, /src="\/visit\.js" defer/);
  assert.match(page, /verse-handoff" content="in: none; out: none"/);
  assert.doesNotMatch(page, /\btip\b/i);
  const words = page.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean);
  assert.ok(words.length >= 120, words.length + ' words');
});

test('upcoming seat features stay labelled coming soon, inside the honest block', () => {
  const honest = page.slice(page.indexOf('<section data-honest>'), page.indexOf('</section>') + 10);
  assert.match(honest, /Link your own AI agent/);
  assert.match(honest, /Link your own project/);
  assert.match(honest, /broken into small jobs/);
  assert.ok((honest.match(/Coming soon/g) || []).length >= 3);
  const shown = page.replace(/<section data-honest>[\s\S]*?<\/section>/, '');
  assert.doesNotMatch(shown, /coming soon/i);
});

test('the store and the films footer send people to the crew seat, not a tip', () => {
  assert.match(store, /href="\/team\/join\/">Get a \$1 crew seat/);
  assert.match(store, /href="\/team\/join\/">What a crew seat is/);
  assert.equal(read('void-live-deploy/store/receipt/index.html'), store);
  assert.doesNotMatch(store, /Tip the crew|Tip more/);
  assert.match(films, /href="\/team\/join\/">\$1 crew seat/);
  assert.doesNotMatch(films, /Tip \$1/);
  const row = buyAnswer().rows.find((r) => r.id === 'join-the-team');
  assert.equal(row.name, 'Join the Team');
  assert.match(row.blurb, /crew seat/);
  assert.doesNotMatch(row.name + ' ' + row.blurb, /tip/i);
});

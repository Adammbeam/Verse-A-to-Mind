import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { floorsFrom, rowStatus, wantStatus, aliasFloor, attachAbilities, abilityHtml, elevatorHtml, cardWithAbilities, abilityLine, packText, WANTS } from '../void-live-deploy/lib/ability-floors.js';
import { buildAbilities } from './ability-floors.mjs';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const list = { items: [
  { id: 'make-video', name: 'Make a video', page: '/video/', ask: 'make a video' },
  { id: 'translate', name: 'Translate', page: '/translate/', ask: 'translate hello' },
  { id: 'recipes', name: 'Recipes', page: '/recipes/', ask: 'pancake recipe' },
  { id: 'budget', name: 'Budget', page: null, ask: 'make a budget' },
] };
const results = { items: [
  { id: 'make-video', overall: 'fail' },
  { id: 'translate', overall: 'pass' },
  { id: 'recipes', overall: 'pass' },
  { id: 'budget', overall: 'partial' },
] };

test('a pass is a working tool, a partial page is part, and a gap is missing', () => {
  assert.equal(rowStatus({ page: '/x/' }, 'pass'), 'has');
  assert.equal(rowStatus({ page: '/x/' }, 'partial'), 'part');
  assert.equal(rowStatus({ page: null }, 'partial'), 'missing');
  assert.equal(rowStatus({ page: '/video/' }, 'fail'), 'missing');
  const by = new Map([['translate', { item: list.items[1], overall: 'pass' }]]);
  assert.equal(wantStatus(WANTS[1], by), 'part');
  assert.equal(wantStatus(WANTS[0], new Map([['make-video', { item: list.items[0], overall: 'fail' }]])), 'missing');
});

test('the floor list is abilities, the pick is the first missing one, and an old floor id still resolves', () => {
  const pack = floorsFrom(list, results);
  assert.equal(pack.pick, 'edit-a-video');
  assert.equal(pack.floors[0].name, 'edit a video');
  assert.equal(pack.floors[0].status, 'missing');
  assert.equal(pack.floors.find((f) => f.name === 'translate a live conversation').status, 'part');
  assert.equal(pack.floors.find((f) => f.id === 'budget').status, 'missing');
  assert.equal(pack.floors.some((f) => f.status === 'has'), false);
  assert.equal(aliasFloor('video', pack.floors).id, 'edit-a-video');
  assert.equal(aliasFloor('recipes', pack.floors).name, 'plan a week of meals');
  assert.match(pack.floors[0].prove, /trim the first 3 seconds/);
  assert.doesNotMatch(JSON.stringify(pack), /https?:|www\.|\.com\b/i);
});

test('the served file matches the inventory, and the card and elevator show the ability', () => {
  const pack = buildAbilities();
  const served = readFileSync(new URL('../void-live-deploy/tower.abilities.json', import.meta.url), 'utf8');
  assert.equal(served, packText(pack));
  assert.equal(pack.pick, 'edit-a-video');
  assert.ok(pack.floors.length >= 10);
  for (const name of ['edit a video', 'translate a live conversation', 'plan a week of meals', 'read a receipt photo']) assert.ok(pack.floors.some((f) => f.name === name), name);
  for (const f of pack.floors) {
    assert.match(f.status, /^(missing|part|has)$/);
    assert.ok(f.why && f.prove && f.ask);
  }
  const html = abilityHtml(pack, esc);
  assert.match(html, /edit a video/);
  assert.match(html, /Working on now/);
  assert.doesNotMatch(html, /https?:|\.com/i);
  const card = cardWithAbilities('<div class="vp"><h2 class="tw-head">Versus</h2><p class="vp-sub">The website Verse is learning to replace right now, and what is left. 1 site done so far.</p><div class="vp-k">Working on now</div><p>old site floor</p></div>', pack, esc);
  assert.match(card, /data-id="edit-a-video"/);
  assert.match(card, /Earlier site floor/);
  assert.match(card, /old site floor/);
  const own = elevatorHtml(attachAbilities({ fight: '' }, pack), '<h1 class="elv-fight">old fight</h1><p>kept.example</p>', esc);
  assert.match(own, /<h1 class="elv-fight">edit a video<\/h1>/);
  assert.match(own, /Earlier site floors/);
  assert.match(own, /kept\.example/);
  assert.match(abilityLine(pack), /edit a video/);
});

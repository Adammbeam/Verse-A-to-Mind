// The frontier, pruned against the build ledger (void-live-deploy/lib/frontier.js). The case that started it:
// "Absorb and connect every repo on the account" was built on 2026-10-22 by grok-bot and still sat in "Still open"
// weeks later, because the card marks its own prose against a seven-day velocity feed and an October build is outside it.
// Run: node --test tools/frontier-prune.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { builtIndex, unbuilt, unbuiltFrontier } from '../void-live-deploy/lib/frontier.js';

const LEDGER = [
  { at: '2026-10-22T02:39:05Z', kind: 'build', what: 'archive/repos: the ten public atomeam repos', asked: 'Absorb and connect every repo on the account' },
  { at: '2026-10-30T11:00:00Z', kind: 'grow', what: 'the weather card', asked: 'Put the weather on the stage' },
];

test('an ask the ledger already proves is not handed back to the model', () => {
  const index = builtIndex(LEDGER);
  assert.deepEqual(unbuilt(['Absorb and connect every repo on the account'], index), []);
});

test('nearly the same words count as the same ask, which is the case that actually drifted', () => {
  const index = builtIndex(LEDGER);
  // five of five content words shared, so lib/ask-same.js scores it 1.0
  assert.deepEqual(unbuilt(['Absorb and connect every repo'], index), []);
});

test('an ask nothing proves stays in the frontier, in the order it was given', () => {
  const index = builtIndex(LEDGER);
  const open = ['Give the map card terrain', 'Absorb and connect every repo on the account', 'Learn Go on the stage'];
  assert.deepEqual(unbuilt(open, index), ['Give the map card terrain', 'Learn Go on the stage']);
});

test('a ledger entry with no asked line proves nothing, and a missing index changes nothing', () => {
  const index = builtIndex([{ at: '2026-10-22T02:39:05Z', kind: 'build', what: 'no ask recorded' }, ...LEDGER]);
  assert.equal(unbuilt(['Put the weather on the stage'], index).length, 0, 'the real line still counts');
  assert.deepEqual(unbuilt(['anything at all'], null), ['anything at all'], 'a failed read must not empty the frontier');
  assert.deepEqual(unbuilt(['anything at all'], builtIndex([])), ['anything at all']);
});

test('two asks that name different sites are two asks, so one site being built does not hide the other', () => {
  const index = builtIndex([{ asked: 'Add a page for onlineconverter.com to LANE_PAGES' }]);
  assert.deepEqual(unbuilt(['Add a page for sycophanthex.com to LANE_PAGES'], index).length, 1);
});

test('a frontier object is pruned in every list it carries, and other fields are left alone', () => {
  const index = builtIndex(LEDGER);
  const f = { frontier: ['Absorb and connect every repo on the account'], open: ['Learn Go on the stage'], note: 'kept' };
  const out = unbuiltFrontier(f, index);
  assert.deepEqual(out.frontier, []);
  assert.deepEqual(out.open, ['Learn Go on the stage']);
  assert.equal(out.note, 'kept');
});

test('frontier items (title, from) are pruned the same way as asks', () => {
  const index = builtIndex(LEDGER);
  const out = unbuilt([{ title: 'Absorb and connect every repo', from: 'frontier' }, { title: 'Paid Verse', from: 'plan' }], index);
  assert.deepEqual(out.map((o) => o.title), ['Paid Verse']);
});

test('self.json: an item the ledger proves built is not in open, the rest stay; no ledger keeps every item', async () => {
  const { buildSelf } = await import('./self-context.mjs');
  const open = [{ title: 'Absorb and connect every repo', from: 'owner, 2026-10-15' }, { title: 'Learn Go on the stage', from: 'plan' }];
  const pruned = buildSelf('> Verse', '', { open, built: builtIndex(LEDGER) });
  assert.deepEqual(pruned.open.map((o) => o.ask), ['Learn Go on the stage']);
  const kept = buildSelf('> Verse', '', { open });
  assert.deepEqual(kept.open.map((o) => o.ask), ['Absorb and connect every repo', 'Learn Go on the stage']);
});

test('the served self.json no longer lists an ask the real ledger proves built', async () => {
  const { readFileSync } = await import('node:fs');
  const self = JSON.parse(readFileSync(new URL('../void-live-deploy/self.json', import.meta.url), 'utf8'));
  assert.ok(!self.open.some((o) => /absorb and connect every repo/i.test(o.ask)), 'built 2026-10-22, still listed open');
});

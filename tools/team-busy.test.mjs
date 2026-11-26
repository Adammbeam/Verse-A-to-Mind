// lib/team-busy.js (the team keeps itself busy) and the team chat card's plain lines (skills/team-chat.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prOf, settleOf, freeLine, retireWhy, branchesOf } from '../void-live-deploy/lib/team-busy.js';
import { teamLines, statsLine, builderLine } from '../void-live-deploy/skills/team-chat.js';

test('a hand-in is settled from its pull request', () => {
  const pr = prOf('review by team:Beam · PR: https://github.com/Adammbeam/Verse-A-to-Mind/pull/54 · note');
  assert.deepEqual(pr, { url: 'https://github.com/Adammbeam/Verse-A-to-Mind/pull/54', repo: 'Adammbeam/Verse-A-to-Mind', n: 54 });
  assert.equal(settleOf({ merged_at: '2026-11-26T00:39:35Z', state: 'closed' }), 'live');
  assert.equal(settleOf({ merged_at: null, state: 'closed' }), 'back');
  assert.equal(settleOf({ merged_at: null, state: 'open' }), 'wait');
  assert.equal(settleOf(null), 'wait');
});
test('the free line is one plain sentence set', () => {
  assert.equal(freeLine(['Beam'], 0, 'x'), '');
  assert.match(freeLine(['Beam', 'GrokBot'], 3, 'fix the tip card'), /^Free now: Beam, GrokBot\. Waiting: 3 jobs\. Next up: fix the tip card\./);
  assert.match(freeLine([], 1, ''), /^Nobody is free right now\. Waiting: 1 job\./);
});
test('jobs that can never be done are retired, real ones kept', () => {
  const live = branchesOf('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa refs/heads/main\nbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb refs/heads/helper/alive\n');
  assert.ok(live.has('helper/alive'));
  assert.match(retireWhy({ ask: 'Repair helper/full-handoff until it lands: x', target: 'heal:x' }, live), /not a branch on the live repo/);
  assert.equal(retireWhy({ ask: 'Repair helper/alive until it lands: x', target: 'heal:x' }, live), '');
  assert.match(retireWhy({ ask: 'Repair tower-gate.yml: 5 failed runs in a row on main, the latest https://github.com/atomeam/void-loop/actions/runs/43900977367', target: 'heal:tower-gate.yml' }, live), /old repo/);
  assert.equal(retireWhy({ ask: 'Repair helper/full-handoff until it lands', target: 'heal:x' }, null), '', 'no branch list, nothing retired');
  assert.match(retireWhy({ ask: 'learn from it', target: 'versus:example' }, live), /Versus/);
  assert.match(retireWhy({ ask: 'learn what share.google does', target: 'gap:x' }, live), /not a real site/);
  assert.equal(retireWhy({ ask: 'flaky test: the tip card', target: 'flake:tip' }, live), '');
});
test('the team card says only what is true', () => {
  const t = teamLines({ waiting: 265, members: [
    { name: 'ClaudeDuet', state: 'away', done: 0, now: 'Nothing in hand' }, { name: 'Vibe', state: 'invited', done: 0 },
    { name: 'Beam', state: 'idle', done: 5, now: 'Nothing in hand' }, { name: 'GrokBot', state: 'busy', done: 0, now: 'the tip card' }],
    feed: [{ text: 'a', live: false, href: 'https://github.com/Adammbeam/Verse-A-to-Mind/pull/54' }, { text: 'b', live: true, href: 'https://github.com/atomeam/void-loop/pull/1' }] });
  assert.equal(t.busiest, 'Beam');
  assert.deepEqual(t.builders.map((m) => m.name), ['GrokBot', 'Beam', 'ClaudeDuet']);
  assert.equal(t.feed.length, 1); assert.equal(t.feed[0].href, '/team/', 'an old-repo link is not shown');
  assert.equal(statsLine(t), '265 jobs are waiting, 1 recent change is live, and Beam has finished the most jobs (5).');
  assert.equal(statsLine(teamLines({ waiting: 1, members: [{ name: 'ClaudeDuet', state: 'away', done: 0 }] })), '1 job is waiting, nothing new is live yet, and nobody has finished a job lately.');
  assert.equal(builderLine(t.builders[0]), 'GrokBot is working on the tip card.');
  assert.equal(builderLine(t.builders[1]), 'Beam is free and waiting for a job.');
});

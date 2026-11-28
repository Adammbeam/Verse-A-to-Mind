// Scene beats for a Verse Short and a podcast episode (lib/show-scenes.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { BEATS, scenesOf, sceneIssues } from '../void-live-deploy/lib/show-scenes.js';

const goodShort = () => ({
  title: 'The town well',
  lines: [
    { who: 'Verse', text: 'How old is the town well?' },
    { who: 'Critic', text: 'Obviously it is brand new.' },
    { who: 'Verse', text: 'The well was dug in 1842.' },
    { who: 'Critic', text: 'Ask Verse anything at a-to-mind.com.' },
  ],
});

const episode = () => ({
  title: 'The town well',
  lines: [
    { who: 'Verse', text: 'How old is the town well?' },
    { who: 'Critic', text: 'Obviously it is brand new.' },
    { who: 'Verse', text: 'Look at the stone.' },
    { who: 'Critic', text: 'Of course the stone is a prop.' },
    { who: 'Verse', text: 'The well was dug in 1842.' },
    { who: 'Critic', text: 'Fine. I lose.' },
    { who: 'Verse', text: 'Ask Verse anything at a-to-mind.com.' },
  ],
});

test('BEATS are the four scene names, frozen', () => {
  assert.deepEqual([...BEATS], ['hook', 'turn', 'payoff', 'close']);
  assert.equal(Object.isFrozen(BEATS), true);
});

test('a short with a hook, a wrong Critic, one fact, and a close has no issues', () => {
  const show = goodShort();
  const scenes = scenesOf(show);
  assert.deepEqual(scenes.map((s) => s.beat), ['hook', 'turn', 'payoff', 'close']);
  assert.equal(scenes[1].who, 'Critic');
  assert.deepEqual(scenes.map((s) => [s.from, s.to]), [[0, 0], [1, 1], [2, 2], [3, 3]]);
  assert.deepEqual(sceneIssues(show, { kind: 'short' }), []);
});

test('a short whose first line is longer than 12 words gets a hook issue', () => {
  const show = goodShort();
  show.lines[0] = { who: 'Verse', text: 'Tell me the full age of that very old town well right now.' };
  const issues = sceneIssues(show, { kind: 'short' });
  assert.equal(words(show.lines[0].text), 13);
  assert.ok(issues.some((s) => /hook/i.test(s)), issues.join(', '));
});

test('an episode may open with more than 12 words', () => {
  const show = episode();
  show.lines[0] = { who: 'Verse', text: 'How old is the town well that sits by the market square today?' };
  assert.equal(words(show.lines[0].text), 13);
  assert.deepEqual(sceneIssues(show, { kind: 'episode' }), []);
});

test('a script with no Critic lines is refused', () => {
  const show = {
    lines: [
      { who: 'Verse', text: 'How old is the town well?' },
      { who: 'Verse', text: 'The well was dug in 1842.' },
      { who: 'Verse', text: 'Ask Verse anything at a-to-mind.com.' },
    ],
  };
  const issues = sceneIssues(show, { kind: 'short' });
  assert.ok(issues.includes('missing Critic'), issues.join(', '));
});

test('a script with no Verse lines is refused', () => {
  const show = {
    lines: [
      { who: 'Critic', text: 'Obviously the well is brand new.' },
      { who: 'Critic', text: 'Of course a guess is enough.' },
      { who: 'Critic', text: 'The well was dug in 1842.' },
      { who: 'Critic', text: 'Ask Verse anything at a-to-mind.com.' },
    ],
  };
  const issues = sceneIssues(show, { kind: 'short' });
  assert.ok(issues.includes('missing Verse'), issues.join(', '));
  assert.ok(!issues.includes('missing Critic'));
});

test('internal paths and queue talk are jargon', () => {
  const show = {
    lines: [
      { who: 'Verse', text: 'Open void-live-deploy/lib/show-pipe.js and read the queue job.' },
      { who: 'Critic', text: 'Obviously helper/scene.mjs is the whole depends_on list.' },
      { who: 'Verse', text: 'tools/show-pipe.mjs holds the queue job.' },
      { who: 'Critic', text: 'Ask Verse anything at a-to-mind.com.' },
    ],
  };
  const issues = sceneIssues(show, { kind: 'short' });
  assert.ok(issues.includes('jargon'), issues.join(', '));
});

test('cruelty is flagged', () => {
  const show = goodShort();
  show.lines[1] = { who: 'Critic', text: 'Obviously you are an idiot about this well.' };
  const issues = sceneIssues(show, { kind: 'short' });
  assert.ok(issues.includes('cruel'), issues.join(', '));
});

test('an episode with the beats and Critic\'s running bit passes', () => {
  const show = episode();
  const scenes = scenesOf(show);
  assert.deepEqual(scenes.map((s) => s.beat), ['hook', 'turn', 'payoff', 'close']);
  assert.equal(scenes[1].who, 'Critic');
  assert.ok(scenes[1].to > scenes[1].from, 'the turn keeps Critic coming back');
  assert.deepEqual(sceneIssues(show, { kind: 'episode' }), []);
});

test('one Critic line is not a running bit on an episode', () => {
  const show = goodShort();
  const issues = sceneIssues(show, { kind: 'episode' });
  assert.ok(issues.includes('running bit'), issues.join(', '));
});

test('two facts in the payoff are not one fact', () => {
  const show = goodShort();
  show.lines[2] = { who: 'Verse', text: 'The well was dug in 1842 and it holds 72 buckets.' };
  const issues = sceneIssues(show, { kind: 'short' });
  assert.ok(issues.includes('payoff'), issues.join(', '));
});

test('the input show is not mutated', () => {
  const show = goodShort();
  const snap = structuredClone(show);
  Object.freeze(show);
  Object.freeze(show.lines);
  for (const line of show.lines) Object.freeze(line);
  scenesOf(show);
  sceneIssues(show, { kind: 'short' });
  scenesOf(episode());
  sceneIssues(episode(), { kind: 'episode' });
  assert.deepEqual(show, snap);
});

test('a missing show is an empty scene list and a refusal, not a throw', () => {
  assert.deepEqual(scenesOf(null), []);
  assert.deepEqual(scenesOf({ lines: null }), []);
  const issues = sceneIssues(undefined, { kind: 'short' });
  assert.ok(issues.includes('missing Critic'));
  assert.ok(issues.includes('missing Verse'));
});

function words(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

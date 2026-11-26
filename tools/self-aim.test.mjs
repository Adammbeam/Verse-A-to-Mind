// Verse's aim is a fact it always reads, and "what are you trying to become?" is a self ask.
// Run: node --test tools/self-aim.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { isSelfAsk, selfFacts, towerFacts, AIM, SELF_RULE } from '../void-live-deploy/lib/self-context.js';
import { buildSelf, floorKind, towerOf } from './self-context.mjs';
import { GUIDE } from '../void-live-deploy/lib/job-guide.js';
import { askOf } from './flakes.mjs';

test('the self context includes the aim, even with no other facts', () => {
  const empty = selfFacts({});
  assert.match(empty, /What I aim to be: /);
  assert.ok(empty.includes(AIM));
  assert.match(AIM, /one place people need/);
  assert.match(AIM, /as well as the best place for that kind does/);
  assert.match(AIM, /saying honestly where I still fall short/);
  assert.match(AIM, /keeping at it on my own/);
  assert.doesNotMatch(AIM, /\.(com|net|org)\b/, 'the aim names no rival host');
  const built = buildSelf('> Verse does whatever anyone asks.', '');
  assert.equal(built.aim, AIM);
  const facts = selfFacts({ self: built });
  assert.ok(facts.indexOf('What I aim to be:') < facts.indexOf('What I am:'));
  assert.match(SELF_RULE, /what you are trying to become/);
  assert.match(SELF_RULE, /state your aim from the facts/);
});

test('what are you trying to become, and what is your aim, are asks about Verse itself', () => {
  for (const a of ['what are you trying to become?', 'what is your aim?', 'what do you aim to become?', 'what are you aiming for?', 'What do you want?']) {
    assert.ok(isSelfAsk(a), a);
  }
  for (const a of ['what is the aim of photosynthesis', 'what are they trying to become', 'aim of the game']) {
    assert.ok(!isSelfAsk(a), a);
  }
});

test('public tower facts name the floor kind, not a rival host', () => {
  const t = towerOf(
    [{ id: 'travel: example-floor.test', site: 'example-floor.test' }, { id: 'maps', site: 'maps' }],
    { id: 'travel: example-floor.test', since: '2026-11-09' },
    { 'travel: example-floor.test': '/flights/routes/' },
  );
  assert.equal(floorKind('travel: example-floor.test'), 'travel');
  assert.equal(t.kind, 'travel');
  assert.equal(t.target, 'example-floor.test');
  const line = towerFacts({ tower: t });
  assert.match(line, /The kind of work I am taking on next is travel/);
  assert.match(line, /since 2026-11-09/);
  assert.doesNotMatch(line, /example-floor\.test/);
});

test('a flake job first asks for a cheap deterministic node test, not a browser suite', () => {
  const ask = askOf({ check: 'sky / still', times: 2, shas: ['a', 'b'] });
  assert.match(ask, /cheap deterministic node test/);
  assert.match(ask, /precise failure/);
  assert.match(ask, /never skip, quarantine or retry/);
  assert.match(GUIDE.flake, /cheap, deterministic node test/);
  assert.match(GUIDE.flake, /node --test/);
  assert.match(GUIDE.flake, /do not start by reproducing it in a full browser suite/);
  assert.match(GUIDE.versus, /Prefer a cheap, deterministic node test/);
});

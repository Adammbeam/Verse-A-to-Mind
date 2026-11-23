// handoff-confidence skill: client-visible confidence for systems Verse owns.
// Run: node --test tools/handoff-confidence.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import skill, { isHandoffConfidence } from '../void-live-deploy/skills/handoff-confidence.js';

test('matches the examples and rejects near misses', () => {
  for (const a of skill.examples) assert.equal(isHandoffConfidence(a), true, a);
  for (const a of skill.nearMisses) assert.equal(isHandoffConfidence(a), false, a);
});

test('suite reports ok', () => {
  assert.equal(skill.suite().ok, true);
});

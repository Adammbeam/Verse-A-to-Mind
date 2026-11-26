import test from 'node:test';
import assert from 'node:assert/strict';
import skill, { isClientStage, subjectOf, stagesFor } from '../void-live-deploy/skills/client-stage-tracker.js';

test('client stage tracker is its own ask', () => {
  assert.equal(isClientStage('stage tracker for client onboarding'), true);
  assert.equal(isClientStage('replacement ladder for the support process'), true);
  assert.equal(isClientStage('track stages for invoice automation'), true);
  assert.equal(isClientStage('stage a play'), false);
  assert.equal(subjectOf('stage tracker for client onboarding'), 'client onboarding');
  const pack = stagesFor('support process');
  assert.ok(pack.stages.length === 4);
  assert.ok(pack.stuck.includes('Verse owns'));
  for (const ex of skill.examples) assert.equal(skill.match(ex.toLowerCase(), ex), true, ex);
  for (const near of skill.nearMisses) assert.equal(skill.match(near.toLowerCase(), near), false, near);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import skill, { isHandoffConfidence, subjectOf, confidenceFor } from '../void-live-deploy/skills/handoff-confidence.js';

test('handoff confidence is its own ask', () => {
  assert.equal(isHandoffConfidence('handoff confidence for the invoice automation'), true);
  assert.equal(isHandoffConfidence('delivery confidence for client onboarding'), true);
  assert.equal(isHandoffConfidence('how reliable is the delivery for support routing'), true);
  assert.equal(isHandoffConfidence('confidence for the reminder system'), true);
  assert.equal(isHandoffConfidence('confidence interval'), false);
  assert.equal(isHandoffConfidence('how confident are you'), false);
  assert.equal(subjectOf('handoff confidence for the invoice automation'), 'invoice automation');
  const pack = confidenceFor('client onboarding');
  assert.equal(pack.level, 'High');
  assert.ok(pack.reasons.length >= 3);
  for (const ex of skill.examples) assert.equal(skill.match(ex.toLowerCase(), ex), true, ex);
  for (const near of skill.nearMisses) assert.equal(skill.match(near.toLowerCase(), near), false, near);
});

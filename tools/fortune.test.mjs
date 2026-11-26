// fortune skill suite check.
import test from 'node:test';
import assert from 'node:assert/strict';
import skill from '../void-live-deploy/skills/fortune.js';

test('suite reports ok', () => {
  assert.equal(skill.suite().ok, true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { due, missingSecrets, runnerSteps, shouldShip, EVERY_MS, REQUIRED_SECRETS } from './scheduled-run.mjs';

test('every 10 minutes: never-run is due; not-yet is not; boundary is due', () => {
  assert.equal(EVERY_MS, 600000);
  assert.equal(due(null, 1000), true);
  assert.equal(due(NaN, 1000), true);
  assert.equal(due(0, 1000), true);
  assert.equal(due(1000, 1000 + EVERY_MS - 1), false);
  assert.equal(due(1000, 1000 + EVERY_MS), true);
  assert.equal(due(1000, 1000 + EVERY_MS + 1), true);
  assert.equal(due(1000, NaN), false);
});

test('missing secrets reports NAMES only, never values', () => {
  assert.deepEqual(missingSecrets({}), REQUIRED_SECRETS);
  assert.deepEqual(missingSecrets({ [REQUIRED_SECRETS[0]]: '' }), REQUIRED_SECRETS);
  // a value is never returned, only names
  assert.deepEqual(missingSecrets({ [REQUIRED_SECRETS[0]]: 'x' }), []);
});

test('one pass on a clean main: check first, then ship; no secret in any argv', () => {
  const steps = runnerSteps();
  assert.deepEqual(steps.map((s) => s.name), ['check', 'ship']);
  assert.deepEqual(steps[0].argv, ['node', 'tools/local-ship.mjs', '--check']);
  assert.deepEqual(steps[1].argv, ['node', 'tools/local-ship.mjs', '--ship']);
  const flat = JSON.stringify(steps).toLowerCase();
  for (const bad of ['token', 'secret']) assert.ok(!flat.includes(bad), 'no secret name/value in argv');
});

test('ship only on green check', () => {
  assert.equal(shouldShip({ ok: true }), true);
  assert.equal(shouldShip({ ok: false }), false);
  assert.equal(shouldShip(null), false);
  assert.equal(shouldShip(undefined), false);
});

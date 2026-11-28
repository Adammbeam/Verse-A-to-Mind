// node --test tools/teardown-gap.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { THRESHOLDS, stem, overlap, gaps } from '../void-live-deploy/lib/teardown-gap.js';

const inventory = [
  { name: 'unit converter', path: 'docs/map.d/units.md', words: 'convert length mass temperature' },
  { name: 'weather card', path: 'docs/map.d/weather.md', words: 'forecast temperature city' },
];

test('stems meet across converter and units', () => {
  assert.equal(stem('converter'), 'convert');
  assert.equal(stem('units'), 'unit');
  assert.ok(overlap('convert units', 'unit converter') >= THRESHOLDS.has);
  assert.ok(overlap('convert temperature', 'unit converter length mass') >= THRESHOLDS.part);
  assert.ok(overlap('convert temperature', 'unit converter length mass') < THRESHOLDS.has);
  assert.equal(overlap('plan weekly meals', 'unit converter'), 0);
});

test('a known feature is has or part, with the inventory path as evidence', () => {
  const spec = { features: [
    { name: 'convert units', flow: ['type a measure'], states: ['blank'], data: { measure: ['value'] } },
    { name: 'convert currency notes', flow: ['pick a scale'], states: ['ready'], data: {} },
    { name: 'plan weekly meals', flow: ['pick recipes'], states: ['empty'], data: {} },
  ] };
  const before = JSON.stringify(spec) + JSON.stringify(inventory);
  const rows = gaps(spec, inventory);
  assert.equal(JSON.stringify(spec) + JSON.stringify(inventory), before);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].feature, 'convert units');
  assert.equal(rows[0].verdict, 'has');
  assert.equal(rows[0].evidence, 'docs/map.d/units.md');
  assert.equal(rows[1].feature, 'convert currency notes');
  assert.equal(rows[1].verdict, 'part');
  assert.equal(rows[1].evidence, 'docs/map.d/units.md');
  assert.equal(rows[2].verdict, 'gap');
  assert.equal(rows[2].evidence, '');
});

test('an empty inventory is all gap', () => {
  const rows = gaps({ features: [{ name: 'convert units' }] }, []);
  assert.deepEqual(rows, [{ feature: 'convert units', verdict: 'gap', evidence: '' }]);
});

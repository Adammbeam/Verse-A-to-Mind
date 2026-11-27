// the keyless vector map on /flights/map/: node --test tools/flights-vector.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as C from '../void-live-deploy/lib/flights-core.js';
import * as V from '../void-live-deploy/lib/flights-vector.js';
const u = (p) => new URL('../' + p, import.meta.url);
const data = JSON.parse(fs.readFileSync(u('void-live-deploy/flights/airports.json'), 'utf8'));
const packed = JSON.parse(fs.readFileSync(u('void-live-deploy/flights/routes.json'), 'utf8'));

test('the keyless map carries its licence, its network and its typed legs', () => {
  assert.match(V.STYLE_URL, /^https:\/\/demotiles\.maplibre\.org\/style\.json$/);
  for (const p of [V.LIB, V.CSS, V.LICENSE]) assert.ok(fs.existsSync(u('void-live-deploy' + p)), p);
  assert.match(fs.readFileSync(u('void-live-deploy' + V.LICENSE), 'utf8'), /BSD-3-Clause/);
  const idx = C.makeIndex(data);
  const n = V.network(idx, packed, 'LIS', 'JFK-LHR-SIN');
  assert.equal(n.origin.iata, 'LIS');
  assert.ok(n.count > 20);
  const legs = n.data.features.filter((f) => f.properties.kind === 'leg');
  assert.deepEqual(legs.map((f) => [f.properties.from, f.properties.to]), [['JFK', 'LHR'], ['LHR', 'SIN']]);
  const cross = V.network(idx, packed, 'SYD', 'SYD-LAX').data.features.filter((f) => f.properties.kind === 'leg');
  assert.ok(cross.length >= 2);
});

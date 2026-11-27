// the keyless vector map on /flights/map/: node --test tools/flights-vector.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as C from '../void-live-deploy/lib/flights-core.js';
import * as V from '../void-live-deploy/lib/flights-vector.js';
import { FLIGHT_SITES } from '../void-live-deploy/lib/flight-sites.js';
const root = (p) => new URL('../' + p, import.meta.url);
const read = (p) => fs.readFileSync(root('void-live-deploy' + p), 'utf8');
const data = JSON.parse(fs.readFileSync(new URL('../void-live-deploy/flights/airports.json', import.meta.url), 'utf8'));
const packed = JSON.parse(fs.readFileSync(new URL('../void-live-deploy/flights/routes.json', import.meta.url), 'utf8'));
const idx = C.makeIndex(data);

test('the map is keyless, vendored and credited', () => {
  assert.match(V.STYLE_URL, /^https:\/\/demotiles\.maplibre\.org\/style\.json$/);
  assert.equal(V.LIB, '/vendor/maplibre-gl-5.6.0/maplibre-gl.js');
  assert.doesNotMatch(V.STYLE_URL + V.LIB + V.CSS, /token|api[_-]?key|access[_-]?key|secret/i);
  for (const p of [V.LIB, V.CSS, V.LICENSE]) assert.ok(fs.existsSync(root('void-live-deploy' + p)), p);
  const licence = read(V.LICENSE);
  assert.match(licence, /Copyright \(c\) 2023, MapLibre contributors/);
  assert.match(licence, /BSD-3-Clause|Redistribution and use in source and binary forms/);
  assert.match(licence, /mapbox-gl-js v1\.13/, 'the historical notice is kept');
  assert.match(V.ATTRIBUTION, /MapLibre GL JS[\s\S]*BSD-3-Clause[\s\S]*Natural Earth/);
  assert.match(read('/lib/flights-ui.js'), /customAttribution: V\.ATTRIBUTION/);
  const credits = fs.readFileSync(root('docs/licenses.md'), 'utf8');
  assert.match(credits, /vendor\/maplibre-gl-5\.6\.0[\s\S]{0,260}BSD-3-Clause/);
});

test('the network, its typed legs and the date-line split', () => {
  const n = V.network(idx, packed, 'LIS', 'JFK-LHR-SIN');
  const of = (k) => n.data.features.filter((f) => f.properties.kind === k);
  assert.equal(n.origin.iata, 'LIS');
  assert.ok(n.count > 20 && of('airport').length === n.count && of('route').length >= n.count);
  assert.deepEqual(of('leg').map((f) => [f.properties.from, f.properties.to]), [['JFK', 'LHR'], ['LHR', 'SIN']]);
  assert.ok(n.bounds[0][0] < n.bounds[1][0] && n.bounds[0][1] <= n.bounds[1][1]);
  assert.equal(V.network(idx, packed, 'ZZZ').count, 0);
  const legs = V.network(idx, packed, 'SYD', 'SYD-LAX').data.features.filter((f) => f.properties.kind === 'leg');
  assert.ok(legs.length >= 2 && legs.some((p) => p.geometry.coordinates[0][0] > 150) && legs.some((p) => p.geometry.coordinates[0][0] < -150));
  for (const p of legs) for (let i = 1; i < p.geometry.coordinates.length; i++) assert.ok(Math.abs(p.geometry.coordinates[i][0] - p.geometry.coordinates[i - 1][0]) <= 180);
});

test('a popup says what it is, and only the map page has the panel', () => {
  const de = { 'nonstop routes': 'Nonstop-Strecken', 'leg of the chain': 'Etappe der Kette' }, tr = (s) => de[s] || s;
  assert.deepEqual(V.popupLines({ kind: 'origin', code: 'LIS', routes: 99 }, tr).slice(-1), ['99 Nonstop-Strecken']);
  assert.deepEqual(V.popupLines({ kind: 'route', from: 'LIS', to: 'MAD', km: 613, airlines: '' }, tr), ['LIS → MAD', '613 km', 'route in the June 2014 data']);
  assert.deepEqual(V.popupLines({ kind: 'leg', from: 'JFK', to: 'LHR', km: 5540 }, tr), ['JFK → LHR', '5540 km', 'Etappe der Kette']);
  const map = FLIGHT_SITES.find((r) => r.path === '/flights/map/');
  assert.ok(map.panels.includes('vectormap') && FLIGHT_SITES.filter((r) => r.panels.includes('vectormap')).length === 1);
  assert.match(fs.readFileSync(root('void-live-deploy/flights/map/app.js'), 'utf8'), /"panels":\["route","vectormap"\]/);
  for (const s of ['Vector map', 'Fly from this airport', 'Licence']) assert.ok(read('/lib/flights-de.js').includes('"' + s + '":'));
});

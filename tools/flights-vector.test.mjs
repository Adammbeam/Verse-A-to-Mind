// the keyless vector map on /flights/map/: node --test tools/flights-vector.test.mjs
// The data built here is the same the browser draws; the licence and the page check that a visitor
// can see a vector map, inspect airports and routes, and find the source terms.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as C from '../void-live-deploy/lib/flights-core.js';
import * as V from '../void-live-deploy/lib/flights-vector.js';
import { FLIGHT_SITES } from '../void-live-deploy/lib/flight-sites.js';

const data = JSON.parse(fs.readFileSync(new URL('../void-live-deploy/flights/airports.json', import.meta.url), 'utf8'));
const packed = JSON.parse(fs.readFileSync(new URL('../void-live-deploy/flights/routes.json', import.meta.url), 'utf8'));
const idx = C.makeIndex(data);
const root = (p) => new URL('../' + p, import.meta.url);

test('the style and the library are first-party or keyless, and the terms are on the page', () => {
  assert.match(V.STYLE_URL, /^https:\/\/demotiles\.maplibre\.org\/style\.json$/);
  assert.doesNotMatch(V.STYLE_URL + V.LIB + V.CSS, /token|api[_-]?key|access[_-]?key|secret/i);
  assert.equal(V.LIB, '/vendor/maplibre-gl-5.6.0/maplibre-gl.js');
  for (const p of [V.LIB, V.CSS, V.LICENSE]) assert.ok(fs.existsSync(root('void-live-deploy' + p)), p + ' is served from this site');
  const licence = fs.readFileSync(root('void-live-deploy' + V.LICENSE), 'utf8');
  assert.match(licence, /Copyright \(c\) 2023, MapLibre contributors/);
  assert.match(licence, /BSD-3-Clause|Redistribution and use in source and binary forms/);
  assert.match(licence, /mapbox-gl-js v1\.13/, 'the bundled historical Mapbox notice is kept');
  assert.match(V.ATTRIBUTION, /MapLibre GL JS/);
  assert.match(V.ATTRIBUTION, /BSD-3-Clause/);
  assert.match(V.ATTRIBUTION, /Natural Earth/);
  const html = fs.readFileSync(root('void-live-deploy/flights/map/index.html'), 'utf8');
  assert.match(html, /<div id="app"><\/div>/);
  const ui = fs.readFileSync(root('void-live-deploy/lib/flights-ui.js'), 'utf8');
  assert.match(ui, /PANELS\.vectormap/);
  assert.match(ui, /customAttribution: V\.ATTRIBUTION/, 'the attribution control carries the credit');
  const credits = fs.readFileSync(root('void-live-deploy/salvage.json'), 'utf8');
  assert.match(credits, /maplibre\/maplibre-gl-js[\s\S]{0,140}BSD-3-Clause/);
  assert.match(credits, /maplibre\/demotiles[\s\S]{0,160}BSD-3-Clause/);
  assert.match(fs.readFileSync(root('docs/licenses.md'), 'utf8'), /vendor\/maplibre-gl-5\.6\.0[\s\S]{0,260}BSD-3-Clause/);
});

test('the GeoJSON carries the origin, its destinations, great-circle routes and the typed chain', () => {
  const n = V.network(idx, packed, 'LIS', 'JFK-LHR-SIN');
  const of = (kind) => n.data.features.filter((f) => f.properties.kind === kind);
  assert.equal(n.origin.iata, 'LIS');
  assert.ok(n.count > 20, 'Lisbon has a network in the local route file');
  assert.equal(of('origin').length, 1);
  assert.equal(of('airport').length, n.count);
  assert.ok(of('route').length >= n.count, 'a line for every destination');
  assert.equal(of('leg').length, 2, 'the two legs typed in the route box are on the vector map too');
  assert.deepEqual(of('leg').map((f) => [f.properties.from, f.properties.to]), [['JFK', 'LHR'], ['LHR', 'SIN']]);
  assert.ok(of('route').some((f) => f.properties.to === 'MAD' && f.properties.airlines.length), 'airlines travel with a route, so it can be inspected');
  for (const f of n.data.features) {
    assert.ok(['origin', 'airport', 'route', 'leg'].includes(f.properties.kind));
    const coords = f.geometry.type === 'Point' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const [lon, lat] of coords) { assert.ok(lon >= -180 && lon <= 180, 'longitude in bounds: ' + lon); assert.ok(lat >= -90 && lat <= 90, 'latitude in bounds: ' + lat); }
  }
  assert.ok(n.bounds[0][0] < n.bounds[1][0] && n.bounds[0][1] <= n.bounds[1][1], 'fit bounds enclose the network');
  assert.equal(V.network(idx, packed, 'ZZZ').count, 0);
});

test('a route crossing the date line is split, not drawn across the whole world', () => {
  const f = V.network(idx, packed, 'SYD', 'SYD-LAX').data.features.filter((x) => x.properties.kind === 'leg' && x.properties.from === 'SYD' && x.properties.to === 'LAX');
  assert.ok(f.length >= 2, 'the leg is drawn in pieces');
  for (const piece of f) for (let i = 1; i < piece.geometry.coordinates.length; i++) {
    const line = piece.geometry.coordinates;
    assert.ok(Math.abs(line[i][0] - line[i - 1][0]) <= 180, 'no piece jumps the map');
  }
  assert.ok(f.some((piece) => piece.geometry.coordinates[0][0] > 150) && f.some((piece) => piece.geometry.coordinates[0][0] < -150), 'both sides of the date line are drawn');
});

test('a click says what an airport or a route is, in the reader’s language', () => {
  const de = { 'nonstop routes': 'Nonstop-Strecken', 'nonstop route': 'Nonstop-Strecke', 'leg of the chain': 'Etappe der Kette' };
  const tr = (s) => de[s] || s;
  assert.deepEqual(V.popupLines({ kind: 'origin', code: 'LIS', name: 'Humberto Delgado', city: 'Lisbon', country: 'Portugal', routes: 99 }, tr).slice(-1), ['99 Nonstop-Strecken']);
  assert.ok(V.popupLines({ kind: 'airport', code: 'MAD', name: 'Barajas', city: 'Madrid', country: 'Spain', routes: 1 }, tr).includes('Nonstop-Strecke'));
  assert.deepEqual(V.popupLines({ kind: 'route', from: 'LIS', to: 'MAD', km: 613, airlines: 'TP, IB' }, tr), ['LIS → MAD', '613 km', 'TP, IB']);
  assert.deepEqual(V.popupLines({ kind: 'route', from: 'LIS', to: 'MAD', km: 613, airlines: '' }, tr), ['LIS → MAD', '613 km', 'route in the June 2014 data']);
  assert.deepEqual(V.popupLines({ kind: 'leg', from: 'JFK', to: 'LHR', km: 5540 }, tr), ['JFK → LHR', '5540 km', 'Etappe der Kette']);
});

test('the vector panel is on the great-circle page, not on every flights page', () => {
  const map = FLIGHT_SITES.find((r) => r.path === '/flights/map/');
  assert.ok(map.panels.includes('route') && map.panels.includes('vectormap'));
  assert.equal(FLIGHT_SITES.filter((r) => r.panels.includes('vectormap')).length, 1);
  const app = fs.readFileSync(root('void-live-deploy/flights/map/app.js'), 'utf8');
  assert.match(app, /"panels":\["route","vectormap"\]/);
  assert.match(map.does + map.intro, /vector map/i);
  const de = fs.readFileSync(root('void-live-deploy/lib/flights-de.js'), 'utf8');
  for (const s of ['Vector map', 'Fly from this airport', 'Licence', 'nonstop destinations from', 'Click an airport or a line to inspect it.']) assert.ok(de.includes('"' + s + '":'), 'German for ' + s);
});

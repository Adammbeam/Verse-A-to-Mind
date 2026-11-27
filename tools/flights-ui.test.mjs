// /flights/map/ vector view (AutoSalvage idea-7733): MapLibre GL JS is BSD-3-Clause, credited on /credits/,
// the pinned vendored build keeps the bundled Mapbox v1.13 notice, and the free OpenFreeMap style needs no key.
// Run: node --test tools/flights-ui.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { routeGeoJson, VENDOR, MAPLIBRE_JS, MAPLIBRE_CSS, STYLE, ATTRIBUTION } from '../void-live-deploy/lib/flights-map-gl.js';
import { pathPoints } from '../void-live-deploy/lib/flights-core.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const at = (p) => resolve(root, 'void-live-deploy' + p);
const ports = [
  { iata: 'JFK', name: 'John F Kennedy', lon: -73.7781, lat: 40.6413 },
  { iata: 'LHR', name: 'Heathrow', lon: -0.4543, lat: 51.47 },
  { iata: 'SIN', name: 'Changi', lon: 103.994, lat: 1.364 },
];

test('the pinned MapLibre build is local and keeps both BSD-3 notices, and the style needs no key', () => {
  for (const p of [MAPLIBRE_JS, MAPLIBRE_CSS, VENDOR + 'LICENSE']) assert.ok(existsSync(at(p)), p + ' is vendored');
  assert.ok(statSync(at(MAPLIBRE_JS)).size > 100000, 'the real library, not a stub');
  const license = readFileSync(at(VENDOR + 'LICENSE'), 'utf8');
  assert.match(license, /MapLibre contributors/);
  assert.match(license, /BSD-3-Clause|All rights reserved/);
  assert.match(license, /mapbox-gl-js v1\.13/);
  assert.match(license, /Copyright \(c\) 2020, Mapbox/);
  assert.match(STYLE, /^https:\/\/tiles\.openfreemap\.org\/styles\//);
  assert.doesNotMatch(STYLE, /key|token|apikey/i, 'no paid key in the style address');
  assert.match(ATTRIBUTION, /OpenStreetMap contributors/);
  assert.match(ATTRIBUTION, /BSD-3-Clause/);
  assert.match(ATTRIBUTION, /v1\.13/);
});

test('the credit is generated into /credits/ from an outside row, licensed BSD-3-Clause', () => {
  const outside = JSON.parse(readFileSync(resolve(root, 'domains/autosalvage.outside.json'), 'utf8'));
  const row = outside.sources.find((s) => s.id === 'maplibre/maplibre-gl-js');
  assert.ok(row, 'the source is named for the unifier');
  assert.equal(row.license, 'BSD-3-Clause');
  assert.match(row.gap, /flights\/map/);
  const unified = JSON.parse(readFileSync(resolve(root, 'domains/autosalvage.unified.json'), 'utf8'));
  assert.match(unified.pieces['outside:maplibre/maplibre-gl-js'].into, /flights\/map/);
  assert.equal(unified.pieces['outside:maplibre/maplibre-gl-js'].test, 'tools/flights-ui.test.mjs');
  const credits = JSON.parse(readFileSync(at('/salvage.json'), 'utf8')).credits;
  assert.ok(credits.some((c) => /maplibre/i.test(c.name) && c.license === 'BSD-3-Clause' && /flights\/map/.test(c.used || '')), '/credits/ names the source, license and use');
});

test('a route becomes GeoJSON the vector map can draw: one leg and one point per airport', () => {
  const gj = routeGeoJson(ports, pathPoints);
  assert.equal(gj.type, 'FeatureCollection');
  const lines = gj.features.filter((f) => f.geometry.type === 'LineString');
  const points = gj.features.filter((f) => f.geometry.type === 'Point');
  assert.equal(lines.length, 2, 'JFK-LHR and LHR-SIN');
  assert.equal(points.length, 3);
  assert.deepEqual(lines[0].properties, { from: 'JFK', to: 'LHR' });
  assert.equal(points[2].properties.code, 'SIN');
  for (const f of lines) { assert.ok(f.geometry.coordinates.length > 2, 'the great circle is sampled'); for (const [lon, lat] of f.geometry.coordinates) { assert.ok(lon >= -181 && lon <= 181); assert.ok(lat >= -91 && lat <= 91); } }
  assert.deepEqual(points[0].geometry.coordinates, [ports[0].lon, ports[0].lat]);
  assert.deepEqual(routeGeoJson([], pathPoints).features, [], 'no route, no features');
  assert.deepEqual(routeGeoJson(ports).features.filter((f) => f.geometry.type === 'LineString'), [], 'no point function, no legs');
});

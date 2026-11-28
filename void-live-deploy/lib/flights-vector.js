/**
 * flights-vector: the keyless vector layer on /flights/map/, drawn with MapLibre GL JS.
 * Pure data and constants; the screen that mounts the map is lib/flights-ui.js. Everything
 * in here runs on the device: the style is a public demo style with no key, the airports
 * and nonstop routes are the same local files the other flights pages read. Tests:
 * tools/flights-vector.test.mjs.
 */
import * as C from './flights-core.js';

/** MapLibre's public demo style: vector tiles, no token, no account. */
export const STYLE_URL = 'https://demotiles.maplibre.org/style.json';
/** The library and its stylesheet are served from this site, unchanged, under their own licence. */
export const LIB = '/vendor/maplibre-gl-5.6.0/maplibre-gl.js';
export const CSS = '/vendor/maplibre-gl-5.6.0/maplibre-gl.css';
export const VERSION = '5.6.0';
/** Shown by the map's attribution control and next to the map, so it is visible without opening a panel. */
export const ATTRIBUTION = 'Map: MapLibre GL JS 5.6.0 (BSD-3-Clause) · MapLibre demo tiles, country shapes from Natural Earth (public domain)';
export const LICENSE = '/vendor/maplibre-gl-5.6.0/LICENSE.txt';

const norm = (lon) => ((lon + 540) % 360) - 180;
const round = (n) => Math.round(n * 1000) / 1000;

/** What a click on a feature says in the popup. Pure; tr is the page's translator. */
export function popupLines(p, tr = (s) => s) {
  if (p.kind === 'origin' || p.kind === 'airport') return [p.code, p.name, [p.city, p.country].filter(Boolean).join(', '), p.kind === 'origin' ? p.routes + ' ' + tr('nonstop routes') : tr('nonstop route')];
  if (p.kind === 'route') return [p.from + ' → ' + p.to, p.km + ' km', p.airlines || tr('route in the June 2014 data')];
  return [p.from + ' → ' + p.to, p.km + ' km', tr('leg of the chain')];
}

/** Great-circle coordinates as GeoJSON lines, split where the path crosses the date line. Pure. */
export function routeCoords(a, b, steps = 32) {
  const lines = [[]];
  for (const p of C.pathPoints(a, b, steps)) {
    const lon = round(norm(p.lon)), line = lines[lines.length - 1];
    if (line.length && Math.abs(lon - line[line.length - 1][0]) > 180) lines.push([]);
    lines[lines.length - 1].push([lon, round(p.lat)]);
  }
  return lines.filter((l) => l.length > 1);
}

/**
 * The GeoJSON for one origin's nonstop network, plus the chain typed in the route box.
 * Returns { data, bounds, count, origin } where bounds is [[west, south], [east, north]].
 * Pure: idx is lib/flights-core.js's makeIndex result, packed is flights/routes.json.
 */
export function network(idx, packed, code, chain = '') {
  const origin = C.airportOf(idx, code), features = [];
  if (!origin) return { data: { type: 'FeatureCollection', features }, bounds: null, count: 0, origin: null };
  const links = C.routesFrom(packed, origin.iata), seen = new Set();
  features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [round(origin.lon), round(origin.lat)] }, properties: { kind: 'origin', code: origin.iata, name: origin.name, city: origin.city, country: origin.country, routes: links.length } });
  for (const link of links) {
    const to = idx.byIata.get(link.to);
    if (!to) continue;
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [round(to.lon), round(to.lat)] }, properties: { kind: 'airport', code: to.iata, name: to.name, city: to.city, country: to.country, routes: 1 } });
    for (const coords of routeCoords(origin, to)) features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: { kind: 'route', from: origin.iata, to: to.iata, airlines: link.airlines.join(', '), km: Math.round(C.distanceKm(origin, to)) } });
    seen.add(to.iata);
  }
  const ports = C.parseRoute(idx, chain).ports;
  for (let i = 0; i + 1 < ports.length; i++) for (const coords of routeCoords(ports[i], ports[i + 1])) features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: { kind: 'leg', from: ports[i].iata, to: ports[i + 1].iata, km: Math.round(C.distanceKm(ports[i], ports[i + 1])) } });
  const points = [origin].concat(links.map((l) => idx.byIata.get(l.to)).filter(Boolean), ports);
  const lons = points.map((p) => p.lon), lats = points.map((p) => p.lat);
  return { data: { type: 'FeatureCollection', features }, bounds: [[Math.min(...lons), Math.max(-80, Math.min(...lats))], [Math.max(...lons), Math.min(85, Math.max(...lats))]], count: seen.size, origin };
}

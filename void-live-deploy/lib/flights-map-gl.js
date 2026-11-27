// A free vector basemap for /flights/map/ (AutoSalvage idea-7733), with the SVG great-circle map kept as the fallback.
// Source: https://github.com/maplibre/maplibre-gl-js — BSD-3-Clause. The pinned build in
// /vendor/maplibre-gl-js-6.20.0/ keeps MapLibre's notice and the bundled Mapbox GL JS v1.13 BSD-3-Clause notice.
// Basemap: OpenFreeMap liberty (https://tiles.openfreemap.org/styles/liberty), no key, no account; © OpenStreetMap contributors.
// Nothing loads until the person asks for the vector view; the on-device SVG map needs no network.

export const VENDOR = '/vendor/maplibre-gl-js-6.20.0/';
export const MAPLIBRE_JS = '/vendor/maplibre-gl-js-6.20.0/maplibre-gl.mjs';
export const MAPLIBRE_CSS = '/vendor/maplibre-gl-js-6.20.0/maplibre-gl.css';
export const STYLE = 'https://tiles.openfreemap.org/styles/liberty';
export const ATTRIBUTION = '© OpenStreetMap contributors · © OpenFreeMap · MapLibre GL JS © MapLibre contributors (BSD-3-Clause, including the bundled Mapbox GL JS v1.13 BSD-3-Clause notice)';

/** the route's legs and airport dots as GeoJSON. Pure; `points` is C.pathPoints from lib/flights-core.js. */
export function routeGeoJson(ports, points) {
  const features = [];
  for (let i = 0; i + 1 < (ports || []).length; i++) {
    const coords = (points ? points(ports[i], ports[i + 1], 64) : []).map((p) => [((p.lon + 540) % 360) - 180, p.lat]);
    if (coords.length > 1) features.push({ type: 'Feature', properties: { from: ports[i].iata, to: ports[i + 1].iata }, geometry: { type: 'LineString', coordinates: coords } });
  }
  for (const p of ports || []) features.push({ type: 'Feature', properties: { code: p.iata, name: p.name || p.iata }, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } });
  return { type: 'FeatureCollection', features };
}

/** mount the vector map into `el`; throws when there is no browser, no WebGL, no vendored file or no style. */
export async function mountVectorMap(el, ports, points, style = STYLE) {
  if (!globalThis.document || !el) throw new Error('no browser to draw a vector map');
  const d = document;
  if (!d.querySelector('link[data-maplibre]')) {
    const l = d.createElement('link'); l.rel = 'stylesheet'; l.href = MAPLIBRE_CSS; l.setAttribute('data-maplibre', '1'); d.head.appendChild(l);
  }
  const mod = await import(/* @vite-ignore */ MAPLIBRE_JS); // a pinned local file, not a CDN: no key, no third-party script at runtime
  const M = mod.default || mod;
  const map = new M.Map({ container: el, style, center: [0, 22], zoom: 1.3, attributionControl: false, cooperativeGestures: true });
  map.addControl(new M.AttributionControl({ compact: false, customAttribution: ATTRIBUTION }), 'bottom-right');
  await Promise.race([
    new Promise((ok) => map.once('load', ok)),
    new Promise((_, bad) => map.once('error', (e) => bad(new Error(String((e && e.error && e.error.message) || 'the map could not load'))))),
    new Promise((_, bad) => setTimeout(() => bad(new Error('the map did not load in time')), 15000)),
  ]);
  const data = routeGeoJson(ports, points);
  map.addSource('route', { type: 'geojson', data });
  map.addLayer({ id: 'legs', type: 'line', source: 'route', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#a58bff', 'line-width': 3 } });
  map.addLayer({ id: 'airports', type: 'circle', source: 'route', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 5, 'circle-color': '#ecebf5', 'circle-stroke-color': '#15131c', 'circle-stroke-width': 2 } });
  return map;
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snap, clampScale, panZoom, routeEdge, layout, hitTest, boundsOf } from '../void-live-deploy/lib/canvas-layout.js';

test('snap: rounds to grid', () => {
  assert.equal(snap(17, 16), 16);
  assert.equal(snap(24, 16), 32);
  assert.equal(snap(5, 16), 0);
});
test('clampScale: clamps range', () => {
  assert.equal(clampScale(0.1), 0.25);
  assert.equal(clampScale(5), 4);
  assert.equal(clampScale(1), 1);
});
test('panZoom: zooms and pans', () => {
  const vp = { x: 0, y: 0, scale: 1, width: 800, height: 600 };
  const r = panZoom(vp, { scale: 2 });
  assert.equal(r.scale, 2);
});
test('routeEdge: returns polyline', () => {
  const p = routeEdge({ x: 0, y: 0, w: 100, h: 50 }, { x: 300, y: 200, w: 100, h: 50 });
  assert.ok(Array.isArray(p));
  assert.equal(p.length, 4);
  assert.equal(p[0].x, 50);
  assert.equal(p[3].x, 350);
});
test('layout: auto-places nodes without coords', () => {
  const r = layout([{ id: 'a' }, { id: 'b' }], []);
  assert.equal(r.nodes.length, 2);
  assert.ok(Number.isFinite(r.nodes[0].x));
  assert.ok(Number.isFinite(r.nodes[1].x));
});
test('layout: routes edges', () => {
  const r = layout([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 300, y: 0 }], [{ from: 'a', to: 'b' }]);
  assert.equal(r.edges.length, 1);
  assert.equal(r.edges[0].path.length, 4);
});
test('hitTest: finds node', () => {
  const nodes = [{ id: 'a', x: 0, y: 0, w: 100, h: 50 }];
  assert.equal(hitTest(nodes, 50, 25), 'a');
  assert.equal(hitTest(nodes, 200, 200), null);
});
test('boundsOf: computes bbox', () => {
  const b = boundsOf([{ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 30, w: 10, h: 10 }]);
  assert.equal(b.x, 0);
  assert.equal(b.y, 0);
  assert.equal(b.w, 30);
  assert.equal(b.h, 40);
});
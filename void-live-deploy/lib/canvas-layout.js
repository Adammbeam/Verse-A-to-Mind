// Spatial Canvas layout engine (pure): node positioning, connection routing, zoom/pan state for Verse's Brain view.
// Pure: rectangles and points in, moves out. No DOM, no browser. The card-placement logic (lib/placement.js) is
// the 2D grid version; this is the freeform graph version (nodes anywhere, edges between them, pan/zoom).
//   layout(nodes, edges, { width, height })  -> { nodes: [{ id, x, y, w, h }], edges: [{ from, to, path }] }
//   panZoom(state, dx, dy, scale)            -> new viewport state
//   routeEdge(a, b)                          -> [{x,y},...] polyline (Manhattan routing, no crossings)
//   snap(value, grid)                        -> nearest grid point

export const GRID = 16; // snap grid in canvas units
export const NODE_W = 160, NODE_H = 60; // default node size
export const MIN_SCALE = 0.25, MAX_SCALE = 4;

/** snap a value to the nearest grid point. Pure. */
export function snap(value, grid = GRID) {
  if (!Number.isFinite(value) || grid <= 0) return value;
  return Math.round(value / grid) * grid;
}

/** clamp a scale to the allowed range. Pure. */
export function clampScale(s) {
  const n = Number(s);
  if (!Number.isFinite(n)) return 1;
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, n));
}

/** pan/zoom a viewport. Pure. Returns a new state (never mutates). */
export function panZoom(vp, { dx = 0, dy = 0, scale = null } = {}) {
  const v = vp || { x: 0, y: 0, scale: 1 };
  const ns = scale === null ? v.scale : clampScale(scale);
  // keep the center stable when zooming
  const cx = (v.x || 0) + (v.width || 0) / 2;
  const cy = (v.y || 0) + (v.height || 0) / 2;
  const ratio = ns / (v.scale || 1);
  const nx = cx - (v.width || 0) / 2 / ratio + (dx || 0);
  const ny = cy - (v.height || 0) / 2 / ratio + (dy || 0);
  return { x: nx, y: ny, scale: ns, width: v.width || 0, height: v.height || 0 };
}

/** Manhattan route between two node centers, avoiding the nodes themselves. Pure. */
export function routeEdge(a, b) {
  if (!a || !b) return [];
  const ax = (a.x || 0) + (a.w || NODE_W) / 2, ay = (a.y || 0) + (a.h || NODE_H) / 2;
  const bx = (b.x || 0) + (b.w || NODE_W) / 2, by = (b.y || 0) + (b.h || NODE_H) / 2;
  // midpoint routing: go horizontal first, then vertical, then horizontal
  const mx = (ax + bx) / 2;
  return [{ x: ax, y: ay }, { x: mx, y: ay }, { x: mx, y: by }, { x: bx, y: by }];
}

/** compute node positions for a graph. Nodes without x/y get auto-placed in a grid. Pure. */
export function layout(nodes, edges, opts = {}) {
  const w = opts.width || 800, h = opts.height || 600;
  const list = (nodes || []).map((n, i) => {
    if (Number.isFinite(n.x) && Number.isFinite(n.y)) return { ...n, w: n.w || NODE_W, h: n.h || NODE_H };
    const cols = Math.max(1, Math.ceil(Math.sqrt((nodes || []).length)));
    const col = i % cols, row = Math.floor(i / cols);
    const cellW = w / cols, cellH = h / Math.ceil((nodes || []).length / cols);
    return { ...n, x: snap(col * cellW + 20), y: snap(row * cellH + 20), w: n.w || NODE_W, h: n.h || NODE_H };
  });
  const nodeMap = new Map(list.map((n) => [n.id, n]));
  const routed = (edges || []).map((e) => {
    const a = nodeMap.get(e.from), b = nodeMap.get(e.to);
    if (!a || !b) return { ...e, path: [] };
    return { ...e, path: routeEdge(a, b) };
  });
  return { nodes: list, edges: routed };
}

/** hit-test: which node contains (px, py) in canvas coords. Pure. */
export function hitTest(nodes, px, py) {
  for (let i = (nodes || []).length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (px >= n.x && px <= n.x + n.w && py >= n.y && py <= n.y + n.h) return n.id;
  }
  return null;
}

/** bounding box of all nodes. Pure. */
export function boundsOf(nodes) {
  if (!nodes || !nodes.length) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) { minX = Math.min(minX, n.x); minY = Math.min(minY, n.y); maxX = Math.max(maxX, n.x + n.w); maxY = Math.max(maxY, n.y + n.h); }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
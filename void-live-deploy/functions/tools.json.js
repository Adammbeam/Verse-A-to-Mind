// GET /tools.json — Verse's callable tools, served from prebuilt /tools.static.json (1 asset fetch, <150 ms) with live
// batched rebuild from /skills as fallback when the prebuilt snapshot is absent.
// Each tool is called by opening https://a-to-mind.com/?q=<ask>. Agents can also call Verse's read-only tools over MCP
// (functions/api/mcp.js, lib/mcp.js): the `mcp` field names the endpoint and lists those tools, from the same table tools/list serves.
import { TOOLS as MCP_TOOLS, PROTOCOL } from '../lib/mcp.js';
export const CORE = [ // the page's own built-ins; the book's "How to ask" page reads them too (tools/guide.mjs)
  { name: 'stage', description: 'Put a thing on the stage: clock, timer, counter, sticky note, notepad, list, calculator, shape, image or link card.', examples: ['make a clock', 'make a 5 minute timer', 'add a sticky that says hi', 'make a list', 'draw a circle'] },
  { name: 'page', description: 'A short sourced page about almost any topic (Wikipedia, Wiktionary).', examples: ['what is a black hole', 'who was Ada Lovelace', 'define serendipity'] },
  { name: 'calculate', description: 'Arithmetic, percentages, unit and currency conversion.', examples: ['15% of 80', '5 miles in km', '100 usd in eur'] },
  { name: 'look', description: "Change the person's own Verse (kept in their browser, and on every device once they say \"remember me\" and make a passkey).", examples: ['make my void deep blue', 'add stars', 'quieter font', 'reset my void'] },
  { name: 'keep', description: 'Keep, name, remove or re-run what is on screen.', examples: ['keep this', 'call this trip', 'take this off', 'same again', 'undo'] },
];
export const HIDDEN = new Set(['rebuild-map']);
const DEFAULT_ORIGIN = 'https://a-to-mind.com';
const BATCH = 24;
const MEM_TTL_MS = 300_000;
const MEM_CACHE = new WeakMap(); // env.ASSETS -> Map<origin, { body, at }>

export function parseSkillMeta(name, src) {
  const m = src.match(/examples\s*:\s*\[([^\]]*)\]/);
  const examples = m ? Array.from(m[1].matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)).map((x) => (x[1] ?? x[2]).replace(/\\'/g, "'")) : [];
  const d = src.match(/^\s*\*\s*\w[\w-]*\s+skill\s+[—-]\s+(.+)$/m);
  return { name: name === 'place' ? 'map' : name, description: d ? d[1].trim() : name, examples };
}

async function mapBatched(items, size, fn) {
  const out = new Array(items.length);
  for (let i = 0; i < items.length; i += size) {
    const slice = items.slice(i, i + size);
    const vals = await Promise.all(slice.map((item, j) => fn(item, i + j)));
    for (let j = 0; j < vals.length; j++) out[i + j] = vals[j];
  }
  return out;
}

const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'cache-control': 'public, max-age=300, stale-while-revalidate=3600',
};

export async function onRequestGet({ request, env }) {
  const origin = new URL(request.url).origin;
  const assets = env && env.ASSETS;
  if (assets && typeof assets === 'object') {
    const byOrigin = MEM_CACHE.get(assets);
    const hit = byOrigin && byOrigin.get(origin);
    if (hit && Date.now() - hit.at < MEM_TTL_MS) return new Response(hit.body, { headers: HEADERS });
  }
  const cacheKey = new Request(origin + '/tools.json');
  try { if (typeof caches !== 'undefined' && caches.default) { const hit = await caches.default.match(cacheKey); if (hit) return hit; } } catch (_) {}

  // Fast path: serve prebuilt /tools.static.json in a single asset fetch (~50-150 ms cold instead of 400+ fetches).
  if (assets && typeof assets.fetch === 'function') {
    try {
      const pre = await assets.fetch(new Request(origin + '/tools.static.json'));
      if (pre && pre.ok) {
        let body = await pre.text();
        if (body && body.trim().startsWith('{')) {
          if (origin !== DEFAULT_ORIGIN) body = body.split(DEFAULT_ORIGIN).join(origin);
          if (typeof assets === 'object') {
            let byOrigin = MEM_CACHE.get(assets);
            if (!byOrigin) { byOrigin = new Map(); MEM_CACHE.set(assets, byOrigin); }
            byOrigin.set(origin, { body, at: Date.now() });
          }
          const res = new Response(body, { headers: HEADERS });
          try { if (typeof caches !== 'undefined' && caches.default) await caches.default.put(cacheKey, res.clone()); } catch (_) {}
          return res;
        }
      }
    } catch (_) {}
  }

  const fetched = new Map();
  const get = async (p) => {
    if (fetched.has(p)) return fetched.get(p);
    try {
      const r = await assets.fetch(new Request(origin + p));
      const txt = r.ok ? await r.text() : '';
      fetched.set(p, txt);
      return txt;
    } catch (_) {
      fetched.set(p, '');
      return '';
    }
  };

  const tools = CORE.map((t) => ({ ...t }));
  try {
    const indexStr = await get('/skills/index.json');
    if (!indexStr) throw new Error('No index');
    const index = JSON.parse(indexStr);
    const indexSrcs = await mapBatched(index, BATCH, (name) => get('/skills/' + name + '.js'));
    const names = [];
    for (let i = 0; i < index.length; i++) {
      const name = index[i], src = indexSrcs[i];
      if (!src) continue;
      const fam = src.match(/^\s*\*\s*parts:\s*\[([^\]]*)\]/m);
      if (fam) names.push(...Array.from(fam[1].matchAll(/'([a-z0-9-]+)'/g)).map((x) => x[1]));
      else names.push(name);
    }
    const visible = names.filter((name) => !HIDDEN.has(name));
    const missing = [...new Set(visible.filter((name) => !fetched.has('/skills/' + name + '.js')))];
    if (missing.length) await mapBatched(missing, BATCH, (name) => get('/skills/' + name + '.js'));

    for (const name of visible) {
      const src = fetched.get('/skills/' + name + '.js');
      if (!src) continue;
      tools.push(parseSkillMeta(name, src));
    }
  } catch (e) {
    console.error('Failed to build tools.json:', e);
  }
  const out = {
    name: 'Verse by A-to-Mind',
    call: { method: 'GET', url: origin + '/?q={ask}', note: 'Opens Verse in a browser and runs the ask in plain words. Results render in the page.' },
    mcp: { endpoint: origin + '/api/mcp', transport: 'streamable HTTP, POST JSON-RPC, JSON replies', protocolVersion: PROTOCOL, tools: MCP_TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, annotations })) },
    tools: tools.map((t) => ({ ...t, try: t.examples.slice(0, 3).map((e) => origin + '/?q=' + encodeURIComponent(e)) })),
  };
  const body = JSON.stringify(out, null, 2);
  if (assets && typeof assets === 'object') {
    let byOrigin = MEM_CACHE.get(assets);
    if (!byOrigin) { byOrigin = new Map(); MEM_CACHE.set(assets, byOrigin); }
    byOrigin.set(origin, { body, at: Date.now() });
  }
  const res = new Response(body, { headers: HEADERS });
  try { if (typeof caches !== 'undefined' && caches.default) await caches.default.put(cacheKey, res.clone()); } catch (_) {}
  return res;
}

// OpenRouter $0 lane helpers (owner, 2026-11-15: "$0 forever", modality-aware free routing).
// Reads void-live-deploy/resources/openrouter-free.json (synced by tools/sync-free-lanes.mjs) and
// selects active free models by kind (text/image/vision), tracking expiration/sunset dates.
// Also provides a minimal OpenRouter image-generation call (POST /api/v1/images) for free image lanes.

export const OPENROUTER_API = 'https://openrouter.ai/api/v1';
// A known $0 image lane requested by the owner; used when present/available in synced lanes (or as
// a configured fallback) so Verse can offer free image generation while it remains free.
export const PREFERRED_FREE_IMAGE = 'recraft/recraft-v4.1-flash-v2:free';
export const PREFERRED_FREE_IMAGE_SUNSET = '2026-11-28';

const isActive = (m, nowMs = Date.now()) => !!m && !!m.id && (!m.expiration_date || Date.parse(m.expiration_date) >= nowMs);
const rank = (a, b) => (Number(b.context || 0) - Number(a.context || 0)) || String(a.id).localeCompare(String(b.id));

/** all active lanes of a kind from a synced payload, in failover order. Pure. */
export function lanesOf(payload, kind, nowMs = Date.now()) {
  const models = Array.isArray(payload && payload.models) ? payload.models : [];
  return models.filter((m) => m && m.kind === kind && isActive(m, nowMs)).slice().sort(rank);
}

/** pick the best active image lane, preferring PREFERRED_FREE_IMAGE when it is active. Pure. */
export function pickImageLane(payload, nowMs = Date.now()) {
  const lanes = lanesOf(payload, 'image', nowMs);
  return lanes.find((m) => m.id === PREFERRED_FREE_IMAGE) || lanes[0] || null;
}

/** load openrouter-free.json from the deploy's own assets (same pattern as /resources/free.json). */
export async function loadOpenRouterFree(env, origin) {
  try {
    const r = env && env.ASSETS ? await env.ASSETS.fetch(new Request(new URL('/resources/openrouter-free.json', origin))) : null;
    return r && r.ok ? await r.json() : null;
  } catch (_) { return null; }
}

/** extract an image URL/data URL from an OpenRouter /images response. */
export function imageOutOf(j) {
  if (!j || typeof j !== 'object') return '';
  const d = Array.isArray(j.data) ? j.data[0] : null;
  if (d && typeof d.url === 'string' && d.url) return d.url;
  if (d && typeof d.b64_json === 'string' && d.b64_json) return 'data:image/png;base64,' + d.b64_json;
  if (Array.isArray(j.output)) {
    for (const o of j.output) {
      const c = Array.isArray(o && o.content) ? o.content : [];
      for (const p of c) {
        if (p && typeof p.image_url === 'string' && p.image_url) return p.image_url;
        if (p && p.image_url && typeof p.image_url.url === 'string') return p.image_url.url;
      }
    }
  }
  return '';
}

/** call OpenRouter image generation for a $0 lane; returns { ok, url, model } or { ok:false, why, status }.
 *  Uses POST /api/v1/images with image_config when provided (e.g. Recraft). Never logs secrets. */
export async function generateImage({ env = {}, payload = null, prompt, size = '1024x1024', model = '', image_config = null, nowMs = Date.now(), fetchFn = fetch } = {}) {
  const key = env && env.OPENROUTER_API_KEY;
  if (!key) return { ok: false, why: 'no OPENROUTER_API_KEY' };
  const lane = model ? { id: model } : pickImageLane(payload, nowMs);
  if (!lane || !lane.id) return { ok: false, why: 'no free image lane' };
  const body = { model: lane.id, prompt: String(prompt || ''), size, n: 1, response_format: 'url' };
  if (image_config && typeof image_config === 'object') body.image_config = image_config;
  try {
    const res = await fetchFn(OPENROUTER_API + '/images', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout ? AbortSignal.timeout(30000) : undefined,
    });
    if (!res.ok) return { ok: false, why: 'openrouter ' + res.status, status: res.status };
    const j = await res.json().catch(() => null);
    const url = imageOutOf(j);
    if (!url) return { ok: false, why: 'no image in response' };
    return { ok: true, url, model: lane.id };
  } catch (e) {
    return { ok: false, why: String(e && e.message || 'error') };
  }
}

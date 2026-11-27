// GET /api/security-check?host=<domain> -> a plain-words scorecard (lib/security-check.js). /security/check/ is the caller.
// WHAT A STRANGER COULD MAKE THIS DO. An open GET that reads a site the caller names, so it is held tight: one bare public
// hostname (no IP, localhost, internal name, sign-in, path, or port); DNS-over-HTTPS first, and a private address is not opened
// and not returned; redirects checked again; homepage body dropped; security.txt contact and expiry not repeated; short timeouts;
// eight checks a minute on top of the guard; the scorecard may sit at the edge for ten minutes under the hostname. No database,
// no log of who asked, no cookie, no model.
import { rateLimited } from './answer.js';
import { jsonNoStore } from '../../lib/http.js';
import { whyNotHost, normalizeHost, inspectHost } from '../../lib/security-check.js';

export const RL_MAX = 8, TTL = 600;

export async function onRequestGet({ request, env, fetchFn = fetch }) {
  const u = new URL(request.url), raw = u.searchParams.get('host') || '';
  if (await rateLimited(request, env || {}, 'security-check', RL_MAX)) return jsonNoStore({ ok: false, why: 'That is a lot of sites in a minute. Wait a moment and try again.' }, 429, { 'retry-after': '60' });
  const why = whyNotHost(raw);
  if (why) return jsonNoStore({ ok: false, why }, 400);
  const host = normalizeHost(raw), cache = typeof caches !== 'undefined' ? caches.default : null;
  const key = new Request(u.origin + '/__void-security-check/card/' + encodeURIComponent(host));
  if (cache) { try { const hit = await cache.match(key); if (hit) return jsonNoStore(await hit.json()); } catch (_) {} }
  const out = await inspectHost(host, fetchFn);
  if (!out.ok) return jsonNoStore({ ok: false, why: out.why }, out.status || 502);
  if (cache) { try { await cache.put(key, new Response(JSON.stringify({ ok: true, card: out.card }), { headers: { 'content-type': 'application/json', 'cache-control': 'max-age=' + TTL } })); } catch (_) {} }
  return jsonNoStore({ ok: true, card: out.card });
}

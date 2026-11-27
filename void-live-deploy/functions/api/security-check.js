// GET /api/security-check?host=<domain> -> a plain-words scorecard for one public site (lib/security-check.js).
// The page at /security/check/ is the caller.
//
// WHAT A STRANGER COULD MAKE THIS DO, AND WHY IT IS BOUNDED. This is an open GET that reads a site the caller names,
// so it is held tight:
//   - the input is one bare public hostname. IP addresses, localhost, internal names, sign-in, paths and any port
//     are refused before a request is made (lib/security-check.js whyNotHost);
//   - the name is resolved through DNS-over-HTTPS first. A loopback, private, link-local or other non-public
//     address stops the check, and the addresses themselves are not returned;
//   - redirects are followed by hand and checked again. The body of the homepage is not kept. security.txt is
//     read only far enough to see a contact and an expiry, and those values are not repeated;
//   - each request has a short timeout. One caller gets a handful of checks a minute, on top of the guard.
//     A result is kept at the edge for ten minutes under the hostname, never under the caller's address;
//   - nothing about the visitor is written down: no database, no log of who asked, no cookie, no model.
//     The scorecard itself may sit at the edge for ten minutes under the hostname.
import { rateLimited } from './answer.js';
import { jsonNoStore } from '../../lib/http.js';
import { whyNotHost, normalizeHost, inspectHost } from '../../lib/security-check.js';

export const RL_MAX = 8, TTL = 600;

export async function onRequestGet({ request, env, fetchFn = fetch }) {
  const u = new URL(request.url);
  const raw = u.searchParams.get('host') || '';
  if (await rateLimited(request, env || {}, 'security-check', RL_MAX)) {
    return jsonNoStore({ ok: false, why: 'That is a lot of sites in a minute. Wait a moment and try again.' }, 429, { 'retry-after': '60' });
  }
  const why = whyNotHost(raw);
  if (why) return jsonNoStore({ ok: false, why }, 400);
  const host = normalizeHost(raw);
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const key = new Request(u.origin + '/__void-security-check/card/' + encodeURIComponent(host));
  if (cache) {
    try {
      const hit = await cache.match(key);
      if (hit) return jsonNoStore(await hit.json());
    } catch (_) {}
  }
  const out = await inspectHost(host, fetchFn);
  if (!out.ok) return jsonNoStore({ ok: false, why: out.why }, out.status || 502);
  if (cache) {
    try { await cache.put(key, new Response(JSON.stringify({ ok: true, card: out.card }), { headers: { 'content-type': 'application/json', 'cache-control': 'max-age=' + TTL } })); } catch (_) {}
  }
  return jsonNoStore({ ok: true, card: out.card });
}

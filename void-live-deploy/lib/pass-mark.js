// A visitor pass (tools/visitor-pass.mjs) reads the live site the way a person meets it. It used to answer every POST to
// Verse's own /api with an empty 204, so an ask the answer engine answers (how tall is Everest, a counter-view) sat on
// "thinking…" until the pass gave up at about 12 s and filed it as slow: the pass measured itself, not Verse. Now the pass lets
// POST /api/answer through, marked with this header, and the answer engine leaves a marked ask out of its route log, so a pass
// still never lands in the answer log, the miss board or a view count. Every other POST stays in the browser. Pure.
export const PASS_HEADER = 'x-verse-pass';
/** whether this request is a visitor pass's own ask. */
export const isPass = (request) => { try { return !!request && !!request.headers && request.headers.get(PASS_HEADER) === '1'; } catch (_) { return false; } };
/** whether the pass lets this browser request through: GETs and HEADs anywhere, and a POST to this site's own answer engine only. */
export function passLets(method, url, site = 'https://a-to-mind.com') {
  const m = String(method || '').toUpperCase();
  if (m === 'GET' || m === 'HEAD') return true;
  if (m !== 'POST') return false;
  try { const u = new URL(url); return u.origin === new URL(site).origin && u.pathname === '/api/answer' && !u.search; } catch (_) { return false; }
}

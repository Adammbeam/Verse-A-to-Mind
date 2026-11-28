// The finished-work feed was marking a line not live from the queue row alone. A line that names a route is
// live when that route's real answer says so. /api/health is live only when GET returns JSON ok:true
// (HEAD is 404: the function answers GET). Queue state still decides a line that names no route.

const NOT_LIVE = /^(.+?) has not put this on the site yet: (.+)\.$/;
const LIVE = /^(.+?) changed the site(?::| to) (.+)\.$/;
const VERB = /^(?:read|let|make|fix|stop|give|keep|show|add|list|open)\b/;

/** the first /api/ route named in a finished-work line, or ''. Pure. */
export function routeOf(text) {
  const m = /(?:https?:\/\/[a-z0-9.-]+)?(\/api\/[a-z0-9][a-z0-9/_-]*)/i.exec(String(text || ''));
  return m ? m[1].replace(/\/+$/, '') : '';
}

/** true when this answer proves the route, false when it does not, null when the route is not one we judge. Pure. */
export function proved(route, status, body) {
  const path = String(route || '');
  if (!path.startsWith('/api/')) return null;
  let json = null;
  try { json = JSON.parse(String(body || '')); } catch (_) { json = null; }
  if (path === '/api/health') return status === 200 && !!(json && json.ok === true);
  return status === 200 && !!json && json.ok !== false;
}

/** the same sentence, live or not, from the line the feed already wrote. Pure. */
export function withLive(text, live) {
  const m = NOT_LIVE.exec(String(text || '')) || LIVE.exec(String(text || ''));
  if (!m) return String(text || '');
  const who = m[1], clause = m[2];
  if (!live) return who + ' has not put this on the site yet: ' + clause + '.';
  return who + ' changed the site' + (VERB.test(clause) ? ' to ' : ': ') + clause + '.';
}

/** rewrite feed lines whose named route was actually fetched. A failed fetch leaves the line as the queue had it. */
export async function proveFeed(request, res, fetchFn = fetch) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/team' || url.search || request.method !== 'GET' || !res) return res;
  const type = res.headers.get('content-type') || '';
  if (!res.ok || !type.includes('json')) return res;
  let body;
  try { body = await res.clone().json(); } catch (_) { return res; }
  if (!body || !Array.isArray(body.feed)) return res;
  const routes = [...new Set(body.feed.map((f) => routeOf(f && f.text)).filter(Boolean))].slice(0, 8);
  const answers = {};
  await Promise.all(routes.map(async (route) => { // void-review: ok (at most 8 distinct routes, one GET each)
    try {
      const r = await fetchFn(new URL(route, url.origin), { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(4000) });
      answers[route] = { status: r.status, text: await r.text() };
    } catch (_) { answers[route] = null; }
  }));
  let changed = false;
  body.feed = body.feed.map((f) => {
    const route = routeOf(f && f.text);
    const a = answers[route];
    if (!a) return f;
    const ok = proved(route, a.status, a.text);
    if (ok === null || ok === !!f.live) return f;
    changed = true;
    return { ...f, live: ok, text: withLive(f.text, ok) };
  });
  if (!changed) return res;
  const headers = new Headers(res.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(body), { status: res.status, headers });
}

// /games and /games/ open the arcade. _redirects already says the same; this answers when that rule is not in the deploy.
export function gamesHubRedirect(request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (path !== '/games') return null;
  const headers = { location: new URL('/arcade/' + url.search, url.origin).href, 'cache-control': 'public, max-age=300' };
  return new Response(null, { status: 301, headers });
}

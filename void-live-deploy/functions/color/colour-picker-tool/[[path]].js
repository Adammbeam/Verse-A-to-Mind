// The second colour picker is the colour page. The old address stays, and the colour in the query (?c=) comes along.
// A stranger can only be sent to /color/ on this site. Nothing is stored.
const HOST = /^(?:a-to-mind\.com|localhost|127\.0\.0\.1|.*\.pages\.dev)$/i;

/** where an old colour-picker address opens, with its query kept. Pure. */
export function colorTarget(requestUrl) {
  const url = new URL(requestUrl);
  const origin = HOST.test(url.hostname) ? url.origin : 'https://a-to-mind.com';
  const to = new URL('/color/', origin);
  to.search = url.search;
  return to.toString();
}

export function onRequest(context) {
  return Response.redirect(colorTarget(context.request.url), 301);
}

// lib/teardown-fetch.js: https-only crawl, robots, page cap, size cap, honest agent
import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchPublic, refusePublicUrl, robotsAllows, TEARDOWN_FETCH } from '../void-live-deploy/lib/teardown-fetch.js';

const UA = 'VerseTeardown/1 (+https://a-to-mind.com/credits/)';

function harness(pages, robots = 'User-agent: *\nDisallow:\n') {
  const calls = [], sleeps = [];
  const fetchFn = async (url, init) => {
    calls.push({ url: String(url), ua: init && init.headers && init.headers['User-Agent'], signal: !!(init && init.signal) });
    const u = String(url);
    const body = u.endsWith('/robots.txt') ? robots : (pages[new URL(u).pathname] ?? '<html></html>');
    return new Response(body, { status: 200 });
  };
  return { calls, sleeps, fetchFn, sleep: async (ms) => { sleeps.push(ms); } };
}

test('refuses http, localhost, private and metadata addresses, credentials and odd ports', async () => {
  const cases = [
    ['http://example.test/a', /https/], ['https://localhost/a', /local|private|internal/],
    ['https://10.0.0.1/a', /local|private|internal/], ['https://169.254.169.254/a', /local|private|internal/],
    ['https://user:pw@host/a', /username|password/], ['https://example.test:8080/a', /port/],
  ];
  for (const [url, re] of cases) {
    assert.match(refusePublicUrl(url), re);
    let called = 0;
    const out = await fetchPublic(url, { fetchFn: async () => { called += 1; return new Response(''); } });
    assert.equal(out.ok, false); assert.match(out.reason, re); assert.equal(called, 0);
  }
});

test('a name that resolves to a private address is refused before fetch', async () => {
  let called = 0;
  const out = await fetchPublic('https://example.test/', { fetchFn: async () => { called += 1; return new Response(''); }, lookup: async () => ['10.1.2.3'] });
  assert.equal(out.ok, false); assert.match(out.reason, /private/); assert.equal(called, 0);
});

test('robots.txt Disallow skips the path, and the agent is honest', async () => {
  const home = '<html><body><a href="/private/a">p</a><a href="/open">o</a><a href="https://other.test/nope">x</a></body></html>';
  const h = harness({ '/': home, '/open': '<html></html>', '/private/a': '<html>no</html>' }, 'User-agent: *\nDisallow: /private\n');
  const out = await fetchPublic('https://example.test/', h);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /private\n', '/private/a'), false);
  assert.equal(out.ok, true); assert.equal(out.agent, UA);
  assert.deepEqual(out.pages.map((p) => p.path), ['/', '/open']);
  assert.deepEqual(out.skipped, [{ path: '/private/a', reason: 'robots' }]);
  assert.equal(h.calls.some((c) => c.url.includes('/private/a') || c.url.includes('other.test')), false);
  assert.ok(h.calls.every((c) => c.ua === UA && c.signal));
  assert.deepEqual(h.sleeps, [1000, 1000]);
});

test('the 21st page is not fetched and a body over 500 KB is cut', async () => {
  const links = Array.from({ length: 20 }, (_, i) => `<a href="/n/${i + 1}">n</a>`).join('');
  const pages = { '/': `<html><body>${links}</body></html>` };
  for (let i = 1; i <= 20; i++) pages['/n/' + i] = i === 1 ? 'Z'.repeat(TEARDOWN_FETCH.MAX_BYTES + 1024) : '<html></html>';
  const h = harness(pages);
  const out = await fetchPublic('https://example.test/', h);
  assert.equal(out.pages.length, 20);
  assert.equal(out.pages.some((p) => p.path === '/n/20') || h.calls.some((c) => c.url.endsWith('/n/20')), false);
  assert.deepEqual(out.skipped, [{ path: '/n/20', reason: 'page cap' }]);
  assert.equal(out.pages.find((p) => p.path === '/n/1').html.length, TEARDOWN_FETCH.MAX_BYTES);
  assert.equal(h.sleeps.length, h.calls.length - 1);
  assert.ok(h.sleeps.every((ms) => ms === 1000));
});

test('env.BROWSER uses Browser Rendering; without it, fetchFn fetches the page', async () => {
  const store = { launches: 0, urls: [], ua: '', closed: false };
  const h = harness({ '/': '<html><p>plain</p></html>' });
  const env = { BROWSER: { async launch() {
    store.launches += 1;
    return { async newPage() { return {
      async setUserAgent(ua) { store.ua = ua; }, async goto(url) { store.urls.push(String(url)); },
      async content() { return '<html><title>Hi</title><body>rendered</body></html>'; }, async close() {},
    }; }, async close() { store.closed = true; } };
  } } };
  const out = await fetchPublic('https://example.test/docs', { ...h, env });
  assert.equal(out.ok && store.launches === 1 && store.closed, true);
  assert.deepEqual(store.urls, ['https://example.test/docs']);
  assert.equal(store.ua, UA);
  assert.equal(out.pages[0].html.includes('rendered'), true);
  assert.ok(h.calls.every((c) => c.url.endsWith('/robots.txt') && c.ua === UA));
});

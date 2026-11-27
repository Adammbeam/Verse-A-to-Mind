// Username finder: the name is bounded, every fetch stays on the allowlist, redirects cannot leave the host,
// and /api/username answers found / missing / unchecked with the network mocked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanName, fill, SITES, hostsOf, sameHost, judge, checkName, checkTarget, pageUrl } from '../void-live-deploy/lib/username.js';
import { onRequestGet, RL_MAX } from '../void-live-deploy/functions/api/username.js';

const hosts = hostsOf();

function fake(routes) {
  const calls = [];
  const fetchFn = async (url, opts) => {
    calls.push({ url: String(url), redirect: opts && opts.redirect, ua: opts && opts.headers && opts.headers['user-agent'] });
    const hit = routes[url] || { status: 404, body: '' };
    if (hit.error) throw hit.error;
    return {
      status: hit.status,
      ok: hit.status >= 200 && hit.status < 300,
      headers: { get: (h) => (String(h).toLowerCase() === 'location' ? (hit.location || null) : null) },
      text: async () => hit.body || '',
      body: { cancel: async () => {} },
    };
  };
  return { calls, fetchFn };
}

const req = (q) => new Request('https://a-to-mind.com/api/username' + q, { headers: { 'cf-connecting-ip': '' } });

test('a public name is short and plain, and anything that could be an address is refused', () => {
  assert.equal(cleanName('octocat'), 'octocat');
  assert.equal(cleanName('  Ada_99 '), 'Ada_99');
  assert.equal(cleanName('a'), 'a');
  assert.equal(cleanName('a'.repeat(39)), 'a'.repeat(39));
  for (const bad of ['', '   ', 'a'.repeat(40), 'has space', 'a/b', 'a\\b', 'a?b', 'a#b', 'a@b', '../x', 'a..b', '.hidden', '-no', 'end-', 'https://evil.test', 'javascript:alert(1)', 'name%2fsecret', 'a\nb']) {
    assert.equal(cleanName(bad), '', bad);
  }
});

test('filling a template cannot move the host, and a subdomain slot is refused', () => {
  assert.equal(fill('https://github.com/{name}', 'octocat'), 'https://github.com/octocat');
  assert.equal(fill('https://news.ycombinator.com/user?id={name}', 'octocat'), 'https://news.ycombinator.com/user?id=octocat');
  assert.equal(fill('https://{name}.example.com/x', 'evil'), '');
  assert.equal(fill('http://github.com/{name}', 'octocat'), '');
  assert.equal(fill('https://github.com/{name}', '../x'), '');
  assert.equal(fill('https://user:pass@github.com/{name}', 'octocat'), '');
});

test('the allowlist is a small fixed set of https hosts', () => {
  assert.ok(SITES.length >= 15 && SITES.length <= 25, 'sites: ' + SITES.length);
  assert.equal(new Set(SITES.map((s) => s.id)).size, SITES.length);
  for (const site of SITES) {
    const page = pageUrl(site, 'octocat'), check = checkTarget(site, 'octocat');
    assert.ok(page.startsWith('https://'), site.id);
    assert.ok(check.startsWith('https://'), site.id);
    assert.ok(hosts.has(new URL(page).hostname), site.id);
    assert.ok(hosts.has(new URL(check).hostname), site.id);
    assert.equal(page.includes('octocat') || page.includes(encodeURIComponent('octocat')), true, site.id);
  }
});

test('a redirect stays on the same https host or is dropped', () => {
  assert.equal(sameHost('https://github.com/octocat', 'https://github.com/OctoCat'), 'https://github.com/OctoCat');
  assert.equal(sameHost('https://github.com/octocat', '/OctoCat'), 'https://github.com/OctoCat');
  assert.equal(sameHost('https://github.com/octocat', 'https://evil.test/octocat'), '');
  assert.equal(sameHost('https://github.com/octocat', 'http://github.com/octocat2'), '');
  assert.equal(sameHost('https://github.com/octocat', 'https://github.com.evil.test/x'), '');
  assert.equal(sameHost('https://github.com/octocat', 'https://user:pass@github.com/x'), '');
  assert.equal(sameHost('https://github.com/octocat', 'https://github.com:8443/x'), '');
});

test('status and a fixed phrase become found, missing, or unchecked', () => {
  const plain = SITES.find((s) => s.id === 'github');
  const hn = SITES.find((s) => s.id === 'hn');
  assert.equal(judge(plain, 200, ''), 'found');
  assert.equal(judge(plain, 404, ''), 'missing');
  assert.equal(judge(plain, 403, ''), 'unchecked');
  assert.equal(judge(plain, 500, ''), 'unchecked');
  assert.equal(judge(plain, 0, ''), 'unchecked');
  assert.equal(judge(hn, 200, 'No such user.'), 'missing');
  assert.equal(judge(hn, 200, 'user: octocat'), 'found');
  assert.equal(judge(hn, 200, ''), 'unchecked');
  assert.equal(judge(SITES.find((s) => s.id === 'bluesky'), 400, ''), 'missing');
});

test('a check fetches only the allowlist, skips a name the site cannot hold, and does not follow a foreign redirect', async () => {
  const routes = {};
  for (const site of SITES) {
    const url = checkTarget(site, 'octocat');
    routes[url] = { status: site.id === 'reddit' ? 302 : 200, location: site.id === 'reddit' ? 'https://evil.test/user/octocat' : '', body: '' };
  }
  const github = checkTarget(SITES.find((s) => s.id === 'github'), 'good_name');
  const { calls, fetchFn } = fake(routes);
  const dotted = await checkName('good_name', fetchFn);
  const gh = dotted.find((s) => s.id === 'github');
  assert.equal(gh.result, 'unchecked');
  assert.equal(calls.some((c) => c.url === github), false, 'GitHub is not asked for a name it cannot hold');
  calls.length = 0;
  const rows = await checkName('octocat', fetchFn);
  assert.equal(rows.length, SITES.length);
  for (const call of calls) {
    assert.equal(call.redirect, 'manual');
    assert.ok(hosts.has(new URL(call.url).hostname), call.url);
    assert.equal(call.url.includes('evil.test'), false);
  }
  assert.equal(rows.find((s) => s.id === 'reddit').result, 'unchecked');
  assert.equal(rows.find((s) => s.id === 'github').result, 'found');
  assert.equal(calls.some((c) => c.url.includes('evil.test')), false);
});

test('one same-host redirect is followed, a timeout is unchecked, and a not-found phrase counts', async () => {
  const gitlab = checkTarget(SITES.find((s) => s.id === 'gitlab'), 'octocat');
  const moved = 'https://gitlab.com/OctoCat';
  const hn = checkTarget(SITES.find((s) => s.id === 'hn'), 'octocat');
  const routes = {};
  for (const site of SITES) routes[checkTarget(site, 'octocat')] = { status: 404 };
  routes[gitlab] = { status: 301, location: moved };
  routes[moved] = { status: 200 };
  routes[hn] = { status: 200, body: 'No such user.' };
  routes[checkTarget(SITES.find((s) => s.id === 'npm'), 'octocat')] = { error: new Error('timed out') };
  const { calls, fetchFn } = fake(routes);
  const rows = await checkName('octocat', fetchFn);
  assert.equal(rows.find((s) => s.id === 'gitlab').result, 'found');
  assert.ok(calls.some((c) => c.url === moved));
  assert.equal(rows.find((s) => s.id === 'hn').result, 'missing');
  assert.equal(rows.find((s) => s.id === 'npm').result, 'unchecked');
  assert.equal(rows.find((s) => s.id === 'github').url, pageUrl(SITES.find((s) => s.id === 'github'), 'octocat'));
});

test('the route refuses a bad name, ignores a supplied url, and rate-limits', async () => {
  const store = new Map();
  globalThis.caches = { default: { match: async (k) => (store.has(k.url) ? new Response(store.get(k.url)) : undefined), put: async (k, res) => { store.set(k.url, await res.text()); } } };
  try {
    const bad = await onRequestGet({ request: req('?name=' + encodeURIComponent('https://evil.test/x')), env: {}, fetchFn: async () => { throw new Error('should not fetch'); } });
    assert.equal(bad.status, 400);
    assert.equal((await bad.json()).ok, false);
    const calls = [];
    const fetchFn = async (url, opts) => { calls.push(String(url)); assert.equal(opts.redirect, 'manual'); return { status: 404, ok: false, headers: { get: () => null }, text: async () => '', body: { cancel: async () => {} } }; };
    const ok = await onRequestGet({ request: req('?name=octocat&url=' + encodeURIComponent('https://evil.test/steal')), env: {}, fetchFn });
    const body = await ok.json();
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('cache-control'), 'no-store');
    assert.equal(body.ok, true);
    assert.equal(body.name, 'octocat');
    assert.equal(body.sites.length, SITES.length);
    assert.equal(body.missing, SITES.length);
    for (const url of calls) assert.ok(hosts.has(new URL(url).hostname), url);
    assert.equal(calls.some((u) => u.includes('evil.test')), false);
    for (let i = 0; i < RL_MAX - 1; i++) assert.equal((await onRequestGet({ request: req('?name=octocat'), env: {}, fetchFn })).status, 200);
    const limited = await onRequestGet({ request: req('?name=octocat'), env: {}, fetchFn });
    assert.equal(limited.status, 429);
    assert.match((await limited.json()).say, /minute/);
  } finally { delete globalThis.caches; }
});

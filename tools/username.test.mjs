// Username finder: the name is bounded, fetches stay on the allowlist, and /api/username is mocked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanName, fill, SITES, hostsOf, sameHost, judge, checkName, checkTarget, pageUrl } from '../void-live-deploy/lib/username.js';
import { onRequestGet, RL_MAX } from '../void-live-deploy/functions/api/username.js';

const hosts = hostsOf();
const fake = (routes) => {
  const calls = [];
  const fetchFn = async (url, opts) => {
    calls.push({ url: String(url), redirect: opts && opts.redirect });
    const hit = routes[url] || { status: 404 };
    if (hit.error) throw hit.error;
    return { status: hit.status, ok: hit.status >= 200 && hit.status < 300, headers: { get: (h) => String(h).toLowerCase() === 'location' ? hit.location || null : null }, text: async () => hit.body || '', body: { cancel: async () => {} } };
  };
  return { calls, fetchFn };
};
const req = (q) => new Request('https://a-to-mind.com/api/username' + q);

test('a public name stays plain, and a template cannot change host', () => {
  assert.equal(cleanName('  Ada_99 '), 'Ada_99');
  assert.equal(cleanName('a'.repeat(39)).length, 39);
  for (const bad of ['', 'a'.repeat(40), 'has space', 'a/b', 'a?b', 'a@b', '../x', 'a..b', 'https://evil.test', 'name%2fsecret']) assert.equal(cleanName(bad), '', bad);
  assert.equal(fill('https://github.com/{name}', 'octocat'), 'https://github.com/octocat');
  assert.equal(fill('https://news.ycombinator.com/user?id={name}', 'octocat'), 'https://news.ycombinator.com/user?id=octocat');
  assert.equal(fill('https://{name}.example.com/x', 'evil'), '');
  assert.equal(fill('http://github.com/{name}', 'octocat'), '');
  assert.equal(fill('https://user:pass@github.com/{name}', 'octocat'), '');
});

test('the allowlist is 15 to 25 https hosts, and a redirect cannot leave its host', () => {
  assert.ok(SITES.length >= 15 && SITES.length <= 25, String(SITES.length));
  assert.equal(new Set(SITES.map((s) => s.id)).size, SITES.length);
  for (const site of SITES) {
    assert.ok(hosts.has(new URL(pageUrl(site, 'octocat')).hostname), site.id);
    assert.ok(hosts.has(new URL(checkTarget(site, 'octocat')).hostname), site.id);
  }
  assert.equal(sameHost('https://github.com/octocat', '/OctoCat'), 'https://github.com/OctoCat');
  for (const bad of ['https://evil.test/x', 'http://github.com/octocat2', 'https://github.com.evil.test/x', 'https://user:pass@github.com/x', 'https://github.com:8443/x']) assert.equal(sameHost('https://github.com/octocat', bad), '');
  const plain = SITES.find((s) => s.id === 'github'), hn = SITES.find((s) => s.id === 'hn');
  assert.equal(judge(plain, 200, ''), 'found');
  assert.equal(judge(plain, 404, ''), 'missing');
  assert.equal(judge(plain, 500, ''), 'unchecked');
  assert.equal(judge(hn, 200, 'No such user.'), 'missing');
  assert.equal(judge(hn, 200, ''), 'unchecked');
  assert.equal(judge(SITES.find((s) => s.id === 'bluesky'), 400, ''), 'missing');
});

test('a check fetches only the allowlist, follows one same-host redirect, and skips a name the site cannot hold', async () => {
  const routes = {};
  for (const site of SITES) routes[checkTarget(site, 'octocat')] = { status: site.id === 'reddit' ? 302 : site.id === 'hn' ? 200 : 404, location: site.id === 'reddit' ? 'https://evil.test/user/octocat' : '', body: site.id === 'hn' ? 'No such user.' : '' };
  const gitlab = checkTarget(SITES.find((s) => s.id === 'gitlab'), 'octocat');
  routes[gitlab] = { status: 301, location: 'https://gitlab.com/OctoCat' };
  routes['https://gitlab.com/OctoCat'] = { status: 200 };
  routes[checkTarget(SITES.find((s) => s.id === 'npm'), 'octocat')] = { error: new Error('timed out') };
  const { calls, fetchFn } = fake(routes);
  const skip = await checkName('good_name', fetchFn);
  assert.equal(skip.find((s) => s.id === 'github').result, 'unchecked');
  assert.equal(calls.some((c) => c.url === checkTarget(SITES.find((s) => s.id === 'github'), 'good_name')), false);
  calls.length = 0;
  const rows = await checkName('octocat', fetchFn);
  assert.equal(rows.length, SITES.length);
  for (const call of calls) { assert.equal(call.redirect, 'manual'); assert.ok(hosts.has(new URL(call.url).hostname), call.url); }
  assert.equal(rows.find((s) => s.id === 'reddit').result, 'unchecked');
  assert.equal(rows.find((s) => s.id === 'gitlab').result, 'found');
  assert.equal(rows.find((s) => s.id === 'hn').result, 'missing');
  assert.equal(rows.find((s) => s.id === 'npm').result, 'unchecked');
  assert.equal(calls.some((c) => c.url.includes('evil.test')), false);
});

test('the route refuses a bad name, ignores a supplied url, and rate-limits', async () => {
  const store = new Map();
  globalThis.caches = { default: { match: async (k) => store.has(k.url) ? new Response(store.get(k.url)) : undefined, put: async (k, res) => { store.set(k.url, await res.text()); } } };
  try {
    assert.equal((await onRequestGet({ request: req('?name=' + encodeURIComponent('https://evil.test')), env: {}, fetchFn: async () => { throw new Error('no'); } })).status, 400);
    const calls = [];
    const fetchFn = async (url, opts) => { calls.push(String(url)); assert.equal(opts.redirect, 'manual'); return { status: 404, ok: false, headers: { get: () => null }, text: async () => '', body: { cancel: async () => {} } }; };
    const ok = await onRequestGet({ request: req('?name=octocat&url=' + encodeURIComponent('https://evil.test/steal')), env: {}, fetchFn });
    const body = await ok.json();
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('cache-control'), 'no-store');
    assert.equal(body.sites.length, SITES.length);
    assert.equal(body.missing, SITES.length);
    for (const url of calls) assert.ok(hosts.has(new URL(url).hostname), url);
    assert.equal(calls.some((u) => u.includes('evil.test')), false);
    for (let i = 0; i < RL_MAX - 1; i++) assert.equal((await onRequestGet({ request: req('?name=octocat'), env: {}, fetchFn })).status, 200);
    assert.equal((await onRequestGet({ request: req('?name=octocat'), env: {}, fetchFn })).status, 429);
  } finally { delete globalThis.caches; }
});

// The site safety check: a bare public hostname in, a plain-words scorecard out. Fetch is mocked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { whyNotHost, isPrivateIp, scorecard, inspectHost, ITEMS } from '../void-live-deploy/lib/security-check.js';
import { onRequestGet } from '../void-live-deploy/functions/api/security-check.js';

const REFUSED = ['', '   ', 'localhost', 'foo.localhost', 'foo.local', 'foo.internal', 'foo.lan', 'metadata.google.internal', 'metadata.google.com', '127.0.0.1', '10.1.2.3', '192.168.1.20', '172.16.0.1', '169.254.169.254', '0.0.0.0', '2130706433', '0x7f000001', '127.1', '0177.0.0.1', '::1', '[::1]', 'fe80::1', 'good-site.com:8443', 'good-site.com:443', 'https://good-site.com', 'https://good-site.com/admin', 'good-site.com/admin', 'user:pass@good-site.com', 'http://127.0.0.1', 'http://127.0.0.1:8080/', 'singlelabel', 'foo.example', 'foo.test'];
const json = (obj) => new Response(JSON.stringify(obj), { status: 200, headers: { 'content-type': 'application/json' } });
const dns = (type, name, data) => { if (type === 'A') return json({ Status: 0, Answer: data ? [{ type: 1, data }] : [] }); if (type === 'AAAA') return json({ Status: 0, Answer: data ? [{ type: 28, data }] : [] }); if (name === 'good-site.com') return json({ Status: 0, Answer: [{ type: 16, data: '"v=spf1 -all"' }] }); if (name === '_dmarc.good-site.com') return json({ Status: 0, Answer: [{ type: 16, data: '"v=DMARC1; p=reject"' }] }); return json({ Status: 0, Answer: [] }); };

test('only a bare public hostname is accepted, and private addresses are recognized', () => {
  assert.equal(whyNotHost('good-site.com'), '');
  assert.equal(whyNotHost('Good-Site.com.'), '');
  for (const bad of REFUSED) assert.notEqual(whyNotHost(bad), '', bad);
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.1', '172.16.5.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '192.0.2.1', '203.0.113.5', '224.0.0.1', '255.255.255.255', '::1', 'fe80::1', 'fd00::1', '2001:db8::1', '::ffff:10.0.0.1']) assert.equal(isPrivateIp(ip), true, ip);
  for (const ip of ['1.1.1.1', '8.8.8.8', '93.184.216.34', '2606:4700:4700::1111', '::ffff:1.1.1.1']) assert.equal(isPrivateIp(ip), false, ip);
});

test('a refused name or a private address is never opened', async () => {
  const never = async (url) => { throw new Error('fetched ' + url); };
  for (const bad of REFUSED) { const out = await inspectHost(bad, never); assert.equal(out.status, 400, bad); }
  for (const ip of ['10.1.2.3', '127.0.0.1', '::1']) {
    const calls = [];
    const out = await inspectHost('good-site.com', async (url) => { calls.push(String(url)); const u = new URL(url); assert.equal(u.hostname, 'cloudflare-dns.com'); const type = u.searchParams.get('type'); return dns(type, u.searchParams.get('name'), ip.includes(':') && type === 'AAAA' ? ip : ip.includes(':') ? '1.1.1.1' : type === 'A' ? ip : ''); });
    assert.match(out.why, /private|not a public/);
    assert.ok(calls.every((c) => c.startsWith('https://cloudflare-dns.com/')));
  }
  const calls = [];
  const both = await inspectHost('good-site.com', async (url) => { calls.push(String(url)); const type = new URL(url).searchParams.get('type'); if (type === 'A') return dns('A', '', '1.1.1.1'); if (type === 'AAAA') return dns('AAAA', '', '::1'); throw new Error(url); });
  assert.match(both.why, /private/);
  assert.ok(calls.every((c) => new URL(c).hostname === 'cloudflare-dns.com'));
});

test('a public site scores in place, a private redirect is not followed, and secrets stay out', async () => {
  const pageHeaders = new Headers({ 'strict-transport-security': 'max-age=16000000', 'content-security-policy': "default-src 'self'; frame-ancestors 'none'", 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin' });
  pageHeaders.append('set-cookie', 'session=super-secret-value; Secure; HttpOnly; SameSite=Lax');
  const good = await inspectHost('Good-Site.com', async (url) => {
    const u = String(url);
    if (u.startsWith('https://cloudflare-dns.com/')) { const q = new URL(u); return dns(q.searchParams.get('type'), q.searchParams.get('name'), q.searchParams.get('type') === 'A' ? '1.1.1.1' : ''); }
    if (u === 'http://good-site.com/') return new Response(null, { status: 301, headers: { location: 'https://good-site.com/' } });
    if (u === 'https://good-site.com/.well-known/security.txt') return new Response('Contact: mailto:security@good-site.com\nExpires: 2027-12-01T00:00:00Z\n', { status: 200 });
    if (u === 'https://good-site.com/') return new Response('<html>home</html>', { status: 200, headers: pageHeaders });
    throw new Error(u);
  });
  assert.equal(good.card.host, 'good-site.com');
  assert.equal(good.card.inPlace, ITEMS.length);
  assert.match(good.card.summary, /12 in place/);
  const body = JSON.stringify(good.card);
  assert.equal(body.includes('super-secret-value') || body.includes('security@') || body.includes('1.1.1.1'), false);
  assert.match(good.card.items.find((i) => i.id === 'https').means, /encrypted address/);
  const calls = [];
  const moved = await inspectHost('good-site.com', async (url) => {
    const u = String(url); calls.push(u);
    if (u.startsWith('https://cloudflare-dns.com/')) { const q = new URL(u); const name = q.searchParams.get('name'); if (name === 'rebind-site.com') return dns('A', name, '10.0.0.1'); return dns(q.searchParams.get('type'), name, q.searchParams.get('type') === 'A' ? '1.1.1.1' : ''); }
    if (u === 'https://good-site.com/') return new Response(null, { status: 302, headers: { location: 'https://rebind-site.com/' } });
    if (u === 'http://good-site.com/') return new Response(null, { status: 301, headers: { location: 'https://127.0.0.1/' } });
    if (u.includes('security.txt')) return new Response('nope', { status: 404 });
    throw new Error('followed ' + u);
  });
  assert.equal(moved.card.items.find((i) => i.id === 'https').state, 'fail');
  assert.equal(moved.card.items.find((i) => i.id === 'http').state, 'fail');
  assert.ok(calls.every((c) => !c.includes('127.0.0.1') && !c.startsWith('https://rebind-site.com')));
});

test('missing signals say how to fix them', () => {
  const card = scorecard({ host: 'good-site.com', https: { tls: true, status: 200, headers: new Headers({ 'content-security-policy-report-only': "default-src 'self'" }), cookies: ['session=super-secret-value; Path=/'] }, http: { status: 200, location: '' }, txt: { status: 404, body: '' }, spf: ['v=spf1 +all'], dmarc: ['v=DMARC1; p=none; rua=mailto:reports@good-site.com'] });
  const by = Object.fromEntries(card.items.map((i) => [i.id, i]));
  assert.equal(by.http.state, 'fail'); assert.match(by.http.fix, /redirect/);
  assert.equal(by.hsts.state, 'fail'); assert.match(by.hsts.fix, /Strict-Transport-Security/);
  assert.equal(by.csp.state, 'warn'); assert.match(by.csp.fix, /report-only/);
  assert.equal(by.cookies.state, 'fail');
  assert.equal(by.spf.state, 'fail'); assert.match(by.spf.detail, /\+all/);
  assert.equal(by.dmarc.state, 'warn'); assert.match(by.dmarc.detail, /p=none/);
  assert.equal(by.securitytxt.state, 'fail'); assert.match(by.securitytxt.fix, /security\.txt/);
  const text = JSON.stringify(card);
  assert.equal(text.includes('super-secret-value') || text.includes('reports@'), false);
});

test('one address gets eight checks a minute, and the page draws text', async () => {
  const store = new Map(), prev = globalThis.caches, ip = '198.51.100.20';
  globalThis.caches = { default: { async match(req) { const v = store.get(req.url); return v == null ? undefined : new Response(v); }, async put(req, res) { store.set(req.url, await res.text()); } } };
  try {
    let last = 0;
    for (let i = 0; i < 9; i++) { const res = await onRequestGet({ request: new Request('https://a-to-mind.com/api/security-check?host=127.0.0.1', { headers: { 'cf-connecting-ip': ip } }), env: { SALT: 'test-salt' }, fetchFn: async () => { throw new Error('fetched'); } }); last = res.status; if (i < 8) assert.equal(res.status, 400); }
    assert.equal(last, 429);
    assert.equal([...store.values()].join('\n').includes(ip), false);
  } finally { if (prev === undefined) delete globalThis.caches; else globalThis.caches = prev; }
  const page = readFileSync(new URL('../void-live-deploy/security/check/index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../void-live-deploy/security/check/app.js', import.meta.url), 'utf8');
  const policy = readFileSync(new URL('../void-live-deploy/security/index.html', import.meta.url), 'utf8');
  assert.match(page, /id="host"/); assert.match(page, /id="go"/); assert.match(page, /canonical" href="https:\/\/a-to-mind\.com\/security\/check\/"/);
  assert.match(policy, /href="\/security\/check\/"/); assert.equal(app.includes('innerHTML') || page.includes('innerHTML'), false); assert.equal(ITEMS.length, 12);
});

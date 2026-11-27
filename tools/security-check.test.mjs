// The site safety check (lib/security-check.js, functions/api/security-check.js, /security/check/):
// a bare public hostname in, a plain-words scorecard out. Fetch is mocked. Private addresses, IP numbers and odd ports never leave the checker.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { whyNotHost, isPrivateIp, scorecard, inspectHost, ITEMS } from '../void-live-deploy/lib/security-check.js';
import { onRequestGet } from '../void-live-deploy/functions/api/security-check.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');

const REFUSED = [
  '', '   ', 'localhost', 'foo.localhost', 'foo.local', 'foo.internal', 'foo.lan', 'metadata.google.internal', 'metadata.google.com',
  '127.0.0.1', '10.1.2.3', '192.168.1.20', '172.16.0.1', '169.254.169.254', '0.0.0.0', '2130706433', '0x7f000001', '127.1', '0177.0.0.1',
  '::1', '[::1]', 'fe80::1',
  'good-site.com:8443', 'good-site.com:443', 'https://good-site.com', 'https://good-site.com/admin', 'good-site.com/admin',
  'user:pass@good-site.com', 'http://127.0.0.1', 'http://127.0.0.1:8080/', 'singlelabel', 'foo.example', 'foo.test',
];

function json(obj, status = 200, headers) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...(headers || {}) } });
}

/** a public site that publishes every signal, plus whatever extra routes a test adds. */
function world(extra = {}) {
  const calls = [];
  const fetchImpl = async (url) => {
    const u = String(url);
    calls.push(u);
    if (extra.before) { const hit = await extra.before(u); if (hit) return hit; }
    if (u.startsWith('https://cloudflare-dns.com/')) {
      const q = new URL(u);
      const name = q.searchParams.get('name');
      const type = q.searchParams.get('type');
      if (type === 'A') return json({ Status: 0, Answer: [{ type: 1, data: '1.1.1.1' }] });
      if (type === 'AAAA') return json({ Status: 0, Answer: [] });
      if (type === 'TXT' && name === 'good-site.com') return json({ Status: 0, Answer: [{ type: 16, data: '"v=spf1 -all"' }] });
      if (type === 'TXT' && name === '_dmarc.good-site.com') return json({ Status: 0, Answer: [{ type: 16, data: '"v=DMARC1; p=reject"' }] });
      return json({ Status: 0, Answer: [] });
    }
    if (u === 'http://good-site.com/') return new Response(null, { status: 301, headers: { location: 'https://good-site.com/' } });
    if (u === 'https://good-site.com/.well-known/security.txt') {
      return new Response('Contact: mailto:security@good-site.com\nExpires: 2027-12-01T00:00:00Z\n', { status: 200, headers: { 'content-type': 'text/plain' } });
    }
    if (u === 'https://good-site.com/') {
      const headers = new Headers({
        'strict-transport-security': 'max-age=16000000',
        'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'strict-origin-when-cross-origin',
      });
      headers.append('set-cookie', 'session=super-secret-value; Secure; HttpOnly; SameSite=Lax');
      return new Response('<html>home</html>', { status: 200, headers });
    }
    throw new Error('unexpected fetch ' + u);
  };
  return { fetchImpl, calls };
}

test('only a bare public hostname is accepted', () => {
  assert.equal(whyNotHost('good-site.com'), '');
  assert.equal(whyNotHost('Good-Site.com.'), '');
  for (const bad of REFUSED) assert.notEqual(whyNotHost(bad), '', bad);
});

test('private and non-routable addresses are recognized, public ones are not', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.1', '172.16.5.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '192.0.2.1', '203.0.113.5', '224.0.0.1', '255.255.255.255', '::1', 'fe80::1', 'fd00::1', '2001:db8::1', '::ffff:10.0.0.1']) {
    assert.equal(isPrivateIp(ip), true, ip);
  }
  for (const ip of ['1.1.1.1', '8.8.8.8', '93.184.216.34', '2606:4700:4700::1111', '::ffff:1.1.1.1']) {
    assert.equal(isPrivateIp(ip), false, ip);
  }
});

test('a refused name never causes a fetch', async () => {
  const never = async (url) => { throw new Error('fetched ' + url); };
  for (const bad of REFUSED) {
    const out = await inspectHost(bad, never);
    assert.equal(out.ok, false, bad);
    assert.equal(out.status, 400, bad);
  }
});

test('a name that resolves to a private address is not opened', async () => {
  for (const ip of ['10.1.2.3', '127.0.0.1', '::1']) {
    const calls = [];
    const out = await inspectHost('good-site.com', async (url) => {
      calls.push(String(url));
      const u = new URL(url);
      assert.equal(u.hostname, 'cloudflare-dns.com', ip);
      const type = u.searchParams.get('type');
      if (type === 'A') return json({ Status: 0, Answer: [{ type: 1, data: ip.includes(':') ? '1.1.1.1' : ip }] });
      if (type === 'AAAA') return json({ Status: 0, Answer: ip.includes(':') ? [{ type: 28, data: ip }] : [] });
      return json({ Status: 0, Answer: [] });
    });
    assert.equal(out.ok, false, ip);
    assert.match(out.why, /private|not a public/, ip);
    assert.ok(calls.every((c) => c.startsWith('https://cloudflare-dns.com/')), ip);
  }
});

test('a public address beside a private one is still refused', async () => {
  const calls = [];
  const out = await inspectHost('good-site.com', async (url) => {
    calls.push(String(url));
    const type = new URL(url).searchParams.get('type');
    if (type === 'A') return json({ Status: 0, Answer: [{ type: 1, data: '1.1.1.1' }] });
    if (type === 'AAAA') return json({ Status: 0, Answer: [{ type: 28, data: '::1' }] });
    throw new Error('opened ' + url);
  });
  assert.equal(out.ok, false);
  assert.match(out.why, /private/);
  assert.ok(calls.every((c) => new URL(c).hostname === 'cloudflare-dns.com'));
});

test('a full public site scores in place, and secrets in the answer stay out of the card', async () => {
  const { fetchImpl } = world();
  const out = await inspectHost('Good-Site.com', fetchImpl);
  assert.equal(out.ok, true);
  assert.equal(out.card.host, 'good-site.com');
  assert.equal(out.card.items.length, ITEMS.length);
  assert.equal(out.card.missing, 0);
  assert.equal(out.card.weak, 0);
  assert.equal(out.card.inPlace, ITEMS.length);
  assert.match(out.card.summary, /12 in place/);
  const body = JSON.stringify(out.card);
  assert.equal(body.includes('super-secret-value'), false);
  assert.equal(body.includes('security@'), false);
  assert.equal(body.includes('1.1.1.1'), false);
  const https = out.card.items.find((i) => i.id === 'https');
  assert.equal(https.state, 'pass');
  assert.match(https.means, /encrypted address/);
  assert.match(https.fix, /https/);
});

test('a redirect toward a private address is not followed', async () => {
  const calls = [];
  const out = await inspectHost('good-site.com', async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.startsWith('https://cloudflare-dns.com/')) {
      const type = new URL(u).searchParams.get('type');
      const name = new URL(u).searchParams.get('name');
      if (name === 'rebind-site.com') return json({ Status: 0, Answer: [{ type: 1, data: '10.0.0.1' }] });
      if (type === 'A') return json({ Status: 0, Answer: [{ type: 1, data: '1.1.1.1' }] });
      return json({ Status: 0, Answer: [] });
    }
    if (u === 'https://good-site.com/') return new Response(null, { status: 302, headers: { location: 'https://rebind-site.com/' } });
    if (u === 'http://good-site.com/') return new Response(null, { status: 301, headers: { location: 'https://127.0.0.1/' } });
    if (u.includes('security.txt')) return new Response('nope', { status: 404 });
    throw new Error('followed ' + u);
  });
  assert.equal(out.ok, true);
  assert.equal(out.card.items.find((i) => i.id === 'https').state, 'fail');
  assert.equal(out.card.items.find((i) => i.id === 'http').state, 'fail');
  assert.ok(calls.every((c) => !c.includes('127.0.0.1') && !c.startsWith('https://rebind-site.com') && !c.startsWith('https://10.0.0.1')));
});

test('missing signals say how to fix them, and a weak mail policy is not called fine', () => {
  const headers = new Headers({ 'content-security-policy-report-only': "default-src 'self'" });
  const card = scorecard({
    host: 'good-site.com',
    https: { tls: true, status: 200, headers, cookies: ['session=super-secret-value; Path=/'] },
    http: { status: 200, location: '' },
    txt: { status: 404, body: '' },
    spf: ['v=spf1 +all'],
    dmarc: ['v=DMARC1; p=none; rua=mailto:reports@good-site.com'],
  });
  const by = Object.fromEntries(card.items.map((i) => [i.id, i]));
  assert.equal(by.http.state, 'fail');
  assert.match(by.http.fix, /redirect/);
  assert.equal(by.hsts.state, 'fail');
  assert.match(by.hsts.fix, /Strict-Transport-Security/);
  assert.equal(by.csp.state, 'warn');
  assert.match(by.csp.fix, /report-only/);
  assert.equal(by.cookies.state, 'fail');
  assert.equal(JSON.stringify(card).includes('super-secret-value'), false);
  assert.equal(JSON.stringify(card).includes('reports@'), false);
  assert.equal(by.spf.state, 'fail');
  assert.match(by.spf.detail, /\+all/);
  assert.equal(by.dmarc.state, 'warn');
  assert.match(by.dmarc.detail, /p=none/);
  assert.equal(by.securitytxt.state, 'fail');
  assert.match(by.securitytxt.fix, /security\.txt/);
});

test('the route refuses a burst and never stores the address it limited', async () => {
  const store = new Map();
  const prev = globalThis.caches;
  globalThis.caches = { default: {
    async match(req) { const v = store.get(req.url); return v == null ? undefined : new Response(v); },
    async put(req, res) { store.set(req.url, await res.text()); },
  } };
  const ip = '198.51.100.20';
  try {
    let last = 0;
    for (let i = 0; i < 9; i++) {
      const res = await onRequestGet({
        request: new Request('https://a-to-mind.com/api/security-check?host=127.0.0.1', { headers: { 'cf-connecting-ip': ip } }),
        env: { SALT: 'test-salt' },
        fetchFn: async () => { throw new Error('fetched'); },
      });
      last = res.status;
      if (i < 8) assert.equal(res.status, 400);
    }
    assert.equal(last, 429);
    const saved = [...store.values()].join('\n');
    assert.equal(saved.includes(ip), false);
  } finally {
    if (prev === undefined) delete globalThis.caches;
    else globalThis.caches = prev;
  }
});

test('the page is linked from the security policy and draws with text, not HTML injection', () => {
  const page = read('void-live-deploy/security/check/index.html');
  const app = read('void-live-deploy/security/check/app.js');
  const policy = read('void-live-deploy/security/index.html');
  assert.match(page, /id="host"/);
  assert.match(page, /id="go"/);
  assert.match(page, /href="\/security\/"/);
  assert.match(page, /canonical" href="https:\/\/a-to-mind\.com\/security\/check\/"/);
  assert.match(policy, /href="\/security\/check\/"/);
  assert.equal(app.includes('innerHTML'), false);
  assert.equal(page.includes('innerHTML'), false);
  assert.equal(ITEMS.length, 12);
});

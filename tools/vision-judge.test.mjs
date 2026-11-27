import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { surfacesOf, liveSurfacesOf, redirectDestOf, pixelStats, judge, run, decodePng, renderingCreds, LIMITS } from './vision-judge.mjs';

const frame = (w, h, f) => { const d = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = f(x, y), i = (y * w + x) * 4; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; } return d; };

test('a change maps to the surfaces it can alter', () => {
  assert.deepEqual(surfacesOf(['void.html', 'void-live-deploy/films/index.html', 'tools/x.mjs', 'void-live-deploy/skills/clock.js']), ['/', '/films/']);
  assert.deepEqual(surfacesOf(['docs/MAP.md']), []);
  assert.equal(surfacesOf(Array.from({ length: 20 }, (_, i) => 'void-live-deploy/p' + i + '/index.html')).length, LIMITS.MAX_SURFACES);
});

test('a deleted page is judged at the address it 301s to, and a gone path with no redirect is dropped', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vj-redir-'));
  fs.mkdirSync(path.join(dir, 'color'));
  fs.writeFileSync(path.join(dir, 'color', 'index.html'), '<p>family</p>');
  fs.writeFileSync(path.join(dir, '_redirects'), '/color/colour-management /color/ 301\n/color/colour-management/ /color/ 301\n');
  assert.equal(redirectDestOf('/color/colour-management /color/ 301\n', '/color/colour-management/'), '/color/');
  assert.deepEqual(liveSurfacesOf(['void-live-deploy/color/colour-management/index.html', 'void-live-deploy/gone/index.html'], dir), ['/color/']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('pixel measures: a soft glow has few hard edges, a hard-edged disk many, a flat frame is blank', () => {
  const W = 160, H = 160, r = (x, y) => Math.hypot(x - 80, y - 80) / 60;
  const soft = pixelStats(frame(W, H, (x, y) => 8 + 120 * Math.max(0, 1 - r(x, y)) ** 4), W, H);
  const hard = pixelStats(frame(W, H, (x, y) => (r(x, y) < 0.3 ? 230 : 8)), W, H);
  assert.ok(soft.hardEdge < LIMITS.HARD_EDGE, JSON.stringify(soft));
  assert.ok(hard.hardEdge > LIMITS.HARD_EDGE, JSON.stringify(hard));
  assert.ok(pixelStats(frame(W, H, () => 5), W, H).offMode < LIMITS.BLANK);
});

test('pixel measures: points of light drawn as flat discs are harsh; the same points as a (1 - r)^4 falloff are not', () => {
  const W = 200, H = 200, at = [];
  for (let i = 0; i < 25; i++) at.push([20 + (i % 5) * 40, 20 + Math.floor(i / 5) * 40]);
  const near = (x, y) => Math.min(...at.map(([a, b]) => Math.hypot(x - a, y - b)));
  const discs = pixelStats(frame(W, H, (x, y) => (near(x, y) <= 1.6 ? 220 : 6)), W, H);
  const soft = pixelStats(frame(W, H, (x, y) => 6 + 214 * Math.max(0, 1 - near(x, y) / 6) ** 4), W, H);
  assert.equal(discs.dots, 25); assert.equal(soft.dots, 25);
  assert.ok(discs.hardDots > LIMITS.HARD_DOTS, JSON.stringify(discs));
  assert.ok(soft.hardDots < LIMITS.HARD_DOTS, JSON.stringify(soft));
  assert.equal(discs.hardEdge, 0, 'points are not shapes');
});

test('judge names each failure with the surface, the viewport and the numbers', () => {
  const dom = { errors: ['boom'], scrollX: 40, clipped: ['p.x'], bg: 0.9, media: ['video a.mp4'] };
  const bad = judge('/', 'mobile', dom, { mean: 0.5, offMode: 0.0001, hardEdge: 0.5, dots: 10, hardDots: 0.5 });
  for (const w of ['console/page error', 'sideways scroll', 'clipped text', 'not the dark theme', 'blank render', 'media failed', 'not near-black', 'hard-edged', 'harsh star dots']) assert.ok(bad.some((b) => b.includes(w) && b.startsWith('/ @ mobile')), w);
  assert.deepEqual(judge('/films/', 'desktop', { errors: [], scrollX: 0, clipped: [], bg: 0.01, media: [] }, { mean: 0.5, offMode: 0.2, hardEdge: 0.9 }), []);
});

const chrome = [process.env.VOID_TEST_BROWSER, '/usr/bin/google-chrome'].find((p) => p && fs.existsSync(p));
test('in a real browser: a white landing fails; a dark page with text passes', { skip: !chrome && 'no Chrome here' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vj-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><body style="margin:0;background:#fff"><p>Buy now $9</p><form id="row"><input placeholder="Ask anything"></form></body>');
  fs.mkdirSync(path.join(dir, 'ok'));
  fs.writeFileSync(path.join(dir, 'ok', 'index.html'), '<!doctype html><body style="margin:0;background:#05070d;color:#ddd"><h1 style="font-size:64px">Tools</h1>' + '<p style="font-size:22px">Plain words about the tools Verse keeps, one line each.</p>'.repeat(8) + '</body>');
  const r = await run({ paths: ['/', '/ok/'], dir });
  const land = r.filter((x) => x.path === '/').flatMap((x) => x.failures), ok = r.filter((x) => x.path === '/ok/').flatMap((x) => x.failures);
  assert.ok(land.some((f) => /not the dark theme/.test(f)), land.join('\n'));
  assert.deepEqual(ok, []);
});

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return ~c >>> 0;
}
function pngChunk(type, data) {
  const t = Buffer.from(type), len = Buffer.alloc(4), crc = Buffer.alloc(4);
  len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
/** a tiny RGBA PNG (filter 0) so the Browser Rendering mock can hand back bytes the judge decodes. */
function pngOf(w, h, f) {
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0;
    for (let x = 0; x < w; x++) {
      const v = f(x, y), i = y * (1 + w * 4) + 1 + x * 4;
      raw[i] = raw[i + 1] = raw[i + 2] = v; raw[i + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]);
}
function pngResponse(png, status = 200) {
  const bytes = png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength);
  return { ok: status >= 200 && status < 300, status, headers: { get: (h) => (String(h).toLowerCase() === 'content-type' ? 'image/png' : '') }, async arrayBuffer() { return bytes; }, async text() { return ''; } };
}
function fakeChrome() {
  const page = {
    on() {},
    async goto() {},
    async waitForTimeout() {},
    async fill() {},
    async press() {},
    mouse: { async move() {} },
    async screenshot() { return Buffer.from([0]); },
    async close() {},
    async evaluate(fn, arg) {
      if (arg && arg.fn) return { mean: 0.02, offMode: 0.2, bright: 0, hardEdge: 0, dots: 0, hardDots: 0 };
      const s = Function.prototype.toString.call(fn);
      if (s.includes('did not play')) return [];
      if (s.includes('scrollWidth')) return { scrollX: 0, clipped: [], bg: 0.01, media: [], mask: null };
      return '';
    },
  };
  return {
    async newContext() { return { route() {}, async newPage() { return page; }, async close() {} }; },
    async newPage() { return page; },
    async close() {},
  };
}

test('local Chrome path screenshots with the local browser and does not call Cloudflare', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vj-local-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>local</title>');
  let fetches = 0;
  const launched = [];
  const token = 'made-up-token-value'; // secret-scan: ok (a made-up token for the test)
  const r = await run({
    paths: ['/'], dir, chrome: '/tmp/fake-chrome',
    env: { CLOUDFLARE_ACCOUNT_ID: 'acct-test-1', CLOUDFLARE_API_TOKEN: token },
    fetch: async () => { fetches += 1; throw new Error('network'); },
    launch: async (exe) => { launched.push(exe); return fakeChrome(); },
  });
  assert.deepEqual(launched, ['/tmp/fake-chrome']);
  assert.equal(fetches, 0);
  assert.equal(r.length, 2);
  assert.ok(r.every((row) => row.via === 'chrome' && !row.skipped && row.px && row.px.mean === 0.02));
  assert.equal(JSON.stringify(r).includes(token), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('with no local Chrome, the screenshot comes from Cloudflare Browser Rendering', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vj-cf-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>remote-marker</title><p>dark page</p>');
  const token = 'made-up-token-value'; // secret-scan: ok (a made-up token for the test)
  const env = { CLOUDFLARE_ACCOUNT_ID: 'acct-test-1', CLOUDFLARE_API_TOKEN: token };
  assert.equal(renderingCreds({ CLOUDFLARE_ACCOUNT_ID: 'acct-test-1' }), null);
  assert.equal(renderingCreds({ CLOUDFLARE_API_TOKEN: token }), null);
  assert.equal(renderingCreds({ CLOUDFLARE_ACCOUNT_ID: 'acct-test-1', CLOUDFLARE_AI_TOKEN: token }).token, token);
  const dark = pngOf(32, 32, (x, y) => ((x + y) % 17 === 0 ? 48 : 8));
  const decoded = decodePng(dark);
  assert.equal(decoded.width, 32);
  assert.equal(decoded.data[0], 48);
  assert.equal(decoded.data[4], 8);
  const sub = Buffer.from([1, 10, 20, 30, 255, 0, 0, 0, 0]);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 6;
  const subPng = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(sub)), pngChunk('IEND', Buffer.alloc(0))]);
  const subFrame = decodePng(subPng);
  assert.equal(subFrame.data[0], 10); assert.equal(subFrame.data[4], 10); assert.equal(subFrame.data[7], 255);
  const calls = [];
  const r = await run({
    paths: ['/'], dir, chrome: '', env,
    fetch: async (url, init) => { calls.push({ url, init }); return pngResponse(dark); },
  });
  assert.equal(calls.length, 2);
  assert.ok(r.every((row) => row.via === 'browser-rendering' && !row.skipped && row.failures.length === 0), JSON.stringify(r));
  assert.ok(r[0].px.mean < LIMITS.NEAR_BLACK);
  for (const c of calls) {
    assert.match(c.url, /\/accounts\/acct-test-1\/browser-rendering\/screenshot$/);
    assert.equal(c.init.method, 'POST');
    assert.equal(c.init.headers.authorization, 'Bearer ' + token);
    const body = JSON.parse(c.init.body);
    assert.ok(body.viewport.width === 1280 || body.viewport.width === 390);
    assert.equal(body.viewport.height, body.viewport.width === 1280 ? 800 : 844);
    assert.equal(body.screenshotOptions.type, 'png');
    assert.match(body.html, /remote-marker/);
    assert.equal(JSON.stringify(body).includes(token), false);
  }
  assert.equal(JSON.stringify(r).includes(token), false);
  const asJson = await run({
    paths: ['/'], dir, chrome: '', env,
    fetch: async () => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, async arrayBuffer() { return Buffer.from(JSON.stringify({ success: true, result: dark.toString('base64') })); }, async text() { return ''; } }),
  });
  assert.ok(asJson.every((row) => row.via === 'browser-rendering' && row.failures.length === 0), JSON.stringify(asJson));
  const light = pngOf(32, 32, (x, y) => ((x + y) % 17 === 0 ? 8 : 240));
  const bad = await run({ paths: ['/'], dir, chrome: '', env, fetch: async () => pngResponse(light) });
  assert.ok(bad.some((row) => row.failures.some((f) => /not the dark theme|not near-black/.test(f))), JSON.stringify(bad));
  const down = await run({ paths: ['/'], dir, chrome: '', env, fetch: async () => pngResponse(Buffer.alloc(0), 503) });
  assert.equal(down.length, 2);
  assert.ok(down.every((row) => row.failures.some((f) => f.includes('HTTP 503')) && !JSON.stringify(row).includes(token)));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('with no Chrome and no Cloudflare credentials, the judge returns skipped: no browser available', async () => {
  let fetches = 0, launches = 0;
  const r = await run({
    paths: ['/', '/films/'], chrome: '', dir: os.tmpdir(),
    env: { CLOUDFLARE_ACCOUNT_ID: '', CLOUDFLARE_API_TOKEN: '', CLOUDFLARE_AI_TOKEN: '', VOID_TEST_BROWSER: '/usr/bin/google-chrome' },
    fetch: async () => { fetches += 1; throw new Error('network'); },
    launch: async () => { launches += 1; throw new Error('should not launch'); },
  });
  assert.equal(fetches, 0);
  assert.equal(launches, 0);
  assert.equal(r.length, 4);
  assert.ok(r.every((row) => row.skipped === 'no browser available' && row.via === 'none' && row.failures.length === 0 && row.px === null));
});

test('the landing horizon stays soft at night on a phone', { skip: !chrome && 'no Chrome here' }, async () => {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'void-live-deploy');
  const r = await run({ paths: ['/'], dir, phase: 'night' });
  const mobile = r.find((x) => x.path === '/' && x.viewport === 'mobile');
  assert.ok(mobile, 'the phone landing was measured');
  assert.equal(mobile.failures.join('\n'), '');
  assert.ok(mobile.px.hardEdge <= LIMITS.HARD_EDGE, 'night phone hard-edge ' + mobile.px.hardEdge + ' > ' + LIMITS.HARD_EDGE);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  clampBytes,
  formatMbps,
  median,
  jitter,
  gradeLine,
  onRequestGet,
  onRequestPost,
  MAX_BYTES,
  MIN_BYTES,
} from '../void-live-deploy/functions/line-speed/index.js';

test('line-speed math helpers are pure and bounded', () => {
  assert.equal(clampBytes(100), MIN_BYTES);
  assert.equal(clampBytes(1e9), MAX_BYTES);
  assert.equal(formatMbps(1_000_000, 1000), 8);
  assert.equal(median([40, 10, 20]), 20);
  assert.equal(median([10, 20, 30, 40]), 25);
  assert.equal(jitter([10, 14, 12]), 3);
  assert.match(gradeLine(150, 20), /Very fast/);
  assert.match(gradeLine(30, 50), /Fast/);
  assert.match(gradeLine(2, 100), /Slow/);
});

test('GET /line-speed/ probes answer ping/down with no-store and pass page requests to next()', async () => {
  let nextCalled = false;
  const pageRes = await onRequestGet({
    request: new Request('https://a-to-mind.com/line-speed/'),
    next: async () => { nextCalled = true; return new Response('page'); },
  });
  assert.equal(nextCalled, true);
  assert.equal(await pageRes.text(), 'page');

  const pingRes = await onRequestGet({
    request: new Request('https://a-to-mind.com/line-speed/?probe=ping'),
    next: async () => new Response('no'),
  });
  assert.equal(pingRes.status, 200);
  assert.match(pingRes.headers.get('cache-control') || '', /no-store/);
  const ping = await pingRes.json();
  assert.equal(ping.ok, true);

  const downRes = await onRequestGet({
    request: new Request('https://a-to-mind.com/line-speed/?probe=down&bytes=32768'),
    next: async () => new Response('no'),
  });
  assert.equal(downRes.status, 200);
  assert.match(downRes.headers.get('cache-control') || '', /no-store/);
  assert.equal((await downRes.arrayBuffer()).byteLength, 32768);
});

test('POST /line-speed/ supports both upload probes and scripts-off HTML form submission', async () => {
  const upRes = await onRequestPost({
    request: new Request('https://a-to-mind.com/line-speed/?probe=up', { method: 'POST', body: new Uint8Array(8192) }),
  });
  assert.equal(upRes.status, 200);
  const up = await upRes.json();
  assert.equal(up.ok, true);
  assert.equal(up.bytes, 8192);

  const formRes = await onRequestPost({
    request: new Request('https://a-to-mind.com/line-speed/', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'bytes=262144',
    }),
  });
  assert.equal(formRes.status, 200);
  assert.match(formRes.headers.get('content-type') || '', /text\/html/);
  const html = await formRes.text();
  assert.match(html, /verse\.css/);
  assert.match(html, /verse-shell\.js/);
  assert.match(html, /Server-side check complete/);
  assert.match(html, /256 KB/);
});

test('void-live-deploy/line-speed/index.html follows Verse dark-stage and scripts-off form contract', () => {
  const html = fs.readFileSync(new URL('../void-live-deploy/line-speed/index.html', import.meta.url), 'utf8');
  assert.match(html, /\/verse\.css/);
  assert.match(html, /\/verse-shell\.js/);
  assert.match(html, /<form[^>]+method="post"[^>]+action="\/line-speed\/"/i);
  assert.ok(!/speedtest\.sg/i.test(html), 'does not copy or name rival site');
  const links = [...html.matchAll(/href="(\/[a-z0-9-]+\/)"/g)].map((m) => m[1]);
  assert.ok(new Set(links).size >= 4, 'links to at least four sibling Verse tools');
});

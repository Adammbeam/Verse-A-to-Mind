// /build.json with no deploy step to write it: the hash of the shell files this deploy serves (lib/build-id.js, functions/build.json.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { idFromAssets, SHELL_FILES } from '../void-live-deploy/lib/build-id.js';
import { onRequestGet } from '../void-live-deploy/functions/build.json.js';
import { buildId, resetBuild } from '../void-live-deploy/lib/answer-edge.js';

const site = (files) => ({ ASSETS: { fetch: async (r) => { const p = new URL(r.url).pathname; const f = files[p]; return f == null ? new Response('no', { status: 404 }) : new Response(f.body || '', { headers: f.etag ? { etag: f.etag } : {} }); } } });
const shell = () => Object.fromEntries(SHELL_FILES.map((p) => [p, { etag: '"' + p + '-1"' }]));

test('the id is 40 hex, the same for the same files, and new when any shell file changes', async () => {
  const a = await idFromAssets((p) => site(shell()).ASSETS.fetch(new Request('https://x' + p)));
  assert.match(a, /^[0-9a-f]{40}$/);
  assert.equal(await idFromAssets((p) => site(shell()).ASSETS.fetch(new Request('https://x' + p))), a);
  const changed = shell(); changed['/skills/index.json'] = { etag: '"skills-2"' };
  assert.notEqual(await idFromAssets((p) => site(changed).ASSETS.fetch(new Request('https://x' + p))), a);
  const weak = shell(); weak['/'] = { etag: 'W/"/-1"' };
  assert.equal(await idFromAssets((p) => site(weak).ASSETS.fetch(new Request('https://x' + p))), a, 'a weak ETag names the same file');
});

test('a file with no ETag is hashed by its body; no file readable is no id', async () => {
  const one = (body) => idFromAssets((p) => site({ '/': { body } }).ASSETS.fetch(new Request('https://x' + p)));
  assert.notEqual(await one('<html>a'), await one('<html>b'));
  assert.equal(await idFromAssets(async () => new Response('', { status: 404 })), '');
  assert.equal(await idFromAssets(async () => { throw new Error('down'); }), '');
});

test('GET /build.json answers the id uncached; 503 when the files cannot be read', async () => {
  const r = await onRequestGet({ env: site(shell()), request: new Request('https://a-to-mind.com/build.json?v=1') });
  assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'no-store');
  const j = await r.json(); assert.match(j.id, /^[0-9a-f]{40}$/);
  assert.equal((await onRequestGet({ env: {}, request: new Request('https://a-to-mind.com/build.json') })).status, 503);
});

test('the answer cache key: with no /build.json file, the build id is the shell files\' hash', async () => {
  resetBuild();
  const id = await buildId(site(shell()), 'https://a-to-mind.com');
  assert.match(id, /^[0-9a-f]{12}$/);
  resetBuild();
  assert.equal(await buildId(site({ '/build.json': { body: JSON.stringify({ id: 'abcdef1234567890' }) } }), 'https://a-to-mind.com'), 'abcdef123456', 'a written /build.json still wins');
  resetBuild();
});

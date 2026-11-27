// GET /api/health (functions/api/health.js): JSON, never the page shell; 200 with ok when D1 answers, 503 when it does not.
// The GitHub-free runner (tools/verse-runner.mjs) rolls a deploy back when this is not ok.
import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../void-live-deploy/functions/api/health.js';

const req = new Request('https://a-to-mind.com/api/health');
test('health: ok with a working DB, 503 with a broken or missing one, always JSON and never cached', async () => {
  const good = await onRequestGet({ env: { DB: { prepare: () => ({ first: async () => ({ one: 1 }) }) } }, request: req, now: 0 });
  assert.equal(good.status, 200); assert.match(good.headers.get('content-type'), /json/); assert.equal(good.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await good.json(), { ok: true, at: '1970-01-01T00:00:00.000Z', db: 'ok', build: '' });
  const bad = await onRequestGet({ env: { DB: { prepare: () => ({ first: async () => { throw new Error('D1 down'); } }) } }, request: req, now: 0 });
  assert.equal(bad.status, 503); assert.equal((await bad.json()).db, 'down');
  assert.equal((await (await onRequestGet({ env: {}, request: req })).json()).db, 'unbound');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isFree, rankFree, buildPayload, activeLanes } from '../tools/sync-free-lanes.mjs';

test('isFree: $0 prompt and completion', () => {
  assert.equal(isFree({ pricing: { prompt: '0', completion: '0' } }), true);
  assert.equal(isFree({ pricing: { prompt: '0.001', completion: '0' } }), false);
  assert.equal(isFree({}), false);
});
test('rankFree: sorts by context desc and captures modalities/expiration', () => {
  const r = rankFree([
    { id: 'a/m1', pricing: { prompt: '0', completion: '0' }, context_length: 1000, architecture: { input_modalities: ['text'], output_modalities: ['text'] } },
    { id: 'b/m2', pricing: { prompt: '0', completion: '0' }, context_length: 4000, architecture: { input_modalities: ['text'], output_modalities: ['image'] }, endpoints: ['/api/v1/images'], expiration_date: '2026-11-28' },
    { id: 'c/paid', pricing: { prompt: '1', completion: '1' }, context_length: 100000 },
  ]);
  assert.equal(r.length, 2);
  assert.equal(r[0].id, 'b/m2');
  assert.equal(r[0].kind, 'image');
  assert.equal(r[0].expiration_date, '2026-11-28');
  assert.equal(r[1].id, 'a/m1');
  assert.equal(r[1].kind, 'text');
});
test('buildPayload: has count, modality pools, and expiring list', () => {
  const p = buildPayload([
    { id: 'x/text', name: 'X', context: 1000, provider: 'x', kind: 'text', input_modalities: ['text'], output_modalities: ['text'], endpoints: [], expiration_date: null },
    { id: 'x/img', name: 'I', context: 10, provider: 'x', kind: 'image', input_modalities: ['text'], output_modalities: ['image'], endpoints: ['/api/v1/images'], expiration_date: '2026-11-28' },
  ]);
  assert.equal(p.count, 2);
  assert.deepEqual(p.byKind.text, ['x/text']);
  assert.deepEqual(p.byKind.image, ['x/img']);
  assert.equal(p.expiring[0].id, 'x/img');
  assert.ok(p.updated);
});
test('importing the sync tool leaves the real free-lane registry alone', () => {
  const registry = new URL('../void-live-deploy/resources/openrouter-free.json', import.meta.url);
  const before = readFileSync(registry, 'utf8');
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', "import('./tools/sync-free-lanes.mjs').then(() => console.log('imported'))"],
    { cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^imported\s*$/, 'importing the helpers prints and writes nothing');
  assert.equal(readFileSync(registry, 'utf8'), before, 'the committed registry is unchanged');
});
test('activeLanes: drops expired models', () => {
  const now = Date.parse('2026-12-01T00:00:00Z');
  const r = activeLanes([
    { id: 'a', expiration_date: '2026-11-28' },
    { id: 'b', expiration_date: '2026-12-15' },
    { id: 'c', expiration_date: null },
  ], now);
  assert.deepEqual(r.map((m) => m.id), ['b', 'c']);
});
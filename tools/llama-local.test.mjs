import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { findBinary, buildArgs } from './llama-local.mjs';

test('findBinary returns empty when nothing is found', () => {
  const which = () => ({ status: 1, stdout: '' });
  const exists = () => false;
  assert.equal(findBinary(['nope-cli', 'also-nope'], which, exists), '');
});

test('findBinary accepts an existing absolute path', () => {
  const p = path.resolve('fake-llama');
  const exists = (x) => x === p;
  assert.equal(findBinary([p], () => ({ status: 1, stdout: '' }), exists), p);
});

test('buildArgs builds a bounded local completion command', () => {
  const a = buildArgs('m.gguf', 'Hi');
  assert.deepEqual(a.slice(0,4), ['-m','m.gguf','-p','Hi']);
  assert.ok(a.includes('-n'));
});

test('script skips clearly when binary is absent', () => {
  const r = spawnSync(process.execPath, ['tools/llama-local.mjs'], {
    cwd: path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..'),
    encoding: 'utf8',
    env: { ...process.env, LLAMA_CPP_BIN: path.resolve('definitely-missing-llama-binary') },
  });
  assert.equal(r.status, 0);
  assert.match(String(r.stdout || ''), /SKIP llama-local/);
  assert.match(String(r.stdout || ''), /No production path is affected/);
});

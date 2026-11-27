import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { remember, read } from '../void-live-deploy/lib/path-memory.js';
import { PATH_NEXT, next } from '../void-live-deploy/lib/path-next.js';

const catalog = [
  { path: '/', slug: 'home', words: 'stage' },
  { path: '/path/', slug: 'path', words: 'what to do next' },
  { path: '/qr/', slug: 'qr', words: 'make a square code' },
];

test('an unfinished /qr/ visit returns /qr/ and never the home page', () => {
  const store = {};
  remember(store, { path: '/qr/', slug: 'qr', step: 'opened', email: 'visitor@example.com', name: 'Ada' }, 10);
  const memory = read(store, 10);
  const snap = JSON.stringify(catalog);
  const a = next(memory, catalog);
  const b = next(memory, catalog);
  assert.equal(a.path, '/qr/');
  assert.notEqual(a.path, '/');
  assert.match(a.step, /^[^.!?]+[.]$/);
  assert.equal(typeof a.reason, 'string');
  assert.ok(a.reason.length > 0);
  assert.equal(JSON.stringify(a).includes('@'), false);
  assert.equal(JSON.stringify(a).includes('Ada'), false);
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(catalog), snap);
  assert.equal(JSON.stringify(memory), JSON.stringify(read(store, 10)));
});

test('empty memory returns one catalog subpage, and a home-only catalog returns none', () => {
  const empty = next([], catalog);
  assert.equal(empty.path, '/path/');
  assert.notEqual(empty.path, '/');
  assert.match(empty.step, /^[^.!?]+[.]$/);
  const none = next([], [{ path: '/', slug: 'home', words: 'stage' }]);
  assert.equal(none.path, null);
  assert.notEqual(none.path, '/');
  assert.ok(none.step && none.reason);
  assert.deepEqual(next(null, null), none);
});

test('a finished visit moves to a related subpage, and a missing tool uses shared words', () => {
  const done = next([{ path: '/qr/', slug: 'qr', step: 'done' }], catalog);
  assert.equal(done.path, '/path/');
  assert.notEqual(done.path, '/');
  const related = next([{ path: '/notes/', slug: 'notes', step: 'opened' }], [
    { path: '/qr/', slug: 'qr', words: 'codes' },
    { path: '/path/', slug: 'path', words: 'notes you left open' },
  ]);
  assert.equal(related.path, '/path/');
  assert.ok(PATH_NEXT.done.includes('done'));
});

test('the picker does not call the network or a model', () => {
  const src = readFileSync(new URL('../void-live-deploy/lib/path-next.js', import.meta.url), 'utf8');
  assert.equal(/\bfetch\s*\(|localStorage|sessionStorage|env\.AI|Date\.now/.test(src), false);
});

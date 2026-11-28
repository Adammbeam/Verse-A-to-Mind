import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PATH_MEMORY, remember, read, clear } from '../void-live-deploy/lib/path-memory.js';

const t = 1_700_000_000_000;

test('remember then read keeps path and slug and drops identity fields', () => {
  const store = {};
  const event = {
    path: '/qr/', slug: 'qr', step: 'opened',
    name: 'Ada', email: 'visitor@example.com', phone: '[phone]',
    address: '1 street', dob: '1990-01-01', governmentId: 'redacted',
  };
  const snap = JSON.stringify(event);
  const saved = remember(store, event, t);
  assert.equal(JSON.stringify(event), snap);
  assert.equal(saved.path, '/qr/');
  assert.equal(saved.slug, 'qr');
  assert.equal(saved.step, 'opened');
  assert.equal('email' in saved, false);
  const got = read(store, t);
  assert.equal(got.length, 1);
  assert.equal(got[0].path, '/qr/');
  assert.equal(got[0].slug, 'qr');
  for (const key of ['name', 'email', 'phone', 'address', 'dob', 'governmentId']) assert.equal(key in got[0], false);
});

test('aliases, a query string and a step that is an email', () => {
  const store = {};
  const saved = remember(store, { path: '/qr/?email=visitor@example.com', tool: 'qr', lastStep: 'email me at visitor@example.com' }, t);
  assert.equal(saved.path, '/qr/');
  assert.equal(saved.slug, 'qr');
  assert.equal('step' in saved, false);
  assert.equal(JSON.stringify(read(store, t)).includes('@'), false);
});

test('an event with only identity fields stores nothing and does not throw', () => {
  const store = {};
  assert.doesNotThrow(() => remember(store, { name: 'A', email: 'visitor@example.com', phone: '[phone]', address: 'street', dob: '1990-01-01', governmentId: 'x' }, t));
  assert.equal(remember(store, null, t), null);
  assert.deepEqual(read(store, t), []);
  assert.equal(remember({}, { path: '/' }, t), null);
});

test('a row older than 30 days is gone on read, and clear wipes the rest', () => {
  const store = {};
  remember(store, { path: '/qr/', slug: 'qr', step: 'opened' }, t);
  remember(store, { path: '/path/', slug: 'path', step: 'saw' }, t + PATH_MEMORY.ttlMs);
  assert.equal(read(store, t + PATH_MEMORY.ttlMs).length, 2);
  const left = read(store, t + PATH_MEMORY.ttlMs + 1);
  assert.equal(left.length, 1);
  assert.equal(left[0].path, '/path/');
  assert.equal(clear(store), true);
  assert.deepEqual(read(store, t + PATH_MEMORY.ttlMs + 1), []);
});

test('constants are frozen, the clock is 30 days, and the file stays off the network', () => {
  assert.equal(Object.isFrozen(PATH_MEMORY), true);
  assert.equal(PATH_MEMORY.ttlMs, 30 * 24 * 60 * 60 * 1000);
  assert.ok(PATH_MEMORY.drop.includes('email') && PATH_MEMORY.drop.includes('governmentId'));
  const src = readFileSync(new URL('../void-live-deploy/lib/path-memory.js', import.meta.url), 'utf8');
  assert.equal(/\bfetch\s*\(|localStorage|sessionStorage|XMLHttpRequest|Date\.now/.test(src), false);
});

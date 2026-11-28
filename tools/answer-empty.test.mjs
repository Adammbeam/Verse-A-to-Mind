// A blank answer is never an answer (idea-7704): the route once served a cached empty string, and a whitespace-only model
// reply passed the truthiness guard, so a self-contained ask after an unrelated earlier one came back with nothing in it.
// Run: node --test tools/answer-empty.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { hasAnswer } from '../void-live-deploy/lib/answer-honesty.js';

test('only a body with words counts as an answer', () => {
  for (const blank of ['', '   ', '\n\t ', null, undefined, 0, 7, {}, []]) assert.equal(hasAnswer(blank), false, JSON.stringify(blank));
  assert.equal(hasAnswer('Paris is the capital of France.'), true);
  assert.equal(hasAnswer('  Paris.  '), true);
});

const realFetch = globalThis.fetch, hadCaches = 'caches' in globalThis, oldCaches = globalThis.caches;
globalThis.fetch = async () => new Response(JSON.stringify({ query: { search: [] } }), { headers: { 'content-type': 'application/json' } }); // no Wikipedia
delete globalThis.caches; // no edge copy: this test is about the D1 row and the model
const answerApi = await import('../void-live-deploy/functions/api/answer.js');
test.after(() => { globalThis.fetch = realFetch; if (hadCaches) globalThis.caches = oldCaches; else delete globalThis.caches; });

function d1() {
  const db = new DatabaseSync(':memory:');
  const stmt = (sql, a = []) => ({ bind: (...b) => stmt(sql, b), run: async () => db.prepare(sql).run(...a), first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }) });
  db.exec('CREATE TABLE void_answers (id TEXT PRIMARY KEY, ask TEXT, answer TEXT, sources TEXT, at TEXT)');
  return { prepare: (sql) => stmt(sql), raw: db };
}
async function keyOf(ask) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ask.toLowerCase()));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
function world(say = 'Paris is the capital of France.') {
  const ai = { calls: 0 };
  return { ai, env: { DB: d1(), AI: { run: async (_m, o) => { ai.calls++; return o && o.messages ? { response: say } : { data: [] }; } } } };
}
async function post(env, body, path = '/api/answer') {
  const waits = [];
  const res = await answerApi.onRequestPost({ env, request: new Request('https://a-to-mind.com' + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(typeof body === 'string' ? { ask: body } : body) }), waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
  return await res.json();
}

test('a blank row in the shared cache is not served after an unrelated earlier ask: the model answers and replaces it', async () => {
  const ask = "What's the capital of France?";
  const { env, ai } = world();
  env.DB.raw.prepare('INSERT INTO void_answers (id, ask, answer, sources, at) VALUES (?, ?, ?, ?, ?)').run(await keyOf(ask), ask, '   ', '[]', new Date().toISOString());
  const j = await post(env, { ask, before: { ask: 'My favorite color is green.', answer: 'Green is a calm color.' } });
  assert.notEqual(j.noAnswer, true, 'the blank cache row was not an answer');
  assert.match(String(j.answer || ''), /Paris/, 'the model answered');
  assert.equal(j.cached, undefined, 'nothing was served from the blank row');
  assert.ok(ai.calls > 0, 'the model ran');
  const row = env.DB.raw.prepare('SELECT answer FROM void_answers WHERE id = ?').get(await keyOf(ask));
  assert.match(row.answer, /Paris/, 'the row was refreshed with a real answer');
});

test('a standalone answer always carries a boolean follow mark, so the card never has to guess', async () => {
  const { env } = world();
  const j = await post(env, "What's the capital of France?");
  assert.equal(typeof j.followed, 'boolean');
  assert.equal(j.followed, false);
});

test('a whitespace-only model reply is a no-answer, not an answered blank', async () => {
  const { env } = world('   ');
  const j = await post(env, 'What is the capital of Spain?');
  assert.equal(j.answer, null);
  assert.equal(j.noAnswer, true);
  const row = env.DB.raw.prepare('SELECT answer FROM void_answers').get();
  assert.equal(row, undefined, 'nothing blank was written to the cache');
});

test('a cached answer still says the earlier ask was not followed, so the card never claims one', async () => {
  const ask = "What's the capital of France?";
  const { env, ai } = world();
  env.DB.raw.prepare('INSERT INTO void_answers (id, ask, answer, sources, at) VALUES (?, ?, ?, ?, ?)').run(await keyOf(ask), ask, 'Paris is the capital of France.', '[]', new Date().toISOString());
  const j = await post(env, { ask, before: { ask: 'My favorite color is green.', answer: 'Green is a calm color.' } });
  assert.match(String(j.answer || ''), /Paris/);
  assert.equal(j.followed, false, 'a self-contained ask served from the cache did not read the earlier one');
  assert.equal(ai.calls, 0);
});

test('?fresh=1 skips the D1 row too, so a repeated cache-bypassed answer is a fresh one with its follow mark', async () => {
  const ask = "What's the capital of France?";
  const { env, ai } = world();
  env.DB.raw.prepare('INSERT INTO void_answers (id, ask, answer, sources, at) VALUES (?, ?, ?, ?, ?)').run(await keyOf(ask), ask, 'Paris is the capital of France.', '[]', new Date().toISOString());
  const j = await post(env, { ask, before: { ask: 'My favorite color is green.', answer: 'Green is a calm color.' } }, '/api/answer?fresh=1');
  assert.match(String(j.answer || ''), /Paris/);
  assert.equal(j.followed, false);
  assert.ok(ai.calls > 0, 'the model ran rather than the D1 row');
});

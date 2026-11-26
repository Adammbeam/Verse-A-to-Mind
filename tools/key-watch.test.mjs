import test from 'node:test';
import assert from 'node:assert/strict';
import { lostKeys, lostLine, watchKeys } from '../void-live-deploy/lib/key-watch.js';
import { answerRoute } from '../void-live-deploy/lib/answer-route.js';

// a D1 stand-in that keeps void_key_seen rows in a Map and runs only the statements key-watch.js sends
function fakeDb() {
  const rows = new Map();
  return { rows, prepare(sql) {
    const st = { args: [], bind(...a) { st.args = a; return st; },
      async run() { if (/^INSERT INTO void_key_seen/.test(sql)) { const [name, state, at] = st.args; rows.set(name, { name, state, at }); } return { meta: { changes: 1 } }; },
      async all() { return { results: [...rows.values()] }; } };
    return st;
  } };
}

test('lostKeys: only set -> empty/absent counts', () => {
  assert.deepEqual(lostKeys({ A: 'set', B: 'set', C: 'empty' }, { A: 'empty', B: 'set', C: 'absent' }), ['A']);
  assert.deepEqual(lostKeys({}, { A: 'empty' }), []);
  assert.deepEqual(lostKeys({ A: 'set' }, { A: 'absent' }), ['A']);
});

test('watchKeys says a loss once, on the tick that sees it, and never a value', async () => {
  const DB = fakeDb(), said = [], say = async (b) => { said.push(b); };
  const secret = 'v3ry-s3cret-value-123';
  await watchKeys({ DB, SALT: secret, GROQ_API_KEY: '' }, 1, say, ['SALT', 'GROQ_API_KEY']);
  assert.equal(said.length, 0, 'first sight: nothing was set before');
  const r = await watchKeys({ DB, SALT: '', GROQ_API_KEY: '' }, 2, say, ['SALT', 'GROQ_API_KEY']);
  assert.deepEqual(r.lost, ['SALT']);
  assert.equal(said.length, 1);
  assert.match(said[0], /SALT went from set to empty/);
  assert.ok(!said[0].includes(secret) && !said[0].includes(String(secret.length)));
  await watchKeys({ DB, SALT: '', GROQ_API_KEY: '' }, 3, say, ['SALT', 'GROQ_API_KEY']);
  assert.equal(said.length, 1, 'no repeat while it stays empty');
  for (const row of DB.rows.values()) assert.ok(['set', 'empty', 'absent'].includes(row.state));
  await watchKeys({ DB, SALT: 'again' }, 4, say, ['SALT']);
  await watchKeys({ DB }, 5, say, ['SALT']);
  assert.equal(said.length, 2); assert.match(said[1], /SALT went from set to absent/);
});

test('watchKeys without D1 does nothing', async () => {
  assert.deepEqual(await watchKeys({ SALT: 'x' }, 1, () => { throw new Error('no'); }), { states: {}, lost: [] });
});

test('lostLine names the project and environment', () => {
  assert.match(lostLine(['SALT'], 0, { SALT: 'empty' }), /production environment of Pages project a-to-mind/);
});

test('answerRoute: Workers AI answers with no key; keyed tiers are failover; Gemini never', () => {
  const rows = [{ id: 'workers-ai-chat', available: true }, { id: 'groq-free', available: false }, { id: 'gemini-free', available: true }];
  assert.deepEqual(answerRoute(rows), { model: 'workers-ai-chat', keyless: true, failover: [] });
  assert.deepEqual(answerRoute([{ id: 'workers-ai-chat', available: false }, { id: 'groq-free', available: true }]), { model: 'groq-free', keyless: false, failover: ['groq-free'] });
  assert.equal(answerRoute([{ id: 'gemini-free', available: true }]).model, null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { keyState, keyStates, WATCHED_KEYS } from '../void-live-deploy/lib/key-state.js';
import { reachable } from '../void-live-deploy/lib/free-router.js';
import { readFileSync } from 'node:fs';

test('keyState tells set, empty and absent apart', () => {
  assert.equal(keyState({ A: 'x' }, 'A'), 'set');
  assert.equal(keyState({ A: '' }, 'A'), 'empty');
  assert.equal(keyState({}, 'A'), 'absent');
  assert.equal(keyState({ A: undefined }, 'A'), 'absent');
  assert.equal(keyState(null, 'A'), 'absent');
  assert.equal(keyState({ DB: {} }, 'DB'), 'set');
});

test('keyStates never carries a value, a length or a prefix', () => {
  const secret = 'sk_live_abcdefghijklmnop';
  const out = JSON.stringify(keyStates({ STRIPE_SECRET_KEY: secret, SALT: '' }));
  assert.ok(!out.includes(secret) && !out.includes('sk_') && !out.includes(String(secret.length)));
  const s = keyStates({ STRIPE_SECRET_KEY: secret, SALT: '' });
  assert.equal(s.STRIPE_SECRET_KEY, 'set'); assert.equal(s.SALT, 'empty'); assert.equal(s.GROQ_API_KEY, 'absent');
  assert.deepEqual(Object.keys(s), WATCHED_KEYS);
  for (const v of Object.values(s)) assert.ok(['set', 'empty', 'absent'].includes(v));
});

test('free-router says a key is bound but empty instead of "needs" it', () => {
  const r = { access: 'key:GROQ_API_KEY' };
  assert.deepEqual(reachable(r, { GROQ_API_KEY: 'k' }), { ok: true, why: 'key set' });
  assert.equal(reachable(r, { GROQ_API_KEY: '' }).ok, false);
  assert.match(reachable(r, { GROQ_API_KEY: '' }).why, /bound on this deploy but empty/);
  assert.match(reachable(r, {}).why, /^needs GROQ_API_KEY/);
});

test('/api/store/status reports key states', () => {
  const src = readFileSync(new URL('../void-live-deploy/functions/api/store/[[path]].js', import.meta.url), 'utf8');
  assert.match(src, /keys: keyStates\(env\)/);
});

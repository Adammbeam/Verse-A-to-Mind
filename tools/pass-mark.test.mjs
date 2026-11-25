// The visitor pass lets the answer engine's POST through, marked, and nothing else (lib/pass-mark.js); the answer engine
// leaves a marked ask out of its route log. Run: node --test tools/pass-mark.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { passLets, isPass, PASS_HEADER } from '../void-live-deploy/lib/pass-mark.js';

test('GETs go through; only a POST to this site\'s own /api/answer does', () => {
  assert.equal(passLets('GET', 'https://api.weather.gov/points/1,2'), true);
  assert.equal(passLets('HEAD', 'https://a-to-mind.com/'), true);
  assert.equal(passLets('POST', 'https://a-to-mind.com/api/answer'), true);
  for (const u of ['https://a-to-mind.com/api/miss', 'https://a-to-mind.com/api/telemetry', 'https://a-to-mind.com/api/answer?fresh=1', 'https://elsewhere.example/api/answer', 'https://a-to-mind.com/api/answers']) assert.equal(passLets('POST', u), false, u);
  assert.equal(passLets('PUT', 'https://a-to-mind.com/api/answer'), false);
  assert.equal(passLets('POST', 'http://127.0.0.1:8788/api/answer', 'http://127.0.0.1:8788'), true, 'a local site is its own origin');
});

test('the mark is read only from the header, exactly 1', () => {
  assert.equal(isPass(new Request('https://a-to-mind.com/api/answer', { method: 'POST', headers: { [PASS_HEADER]: '1' } })), true);
  assert.equal(isPass(new Request('https://a-to-mind.com/api/answer', { method: 'POST' })), false);
  assert.equal(isPass(new Request('https://a-to-mind.com/api/answer', { method: 'POST', headers: { [PASS_HEADER]: 'yes' } })), false);
  assert.equal(isPass(null), false);
});

test('the answer engine checks the mark before it writes the route log, and the pass sends it', () => {
  const answer = readFileSync(new URL('../void-live-deploy/functions/api/answer.js', import.meta.url), 'utf8');
  assert.match(answer, /const log = async \(extra\) => \{ if \(isPass\(request\)\) return;/);
  const pass = readFileSync(new URL('./visitor-pass.mjs', import.meta.url), 'utf8');
  assert.match(pass, /passLets\(req\.method\(\), req\.url\(\), site\)/);
  assert.match(pass, /\[PASS_HEADER\]: '1'/);
});

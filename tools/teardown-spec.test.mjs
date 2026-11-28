// node --test tools/teardown-spec.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FREE_MODEL } from '../void-live-deploy/lib/models.js';
import { COPY_RUN, STRICT, sharesRun, spec, askFree, textOf } from '../void-live-deploy/lib/teardown-spec.js';

const SOURCE = 'alpha bravo charlie delta echo foxtrot golf hotel india juliet';
const MAP = { url: 'https://example.test/units', nav: ['/units', '/about'], headings: [{ level: 2, words: 2 }], forms: [], buttons: 1, api_paths: ['/api/convert'] };
const copied = JSON.stringify({ features: [{ name: 'alpha bravo charlie delta echo foxtrot golf hotel', flow: ['start'], states: ['idle'], data: { item: ['id'] } }] });
const clean = JSON.stringify({ target: 'units', features: [{ name: 'convert units', flow: ['type a measure', 'pick the target kind'], states: ['blank', 'filled'], data: { measure: ['value', 'kind'] } }], api: { ops_by_area: { convert: 1 } } });

test('eight source words in a row are a copy, seven are not', () => {
  assert.equal(COPY_RUN, 8);
  assert.equal(sharesRun('alpha bravo charlie delta echo foxtrot golf hotel extra', SOURCE), true);
  assert.equal(sharesRun('Alpha, bravo, charlie, delta, echo, foxtrot, golf, hotel.', SOURCE), true);
  assert.equal(sharesRun('alpha bravo charlie delta echo foxtrot golf only', SOURCE), false);
});

test('a copied spec is retried once, then refused', async () => {
  let n = 0;
  const out = await spec(MAP, SOURCE, { ask: async (messages) => { n += 1; if (n === 2) assert.match(messages[1].content, /eight word/); return copied; } });
  assert.equal(n, 2);
  assert.deepEqual(out, { ok: false, reason: 'copied' });
});

test('a retry written in new words is kept', async () => {
  let n = 0;
  const out = await spec(MAP, SOURCE, { ask: async () => (++n === 1 ? copied : clean) });
  assert.equal(n, 2);
  assert.equal(out.ok, true);
  assert.equal(out.target, 'units');
  assert.equal(out.features[0].name, 'convert units');
  assert.deepEqual(out.features[0].flow, ['type a measure', 'pick the target kind']);
  assert.deepEqual(out.features[0].states, ['blank', 'filled']);
  assert.deepEqual(out.features[0].data.measure, ['value', 'kind']);
  assert.equal(out.api.ops_by_area.convert, 1);
});

test('the binding answers before groq, and groq is the only fallback', async () => {
  let groq = 0;
  const env = { AI: { async run(model, body) { assert.equal(model, FREE_MODEL); assert.equal(body.messages[0].role, 'user'); return { response: '{"features":[]}' }; } } };
  const text = await askFree(env, [{ role: 'user', content: 'map' }], async () => { groq += 1; return { text: 'no' }; });
  assert.equal(text, '{"features":[]}');
  assert.equal(groq, 0);
  const seen = [];
  const empty = { AI: { run: async () => ({ response: '  ' }) } };
  const fell = await askFree(empty, [{ role: 'user', content: 'map' }], async (_e, _m, opt) => { seen.push(opt); return { text: 'from-groq' }; });
  assert.deepEqual(seen, [{ only: 'groq' }]);
  assert.equal(fell, 'from-groq');
  assert.equal(textOf({ response: { features: [] } }), '{"features":[]}');
});

test('the module names groq and no other free provider', () => {
  const src = readFileSync(new URL('../void-live-deploy/lib/teardown-spec.js', import.meta.url), 'utf8');
  assert.match(src, /answerFree/);
  assert.match(src, /only:\s*'groq'/);
  assert.equal(src.includes('gemini'), false);
  assert.equal(src.includes('openrouter'), false);
  assert.equal(STRICT.includes('eight word'), true);
});

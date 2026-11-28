// A free or anonymous visitor is never given a paid model. DeepSeek V4 Flash is PAID_MODEL; V4, V4.1, and any
// later @cf/deepseek-ai/* name are paid too. The free list is the model ids this file collects from the live
// constants: if one of them is a paid id, this test fails. Run: node --test tools/visitor-models.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as models from '../void-live-deploy/lib/models.js';
import { PROVIDERS } from '../void-live-deploy/lib/agent-providers.js';
import { LLM_ENDPOINTS } from '../void-live-deploy/lib/answer-free.js';
import { isFreeAllowance, resolveFree, runFree } from '../void-live-deploy/lib/ai-gateway.js';

const {
  PAID_MODEL, PAID_PLAN_MODELS, VIDEO_MODELS, GROQ_VISITOR_MODELS, PATH_MODELS,
  isPaidModelId, visitorModel, visitorAttemptModels, models: modelFor,
} = models;

const SKIP = new Set(['PAID_MODEL', 'PAID_PLAN_MODELS', 'VIDEO_MODELS']);
function collect(value, key, out) {
  if (SKIP.has(key)) return;
  if (typeof value === 'string') { if (value.includes('@cf/') || GROQ_VISITOR_MODELS.includes(value)) out.push(value); return; }
  if (Array.isArray(value)) { for (const v of value) collect(v, '', out); return; }
  if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) collect(v, k, out);
}

/** every id the free visitor path names, plus Groq. Paid buckets are not part of this list. */
function freeList() {
  const out = [];
  collect(models, '', out);
  for (const p of PROVIDERS) if (!p.private) out.push(...p.models);
  out.push(LLM_ENDPOINTS['groq-free'].model);
  return [...new Set(out)];
}

const BANNED = [
  PAID_MODEL,
  '@cf/deepseek-ai/deepseek-v4-flash',
  '@cf/deepseek-ai/deepseek-v4.1-flash',
  '@cf/deepseek-ai/future-model',
  'deepseek-v4',
  'deepseek-v4.1',
  'DeepSeek V4',
  ...PAID_PLAN_MODELS,
  ...Object.values(VIDEO_MODELS),
];

test('the free visitor list is only Workers AI free models or Groq, and a paid id on it fails', () => {
  const list = freeList();
  assert.ok(list.length > 5);
  for (const id of list) {
    assert.equal(isPaidModelId(id), false, id);
    assert.equal(visitorModel(id), id, id);
    assert.ok(isFreeAllowance(id) || GROQ_VISITOR_MODELS.includes(id), id + ' is not a free Workers AI model or Groq');
  }
  assert.deepEqual(PROVIDERS.filter((p) => !p.private).map((p) => p.id), ['groq']);
  assert.ok(GROQ_VISITOR_MODELS.includes(LLM_ENDPOINTS['groq-free'].model));
  for (const ep of Object.values(LLM_ENDPOINTS)) assert.equal(isPaidModelId(ep.model), false, ep.model);
  const poisoned = list.concat(BANNED);
  assert.ok(poisoned.some((id) => visitorModel(id) !== id));
  for (const id of BANNED) {
    assert.equal(isPaidModelId(id), true, id);
    assert.equal(visitorModel(id), null, id);
    assert.equal(isFreeAllowance(id), false, id);
    assert.equal(resolveFree(id), null, id);
  }
});

test('a paid id cannot be selected for a free or anonymous visitor, including from a path', async () => {
  assert.deepEqual(visitorAttemptModels([PAID_MODEL, '@cf/deepseek-ai/deepseek-v4.1-flash', modelFor('agent'), modelFor('answer')]), [modelFor('agent')]);
  const saved = PATH_MODELS.answer;
  PATH_MODELS.answer = '@cf/deepseek-ai/deepseek-v4.1-flash';
  try { assert.throws(() => modelFor('answer'), /paid model is off the free visitor path/); }
  finally { PATH_MODELS.answer = saved; }
  assert.equal(modelFor('answer'), saved);
  const agent = fs.readFileSync(new URL('../void-live-deploy/functions/api/agent.js', import.meta.url), 'utf8');
  assert.match(agent, /visitorAttemptModels\(/);
  assert.match(agent, /opts\.owner && \(await potCents/);
  const env = { AI: { run: async () => ({ ok: 1 }) } };
  await assert.rejects(() => runFree(env, '@cf/deepseek-ai/future-model', {}), /not a free model/);
  await assert.rejects(() => runFree(env, PAID_MODEL, {}), /not a free model/);
  await assert.rejects(() => runFree(env, 'deepseek-v4.1', {}), /not a free model/);
});

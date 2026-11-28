// /api/answer must read the two card asks the same way the page does: "play sudoku" -> skill:sudoku,
// "currency converter" -> skill:open-tool. The page opens those skills; the API used to send both to a model answer.
// Run: node --test tools/answer-skill-route.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SKILLS, exemplars, decide, resetRouter } from '../void-live-deploy/lib/router.js';
import { onRequestPost } from '../void-live-deploy/functions/api/answer.js';

const WANTS = { 'play sudoku': 'sudoku', 'currency converter': 'open-tool' };

// a deterministic stand-in for Workers AI embeddings: identical text gives an identical unit vector,
// different text shares almost nothing. Enough to drive decide() and the whole /api/answer reply here.
const DIMS = 256;
const vec = (text) => {
  const v = new Array(DIMS).fill(0.001);
  for (const w of String(text).toLowerCase().match(/[a-z0-9]+/g) || []) {
    let h = 0; for (const c of w) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    v[h % DIMS] += 1;
  }
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
};
const AI = { run: async (model, input) => (input && Array.isArray(input.text) ? { response: input.text.map(vec) } : { response: 'a test answer' }) };
const db = { batch: async () => [], prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }), first: async () => null, run: async () => ({}) }), all: async () => ({ results: [] }), first: async () => null, run: async () => ({}) }) };

test('the router lists the skills the page opens for these asks', () => {
  for (const [ask, skill] of Object.entries(WANTS)) {
    assert.ok(SKILLS[skill].examples.includes(ask), skill + ' has the exact ask: ' + ask);
    assert.ok(exemplars().some((e) => e.kind === 'skill' && e.skill === skill && e.text === ask), ask + ' is a skill exemplar');
  }
});

test('decide() reads each ask as its own skill, not a question or another skill', () => {
  const ex = exemplars(), vecs = ex.map((e) => vec(e.text));
  for (const [ask, skill] of Object.entries(WANTS)) {
    const r = decide(vec(ask), ex, vecs, ask);
    assert.equal(r.kind, 'skill', ask + ' routes to a skill');
    assert.equal(r.skill, skill, ask + ' routes to ' + skill);
  }
});

test('/api/answer replies with route:skill and the skill name for both asks', async () => {
  resetRouter();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}', { status: 404 }); // no Wikipedia detour, no network
  try {
    const post = async (ask) => (await onRequestPost({
      request: new Request('https://a-to-mind.com/api/answer', { method: 'POST', body: JSON.stringify({ ask }) }),
      env: { AI, DB: db }, waitUntil: () => {},
    })).json();
    for (const [ask, skill] of Object.entries(WANTS)) {
      const out = await post(ask);
      assert.equal(out.route, 'skill', ask + ': ' + JSON.stringify(out));
      assert.equal(out.skill, skill, ask + ': ' + JSON.stringify(out));
    }
  } finally { globalThis.fetch = realFetch; resetRouter(); }
});

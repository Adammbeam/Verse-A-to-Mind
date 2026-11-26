import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../void-live-deploy/functions/api/answer.js';

const req = (ask) => new Request('https://a-to-mind.com/api/answer', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ ask }),
});

test('self ask with model busy returns self:true and "model busy, my own facts" (never Wikipedia or "nothing on the web")', async () => {
  let netHits = 0;
  const keepFetch = globalThis.fetch;
  globalThis.fetch = async () => { netHits++; return new Response('should not fetch wikipedia', { status: 500 }); };
  try {
    const busyAI = { run: async () => { throw new Error('4006 daily free neurons exceeded'); } };
    const ASSETS = {
      fetch: async (rq) => {
        const p = new URL(rq.url).pathname;
        if (p === '/self.json') return new Response(JSON.stringify({ about: 'Verse stage', open: [{ ask: 'vr draw', from: 'owner', date: '2026-11-26' }] }));
        if (p === '/skills/index.json') return new Response(JSON.stringify(['tip', 'loan', 'calc']));
        if (p === '/skills/families.json') return new Response(JSON.stringify({ families: [] }));
        return new Response('', { status: 404 });
      },
    };
    const res = await (await onRequestPost({ request: req('what are you building'), env: { AI: busyAI, ASSETS } })).json();
    assert.equal(res.self, true);
    assert.equal(res.note, 'model busy, my own facts');
    assert.match(res.answer, /My skill index has 3 entries/);
    assert.equal(netHits, 0, 'zero external Wikipedia fetches');

    // Even if ASSETS fails/404s, model-busy self ask keeps self:true and exact note (never "nothing on the web")
    const emptyAssets = { fetch: async () => new Response('', { status: 404 }) };
    const resEmpty = await (await onRequestPost({ request: req('what are you building'), env: { AI: busyAI, ASSETS: emptyAssets } })).json();
    assert.equal(resEmpty.self, true);
    assert.equal(resEmpty.note, 'model busy, my own facts');
    assert.equal(netHits, 0, 'still zero external Wikipedia fetches');

    // With VOID_ANSWER_MODELS=off and empty ASSETS, never falls through to Wikipedia
    const resOff = await (await onRequestPost({ request: req('what are you building'), env: { ASSETS: emptyAssets, VOID_ANSWER_MODELS: 'off' } })).json();
    assert.equal(resOff.self, true);
    assert.ok(!/sourced extract/i.test(String(resOff.answer)));
    assert.equal(netHits, 0, 'models-off self ask never hits Wikipedia even when assets fail');
  } finally {
    globalThis.fetch = keepFetch;
  }
});

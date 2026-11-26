import test from 'node:test';
import assert from 'node:assert/strict';
import { readSelf, selfFacts } from '../void-live-deploy/lib/self-context.js';

test('readSelf survives >800ms asset latency under load and caches static JSON per ASSETS binding without cross-env leakage', async () => {
  let fetches = 0;
  const ASSETS = {
    fetch: async (rq) => {
      fetches++;
      await new Promise((r) => setTimeout(r, 950));
      const p = new URL(rq.url).pathname;
      if (p === '/self.json') return new Response(JSON.stringify({ about: 'Verse stage', open: [{ ask: 'ship vr', from: 'owner', date: '2026-11-25' }] }));
      if (p === '/skills/index.json') return new Response(JSON.stringify(['tip', 'loan', 'calc']));
      if (p === '/skills/families.json') return new Response(JSON.stringify({ families: [] }));
      return new Response('', { status: 404 });
    },
  };
  const first = await readSelf({ ASSETS }, 'https://a-to-mind.com');
  assert.ok(first.self && Array.isArray(first.skills), '950ms asset read succeeds instead of timing out at 800ms');
  const facts = selfFacts(first);
  assert.match(facts, /Growth inbox, still open: "ship vr"/);
  assert.match(facts, /My skill index has 3 entries/);

  const t0 = Date.now();
  const second = await readSelf({ ASSETS }, 'https://a-to-mind.com');
  assert.ok(Date.now() - t0 < 100, 'repeat read on same ASSETS binding uses warm cache');
  assert.equal(fetches, 3, 'each static JSON fetched once');
  assert.equal(second.self.open[0].ask, 'ship vr');

  const ASSETS2 = { fetch: async (rq) => new Response(new URL(rq.url).pathname === '/skills/index.json' ? '["other"]' : '{}') };
  const third = await readSelf({ ASSETS: ASSETS2 }, 'https://a-to-mind.com');
  assert.deepEqual(third.skills, ['other']);
});

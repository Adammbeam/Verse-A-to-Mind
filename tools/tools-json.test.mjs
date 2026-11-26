import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../void-live-deploy/functions/tools.json.js';

test('/tools.json fetches skills in parallel without duplicate fetches and caches per ASSETS binding (want-page-tools-json)', async () => {
  const skillNames = Array.from({ length: 36 }, (_, i) => `skill-${i}`);
  const files = {
    '/skills/index.json': JSON.stringify([...skillNames, 'fam-a', 'rebuild-map', 'place']),
    '/skills/fam-a.js': `/*\n * parts: ['part-one', 'part-two']\n */\n`,
    '/skills/part-one.js': `/*\n * part-one skill — First part.\n */\nexport default { examples: ['run part one'] };`,
    '/skills/part-two.js': `/*\n * part-two skill — Second part.\n */\nexport default { examples: ["run part two"] };`,
    '/skills/rebuild-map.js': `/*\n * rebuild-map skill — Hidden.\n */\nexport default { examples: ['hide me'] };`,
    '/skills/place.js': `/*\n * place skill — Show a map.\n */\nexport default { examples: ['map of Paris'] };`,
  };
  for (const n of skillNames) {
    files[`/skills/${n}.js`] = `/*\n * ${n} skill — Description for ${n}.\n */\nexport default { examples: ['try ${n}'] };`;
  }

  const hits = new Map();
  const ASSETS = {
    fetch: async (rq) => {
      const p = new URL(rq.url).pathname;
      hits.set(p, (hits.get(p) || 0) + 1);
      await new Promise((r) => setTimeout(r, 15));
      return p in files ? new Response(files[p], { status: 200 }) : new Response('', { status: 404 });
    },
  };

  const t0 = Date.now();
  const res = await onRequestGet({ request: new Request('https://a-to-mind.com/tools.json'), env: { ASSETS } });
  const elapsed = Date.now() - t0;
  assert.equal(res.status, 200);
  const data = await res.json();

  // Serial double-fetch of 39 skills at 15 ms each would take > 1100 ms; batched single-fetch finishes well under 400 ms.
  assert.ok(elapsed < 400, `expected batched /tools.json under 400ms, got ${elapsed}ms`);
  for (const [p, count] of hits) assert.equal(count, 1, `expected single fetch for ${p}, got ${count}`);

  const byName = new Map(data.tools.map((t) => [t.name, t]));
  assert.ok(byName.has('stage'), 'CORE tools kept');
  assert.ok(byName.has('part-one') && byName.has('part-two'), 'family parts expanded');
  assert.ok(!byName.has('rebuild-map'), 'HIDDEN skill omitted');
  assert.equal(byName.get('map')?.description, 'Show a map.', 'place renamed to map');
  assert.equal(byName.get('part-one')?.try[0], 'https://a-to-mind.com/?q=run%20part%20one');

  // Second request on same ASSETS hits in-isolate cache with zero extra fetches.
  const hitsBefore = [...hits.values()].reduce((a, b) => a + b, 0);
  const res2 = await onRequestGet({ request: new Request('https://a-to-mind.com/tools.json'), env: { ASSETS } });
  assert.equal(res2.status, 200);
  const hitsAfter = [...hits.values()].reduce((a, b) => a + b, 0);
  assert.equal(hitsAfter, hitsBefore, 'in-isolate cache avoids re-fetching ASSETS');
});

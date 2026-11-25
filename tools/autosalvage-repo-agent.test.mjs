import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENT_NAME,
  HARD_QUERY_CAP,
  COOLDOWN_MS,
  queryOfGap,
  collectQueries,
  selectQueries,
  vetRepos,
  extractRepoSlugs,
  mergeOutside,
  runRepoAgent,
} from './autosalvage/repo-agent.mjs';

test('queryOfGap strips URLs, stopwords and keeps 2-4 high-signal terms', () => {
  assert.equal(queryOfGap('Show me the WebGPU rigid body physics engine on https://example.com'), 'webgpu rigid body physics');
  assert.equal(queryOfGap('the and for with'), '');
});

test('selectQueries enforces hard <= 5 cap and 24h per-query cooldown', () => {
  const now = 1_700_000_000_000;
  const items = Array.from({ length: 9 }, (_, i) => ({ query: 'topic' + i, gap: 'gap' + i }));
  const state = { asked: { topic0: now - 1000, topic1: now - COOLDOWN_MS - 1000 } };
  const picked = selectQueries(items, state, { now, limit: 99 });
  assert.equal(picked.length, HARD_QUERY_CAP, 'never exceeds HARD_QUERY_CAP even when caller passes 99');
  assert.equal(picked[0].query, 'topic1', 'skips topic0 inside cooldown, allows expired topic1');
});

test('vetRepos keeps only permissive/reviewed SPDX licenses above star threshold and skips archived/duplicates', () => {
  const repos = [
    { full_name: 'dimforge/rapier.js', stargazers_count: 3200, license: { spdx_id: 'Apache-2.0' }, description: 'Fast 3D WASM physics engine', topics: ['wasm', 'physics'] },
    { full_name: 'mystery/nolicense', stargazers_count: 9000, license: { spdx_id: 'NOASSERTION' }, description: 'No license repo' },
    { full_name: 'old/archived-lib', stargazers_count: 800, archived: true, license: { spdx_id: 'MIT' }, description: 'Archived' },
    { full_name: 'tiny/new-lib', stargazers_count: 5, license: { spdx_id: 'MIT' }, description: 'Too few stars' },
    { full_name: 'Dimforge/Rapier.js', stargazers_count: 3200, license: { spdx_id: 'Apache-2.0' }, description: 'Case duplicate' },
  ];
  const out = vetRepos(repos, '3D miniatures physics', new Set(), { minStars: 50 });
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'dimforge/rapier.js');
  assert.equal(out[0].target, 'tool');
  assert.equal(out[0].license, 'Apache-2.0');
});

test('extractRepoSlugs pulls clean owner/repo slugs from Show HN and npm search payloads', () => {
  const slugs = extractRepoSlugs({
    hnHits: [{ url: 'https://github.com/Poly-Haven/Poly-Haven-API#readme' }, { url: 'https://github.com/topics/wasm' }],
    npmObjects: [{ package: { links: { repository: 'git+https://github.com/Hopding/pdf-lib.git' } } }],
  });
  assert.deepEqual(slugs, ['Poly-Haven/Poly-Haven-API', 'Hopding/pdf-lib']);
});

test('runRepoAgent runs offline with injected search, merges without duplicates, and records state', async () => {
  const frontierMd = '**Folded in from the old lists\n- **WebGPU fluid solver**: fast browser simulation\n\n';
  const outsideDoc = { sources: [{ id: 'public-apis/public-apis', license: 'MIT' }] };
  const res = await runRepoAgent({
    gaps: ['longevity clinical trials api'],
    misses: [{ ask: 'generate pdf packet offline' }],
    frontierMd,
    outsideDoc,
    state: { asked: {} },
    now: 2_000_000_000_000,
    maxQueries: 10,
    minStars: 50,
    searchGh: async (q) => (q.includes('pdf')
      ? [{ full_name: 'Hopding/pdf-lib', stargazers_count: 7100, license: { spdx_id: 'MIT' }, description: 'Create and modify PDF documents in JS' }]
      : []),
    webSignals: async () => [],
  });
  assert.equal(res.agent, AGENT_NAME);
  assert.equal(res.queriesRun.length, 3);
  assert.equal(res.added.length, 1);
  assert.equal(res.added[0].id, 'Hopding/pdf-lib');
  assert.equal(res.outsideDoc.sources.length, 2);
  const again = mergeOutside(res.outsideDoc, res.added);
  assert.equal(again.added.length, 0, 'idempotent on repeat merge');
  assert.equal(collectQueries({ gaps: ['wasm pdf', 'wasm pdf'] }).length, 1);
});

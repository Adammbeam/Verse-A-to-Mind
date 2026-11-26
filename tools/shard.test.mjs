import test from 'node:test';
import assert from 'node:assert/strict';
import { hashLabel, parseShard, inShard, CORE_LABEL } from './shard.mjs';
import fs from 'node:fs';

test('"i/n" parses, anything else means no sharding', () => {
  assert.deepEqual(parseShard('1/2'), { i: 1, n: 2 });
  assert.deepEqual(parseShard(' 3 / 4 '), { i: 3, n: 4 });
  for (const bad of ['', '0/2', '3/2', '2', '1/0', 'a/b', '1/65', undefined, null]) assert.equal(parseShard(bad), null, String(bad));
});

test('a heading lands in exactly one shard, the same one every time, and every shard gets some', () => {
  const labels = [...fs.readFileSync(new URL('./test_void.mjs', import.meta.url), 'utf8').matchAll(/^  if \(want\(("(?:[^"\\]|\\.)*")\)\)/gm)].map((m) => JSON.parse(m[1]));
  assert.ok(labels.length > 100, 'the suite has its sections');
  for (const n of [2, 3]) {
    const counts = Array.from({ length: n }, () => 0);
    for (const l of labels) { const hits = []; for (let i = 1; i <= n; i++) if (inShard(l, { i, n })) hits.push(i); assert.equal(hits.length, 1, l); counts[hits[0] - 1]++; }
    for (const c of counts) assert.ok(c > labels.length / (n * 3), 'a shard is not nearly empty: ' + counts.join('/'));
  }
  assert.equal(hashLabel(CORE_LABEL), hashLabel(CORE_LABEL));
  assert.ok(inShard('anything', null));
});

test('for n >= 4 (verify.yml sharded runs), CORE runs on its own dedicated shard without piling onto other sections (mw2k6aqf)', () => {
  const labels = [];
  for (const file of ['./test_void.mjs', './test_3d.mjs']) {
    for (const m of fs.readFileSync(new URL(file, import.meta.url), 'utf8').matchAll(/^  if \(want\(("(?:[^"\\]|\\.)*")\)\)/gm)) {
      labels.push(JSON.parse(m[1]));
    }
  }
  assert.ok(labels.length > 300, 'reads both test_void.mjs and test_3d.mjs sections');
  for (const n of [4, 5, 6, 8]) {
    const coreHits = [];
    for (let i = 1; i <= n; i++) if (inShard(CORE_LABEL, { i, n })) coreHits.push(i);
    assert.deepEqual(coreHits, [n], `CORE must land exclusively on dedicated shard ${n} of ${n}`);
    const counts = Array.from({ length: n }, () => 0);
    for (const l of labels) {
      const hits = [];
      for (let i = 1; i <= n; i++) if (inShard(l, { i, n })) hits.push(i);
      assert.equal(hits.length, 1, `section lands in exactly one shard for n=${n}: ${l}`);
      counts[hits[0] - 1]++;
    }
    assert.equal(counts[n - 1], 0, `CORE shard ${n}/${n} must not also carry other sections (got ${counts[n - 1]})`);
    for (let i = 0; i < n - 1; i++) {
      assert.ok(counts[i] > labels.length / (n * 2), `non-CORE shard ${i + 1}/${n} is balanced: ${counts.join('/')}`);
    }
  }
});

// The wired path of /embeddings/: pure score maths, a lazy Transformers.js call, a visible credit and a narrow CSP.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { similarity } from '../void-live-deploy/embeddings/embed-core.js';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const page = read('void-live-deploy/embeddings/index.html');
const app = read('void-live-deploy/embeddings/app.js');
const headers = read('void-live-deploy/_headers');

test('cosine score is 1 for the same vector, 0 for unrelated vectors and clamped', () => {
  assert.equal(similarity([0, 1], [0, 1]), 1);
  assert.equal(similarity([1, 0], [0, 1]), 0);
  assert.equal(similarity([1, 0], [-1, 0]), -1);
  assert.equal(similarity([3, 4], [0.6, 0.8]), 1);
  assert.equal(similarity([1, 2], [1, 2, 3]), 0, 'different lengths are not a score');
  assert.equal(similarity([], []), 0);
  assert.equal(similarity([1, 0], [NaN, 0]), 0);
});

test('the model loads only when compare is pressed, and runs one feature-extraction task locally', () => {
  assert.match(app, /cdn\.jsdelivr\.net\/npm\/@huggingface\/transformers@4\.3\.2/);
  assert.match(app, /await import\(/);
  assert.match(app, /pipeline\('feature-extraction', MODEL, \{ dtype: 'q8' \}\)/);
  assert.match(app, /pooling: 'mean', normalize: true/);
  assert.match(app, /form\.addEventListener\('submit'/);
  assert.match(app, /similarity\(vectors\[0\], vectors\[1\]\)/);
  assert.doesNotMatch(app, /\/api\/(answer|embed)/, 'the task never calls a Verse worker');
  const importLine = app.split('\n').findIndex((l) => l.includes('await import('));
  const handlerLine = app.split('\n').findIndex((l) => l.includes("addEventListener('submit'"));
  assert.ok(importLine > 0 && handlerLine > 0, 'the import is inside a function the form calls');
});

test('the page shows the Apache-2.0 credit and says where the text goes', () => {
  assert.match(page, /Hugging Face Transformers\.js/);
  assert.match(page, /Apache-2\.0/);
  assert.match(page, /href="\/credits\/"/);
  assert.match(page, /Xenova\/all-MiniLM-L6-v2/);
  assert.match(page, /nothing is sent to a-to-mind\.com/);
  assert.match(page, /<script type="module" src="\/embeddings\/app\.js">/);
  assert.match(page, /id="status" role="status" aria-live="polite"/);
});

test('the demo has its own narrow CSP rule for the CDN module', () => {
  const rule = headers.split(/(?=^#)/m).find((b) => b.startsWith('# the on-device sentence demo'));
  assert.ok(rule, 'a commented header rule exists');
  assert.match(rule, /^\/embeddings\/\n  ! Content-Security-Policy\n/m);
  assert.match(rule, /script-src[^;]*https:\/\/cdn\.jsdelivr\.net/);
  assert.match(rule, /'wasm-unsafe-eval'/);
  assert.doesNotMatch(rule, /esm\.run/, 'this demo needs only the Transformers.js module');
});

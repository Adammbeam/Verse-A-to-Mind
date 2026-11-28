// idea-7723: an opt-in model on this device never changes the default path. node --test tools/local-model.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const page = read('void.html');
const headers = read('void-live-deploy/_headers');
const salvage = JSON.parse(read('void-live-deploy/salvage.json'));

test('all three page copies carry the same opt-in control', () => {
  assert.equal(read('void-live-deploy/void.html'), page);
  assert.equal(read('void-live-deploy/index.html'), page);
  assert.ok(page.includes('id="local-toggle"') && page.includes('data-local-toggle'));
  assert.match(page, /let localOn = false/, 'the default is the ordinary online answer');
  assert.match(page, /aria-pressed="false"/);
  assert.match(page, /const LOCAL_MODEL = 'SmolLM2-360M-Instruct-q4f16_1-MLC'/);
  assert.match(page, /await import\(LOCAL_JS\)/, 'the model library is a click-time download, not a page-load cost');
});

test('the on-device branch answers before the ask leaves the page', () => {
  const local = page.indexOf('if (localOn && !page && !heading && String(text).length <= 280)');
  const ask = page.indexOf("fetch('/api/answer'");
  assert.ok(local > -1 && ask > local, 'the local answer is tried first');
  assert.match(page, /your question was not sent to a-to-mind\.com/);
  assert.match(page, /localOn = false; localPaint\(\); localSave\(\)/, 'a failed model hands the ask back to the normal route');
  assert.match(page, /localLimit\(engine\.chat\.completions\.create/, 'a slow model is bounded');
});

test('the front page may load the model library; the narrower page rules stay narrow', () => {
  const root = headers.slice(headers.indexOf('Content-Security-Policy:'), headers.indexOf('# the emoji looks'));
  assert.match(root, /script-src[^\n]*https:\/\/esm\.run https:\/\/cdn\.jsdelivr\.net/);
  assert.doesNotMatch(headers.slice(headers.indexOf('/emojis/*')), /https:\/\/esm\.run/);
  assert.match(read('tools/csp-hashes.mjs'), /REST = "[^"]*https:\/\/esm\.run https:\/\/cdn\.jsdelivr\.net"/);
});

test('the outside library is credited on /credits/', () => {
  const credit = salvage.credits.find((c) => c.name === 'mlc-ai/web-llm');
  assert.ok(credit, 'WebLLM is in the generated credits');
  assert.equal(credit.license, 'Apache-2.0');
  assert.match(credit.used, /on-device/);
  assert.match(read('void-live-deploy/credits/index.html'), /s\.credits\.map/);
});

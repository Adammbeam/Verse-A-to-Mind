// lib/teardown-map.js: a public page's structure, with short labels and no prose
import test from 'node:test';
import assert from 'node:assert/strict';
import { mapPage, TEARDOWN_MAP } from '../void-live-deploy/lib/teardown-map.js';

const TITLE = 'TitleTokenThatIsFarTooLongToKeepInTheMapOutputAtAllReallyYes';
const PARA = 'The full paragraph about purple turnips must stay off the map entirely and never be stored.';
const LONG = 'A'.repeat(70);
const HTML = `<!doctype html><html><head><title>${TITLE}</title><style>a{color:purple turnips}</style></head><body>
<nav><a href="/about">About</a><a href="/pricing">Pricing</a><a href="https://example.test/docs">Docs</a></nav>
<h2>Welcome visitors to the public catalog today please</h2><p>${PARA}</p><h2>${LONG}</h2>
<form action="/login" method="POST"><input type="email" name="email" required><input type="password" name="password" required>
<input type="checkbox" name="remember"><button type="submit">Sign in</button></form><button>Cancel</button><a href="/api/x">API</a>
<script><a href="/api/hidden">secret</a>${PARA}</script></body></html>`;

const strings = (v, acc = []) => {
  if (typeof v === 'string') acc.push(v);
  else if (Array.isArray(v)) for (const x of v) strings(x, acc);
  else if (v && typeof v === 'object') for (const x of Object.values(v)) strings(x, acc);
  return acc;
};

test('mapPage keeps nav, form fields, headings, buttons and api paths', () => {
  const page = mapPage(HTML, 'https://example.test/start');
  assert.equal(page.url, 'https://example.test/start');
  assert.equal(page.title_len, TITLE.length);
  assert.deepEqual(page.nav, ['/about', '/pricing', '/docs']);
  assert.deepEqual(page.headings[0], { level: 2, words: 'Welcome visitors to the public catalog' });
  assert.equal(page.headings.length, 2);
  assert.equal(page.headings[0].words.split(' ').length, TEARDOWN_MAP.LABEL_WORDS);
  assert.equal(page.headings[1].words.length, TEARDOWN_MAP.MAX_STRING);
  assert.deepEqual(page.forms, [{ action_path: '/login', method: 'post', fields: [
    { type: 'email', required: true }, { type: 'password', required: true }, { type: 'checkbox', required: false },
  ] }]);
  assert.equal(page.buttons, 2);
  assert.deepEqual(page.api_paths, ['/api/x']);
  const blob = JSON.stringify(page);
  assert.equal(blob.includes('purple turnips') || blob.includes(TITLE) || blob.includes('/api/hidden') || blob.includes(LONG), false);
  assert.ok(strings(page).every((s) => s.length <= 60));
});

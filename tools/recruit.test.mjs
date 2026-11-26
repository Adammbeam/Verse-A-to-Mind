// Bring an agent on /team/ (ask-8246): one-line self-join prompt, copy button, and /team/agents.txt link.
// Run: node --test tools/recruit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../void-live-deploy/team/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../void-live-deploy/team/app.js', import.meta.url), 'utf8');

test('/team/ has a Bring an agent section with the one-call join prompt and copy button', () => {
  assert.match(html, /id="bring"/);
  assert.match(html, /Bring an agent/);
  assert.match(html, /id="bringPrompt"[^>]*>[^<]*a-to-mind\.com\/team\/agents\.txt[^<]*next/);
  assert.match(html, /id="copyBring"/);
  assert.match(html, /href="\/team\/agents\.txt"/);
  assert.match(app, /getElementById\('copyBring'\)/);
});

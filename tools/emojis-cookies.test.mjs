import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');

test('/emojis/ has Reject Optional Cookies control', () => {
  const html = fs.readFileSync(path.join(root, 'void-live-deploy/emojis/index.html'), 'utf8');
  assert.match(html, /Reject Optional Cookies/);
  assert.match(html, /id="rejectCookies"/);
  assert.match(html, /No optional cookies are used on this page/);
});

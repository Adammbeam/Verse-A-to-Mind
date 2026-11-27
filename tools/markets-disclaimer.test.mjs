import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');

test('/markets/ has a DISCLAIMER section', () => {
  const html = fs.readFileSync(path.join(root, 'void-live-deploy/markets/index.html'), 'utf8');
  assert.match(html, /<h2[^>]*>\s*DISCLAIMER\s*<\/h2>/);
  assert.match(html, /not financial advice/i);
  assert.match(html, /id="disclaimer"/);
});

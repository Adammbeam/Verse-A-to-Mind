import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('base64 has URL encode/decode sister mode', () => {
  const page = read('void-live-deploy/base64/modes/url.html');
  assert.match(page, /URL encode and decode/);
  assert.match(page, /encodeURIComponent/);
  assert.match(page, /decodeURIComponent/);
  assert.match(page, /id="plain"/);
  assert.match(page, /id="encoded"/);
  assert.match(page, /aria-current="page">URL encode<\/a>/);
  for (const f of ['void-live-deploy/base64/index.html', 'void-live-deploy/base64/modes/bases.html']) {
    assert.match(read(f), /\/base64\/\?mode=url"[^>]*>URL encode<\/a>/, f);
  }
  const redir = read('void-live-deploy/_redirects');
  assert.match(redir, /\/base64\/url \/base64\/\?mode=url 301/);
});

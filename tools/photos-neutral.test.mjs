// pages once named after other sites redirect to the Verse tool that does the job (_redirects); none of their old addresses is a dead end
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const rules = readFileSync(new URL('../void-live-deploy/_redirects', import.meta.url), 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.trim().split(/\s+/));
const to = (from) => (rules.find((r) => r[0] === from) || [])[1];

test('each old page, with and without its slash and below it, opens its neutral tool', () => {
  const want = { photopea: '/photos/?tab=adj', squoosh: '/photos/?tab=out', tinypng: '/photos/?tab=out', iloveimg: '/photos/?tab=crop', exifeditor: '/photos/?tab=info', exif: '/photos/details/' };
  for (const [old, dest] of Object.entries(want)) {
    assert.equal(to('/photos/' + old), dest, old);
    assert.ok(to('/photos/' + old + '/*'), old + '/*');
  }
  assert.equal(to('/photos/exif/*'), '/photos/details/:splat', 'the AI check (?mode=ai) and provenance modes keep their query on the way');
});

test('every destination exists, and no plain name points at an old page any more', () => {
  assert.ok(existsSync(new URL('../void-live-deploy/photos/details/index.html', import.meta.url)));
  assert.ok(existsSync(new URL('../void-live-deploy/photos/ai-mode.js', import.meta.url)));
  for (const r of rules) assert.doesNotMatch(r[1] || '', /\/photos\/(?:photopea|squoosh|tinypng|iloveimg|exifeditor|exif)\//, r.join(' '));
  const page = readFileSync(new URL('../void-live-deploy/photos/details/index.html', import.meta.url), 'utf8');
  assert.match(page, /<link rel="canonical" href="https:\/\/a-to-mind\.com\/photos\/details\/">/);
  assert.match(page, /src="\/photos\/ai-mode\.js"/);
});

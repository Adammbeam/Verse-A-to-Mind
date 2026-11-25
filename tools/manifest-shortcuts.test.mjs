// The installed app's shortcuts (a long-press on the icon) each open a page this deploy serves. The case: the "Tower"
// shortcut opened /conquered/, which is not served (404 on a-to-mind.com, 2026-11-25), and the tower is owner-only anyway.
// Run: node --test tools/manifest-shortcuts.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../void-live-deploy/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.webmanifest', root), 'utf8'));
const served = (path) => {
  const p = path.replace(/^\//, '');
  return [p, p + 'index.html', p + '/index.html', p + '.html'].some((f) => f && existsSync(new URL(f, root)));
};

test('every shortcut opens a page that is in the deploy', () => {
  assert.ok(manifest.shortcuts.length >= 1);
  for (const s of manifest.shortcuts) {
    const path = new URL(s.url, 'https://a-to-mind.com').pathname;
    assert.ok(served(path), s.name + ' -> ' + path + ' is not served');
  }
});

test('no shortcut points at an owner-only page, and every icon exists', () => {
  for (const s of manifest.shortcuts) {
    assert.doesNotMatch(s.url, /conquered|tower/i, s.name);
    for (const i of s.icons || []) assert.ok(served(i.src), i.src);
  }
  assert.ok(served(new URL(manifest.start_url, 'https://a-to-mind.com').pathname));
});

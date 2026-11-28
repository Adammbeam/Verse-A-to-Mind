// The public motto is three lines. The retired line must not ship again.
// Run: node --test tools/motto.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILD_OUTPUTS } from './generated.mjs';
import { DEPLOY_ONLY } from './regen-paths.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OLD = 'You name it, Verse learns it and does it better.';
const LINES = ['Ask, and it appears.', 'Speak it into being.', 'From thought to thing.'];
const skip = new Set([...BUILD_OUTPUTS, ...DEPLOY_ONLY]);
const TEXT = /\.(html|js|mjs|md|txt|xml)$/;

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === 'archive') continue;
    const abs = join(dir, name);
    const rel = relative(root, abs).replace(/\\/g, '/');
    if (skip.has(rel)) continue;
    const st = statSync(abs);
    if (st.isDirectory()) walk(abs, out);
    else if (TEXT.test(name)) out.push(rel);
  }
}

const shipped = ['void.html', 'README.md', 'domains/void.canon.md'];
walk(join(root, 'docs'), shipped);
walk(join(root, 'void-live-deploy'), shipped);

test('the retired motto is gone from shipped files', () => {
  const hits = [];
  for (const rel of shipped) {
    const text = readFileSync(join(root, rel), 'utf8');
    if (text.includes(OLD)) hits.push(rel);
  }
  assert.deepEqual(hits, []);
});

test('the page and the canon say the same three motto lines', () => {
  const canon = readFileSync(join(root, 'domains/void.canon.md'), 'utf8');
  const block = (/^## Motto\n([\s\S]*?)(?=^## )/m.exec(canon) || [])[1] || '';
  assert.deepEqual(block.trim().split('\n'), LINES);
  for (const rel of ['void.html', 'void-live-deploy/void.html', 'void-live-deploy/index.html']) {
    const html = readFileSync(join(root, rel), 'utf8');
    assert.ok(html.includes("const MOTTO = '" + LINES[0] + "';"), rel);
    assert.ok(html.includes("const MOTTO_NEXT = '" + LINES[1] + "';"), rel);
    assert.ok(html.includes("const MOTTO_SUPPORT = '" + LINES[2] + "';"), rel);
    assert.match(html, /const SELF_LEAD = .*MOTTO \+ ' ' \+ MOTTO_NEXT \+ ' ' \+ MOTTO_SUPPORT/);
  }
});

// The /team/ work feed is styled only inside #workfeed, and this change touches only that stylesheet plus its check.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXPECT = ['void-live-deploy/verse.css', 'tools/workfeed-css.test.mjs', 'tools/checks.d/workfeed-css.chk'];

/** CSS selectors in `css`. Walks @media and @supports. Skips other at-rules and declaration bodies. */
export function cssSelectors(css) {
  const s = String(css || '').replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  let i = 0;
  function read(skip) {
    let buf = '';
    while (i < s.length) {
      const c = s[i++];
      if (c === '{') {
        const header = buf.trim();
        buf = '';
        if (header.startsWith('@')) read(skip || !/^@(media|supports)\b/.test(header));
        else {
          if (!skip) for (const part of header.split(',')) { const sel = part.trim(); if (sel) out.push(sel); }
          read(true);
        }
        continue;
      }
      if (c === '}') return;
      buf += c;
    }
  }
  read(false);
  return out;
}

/** files in `changed` that this workfeed pass is not allowed to touch. */
export function unexpectedFiles(changed, expected = EXPECT) {
  const ok = new Set(expected);
  return (changed || []).filter((f) => !ok.has(f));
}

function workfeedBlock(css) {
  const start = css.indexOf('/* #workfeed */');
  const end = css.indexOf('/* /#workfeed */');
  assert.ok(start >= 0 && end > start, 'verse.css keeps one marked #workfeed block');
  return css.slice(start, end);
}

test('every selector in the workfeed block starts with #workfeed', () => {
  const block = workfeedBlock(readFileSync(resolve(root, 'void-live-deploy/verse.css'), 'utf8'));
  const sels = cssSelectors(block);
  assert.ok(sels.length >= 8, 'the block has the panel, headings, pills and rows');
  for (const sel of sels) assert.ok(sel.startsWith('#workfeed'), sel);
  assert.ok(sels.some((s) => s === '#workfeed'));
  assert.ok(sels.some((s) => s.includes('focus-visible')));
  assert.equal(cssSelectors('#workfeed a {}\n.other { color: red }').some((s) => s.startsWith('#workfeed') && s.includes('.other')), false);
  assert.deepEqual(cssSelectors('@media (max-width: 480px) {\n  #workfeed li { min-height: 44px }\n}\n.page { }'), ['#workfeed li', '.page']);
});

test('a workfeed change may only touch the feed files', () => {
  assert.deepEqual(unexpectedFiles(['void-live-deploy/verse.css', 'tools/workfeed-css.test.mjs']), []);
  assert.deepEqual(unexpectedFiles(['void-live-deploy/verse.css', 'void-live-deploy/team/index.html']), ['void-live-deploy/team/index.html']);
  const diff = spawnSync('git', ['diff', '--name-only', 'origin/main...HEAD'], { cwd: root, encoding: 'utf8' });
  const status = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
  if (diff.status !== 0 || status.status !== 0) return;
  const dirty = status.stdout.split('\n').filter((l) => l.length > 3).map((l) => l.slice(3).replace(/^.* -> /, '').trim());
  const changed = [...new Set([...diff.stdout.split('\n'), ...dirty].map((f) => f.trim()).filter(Boolean))];
  if (!changed.some((f) => f === 'void-live-deploy/verse.css' || f === 'tools/workfeed-css.test.mjs')) return;
  assert.deepEqual(unexpectedFiles(changed), []);
});

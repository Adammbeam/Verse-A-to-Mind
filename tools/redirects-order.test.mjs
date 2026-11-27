// _redirects keeps every static rule above the first wildcard or placeholder rule. Cloudflare Pages asks for static rules first;
// on 2026-11-27 the live site applied only the first 100 rules counted from the first wildcard, and the 14 old addresses below
// them (/games/, /dashboard/, /videos/, /word-counter/ ...) were 404s.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lines = readFileSync(new URL('../void-live-deploy/_redirects', import.meta.url), 'utf8').split('\n');
const rules = lines.map((l, i) => ({ l: l.trim(), n: i + 1 })).filter((r) => r.l && !r.l.startsWith('#'));
const dynamic = (r) => /[*]|\/:[A-Za-z]/.test(r.l.split(/\s+/)[0]);

test('no static redirect sits below a wildcard one', () => {
  const first = rules.findIndex(dynamic);
  if (first < 0) return;
  const late = rules.slice(first).filter((r) => !dynamic(r)).map((r) => r.n + ': ' + r.l);
  assert.deepEqual(late, [], 'move these above line ' + rules[first].n + ' (or move the wildcard rules to the end)');
});

test('the file stays inside the Pages limits', () => {
  assert.ok(rules.filter(dynamic).length <= 100);
  assert.ok(rules.filter((r) => !dynamic(r)).length <= 2000);
  for (const r of rules) assert.ok(r.l.length <= 1000, r.n + ' is too long');
});

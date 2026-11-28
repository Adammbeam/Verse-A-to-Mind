// /calculators/?calc=<id> must keep the formula. Pages drops the incoming query when the redirect target already has one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lines = readFileSync(new URL('../void-live-deploy/_redirects', import.meta.url), 'utf8').split('\n');

function rule(from) {
  const line = lines.find((l) => l.startsWith(from + ' '));
  assert.ok(line, from + ' has a redirect');
  const parts = line.trim().split(/\s+/);
  return { to: parts[1], status: parts[2] };
}

test('the calculator alias opens the formula keypad and does not replace the query', () => {
  for (const from of ['/calculators', '/calculators/']) {
    const r = rule(from);
    assert.equal(r.to, '/calculator/modes/formulas');
    assert.equal(r.status, '301');
    assert.equal(r.to.includes('?'), false, from + ' target must not carry its own query');
  }
});

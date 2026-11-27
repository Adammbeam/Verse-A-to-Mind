import test from 'node:test';
import assert from 'node:assert/strict';
import { pageFacts, groupPages, canonicalOf, redirectTo, buildReport } from './consolidate-map.mjs';
import { colorTarget } from '../void-live-deploy/functions/color/colour-picker-tool/[[path]].js';

const color = (route, extra = '') => pageFacts(route, `<!doctype html><html class="vs-tool"><link rel="stylesheet" href="/verse.css"><title>Color Picker</title><body><h1>Color Picker</h1><h2>Shades, to black</h2>${extra}</body></html>`);
const old = pageFacts('/color/colour-picker-tool/', `<html><title>Color Picker</title><body><h1>Color Picker</h1><h2>The 16 VGA colours</h2></body></html>`);

test('the standard path is kept, and a copy redirects to it', () => {
  const kept = color('/color/', '<h2>Palettes made from it</h2>');
  const group = groupPages([kept, old])[0];
  assert.equal(group.canonical.route, '/color/');
  assert.equal(group.copies[0].route, '/color/colour-picker-tool/');
  assert.deepEqual(group.copies[0].extra, ['the 16 vga colours']);
  assert.ok(group.copies[0].missing.includes('palettes made from it'));
  assert.deepEqual(group.redirects, [{ from: '/color/colour-picker-tool/', to: '/color/' }]);
  assert.equal(redirectTo('/color/', kept), null);
});

test('a redirect is a path on this site', () => {
  const bad = redirectTo('/old/', { route: 'https://example.com/color/' });
  assert.equal(bad, null);
  assert.equal(canonicalOf([old, color('/color/')], '/color/').route, '/color/');
});

test('the live map keeps the colour picker and ranks a same-headline group first', () => {
  const report = buildReport();
  const colorGroup = report.groups.find((g) => g.standard === '/color/');
  assert.ok(colorGroup, 'color group');
  assert.equal(colorGroup.canonical.route, '/color/');
  assert.ok(colorGroup.redirects.some((r) => r.from === '/color/colour-picker-tool/' && r.to === '/color/'));
  assert.equal(report.groups[0].standard, '/color/');
  for (const g of report.groups) for (const r of g.redirects) {
    assert.match(r.from, /^\//);
    assert.match(r.to, /^\//);
    assert.doesNotMatch(r.from, /https?:|\/\//);
    assert.doesNotMatch(r.to, /https?:|\/\//);
  }
  assert.equal(report.sync.files.length, 3);
});

test('the old colour picker keeps the colour in the query', () => {
  assert.equal(colorTarget('https://a-to-mind.com/color/colour-picker-tool/?c=ff5733'), 'https://a-to-mind.com/color/?c=ff5733');
  assert.equal(colorTarget('https://a-to-mind.com/color/colour-picker-tool/'), 'https://a-to-mind.com/color/');
  assert.equal(colorTarget('https://evil.example/color/colour-picker-tool/?c=abc'), 'https://a-to-mind.com/color/?c=abc');
});

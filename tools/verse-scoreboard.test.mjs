// Scoreboard math: appearance, routing, delta, the five-ask file, and the table. No browser, no model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { appearancePass, appearanceOf, routingOf, deltaOf, fiveAskFrom, boardOf, render, pct } from './verse-scoreboard.mjs';

const row = (over) => ({ level: 8, ask: 'x', want: 'skill:timer', note: 'skill:timer', usable: true, errors: [], status: 'pass', ...over });

test('appearance fails a blank, an article fallback, and the generic answer', () => {
  assert.equal(appearancePass(''), false);
  assert.equal(appearancePass('article fallback'), false);
  assert.equal(appearancePass('answer'), false);
  assert.equal(appearancePass('skill:clock'), true);
  assert.equal(appearancePass('timer'), true);
  const got = appearanceOf([row({ note: 'skill:clock' }), row({ note: 'article fallback' }), row({ note: 'answer' }), row({ paste: true, note: 'article fallback' })]);
  assert.deepEqual(got, { pass: 1, total: 3 });
});

test('level 8 routing is the wanted skill, and a bare timer note counts', () => {
  const rows = [
    row({ ask: 'a', note: 'skill:timer' }),
    row({ ask: 'b', note: 'timer' }),
    row({ ask: 'c', note: 'article fallback' }),
    row({ ask: 'd', level: 1, note: 'skill:clock', want: 'skill:clock' }),
  ];
  assert.deepEqual(routingOf(rows), { pass: 2, total: 3 });
  assert.equal(pct(20, 50), '40% (20/50)');
});

test('delta is a changed structure string, and a missing five-ask file stays unknown', () => {
  assert.deepEqual(deltaOf([{ delta: true }, { delta: false }, { delta: true }]), { pass: 2, total: 3 });
  assert.equal(fiveAskFrom(null), '?');
  assert.equal(fiveAskFrom('no scores here'), '?');
  assert.equal(fiveAskFrom('clock 8/10, timer 10/10'), '8/10, 10/10');
});

test('the table names every row, the goals, and leaves composition unknown', () => {
  const md = render(boardOf({
    rows: [row({ note: 'skill:timer' }), row({ ask: 'b', note: 'article fallback' })],
    probes: [{ delta: true }, { delta: false }],
    five: '?',
  }));
  assert.match(md, /\| Appearance Test pass rate \| 50% \(1\/2\) \| 95%\+ \|/);
  assert.match(md, /\| Artifact Delta pass rate \| 50% \(1\/2\) \| 95%\+ \|/);
  assert.match(md, /\| Natural Ask Routing accuracy \| 50% \(1\/2\) \| 90%\+ \|/);
  assert.match(md, /\| Composition quality \| \? \| \? \|/);
  assert.match(md, /\| Five Ask Benchmark \| \? \| 8-10\/10 each \|/);
  assert.match(md, /not a paraphrase|article fallback/);
  assert.match(md, /stage structure/);
});

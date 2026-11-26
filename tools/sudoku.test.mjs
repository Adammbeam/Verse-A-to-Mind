// skills/sudoku.js: "play sudoku" opens a real 9 by 9 puzzle with exactly one solution (skills/sudoku-rules.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../void-live-deploy/skills/sudoku-rules.js';
import skill from '../void-live-deploy/skills/sudoku.js';
import nineGrid from '../void-live-deploy/skills/nine-grid.js';

const rows = (g) => [...Array(9).keys()].map((r) => g.slice(r * 9, r * 9 + 9));
const cols = (g) => [...Array(9).keys()].map((c) => [...Array(9).keys()].map((r) => g[r * 9 + c]));
const boxes = (g) => [...Array(9).keys()].map((b) => [...Array(9).keys()].map((k) => g[(Math.floor(b / 3) * 3 + Math.floor(k / 3)) * 9 + (b % 3) * 3 + (k % 3)]));

test('its asks, and the near-misses it leaves to others', () => {
  for (const a of skill.examples) assert.equal(skill.match(a.toLowerCase(), a), true, a);
  for (const a of skill.nearMisses) assert.equal(skill.match(a.toLowerCase(), a), false, a);
  assert.equal(nineGrid.match('play sudoku', 'play sudoku'), false, 'the 4 by 4 Nine Grid is not sudoku');
});

test('the answer is a full valid 9 by 9 grid; the puzzle agrees with it and has exactly one solution', () => {
  for (const seed of [1, 2, 20261125]) {
    const { given, answer } = G.create(seed);
    assert.equal(answer.length, 81); assert.equal(given.length, 81);
    for (const unit of [...rows(answer), ...cols(answer), ...boxes(answer)]) assert.deepEqual([...unit].sort(), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    given.forEach((d, i) => { if (d) assert.equal(d, answer[i]); });
    const clues = given.filter(Boolean).length;
    assert.ok(clues >= 17 && clues <= 40, 'clues ' + clues);
    assert.equal(G.countSolutions(given, 2), 1, 'unique solution for seed ' + seed);
    assert.equal(G.solved(answer), true); assert.equal(G.solved(given), false);
  }
});

test('the same seed makes the same puzzle; another seed another', () => {
  assert.deepEqual(G.create(7).given, G.create(7).given);
  assert.notDeepEqual(G.create(7).given, G.create(8).given);
});

test('a repeated digit is marked in its row, column and box; a wrong full board is not solved', () => {
  const { answer } = G.create(3);
  const b = answer.slice(); [b[0], b[1]] = [b[1], b[0]];
  assert.ok(G.conflicts(b).size > 0); assert.equal(G.solved(b), false);
  const one = new Array(81).fill(0); one[0] = 5; one[40] = 5; assert.equal(G.conflicts(one).size, 0);
  one[8] = 5; assert.deepEqual([...G.conflicts(one)].sort((x, y) => x - y), [0, 8]);
});

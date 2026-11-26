// The five arrows (flanker cost, Gratton effect). node --test tools/flanker-cost.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import skill, { selftest, plan, sitting, across, conditions, runsTooLong, MIN_CELL, TRIALS } from '../void-live-deploy/skills/flanker-cost.js';

test('flanker cost: the module self-test passes and the skill takes its own asks', () => {
  assert.equal(selftest(), true);
  assert.equal(skill.name, 'flanker-cost');
  for (const ask of skill.examples) assert.equal(skill.match(ask, ask), true, ask);
  for (const ask of skill.nearMisses) assert.equal(skill.match(ask, ask), false, ask);
});

test('flanker cost: the asks that belong to other skills are left alone', () => {
  // the pointing arrow is its own card, and "test my attention" stays the lab frame
  for (const ask of ['the pointing arrow', 'posner cueing test', 'test my attention', 'what is attention', 'attention field mind']) {
    assert.equal(skill.match(ask, ask), false, ask);
  }
});

test('flanker cost: a sitting is balanced, never runs long, and every row knows the one before it', () => {
  for (let k = 0; k < 60; k++) {
    const p = plan(TRIALS);
    assert.equal(p.length, TRIALS);
    assert.equal(p.filter((t) => t.congruent).length, TRIALS / 2, 'conditions balanced');
    assert.equal(p.filter((t) => t.dir === 'L').length, TRIALS / 2, 'directions balanced');
    assert.equal(runsTooLong(p.map((t) => t.congruent)), false, 'no condition runs longer than three');
    assert.equal(p[0].prev, null, 'the first row has no row before it');
    p.slice(1).forEach((t, i) => assert.equal(t.prev, p[i].congruent, 'prev is the row before'));
  }
});

test('flanker cost: the cost and the split are the medians of correct answers only', () => {
  // four cells of three, plus one leading row and one wrong answer
  const rows = [
    { congruent: true, prev: null, correct: true, ms: 500 },
    { congruent: true, prev: true, correct: true, ms: 500 },
    { congruent: true, prev: true, correct: true, ms: 502 },
    { congruent: true, prev: true, correct: true, ms: 504 },
    { congruent: false, prev: true, correct: true, ms: 520 },
    { congruent: false, prev: true, correct: true, ms: 522 },
    { congruent: false, prev: true, correct: true, ms: 524 },
    { congruent: true, prev: false, correct: true, ms: 600 },
    { congruent: true, prev: false, correct: true, ms: 602 },
    { congruent: true, prev: false, correct: true, ms: 604 },
    { congruent: false, prev: false, correct: true, ms: 607 },
    { congruent: false, prev: false, correct: true, ms: 609 },
    { congruent: false, prev: false, correct: true, ms: 611 },
    { congruent: true, prev: false, correct: false, ms: 200 }, // a miss: counted as an error, never as a time
  ];
  const s = sitting(rows);
  assert.equal(s.n, rows.length);
  assert.equal(s.congruent, 504, 'median of the agreeing rows');
  assert.equal(s.incongruent, 565.5, 'median of the disagreeing rows');
  assert.equal(s.cost, 61.5);
  assert.equal(s.afterCongruent.cost, 20, 'after an agreeing row the cost is 20');
  assert.equal(s.afterIncongruent.cost, 7, 'after a disagreeing row the cost is 7');
  assert.equal(s.adaptation, 13, 'the Gratton effect is the difference of the two costs');
  assert.ok(Math.abs(s.errors - 1 / 14) < 1e-12);
});

test('flanker cost: a thin cell is unknown, not zero', () => {
  const two = sitting([{ congruent: true, prev: null, correct: true, ms: 400 }, { congruent: false, prev: true, correct: true, ms: 500 }]);
  assert.equal(two.cost, null, 'two answers are not a cost');
  assert.equal(two.adaptation, null, 'a thin split is not an adaptation');
  assert.notEqual(two.cost, 0, 'unknown must not read as no effect');

  // exactly MIN_CELL answers on each side is the first cost the card will report
  const n = MIN_CELL;
  const rows = [];
  for (let i = 0; i < n; i++) rows.push({ congruent: true, prev: null, correct: true, ms: 400 });
  for (let i = 0; i < n; i++) rows.push({ congruent: false, prev: true, correct: true, ms: 460 });
  assert.equal(sitting(rows).cost, 60);
  assert.equal(sitting(rows.slice(0, n * 2 - 1)).cost, null, 'one short of the cell size is still unknown');
});

test('flanker cost: across sittings, a null adaptation does not become a zero', () => {
  const a = across([
    { cost: 40, adaptation: 10 },
    { cost: 60, adaptation: null },
    { cost: 50, adaptation: 20 },
  ]);
  assert.equal(a.n, 3);
  assert.equal(a.cost, 50);
  assert.equal(a.adaptation, 15, 'the median of the two adaptations that exist');
  assert.equal(across([]).cost, null);
  assert.equal(across([{ cost: null }]).n, 0, 'a sitting with no cost does not count');
});

test('flanker cost: conditions() alone is balanced too, which is what plan() builds on', () => {
  const c = conditions(40);
  assert.equal(c.length, 40);
  assert.equal(c.filter(Boolean).length, 20);
  assert.equal(runsTooLong(c), false);
});

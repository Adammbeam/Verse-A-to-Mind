import test from 'node:test';
import assert from 'node:assert/strict';
import skill, { CPI_U, FIRST_YEAR, LATEST_YEAR, inflationAsk, adjustInflation } from '../void-live-deploy/skills/inflation.js';

test('CPI_U bounds and constants', () => {
  assert.equal(FIRST_YEAR, 1913);
  assert.equal(LATEST_YEAR, 2025);
  assert.equal(CPI_U[1913], 9.9);
  assert.equal(CPI_U[1990], 130.7);
  assert.equal(CPI_U[2025], 321.5);
});

test('inflationAsk parses examples and rejects nearMisses', () => {
  assert.deepEqual(inflationAsk('inflation calculator 100 in 1990'), { amount: 100, from: 1990, to: LATEST_YEAR });
  assert.deepEqual(inflationAsk('$100 in 1980 today'), { amount: 100, from: 1980, to: LATEST_YEAR });
  assert.deepEqual(inflationAsk('inflation from 1995 to 2020'), { amount: 100, from: 1995, to: 2020 });
  assert.deepEqual(inflationAsk('inflation calculator'), { amount: 100, from: 1990, to: LATEST_YEAR });

  for (const ex of skill.examples) {
    assert.equal(skill.match(ex.toLowerCase(), ex), true);
  }
  for (const nm of skill.nearMisses) {
    assert.equal(skill.match(nm.toLowerCase(), nm), false);
  }
});

test('adjustInflation computes adjusted value and percentage', () => {
  const res = adjustInflation(100, 1990, 2025);
  assert.ok(res);
  assert.ok(Math.abs(res.adjusted - 100 * (321.5 / 130.7)) < 1e-9);
  assert.ok(Math.abs(res.pct - ((321.5 - 130.7) / 130.7) * 100) < 1e-9);
  assert.equal(res.cpiFrom, 130.7);
  assert.equal(res.cpiTo, 321.5);
  assert.equal(adjustInflation(100, 1800, 2025), null);
});

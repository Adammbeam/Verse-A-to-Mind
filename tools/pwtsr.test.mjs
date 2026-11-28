// The PWTSR scorer: rate, expected-fail, job cards, the long paste, summon rows. No browser, no model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepare, withSummon, runRoute, summarize, jobsOf, toMarkdown, longPaste, pasteOk, wanted, PASTE_QUESTIONS, PASTE_FACTS } from './pwtsr.mjs';

const file = JSON.parse(readFileSync(new URL('./pwtsr-cases.json', import.meta.url), 'utf8'));

test('the case file has the summon set, four timer phrasings, fifty natural asks, and one expected-fail paste', () => {
  const cases = prepare(file);
  assert.equal(cases.filter((c) => c.level === 1).length, 6);
  assert.equal(cases.filter((c) => c.level === 4).length, 4);
  assert.equal(cases.filter((c) => c.level === 8).length, 50);
  assert.equal(cases.filter((c) => c.expectFail).length, 1);
  const paste = cases.find((c) => c.paste);
  assert.ok(paste.ask.length >= 6000);
  for (const q of PASTE_QUESTIONS) assert.ok(paste.ask.includes(q));
  assert.equal(longPaste().length >= 6000, true);
});

test('a miss is a job card and an expected fail is not in the rate', () => {
  const cases = prepare([
    { id: 'a', level: 4, ask: 'timer', want: 'skill:timer' },
    { id: 'b', level: 4, ask: 'can i have a timer', want: 'skill:timer' },
    { id: 'p', level: 0, paste: true, expectFail: true },
  ]);
  const route = (ask) => (ask === 'timer' ? 'timer' : 'quiz');
  const rows = runRoute(cases, route);
  const sum = summarize(rows, 'routing');
  assert.equal(sum.pass, 1);
  assert.equal(sum.total, 2);
  assert.equal(rows.find((r) => r.id === 'p').status, 'expected-fail');
  assert.equal(jobsOf(rows).length, 1);
  assert.match(jobsOf(rows)[0].target, /^pwtsr:/);
  assert.match(toMarkdown(sum, rows), /1\/2/);
  assert.match(toMarkdown(sum, rows), /Expected fail/);
  assert.equal(wanted('skill:timer', 'timer'), true);
  assert.equal(wanted('skill:timer', 'timer-start'), true);
  assert.equal(wanted('skill:timer', 'time'), false);
  assert.equal(wanted('skill:timer', 'article fallback'), false);
});

test('summon adds one example per skill and does not repeat an ask', () => {
  const cases = [{ id: 'L1', level: 1, ask: 'make a clock', want: 'skill:clock' }];
  const all = withSummon(cases, [
    { name: 'clock', examples: ['make a clock'] },
    { name: 'timer', examples: ['set a timer for 5 minutes'] },
    { name: 'empty', examples: [] },
  ]);
  assert.deepEqual(all.map((c) => c.id), ['L1', 'summon-timer']);
});

test('duplicate asks are refused, and the paste passes only when every fact is visible', () => {
  assert.throws(() => prepare([{ id: 'a', ask: 'timer', want: 'skill:timer' }, { id: 'b', ask: 'Timer', want: 'skill:timer' }]));
  assert.equal(pasteOk('short', PASTE_FACTS), false);
  const doc = 'Launch is 12 March. Budget owner is Nia. The highest risk is the lease. ' + 'x'.repeat(20);
  assert.equal(pasteOk(doc, PASTE_FACTS), true);
  assert.equal(pasteOk(doc.replace('Nia', 'someone'), PASTE_FACTS), false);
});

// The table rewriter. The browser run is tools/appearance-bench.mjs itself. No model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fillTable, rowOf, connected, regressions, historyRecord, jobLine } from './appearance-bench.mjs';

const DOC = [
  '## Verse Product Laws',
  '',
  '| Ask | Before | After | Score | Appears? | Delta? |',
  '| --- | --- | --- | --- | --- | --- |',
  '| I need a client onboarding system that runs itself. | old paragraph | (pending) | 0 | ❌ | ❌ |',
  '',
  '| Ask | Appearance | Artifact Delta | Routing | Composition | Distinctness |',
  '| --- | --- | --- | --- | --- | --- |',
  '| I need a client onboarding system that runs itself. | 0 | 0 | 0 | 0 | 0 |',
  '',
].join('\n');

test('the rewriter fills After and Score and leaves the detail table alone', () => {
  const out = fillTable(DOC, [{ ask: 'I need a client onboarding system that runs itself.', after: 'Client onboarding: welcome', score: 10, appears: true, delta: true }]);
  assert.match(out, /\| Client onboarding: welcome \| 10 \| ✅ \| ✅ \|/);
  assert.ok(out.startsWith('## Verse Product Laws'));
  assert.match(out, /\| 0 \| 0 \| 0 \| 0 \| 0 \|/);
});

const LINKED = '<article data-system="onboarding"><h2>Client onboarding</h2>'
  + '<h3 data-system="onboarding" data-artifact="process">Process</h3><ol><li>Capture the new client</li></ol>'
  + '<h3 data-system="onboarding" data-artifact="automations">Automations Verse owns</h3><ul><li>Intake capture</li></ul>'
  + '<nav data-system="onboarding"><a data-system="onboarding" data-from="process" data-to="automations">Process → Automations</a></nav></article>';

test('a connected card passes Law 4, and two titles do not', () => {
  const card = { title: 'Client onboarding', items: ['Capture the new client', 'Intake capture'], text: 'Client onboarding Capture the new client', html: LINKED, note: 'skill:system-design' };
  assert.equal(connected(card), true);
  assert.equal(connected({ html: '<h2>A</h2><h2>B</h2>' }), false);
  const row = rowOf('I need a client onboarding system that runs itself.', card, ['Capture the new client|Intake capture']);
  assert.equal(row.appears, true);
  assert.equal(row.delta, true);
  assert.equal(row.composition, true);
  assert.equal(row.score, 10);
});

test('a pass that becomes a fail names the ask and the commit', () => {
  const prev = historyRecord([{ ask: 'I keep forgetting invoices.', appears: true, delta: true, composition: true, score: 10, pass: true }], 'abc', '2026-11-28');
  const now = [{ ask: 'I keep forgetting invoices.', pass: false }];
  assert.deepEqual(regressions(prev, now), ['I keep forgetting invoices.']);
  assert.match(jobLine(regressions(prev, now), 'abc'), /forgetting invoices/);
  assert.match(jobLine(['I keep forgetting invoices.'], 'abc'), /regressed at abc/);
});

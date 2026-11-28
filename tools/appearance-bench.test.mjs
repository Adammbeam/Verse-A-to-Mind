// The table rewriter. The browser run is tools/appearance-bench.mjs itself. No model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fillTable, rowOf, connected, regressions, historyRecord, jobLine, variety, verdict, compareBaseline, overlapBand, liveOf } from './appearance-bench.mjs';

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

test('variety fails a shared generic plan and passes disjoint systems', () => {
  const ask = 'I need a client onboarding system that runs itself.';
  const other = 'I keep forgetting invoices.';
  const generic = { ask, types: ['process', 'automations', 'monitoring'] };
  const same = variety([generic, { ask: other, types: ['process', 'automations', 'monitoring'] }]);
  assert.equal(same.ok, false);
  assert.ok(same.pairs[0].overlap > 0.5);
  const different = variety([
    { ask, types: ['intake', 'welcome-sequence', 'stall-watch'] },
    { ask: other, types: ['unpaid-list', 'reminder', 'overdue-nudge'] },
  ]);
  assert.equal(different.ok, true);
  assert.equal(different.pairs[0].band, 'green');
  assert.equal(overlapBand(0.3), 'yellow');
  assert.equal(overlapBand(0.51), 'red');
  assert.equal(liveOf('<p>lorem 4</p>').live, false);
  assert.equal(liveOf('<input value="1">').live, true);
});

test('the threshold is 5/5 appearance and delta, 4/5 composition, variety, and average 8', () => {
  const rows = [1, 2, 3, 4, 5].map(() => ({ appears: true, delta: true, composition: true, score: 10 }));
  rows[4] = { ...rows[4], composition: false };
  const ok = verdict(rows, { ok: true });
  assert.equal(ok.ok, true);
  assert.equal(verdict(rows, { ok: false }).ok, false);
  rows[0] = { ...rows[0], appears: false };
  assert.equal(verdict(rows, { ok: true }).ok, false);
});

test('the baseline comparison shows before and after for one ask', () => {
  const base = { asks: [{ ask: 'I keep forgetting invoices.', appears: false, delta: false, score: 0 }] };
  const now = [{ ask: 'I keep forgetting invoices.', appears: true, delta: true, score: 10 }];
  const row = compareBaseline(base, now)[0];
  assert.deepEqual(row.appears, [false, true]);
  assert.deepEqual(row.score, [0, 10]);
});

test('a pass that becomes a fail names the ask and the commit', () => {
  const prev = historyRecord([{ ask: 'I keep forgetting invoices.', appears: true, delta: true, composition: true, score: 10, pass: true }], 'abc', '2026-11-28');
  const now = [{ ask: 'I keep forgetting invoices.', pass: false }];
  assert.deepEqual(regressions(prev, now), ['I keep forgetting invoices.']);
  assert.match(jobLine(regressions(prev, now), 'abc'), /forgetting invoices/);
  assert.match(jobLine(['I keep forgetting invoices.'], 'abc'), /regressed at abc/);
});

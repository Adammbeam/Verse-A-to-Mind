// Two loops log usage to one D1 table a day; the owner's view ranks them with rough USD estimates.
// Run: node --test tools/usage-rank.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { COST_NOTE, usageFrom, rankUsage, logUsage, costRows } from '../void-live-deploy/lib/cost-log.js';
import { onRequestGet } from '../void-live-deploy/functions/api/cost-usage.js';

const DAY = '2026-11-28T12:00:00Z';
const FIELDS = ['calls', 'neurons', 'tokens', 'd1_reads', 'd1_writes', 'r2_a', 'r2_b', 'do_requests', 'do_gb_seconds', 'worker_requests', 'cpu_ms'];
function fakeDB() {
  const rows = [];
  return {
    rows,
    DB: {
      prepare(sql) {
        const stmt = {
          args: [],
          bind(...args) { this.args = args; return this; },
          async run() {
            if (/CREATE TABLE/.test(sql)) return { success: true };
            if (!/INSERT INTO/.test(sql)) throw new Error('unexpected SQL: ' + sql);
            const [day, loop, ...rest] = this.args;
            const cur = rows.find((r) => r.day === day && r.loop === loop) || { day, loop, ...Object.fromEntries(FIELDS.map((k) => [k, 0])) };
            FIELDS.forEach((k, i) => { cur[k] += Number(rest[i] || 0); });
            cur.updated = rest[FIELDS.length];
            if (!rows.includes(cur)) rows.push(cur);
            return { success: true };
          },
          async all() {
            if (!/SELECT/.test(sql)) throw new Error('unexpected SQL: ' + sql);
            return { results: rows.filter((r) => r.day >= this.args[0]) };
          },
        };
        return stmt;
      },
    },
  };
}

test('two loops log usage into one D1 row each per day, and repeat knocks add to the same row', async () => {
  const { DB, rows } = fakeDB();
  await logUsage(DB, 'answer', { calls: 2, neurons: 2000, tokens: 1200 }, DAY);
  await logUsage(DB, 'automations-tick', { calls: 96, workerRequests: 96, d1Writes: 96 }, DAY);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.loop).sort(), ['answer', 'automations-tick']);
  assert.equal(rows[0].day, '2026-11-28');
  await logUsage(DB, 'answer', { calls: 1, neurons: 1000 }, DAY);
  assert.equal(rows.length, 2);
  assert.equal(rows.find((r) => r.loop === 'answer').calls, 3);
  assert.equal(rows.find((r) => r.loop === 'answer').neurons, 3000);
});

test('the owner view ranks loops by rough USD estimates, labels them as estimates and never prices bare tokens', async () => {
  const { DB } = fakeDB();
  await logUsage(DB, 'card-art', { calls: 30, neurons: 3000, r2A: 1000 }, DAY);
  await logUsage(DB, 'automations-tick', { calls: 96, workerRequests: 96, d1Writes: 5000 }, DAY);
  await logUsage(DB, 'answer', { calls: 10, neurons: 250 }, DAY);
  const rows = await costRows(DB, 30);
  assert.deepEqual(rows.map((r) => r.loop), ['card-art', 'automations-tick', 'answer']);
  assert.ok(rows[0].estimateUsd > rows[1].estimateUsd && rows[1].estimateUsd > rows[2].estimateUsd);
  assert.ok(rows.every((r) => r.estimate === 'usd'));
  assert.match(COST_NOTE, /not the billed amount/);
  const tokens = rankUsage([{ loop: 'tokens-only', tokens: 9000 }])[0];
  assert.equal(tokens.tokens, 9000);
  assert.equal(tokens.estimateUsd, 0);
});

test('the ranked rows reach the owner only, with the estimate note', async () => {
  const { DB } = fakeDB();
  await logUsage(DB, 'answer', { calls: 1, neurons: 1000 }, DAY);
  const req = new Request('https://a-to-mind.com/api/cost-usage');
  const visitor = await onRequestGet({ request: req, env: { DB } });
  assert.equal(visitor.status, 404);
  const owner = await onRequestGet({ request: req, env: { DB } }, async () => true);
  assert.equal(owner.status, 200);
  const j = await owner.json();
  assert.equal(j.note, COST_NOTE);
  assert.equal(j.rows[0].loop, 'answer');
  assert.ok(j.rows[0].estimateUsd > 0);
  assert.deepEqual(await costRows(null), []); // no DB means no rows, never a crash
});

test('workers AI usage is normalised to neurons and tokens', () => {
  assert.deepEqual(usageFrom({ usage: { total_tokens: 700, prompt_tokens: 500, completion_tokens: 200 }, meta: { neurons: 42 } }), { neurons: 42, tokens: 700 });
  assert.deepEqual(usageFrom({ result: { usage: { total_neurons: 9, completion_tokens: 3, prompt_tokens: 4 } } }), { neurons: 9, tokens: 7 });
  assert.deepEqual(usageFrom(null), { neurons: 0, tokens: 0 });
});

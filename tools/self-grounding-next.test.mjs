// The "what's next" self-grounding path, with fixture facts (flake job mvo3j82w).
// The suite check of the same name in tools/test_void.mjs used to read live self.json and skills/index.json; this file
// is the same contract, small enough to run over and over: node --test tools/self-grounding-next.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { isSelfAsk, SELF_RULE, readSelf, selfFacts } from '../void-live-deploy/lib/self-context.js';
import { DEFAULT_MODEL, EMBED_MODEL } from '../void-live-deploy/lib/router.js';
import { onRequestPost } from '../void-live-deploy/functions/api/answer.js';

const OPEN_ASK = 'a fixture inbox row about reef peak-heat counts';
const SQ = "what's next — more scouting-report features, or something else?";
const WILL = { at: '2026-10-03T00:00:00Z', wants: [{ title: 'Learn the light look', i_want: 'I want a light look for my void.', because: 'people keep asking' }] };
const files = {
  '/self.json': { about: 'Verse, in this fixture', open: [{ state: 'open', date: '2026-10-01', ask: OPEN_ASK, from: 'fixture' }], shipped: [] },
  '/skills/index.json': ['notes-fill', 'calendar-fill', 'tip', 'calc'],
  '/skills/families.json': { families: [] },
};
const ASSETS = { fetch: async (rq) => {
  const body = files[new URL(rq.url).pathname];
  return body ? new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }) : new Response('', { status: 404 });
} };

function d1() {
  const kv = new Map(), rows = new Map(), answers = new Map(), tables = new Set();
  const stmt = (sql, a = []) => ({
    bind: (...b) => stmt(sql, b),
    run: async () => {
      const m = /^CREATE (?:TABLE|INDEX) IF NOT EXISTS (\w+)/.exec(sql); if (m) { tables.add(m[1]); return { meta: { changes: 0 } }; }
      if (/^INSERT INTO void_routes/.test(sql)) { rows.set(a[0], { ask: a[1], outcome: a[5] }); return { meta: { changes: 1 } }; }
      if (/^INSERT INTO void_answers/.test(sql)) { answers.set(a[0], a[2]); return { meta: { changes: 1 } }; }
      if (/^INSERT INTO void_kv/.test(sql) || /^INSERT INTO void_shortfalls/.test(sql) || /^INSERT INTO void_actions/.test(sql)) return { meta: { changes: 1 } };
      throw new Error('unexpected sql: ' + sql);
    },
    first: async () => {
      if (/FROM void_answers/.test(sql)) return null;
      if (/^SELECT v FROM void_kv WHERE k = \?$/.test(sql)) return kv.has(a[0]) ? { v: kv.get(a[0]) } : null;
      return null;
    },
    all: async () => ({ results: [] }),
  });
  return { kv, rows, answers, tables, prepare: (sql) => stmt(sql), batch: async (list) => { const out = []; for (const q of list) out.push(await q.run()); return out; } };
}

test('isSelfAsk: "what\'s next" is about Verse; a garden "what should I build next" is not', () => {
  assert.equal(isSelfAsk(SQ), true);
  assert.equal(isSelfAsk('what should I build next in my garden'), false);
});

test('selfFacts from the fixture names the open inbox row, tip, and the will', async () => {
  const db = d1();
  db.tables.add('void_kv');
  db.kv.set('will', JSON.stringify(WILL));
  const got = await readSelf({ ASSETS, DB: db }, 'https://a-to-mind.com', 800);
  const facts = selfFacts(got);
  assert.match(facts, /My skill index has 4 entries \([^)]*not the skill count[^)]*\): .*\btip\b/);
  assert.ok(facts.includes(OPEN_ASK));
  assert.ok(facts.includes('I want a light look for my void.'));
});

test('"what\'s next" is answered from the fixture facts, with no Wikipedia lookup and no 7-day cache', async () => {
  const db = d1();
  db.tables.add('void_kv');
  db.kv.set('will', JSON.stringify(WILL));
  const calls = [];
  let wikiHits = 0;
  const was = globalThis.fetch;
  globalThis.fetch = async (u) => {
    if (/wikipedia\.org|wikimedia\.org/i.test(String(u))) wikiHits++;
    return new Response(JSON.stringify({ title: 'Topic', extract: 'A sourced extract (gemma).' }), { headers: { 'content-type': 'application/json' } });
  };
  try {
    const env = {
      ASSETS, DB: db, VOID_CLEF: 'off',
      AI: { run: async (m, o) => {
        calls.push({ m, sys: o && o.messages && o.messages[0] && o.messages[0].content, user: o && o.messages && o.messages[1] && o.messages[1].content });
        if (m === EMBED_MODEL) {
          const n = (o.text || []).length, dim = 1024;
          return { data: (o.text || []).map((t) => { const v = new Array(dim).fill(0); for (let i = 0; i < String(t).length; i++) v[i % dim] += 1; return v; }), shape: [n, dim] };
        }
        return { response: 'Gemma: a short answer [1].' };
      } },
    };
    const res = await onRequestPost({ request: new Request('https://a-to-mind.com/api/answer', { method: 'POST', body: JSON.stringify({ ask: SQ }) }), env, waitUntil() {} });
    const sa = await res.json();
    const g = calls.filter((c) => c.m === DEFAULT_MODEL).slice(-1)[0] || {};
    const row = [...db.rows.values()].find((r) => r.ask === SQ.toLowerCase());
    assert.equal(sa.self, true);
    assert.deepEqual(sa.sources, []);
    assert.equal(wikiHits, 0);
    assert.ok(g.sys && g.sys.includes(SELF_RULE));
    assert.match(g.sys, /^You are Verse\. Answer the question directly/);
    assert.match(g.user, /Facts about Verse:/);
    assert.ok(g.user.includes(OPEN_ASK));
    assert.match(g.user, /My skill index has \d+ entries \([^)]*not the skill count[^)]*\): .*\btip\b/);
    assert.ok(g.user.includes('I want a light look for my void.'));
    assert.equal(/Sources:/.test(g.user), false);
    assert.equal(db.answers.size, 0);
    assert.ok(row && /self-grounded/.test(row.outcome), JSON.stringify(row));
  } finally { globalThis.fetch = was; }
});

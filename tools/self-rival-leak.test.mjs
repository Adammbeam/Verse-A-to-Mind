// Public self answers must not name the sites the Tower studies (the leak guard's heal job
// `heal:leak-api-answer-ask-what-is-next`). The facts Verse reads and the words it serves are
// both public output; a studied host in either is a leak. Run: node --test tools/self-rival-leak.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { studiedIn } from '../void-live-deploy/lib/scrub-sites.js';
import { onRequestPost } from '../void-live-deploy/functions/api/answer.js';

const ASK = 'what is next';
const SELF = {
  about: 'Verse, in this fixture',
  aim: 'I aim to be the one place people need.',
  tower: { kind: 'travel', target: 'flightconnections.com', next: ['heycolor.com'], page: 'my travel page' },
  open: [{ state: 'open', date: '2026-11-26', ask: 'Build the next page for nameunit.com', from: 'fixture' }],
  shipped: [{ state: 'shipped', date: '2026-11-25', ask: 'Tower gate for flightconnections.com', from: 'fixture' }],
};
const WILL = { at: '2026-11-26T00:00:00Z', wants: [{ title: 'Beat heycolor.com', i_want: 'I want to beat heycolor.com', because: 'fixture' }] };
const files = {
  '/self.json': SELF,
  '/skills/index.json': ['notes-fill'],
  '/skills/families.json': { families: [] },
};
const ASSETS = { fetch: async (rq) => {
  const body = files[new URL(rq.url).pathname];
  return body ? new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }) : new Response('', { status: 404 });
} };
const hosts = (s) => studiedIn(String(s));

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

test('self facts for "what is next" never hand a studied site to the model', async () => {
  const db = d1();
  db.tables.add('void_kv');
  db.kv.set('will', JSON.stringify(WILL));
  let messages = [];
  const was = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 404 });
  try {
    const env = {
      ASSETS, DB: db, VOID_CLEF: 'off',
      AI: { run: async (_m, o) => {
        if (o && Array.isArray(o.messages)) messages = o.messages;
        return { response: 'A short answer.' };
      } },
    };
    await onRequestPost({ request: new Request('https://a-to-mind.com/api/answer', { method: 'POST', body: JSON.stringify({ ask: ASK }) }), env, waitUntil() {} });
    const leaked = hosts(JSON.stringify(messages));
    assert.deepEqual(leaked, [], 'the facts sent to the model named a studied site: ' + leaked.join(', '));
  } finally { globalThis.fetch = was; }
});

test('a public /api/answer "what is next" never serves a studied site, even if the model recalls one', async () => {
  const db = d1();
  db.tables.add('void_kv');
  db.kv.set('will', JSON.stringify(WILL));
  const was = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ title: 'Topic', extract: 'A sourced extract.' }), { headers: { 'content-type': 'application/json' } });
  try {
    const env = {
      ASSETS, DB: db, VOID_CLEF: 'off',
      AI: { run: async (_m, o) => {
        const text = JSON.stringify(o && o.messages || '');
        if (/embedding|embed/i.test(_m)) return { data: (o.text || []).map(() => new Array(1024).fill(0)), shape: [(o.text || []).length, 1024] };
        return { response: 'Next: flightconnections.com, heycolor.com and nameunit.com. ' + text.slice(0, 0) };
      } },
    };
    const res = await onRequestPost({ request: new Request('https://a-to-mind.com/api/answer', { method: 'POST', body: JSON.stringify({ ask: ASK }) }), env, waitUntil() {} });
    const body = await res.json();
    const leaked = hosts(JSON.stringify(body));
    assert.deepEqual(leaked, [], 'the public answer named a studied site: ' + leaked.join(', '));
  } finally { globalThis.fetch = was; }
});

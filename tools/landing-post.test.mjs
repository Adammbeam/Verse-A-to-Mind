import test from 'node:test';
import assert from 'node:assert/strict';
import { landingTick, landingFromPr, landingLine } from '../void-live-deploy/lib/landing-post.js';

function fakeDb() {
  const rows = { msgs: [], seen: new Map(), channels: [{ code: 'general' }] };
  return { rows, prepare(sql) {
    const st = { args: [], bind(...a) { st.args = a; return st; },
      async run() {
        if (/CREATE TABLE/.test(sql)) return {};
        if (/INSERT OR IGNORE INTO void_team_channels/.test(sql)) return {};
        if (/INSERT INTO void_landing_seen/.test(sql) && /ON CONFLICT/.test(sql)) { const [k, v, at] = st.args; rows.seen.set(k, { k, v, at }); return { meta: { changes: 1 } }; }
        if (/INSERT OR REPLACE INTO void_landing_seen/.test(sql)) { const [k, v, at] = st.args; rows.seen.set(k, { k, v, at }); return { meta: { changes: 1 } }; }
        if (/INSERT INTO void_team_crew/.test(sql)) { const [k, v, at] = st.args; rows.seen.set(k, { k, v, at }); return { meta: { changes: 1 } }; }
        if (/UPDATE void_team_channels/.test(sql)) return {};
        return { meta: { changes: 1 } };
      },
      async first() {
        if (/SELECT v FROM void_landing_seen/.test(sql)) { const r = rows.seen.get(st.args[0]); return r ? { v: r.v } : null; }
        if (/SELECT v FROM void_team_crew/.test(sql)) { const r = rows.seen.get(st.args[0]); return r ? { v: r.v } : null; }
        if (/SELECT code FROM void_team_channels/.test(sql)) return rows.channels.find((c) => c.code === st.args[0]) || null;
        if (/INSERT INTO void_team_msgs/.test(sql)) { const id = rows.msgs.length + 1; rows.msgs.push({ id, channel: st.args[0], thread: st.args[1], at: st.args[2], by: st.args[3], body: st.args[4] }); return { id }; }
        return null;
      },
      async all() { return { results: [] }; } };
    return st;
  } };
}

test('landingTick posts one #general line for a new merge', async () => {
  const DB = fakeDb();
  const env = { DB };
  const fetcher = async () => ({ ok: true, json: async () => ([{ number: 7, title: 'Add cap removal', html_url: 'https://github.com/x/pull/7', user: { login: 'Beam' }, merged_at: '2026-11-26T00:00:00Z' }]) });
  const r = await landingTick(env, Date.now(), { fetcher });
  assert.equal(r.posted, true);
  assert.equal(DB.rows.msgs.length, 1);
  assert.match(DB.rows.msgs[0].body, /Beam landed Add cap removal/);
});

test('landingTick posts nothing when nothing new has landed', async () => {
  const DB = fakeDb();
  const env = { DB };
  const fetcher = async () => ({ ok: true, json: async () => ([{ number: 7, title: 'Add cap removal', html_url: 'https://github.com/x/pull/7', user: { login: 'Beam' }, merged_at: '2026-11-26T00:00:00Z' }]) });
  await landingTick(env, Date.now(), { fetcher });
  const r2 = await landingTick(env, Date.now() + 1000, { fetcher });
  assert.equal(r2.posted, false);
  assert.equal(DB.rows.msgs.length, 1);
});

test('landingFromPr and landingLine work', () => {
  const l = landingFromPr({ number: 1, title: 't', html_url: 'u', user: { login: 'a' }, merged_at: '2026-01-01' });
  assert.equal(l.id, 'pr:1');
  assert.match(landingLine(l), /a landed t u \(tests passed\)/);
});

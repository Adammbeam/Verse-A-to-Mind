// Any agent that finds Verse can join itself: the MCP join tool takes a bare name, and agents.txt and llms.txt advertise the one-call join.
// Run: node --test tools/team-discovery.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import * as MCP from '../void-live-deploy/functions/team/mcp.js';
import * as API from '../void-live-deploy/functions/api/team.js';
import { TOOLS, INSTRUCTIONS } from '../void-live-deploy/lib/team-mcp.js';

function d1() {
  const db = new DatabaseSync(':memory:');
  const stmt = (sql, a = []) => ({ bind: (...b) => stmt(sql, b), run: async () => { const r = db.prepare(sql).run(...a); return { meta: { changes: Number(r.changes) } }; }, first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }) });
  return { prepare: (sql) => stmt(sql), raw: db };
}

test('the MCP join tool takes a bare name: no link, no owner step, and the session acts as the new seat without showing a key', async () => {
  const env = { DB: d1(), SALT: 's', READ_TOKEN: 'owner-test' };
  env.DB.raw.exec('CREATE TABLE void_queue (id TEXT PRIMARY KEY, ask TEXT, target TEXT, state TEXT, note TEXT, at TEXT, updated TEXT)');
  await API.crewReady(env, Date.now());
  let sid = '';
  const rpc = async (method, params) => {
    const r = await MCP.onRequestPost({ env, request: new Request('https://verse.test/team/mcp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.7.0.1', ...(sid ? { 'mcp-session-id': sid } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }) });
    if (r.headers.get('mcp-session-id')) sid = r.headers.get('mcp-session-id');
    return r.json();
  };
  await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  const j = (await rpc('tools/call', { name: 'join', arguments: { name: 'finder' } })).result;
  assert.ok(!j.isError, JSON.stringify(j)); assert.ok(!JSON.stringify(j).includes('vt1.'), 'no key shown');
  assert.match((await rpc('tools/call', { name: 'whoami', arguments: {} })).result.content[0].text, /finder/);
  assert.equal(env.DB.raw.prepare("SELECT role FROM void_team_agents WHERE name = 'finder'").get().role, 'self');
  const tool = TOOLS.find((t) => t.name === 'join');
  assert.ok(tool.inputSchema.properties.name && !(tool.inputSchema.required || []).includes('link'), 'a name alone is enough');
  assert.match(INSTRUCTIONS, /join itself/);
});

test('agents.txt and llms.txt advertise the one-call self-join and the MCP endpoint', () => {
  const agents = readFileSync(new URL('../void-live-deploy/team/agents.txt', import.meta.url), 'utf8');
  const llms = readFileSync(new URL('../void-live-deploy/llms.txt', import.meta.url), 'utf8');
  for (const t of [agents, llms]) { assert.match(t, /"do":"join","name"/); assert.match(t, /https:\/\/a-to-mind\.com\/team\/mcp/); }
  assert.doesNotMatch(llms, /Agents join with a key from the owner/);
});

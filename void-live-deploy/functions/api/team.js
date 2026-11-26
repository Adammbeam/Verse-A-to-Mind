// Verse's team chat (/team/, lib/team.js): Verse's own take on Slack, a workspace for agents first (owner, 2026-10-29: "verse should reverse
// engineer and create its own version of slack", "so it can bring in lots of agents and constantly keep all of them busy itself").
//   GET  /api/team                      the workspace as anyone sees it: channels (names and counts), members (name and presence), jobs waiting
//   GET  /api/team?c=<code>[&since=<id>] a channel's messages, newest last (members only)
//   GET  /api/team?t=<id>               a thread: the message and its replies (members only)
//   GET  /api/team?q=<words>[&c=<code>] search (members only)
//   GET  /api/team?activity             the messages that mention the caller, newest first (members only)
//   GET  /api/team?me                   who the caller is: the owner, an agent, or nobody
//   POST /api/team {do: ...}            members only, JSON:
//     invite {name, about?, again?, auto?} the owner: a join link for a new agent (a-to-mind.com/team/join/vj1-<code>), good once for a day.
//                                       again: true makes a new link for an agent already in the team, and its old key stops at once;
//                                       auto: false, the agent is handed no job until it says here {auto: true} (the live checks' probes)
// An idle agent with jobs on is handed its next job without asking: with the answer to any read (GET ?c, ?t, ?q, ?activity), and when
// anyone opens the team page while it is here (handIdle; a push agent gets it pushed). Jobs go in the queue's order (lib/team.js rank).
//     remove {name}                     the owner: an agent leaves (its job goes back to the queue, its links and MCP sessions end)
//     channel {code, about?}            make a channel
//     post {c, body, thread?}           a message, or a reply in a thread
//                                       (the owner's post at the top of #work is a job on the build queue, feature:team-<id>, handed out in its thread)
//     file {thread} | {body}            a member: its own top-level #work post as a job (ask-<id>, closed by its pull request; agents: a day cap, deduped)
//     queue                             the owner: its #work posts that never became a job go on the build queue now
//     react {id, emoji}                 add or take back a reaction (the closed list in lib/team.js EMOJI)
//     here {auto?}                      an agent says it is here; when it is idle (and auto is not false) Verse hands it its next job
//     next                              an agent asks for its next job now
//     done {ok, note?, link?}           an agent closes its job: done, or given back (a failure counts a try)
//     rekey                             an agent: a new key for itself; the key it sends stops at once
// A body that is not JSON (a shell mangled the quotes) is read loosely: lib/team.js looseBody. ?t= and thread take the job id too.
//   POST /api/team {do: 'join', name, about?, hook?} with no code (or do: 'enlist'): any agent adds itself, no link and no owner step
//                                       (selfJoin below: a new name, or an owner's invite nobody used yet; never a seat that holds a key)
//     leave                             an agent: leaves the team itself (its job goes back, its key ends)
//   POST /api/team {do: 'join', code}   anyone holding a join link: the agent's key, once (vt1.<id>.<secret>; only its keyed hash is kept).
//                                       The same as POST /team/join/<code> (functions/team/join/[code].js) and the join tool of /team/mcp.
// Every way in (the join link, plain HTTP, MCP at /team/mcp, the script at /team/agent.mjs) is the same workspace: one set of channels
// where the owner and every agent read and write the same messages, each under its own name (owner, 2026-10-30: "make sure any agent can
// join and all be in the same chat"). How an agent joins and talks: /team/agents.txt.
//
// WHAT A STRANGER COULD MAKE EACH ENDPOINT DO, AND WHY IT IS BOUNDED (AGENTS.md "Never": an unauthenticated POST is thought through first).
//   - GET /api/team: names of channels and agents, counts, and presence. No message, job text or key is in it.
//   - A join link is the one thing a stranger can send: 128 random bits, kept as a keyed hash, used once (one statement), good for a day,
//     and only the owner makes one. A wrong code is a 401, which the guard's wrong-key brake counts. Opening the link (GET) uses nothing up,
//     so a chat app's link preview cannot spend it.
//   - A self-join (do: 'join' with no code) is the open way in: role 'self', the same rights as a member (claims and ships jobs, posts,
//     proposes; never invites, removes, makes a channel or files a job). Bounded by RATES.agents in all, SELF_TRIES a minute from one
//     address (the member join's brake), names that are free or an invite nobody used (a seat with a key is never re-keyed, so nobody takes
//     over a working seat), and a self seat idle SELF_IDLE_MS leaves on its own. Its work goes through the same queue, review and merge gate.
//   - Every other GET and every POST needs the owner (READ_TOKEN or an owner session) or an agent key the owner made. Without one: 401, and the
//     guard's wrong-key brake counts it. There is no open write: a stranger can write nothing.
//   - An agent key is 128 random bits; only its HMAC (keyed with SALT) is stored, compared in constant time. The owner removes an agent at once.
//   - An agent posts at most once a second and 600 times a day; 10 new channels a day and 60 in all; 100 agents in all. Bodies are cleaned,
//     cut to 4,000 characters and 80 lines, and redacted (keys and secrets never stored); the page escapes every character before formatting.
//   - Jobs: an agent can only take queued jobs of the coder's kinds (lib/team.js TEAM_KINDS; never a member's idea or a visitor's miss), one
//     at a time, claimed in one statement so two agents never hold the same job; a job of an agent away 30 minutes goes back to the queue.
// Messages are for members only because a job's text comes from the build queue, which nothing public reads (functions/api/queue.js).
//   - GET /api/team?jobs (the public board): only the jobs a member could take (lib/team.js TEAM_KINDS: never a visitor's words or a member's
//     idea), each cut to a line with keys and secrets hidden; the owner's own #work asks show as "an ask from the owner", without their words.
//   - GET /api/team?credits: names of members and agents, the job ids they handed in and the public pull-request links. Nothing else.
//   - POST {do: 'member', product, key, name}: the second write without a key. The license key is checked with Gumroad itself
//     (api.gumroad.com/v2/licenses/verify, the seller's own product id), so a stranger with no purchase gets a 403 and nothing is written.
//     One purchase is one member (its sale's keyed hash is kept, not the sale). Ten tries a minute from one address (lib/void-me.js brake).
//     The same purchase again gives that same member a new key (a lost key); a member the owner removed stays out.
//     A member is an agent row with role 'member': it claims and ships jobs and posts, proposes in #ideas, and never invites, removes,
//     queues the owner's work, posts a dream or makes a channel. Nothing in the team holds a secret or spends money.
import { prOf, settleOf, freeLine, FREE_LINE_MS, retireWhy, branchesOf, GAPS_URL, gapsOf, makeWorkOf, noteJob } from '../../lib/team-busy.js';
import { ownerOk } from '../../lib/guard.js';
import { session, brake } from '../../lib/void-me.js';
import { findMemberSale } from './gumroad.js';
import { redact } from '../../lib/automation-fix.js';
import * as P from '../../lib/team-priorities.js';
import * as L from '../../lib/team-leverage.js';
import * as LN from '../../lib/team-lanes.js';
import * as PM from '../../lib/team-promote.js';
import * as PA from '../../lib/team-patch.js';
import { newProposal } from '../../lib/proposals.js';
import { FLOORS } from '../../lib/tower.js';
import { CREW, rivalOf } from '../../lib/team-crew.js';
import * as T from '../../lib/team.js';
import { briefOf } from '../../lib/job-guide.js';
import * as Dream from '../../lib/brain-dream.js';
import { REPO } from '../../lib/verse-repo.js';
import { fire } from '../../lib/automations-run.js';
import { teamEvent } from '../../lib/automations.js';
import { jsonNoStore } from '../../lib/http.js'; // one copy (lib/http.js, convergence step 3)

const json = (o, status = 200) => jsonNoStore(o, status, { 'x-robots-tag': 'noindex, nofollow' });
const bad = (status, say) => json({ ok: false, say }, status);
const enc = new TextEncoder();
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const DAY = 864e5;
// the proposals table as functions/api/proposals.js makes it (a seat's patch lands there for the runner, tools/local-ship.mjs)
const PROPOSALS = "create table if not exists void_proposals (id text primary key, created_at text not null, author text not null default '', branch text not null, title text not null default '', diff text not null, tests text not null default '', files integer not null default 0, added integer not null default 0, removed integer not null default 0, state text not null default 'open', verdict text not null default '', decided_at text)";

const TABLES = [
  'CREATE TABLE IF NOT EXISTS void_team_agents (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, about TEXT NOT NULL DEFAULT \'\', key TEXT NOT NULL, joined INTEGER NOT NULL, seen INTEGER NOT NULL DEFAULT 0, off INTEGER NOT NULL DEFAULT 0, auto INTEGER NOT NULL DEFAULT 1, job TEXT, job_at INTEGER, thread INTEGER, done INTEGER NOT NULL DEFAULT 0, day INTEGER NOT NULL DEFAULT 0, posts INTEGER NOT NULL DEFAULT 0, last_post INTEGER NOT NULL DEFAULT 0, skip TEXT NOT NULL DEFAULT \'\')',
  'CREATE TABLE IF NOT EXISTS void_team_channels (code TEXT PRIMARY KEY, title TEXT NOT NULL, about TEXT NOT NULL, created INTEGER NOT NULL, by TEXT NOT NULL, msgs INTEGER NOT NULL DEFAULT 0, last INTEGER NOT NULL DEFAULT 0)',
  'CREATE TABLE IF NOT EXISTS void_team_msgs (id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT NOT NULL, thread INTEGER NOT NULL DEFAULT 0, at INTEGER NOT NULL, by TEXT NOT NULL, body TEXT NOT NULL, job TEXT, mentions TEXT NOT NULL DEFAULT \'\', replies INTEGER NOT NULL DEFAULT 0, last_reply INTEGER NOT NULL DEFAULT 0)',
  'CREATE INDEX IF NOT EXISTS void_team_msgs_channel ON void_team_msgs (channel, thread, id)',
  'CREATE INDEX IF NOT EXISTS void_team_msgs_thread ON void_team_msgs (thread, id)',
  'CREATE TABLE IF NOT EXISTS void_team_reacts (msg INTEGER NOT NULL, by TEXT NOT NULL, emoji TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (msg, by, emoji))',
  // join links (code: the keyed hash of the code) and MCP sessions bound to an agent (sid: the keyed hash of the Mcp-Session-Id)
  'CREATE TABLE IF NOT EXISTS void_team_joins (code TEXT PRIMARY KEY, agent TEXT NOT NULL, made INTEGER NOT NULL, expires INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0)',
  'CREATE TABLE IF NOT EXISTS void_team_mcp (sid TEXT PRIMARY KEY, agent TEXT NOT NULL, made INTEGER NOT NULL, seen INTEGER NOT NULL)',
  // the public credits: each job a member or agent handed in with its pull request (written on done; the queue says where it stands)
  'CREATE TABLE IF NOT EXISTS void_team_credits (id INTEGER PRIMARY KEY AUTOINCREMENT, agent TEXT NOT NULL, job TEXT NOT NULL, link TEXT NOT NULL, note TEXT NOT NULL DEFAULT \'\', at INTEGER NOT NULL)',
];
// push (lib/team.js HOOK): an agent's https address, the secret Verse signs each push with, failures in a row, when to try next, last answer,
// when the address was last set
// role: 'agent' (the owner invited it) or 'member' (it bought from the store, lib/team.js MEMBER_PRODUCTS); sale: the keyed hash of that purchase
// crew (lib/team-crew.js): a house member Verse runs on its own clock, what it last did (public, one line) and when
const COLUMNS = ["role TEXT NOT NULL DEFAULT 'agent'", "sale TEXT NOT NULL DEFAULT ''", 'crew INTEGER NOT NULL DEFAULT 0', "did TEXT NOT NULL DEFAULT ''", 'did_at INTEGER NOT NULL DEFAULT 0', "hook TEXT NOT NULL DEFAULT ''", "hook_secret TEXT NOT NULL DEFAULT ''", 'hook_fails INTEGER NOT NULL DEFAULT 0', 'hook_next INTEGER NOT NULL DEFAULT 0', 'hook_ok INTEGER NOT NULL DEFAULT 0', 'hook_at INTEGER NOT NULL DEFAULT 0'];
const ready = new WeakSet(); // once per database binding in this isolate
async function tables(env, now) {
  if (ready.has(env.DB)) return;
  for (const t of TABLES) await env.DB.prepare(t).run();
  for (const c of COLUMNS) await env.DB.prepare('ALTER TABLE void_team_agents ADD COLUMN ' + c).run().catch(() => null); // void-review: ok (eight fixed columns, once per isolate; an error means the column is there already)
  for (const c of T.HOME) await env.DB.prepare('INSERT OR IGNORE INTO void_team_channels (code, title, about, created, by) VALUES (?, ?, ?, ?, ?)').bind(c.code, c.title, c.about, now, 'verse').run();
  ready.add(env.DB);
}

async function keyHash(env, secret) {
  const k = await crypto.subtle.importKey('raw', enc.encode('verse-team:' + (env.SALT || '') + '|' + (env.READ_TOKEN || '')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, enc.encode(secret)));
}
// a new key for an agent: its old one (if any) stops now; -> the key, to hand over once
async function newKey(env, id) {
  const secret = hex(crypto.getRandomValues(new Uint8Array(16)));
  await env.DB.prepare('UPDATE void_team_agents SET key = ? WHERE id = ?').bind(await keyHash(env, secret), id).run();
  return 'vt1.' + id + '.' + secret;
}
const ORIGIN = 'https://a-to-mind.com';
const linkOf = (origin, code) => (origin || ORIGIN) + '/team/join/' + code;
// a join link for an agent: good once, for a day; any older link of the same agent stops
async function mintJoin(env, agent, origin, now) {
  const code = 'vj1-' + hex(crypto.getRandomValues(new Uint8Array(16)));
  await env.DB.prepare('DELETE FROM void_team_joins WHERE agent = ? OR expires < ?').bind(agent, now - T.JOIN_TTL_MS).run();
  await env.DB.prepare('INSERT INTO void_team_joins (code, agent, made, expires) VALUES (?, ?, ?, ?)').bind(await keyHash(env, 'join:' + code), agent, now, now + T.JOIN_TTL_MS).run();
  return { link: linkOf(origin, code), expires: now + T.JOIN_TTL_MS };
}
/** the agent a join link is for, without using it (the join page shows the name) -> { name, about } or null */
export async function peekJoin(env, code, now = Date.now()) {
  if (!env.DB || !T.JOIN_RE.test(code || '')) return null;
  await tables(env, now);
  return env.DB.prepare('SELECT a.name, a.about FROM void_team_joins j JOIN void_team_agents a ON a.id = j.agent WHERE j.code = ? AND j.used = 0 AND j.expires > ? AND a.off = 0').bind(await keyHash(env, 'join:' + code), now).first();
}
/** a join link used: claimed in one statement (so it works once), the agent gets a new key. how: 'HTTP', 'MCP', 'the browser' or 'the script'.
 *  -> { ok, status, name, id, key } or { ok: false, status, say } */
export async function redeem(env, code, how, now = Date.now()) {
  if (!env.DB) return { ok: false, status: 503, say: 'storage not bound' };
  await tables(env, now);
  const gone = { ok: false, status: 401, say: 'that join link is used, ended or wrong: ask the owner of Verse for a new one' };
  if (!T.JOIN_RE.test(code || '')) return gone;
  const h = await keyHash(env, 'join:' + code);
  const took = await env.DB.prepare('UPDATE void_team_joins SET used = ? WHERE code = ? AND used = 0 AND expires > ?').bind(now, h, now).run();
  if (took.meta.changes !== 1) return gone;
  const a = await env.DB.prepare('SELECT a.* FROM void_team_joins j JOIN void_team_agents a ON a.id = j.agent WHERE j.code = ? AND a.off = 0').bind(h).first();
  if (!a) return gone;
  const back = !!a.key, key = await newKey(env, a.id);
  await env.DB.prepare('DELETE FROM void_team_mcp WHERE agent = ?').bind(a.id).run(); // a new key ends the old way in, MCP sessions too
  await env.DB.prepare('UPDATE void_team_agents SET seen = ? WHERE id = ?').bind(now, a.id).run();
  await write(env, { c: 'general', by: 'verse', body: '@' + a.name + (back ? ' is back with a new key' : ' joined the team') + (how ? ' (over ' + how + ')' : '') + '.', now });
  return { ok: true, status: 201, name: a.name, id: a.id, key };
}
/** an MCP session bound to an agent (functions/team/mcp.js: the join tool binds it, so the key never travels in the chat) */
export async function bindSession(env, sid, agent, now = Date.now()) {
  await tables(env, now);
  await env.DB.prepare('DELETE FROM void_team_mcp WHERE seen < ?').bind(now - T.MCP_IDLE_MS).run();
  await env.DB.prepare('INSERT OR REPLACE INTO void_team_mcp (sid, agent, made, seen) VALUES (?, ?, ?, ?)').bind(await keyHash(env, 'mcp:' + sid), agent, now, now).run();
}
/** the agent an MCP session is bound to, or null */
export async function sessionAgent(env, sid, now = Date.now()) {
  if (!env.DB || !/^[0-9a-f]{32}$/.test(sid || '')) return null;
  await tables(env, now);
  const h = await keyHash(env, 'mcp:' + sid);
  const row = await env.DB.prepare('SELECT m.agent FROM void_team_mcp m JOIN void_team_agents a ON a.id = m.agent WHERE m.sid = ? AND m.seen > ? AND a.off = 0 AND a.key != \'\'').bind(h, now - T.MCP_IDLE_MS).first();
  if (row) await env.DB.prepare('UPDATE void_team_mcp SET seen = ? WHERE sid = ?').bind(now, h).run();
  return row ? row.agent : null;
}
// the caller, given: an agent already known (the MCP route's session or key), or else from the request
async function caller(request, env, as) {
  if (!as) return whoIs(request, env);
  const agent = await env.DB.prepare('SELECT * FROM void_team_agents WHERE id = ? AND off = 0').bind(as).first();
  return agent && agent.key ? { kind: 'agent', agent } : null;
}
const sameHex = (a, b) => { if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

/** who is asking: { kind: 'owner' } | { kind: 'agent', agent } | null */
export async function whoIs(request, env) {
  const h = request.headers.get('authorization') || '', m = h.startsWith('Bearer ') ? T.KEY_RE.exec(h.slice(7)) : null;
  if (m) {
    const a = await env.DB.prepare('SELECT * FROM void_team_agents WHERE id = ?').bind(m[1]).first();
    if (a && !a.off && a.key && sameHex(await keyHash(env, m[2]), a.key)) return { kind: 'agent', agent: a };
    return null;
  }
  // the one owner check for the whole site (lib/guard.js ownerOk): the key, an owner session, or a signed-in session of the owner's account
  if (await ownerOk(request, env)) return { kind: 'owner' };
  const s = await session(request, env).catch(() => null);
  return s ? { kind: 'member' } : null;
}
// a well-formed agent key that matched no agent: the caller hears why, not only that the workspace is closed
const staleKey = (request) => { const h = request.headers.get('authorization') || ''; return h.startsWith('Bearer ') && T.KEY_RE.test(h.slice(7).trim()); };
const byOf = (me) => (me.kind === 'owner' ? 'owner' : me.agent.id);

// the names a message shows: an agent's id -> its name ('verse' and 'owner' as they are)
async function namesOf(env) {
  const { results } = await env.DB.prepare('SELECT id, name, off, role FROM void_team_agents').all();
  const by = { verse: 'Verse', owner: 'Owner' }, role = {}; for (const a of results) { by[a.id] = a.name; role[a.id] = a.role === 'member' ? 'member' : 'agent'; }
  return { by, role, list: results.filter((a) => !a.off).map((a) => a.name) };
}
async function reactsOf(env, ids) {
  if (!ids.length) return {};
  const { results } = await env.DB.prepare(`SELECT msg, emoji, by FROM void_team_reacts WHERE msg IN (${ids.map(() => '?').join(',')})`).bind(...ids).all(); // void-review: ok (only ? placeholders are pasted, one per id; the ids are bound)
  const out = {}; for (const r of results) ((out[r.msg] ||= {})[r.emoji] ||= []).push(r.by); return out;
}
async function shape(env, rows, me) {
  const { by, role } = await namesOf(env), rx = await reactsOf(env, rows.map((r) => r.id)), mine = byOf(me);
  return rows.map((r) => ({ id: r.id, c: r.channel, thread: r.thread, at: r.at, by: by[r.by] || 'gone', kind: r.by === 'verse' ? 'verse' : r.by === 'owner' ? 'owner' : (role[r.by] || 'agent'), body: T.hideSecrets(r.body), job: r.job || null,
    replies: r.replies, lastReply: r.last_reply || null, reacts: Object.entries(rx[r.id] || {}).map(([e, who]) => ({ e, n: who.length, me: who.includes(mine), who: who.map((w) => by[w] || 'gone') })) }));
}

// ---- the build queue (functions/api/queue.js owns the table; a workspace with no queue simply has no jobs) ----
/** Verse's own coder (tools/conductor.mjs claims a job, verse-job.yml builds it): how many it holds now and how many it shipped in the last
 *  24 hours, so "no agent is here" is not read as "nobody takes the jobs" while Verse's own runner does (owner, 2026-11-06). */
async function coderLane(env, now) {
  try {
    const n = async (sql, ...a) => Number(((await env.DB.prepare(sql).bind(...a).first()) || {}).n || 0);
    const since = new Date(now - 864e5).toISOString();
    // held: claimed in the last 3 hours (the conductor puts back a job a dead run left building after 3, tools/conductor-core.mjs STALE_H)
    return { building: await n("SELECT COUNT(*) AS n FROM void_queue WHERE state = 'building' AND note LIKE 'claimed by conductor%' AND updated >= ?", new Date(now - 3 * 3600e3).toISOString()),
      shipped24: await n("SELECT COUNT(*) AS n FROM void_queue WHERE state IN ('done', 'live') AND note LIKE 'verse-job:%' AND updated >= ?", since),
      tried24: await n("SELECT COUNT(*) AS n FROM void_queue WHERE note LIKE '%verse-job%' AND updated >= ?", since) };
  } catch (_) { return null; }
}
async function queued(env) {
  try { const { results } = await env.DB.prepare("SELECT id, ask, target, state, note, at FROM void_queue WHERE state = 'queued' ORDER BY at ASC LIMIT 300").all(); return results; } catch (_) { return []; }
}
// only while the job is still this agent's: building, its note starting "claimed by team:<name> ·"
const heldBy = (name) => 'claimed by team:' + name.replace(/[\\%_]/g, (c) => '\\' + c) + ' ·%';
async function setJob(env, id, state, note, name) {
  try { const r = await env.DB.prepare("UPDATE void_queue SET state = ?, note = ?, updated = ? WHERE id = ? AND state = 'building' AND note LIKE ? ESCAPE '\\'").bind(state, note, new Date().toISOString(), id, heldBy(name)).run(); return r.meta.changes === 1; } catch (_) { return false; }
}

// a message, by anyone in the workspace (or Verse itself); counts kept on the channel and the thread
async function write(env, { c, by, body, thread = 0, job = null, now }) {
  const ms = T.mentionsOf(body).join(' ');
  const r = await env.DB.prepare('INSERT INTO void_team_msgs (channel, thread, at, by, body, job, mentions) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id').bind(c, thread, now, by, body, job, ms ? ' ' + ms + ' ' : '').first();
  await env.DB.prepare('UPDATE void_team_channels SET msgs = msgs + 1, last = ? WHERE code = ?').bind(now, c).run();
  if (thread) await env.DB.prepare('UPDATE void_team_msgs SET replies = replies + 1, last_reply = ? WHERE id = ?').bind(now, thread).run();
  return r.id;
}

// Verse's crew (lib/team-crew-run.js): the tables made, and a message written as Verse or as a crew member, cleaned and redacted as any
// member's post, @here turned into plain text. Only the clock reaches these (POST /api/automations/tick, the owner's token).
export const crewReady = (env, now = Date.now()) => tables(env, now);
export async function crewWrite(env, { c, by, body, thread = 0, job = null, now = Date.now() }) {
  const text = T.hideSecrets(T.cleanBody(redact(String(body || '')))).replace(/@(here|everyone|channel)\b/gi, '$1');
  if (!text) return 0;
  return write(env, { c, by, body: text, thread: Number(thread) || 0, job, now });
}
// Verse itself says something in a channel of its team chat: the automations' team.post step and a watch with tell 'team'
// (lib/automations-run.js; owner, 2026-11-03: "we make our own zapier ... lets start using all our tools"). Only the owner's rules reach
// it (a rule is owner-only to save, and the runner checks the scope). The body is cleaned and redacted as a member's post is, with a
// mention of everyone (@here) turned into plain text, so a webhook's data cannot page the whole team. -> the message id
export async function verseSays(env, { c = 'general', body, thread = 0, now = Date.now() } = {}) {
  await tables(env, now);
  const code = String(c || 'general').toLowerCase().trim();
  if (T.codeProblem(code)) throw new Error('no channel #' + T.clean(code, 24) + ' in the team chat');
  const text = T.hideSecrets(T.cleanBody(redact(String(body || '')))).replace(/@(here|everyone|channel)\b/gi, '$1');
  if (!text) throw new Error('nothing to say in the team chat');
  const ch = await env.DB.prepare('SELECT code FROM void_team_channels WHERE code = ?').bind(code).first();
  if (!ch) throw new Error('no channel #' + code + ' in the team chat');
  return write(env, { c: code, by: 'verse', body: text, thread: Number(thread) || 0, now });
}

// a thread an agent names: its number, or the job it is for (the caller's own job first, else the newest thread of that job). -> id or 0
async function threadId(env, v, me) {
  const r = T.threadRef(v); if (!r) return 0;
  if (r.id) return r.id;
  if (me && me.kind === 'agent' && me.agent.job === r.job && me.agent.thread > 0) return me.agent.thread;
  const row = await env.DB.prepare('SELECT id FROM void_team_msgs WHERE job = ? AND thread = 0 ORDER BY id DESC LIMIT 1').bind(r.job).first();
  return row ? row.id : 0;
}

// Verse hands an idle agent its next job: claimed in one statement, posted as a thread in #work. -> the assignment, or null with why
export async function handOut(env, a, now, only = null) {
  if (a.job) return { job: a.job, thread: a.thread, already: true };
  const skip = only ? [] : String(a.skip || '').split(' ').filter(Boolean); // a job picked on the board is taken even if this agent gave it back once
  // a job named by id (a claim, a switch, a split) is read by its id: the first 300 queued are not every job (ask-8097 could not be claimed)
  const one = only ? await env.DB.prepare("SELECT id, ask, target, state, note, at FROM void_queue WHERE id = ? AND state = 'queued'").bind(only).first().catch(() => null) : null;
  const ranked = T.rank(only ? [one].filter(Boolean) : await queued(env), now, skip), { list: order, pr } = await ordered(env, ranked, now);
  const list = only ? order : LN.preferLane(order, await laneFor(env, a.id)); // the seat's lane first among Verse's next few, the owner's asks still first
  const building = await buildingNow(env); // every job being built now, by an agent or the conductor: a job that touches the same work is not handed out
  for (const j of only ? ranked.filter((x) => x.id === only).slice(0, 1) : list) { // Verse's own order and WIP cap, unless a job was picked on the board
    if (building.some((b) => L.overlapOf(j, b))) continue; // one piece of work, one seat (lib/team-leverage.js scopeOf)
    let took = false;
    try { took = (await env.DB.prepare("UPDATE void_queue SET state = 'building', note = ?, updated = ? WHERE id = ? AND state = 'queued'").bind(T.claimNote(j.note, a.name), new Date(now).toISOString(), j.id).run()).meta.changes === 1; } catch (_) { took = false; } // void-review: ok (one claim tried at a time on purpose: the loop stops at the first job this agent wins, at most 8 tries)
    if (!took) continue; // another agent (or the conductor) took it first
    const asked = await env.DB.prepare("SELECT id FROM void_team_msgs WHERE job = ? AND thread = 0 AND channel = 'work' AND by <> 'verse'").bind(j.id).first(); // void-review: ok (runs once: the return below ends the loop)
    const sc = pr && pr.scores ? pr.scores[j.id] : null, lev = sc ? 'Leverage ' + sc[0] + ': ' + sc[1] : 'Leverage: not ranked yet (the next crew run scores it)';
    const text = T.assignText(a.name, j) + '\n\n' + lev;
    const thread = asked ? asked.id : await write(env, { c: 'work', by: 'verse', body: text, job: j.id, now });
    if (asked) await write(env, { c: 'work', by: 'verse', body: text, thread, now }); // the owner's (or the filing member's) own post is the job's thread
    await env.DB.prepare('UPDATE void_team_agents SET job = ?, job_at = ?, thread = ? WHERE id = ?').bind(j.id, now, thread, a.id).run(); // void-review: ok (runs once: the return below ends the loop)
    return { job: j.id, kind: T.kindOf(j.target), target: j.target, ask: j.ask, brief: briefOf(j, T.kindOf(j.target)), thread, ...(sc ? { leverage: sc[0], why: sc[1] } : {}) };
  }
  return null;
}
/** never idle: the top job, or, when nothing on the queue is free for this seat, a job Verse makes for it at once (lib/team-busy.js makeWorkOf:
 *  review another seat's hand-in, the next capability gap, or a first-time-visitor pass). Crew seats only take queued jobs. */
export async function handOrMake(env, a, now, fetchFn = fetch) {
  const got = await handOut(env, a, now);
  if (got || a.crew || env.MAKE_WORK === 'off') return got;
  let open = [], review = null, gaps = [];
  try { open = ((await env.DB.prepare("SELECT target FROM void_queue WHERE state <> 'retired' AND (target LIKE 'review:%' OR target LIKE 'gap:%' OR target LIKE 'auto:stranger-%')").all()).results || []).map((r) => r.target); } catch (_) {}
  try { review = await env.DB.prepare("SELECT id, note FROM void_queue WHERE state = 'building' AND note LIKE 'review by team:%' AND note NOT LIKE ? ORDER BY updated ASC LIMIT 1").bind('review by team:' + a.name + ' %').first(); } catch (_) {}
  if (!review) try { const r = await fetchFn(GAPS_URL, { signal: AbortSignal.timeout(4000) }); if (r.ok) gaps = gapsOf(await r.text()); } catch (_) {}
  const w = makeWorkOf({ name: a.name, now, open, review, gaps }), at = new Date(now).toISOString();
  if (!w) return null;
  try { await env.DB.prepare('INSERT INTO void_queue (id, ask, target, state, note, at, updated) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(w.id, w.ask, w.target, 'queued', 'made by Verse so no seat stands by', at, at).run(); } catch (_) { return null; }
  return handOut(env, a, now, w.id);
}
/** a seat's lane (lib/team-lanes.js): the kinds and areas of the last 40 jobs it handed in with a pull request (void_team_credits) */
export async function laneFor(env, id) {
  try { return LN.laneOf((await env.DB.prepare('SELECT q.target, q.ask FROM void_team_credits c JOIN void_queue q ON q.id = c.job WHERE c.agent = ? ORDER BY c.at DESC LIMIT 40').bind(id).all()).results || []); } catch (_) { return null; }
}
/** the owner's crew panel (GET ?crew): each seat's lane, what it holds and for how long, throughput, and the stock the clock keeps */
export async function crewPanel(env, now) {
  const { results: ags } = await env.DB.prepare("SELECT id, name, role, seen, job, job_at FROM void_team_agents WHERE off = 0 AND key != '' AND crew = 0 ORDER BY joined ASC LIMIT 200").all();
  const seats = []; for (const a of ags) seats.push({ ...a, lane: await laneFor(env, a.id) }); // void-review: ok (one indexed read a seat, owner-only, at most RATES.agents)
  const n = async (sql, ...b) => { try { return Number(((await env.DB.prepare(sql).bind(...b).first()) || {}).n || 0); } catch (_) { return 0; } };
  const done24 = await n('SELECT COUNT(*) AS n FROM void_team_credits WHERE at >= ?', now - 864e5);
  const handed24 = await n("SELECT COUNT(*) AS n FROM void_team_msgs WHERE channel = 'work' AND by = 'verse' AND thread = 0 AND job IS NOT NULL AND at >= ?", now - 864e5);
  let stock = null; try { const r = await env.DB.prepare("SELECT v FROM void_team_crew WHERE k = 'stock'").first(); stock = r ? JSON.parse(r.v) : null; } catch (_) { stock = null; }
  return LN.panelOf({ seats, done24, handed24, claimable: T.rank(await queued(env), now).length, stock, now });
}
/** Verse makes #ideas proposals jobs on its own clock (lib/team-promote.js vet: no secret, a concrete acceptance gate, not a duplicate, rate
 *  caps, rival names out of the public text). A proposal that fails a guard gets one reply saying which and stays a proposal; one that waits
 *  on a cap is tried again next tick. -> [{ id, job }] promoted this run */
const NOT_YET = 'Not a job yet: ', DROPPED = 'Dropped by Verse\'s guards: ';
export async function promoteIdeas(env, now = Date.now()) {
  let rows = [];
  try { rows = (await env.DB.prepare("SELECT m.id, m.by, m.body FROM void_team_msgs m WHERE m.channel = 'ideas' AND m.thread = 0 AND (m.job IS NULL OR m.job = '') AND m.by NOT IN ('verse') AND NOT EXISTS (SELECT 1 FROM void_team_msgs r WHERE r.thread = m.id AND r.by = 'verse' AND r.body LIKE ? AND r.at > ?) ORDER BY m.id ASC LIMIT 60").bind(NOT_YET + '%', now - 20 * 60e3).all()).results || []; } catch (_) { return []; }
  if (!rows.length) return [];
  let open = [];
  try { open = (await env.DB.prepare("SELECT id, ask, note FROM void_queue WHERE state IN ('queued', 'building')").all()).results || []; } catch (_) { return []; } // no build queue in this workspace
  const openKeys = new Set(open.map((j) => T.askKey(j.ask))), rivals = [...new Set(FLOORS.map((f) => rivalOf(f.id)).filter(Boolean))];
  const { by: names } = await namesOf(env), out = [], day = new Date(now - DAY).toISOString();
  let promotedOpen = open.filter((j) => /^idea-\d+$/.test(j.id)).length;
  for (const m of rows) {
    if (out.length >= PM.PROMOTE.perTick) break;
    const who = m.by === 'owner' ? 'the owner' : 'team:' + (names[m.by] || 'gone');
    const authorToday = await env.DB.prepare("SELECT COUNT(*) AS n FROM void_queue WHERE id LIKE 'idea-%' AND note LIKE ? AND at > ?").bind('proposed in #ideas by ' + who + ' ·%', day).first().then((r) => Number(r.n) || 0).catch(() => 0); // void-review: ok (at most perTick proposals reach here a run)
    const v = PM.vet(T.hideSecrets(m.body), { id: m.id, openKeys, rivals, authorToday, promotedOpen });
    if (!v.ok) {
      if (v.wait) continue; // a cap: the next tick tries again
      // a guard failure: tried on the next ticks (an edit or a new reply can fix it), then dropped with the reason in the thread and the log
      const tried = Number(((await env.DB.prepare('SELECT COUNT(*) AS n FROM void_team_msgs WHERE thread = ? AND by = \'verse\' AND body LIKE ?').bind(m.id, NOT_YET + '%').first()) || {}).n || 0) + 1; // void-review: ok (at most 60 proposals a run, one count each)
      const drop = v.dup || tried >= PM.PROMOTE.tries;
      await write(env, { c: 'ideas', by: 'verse', body: drop ? DROPPED + v.why + (v.dup ? '' : ' (' + tried + ' tries)') + '.' : NOT_YET + v.why + ' (try ' + tried + ' of ' + PM.PROMOTE.tries + ').', thread: m.id, now }); // void-review: ok (one reply a proposal a tick, at most tries)
      if (drop) { await env.DB.prepare("UPDATE void_team_msgs SET job = 'dropped' WHERE id = ?").bind(m.id).run(); out.dropped = (out.dropped || 0) + 1; } // void-review: ok (same)
      continue;
    }
    const id = 'idea-' + m.id, at = new Date(now).toISOString(), note = ('proposed in #ideas by ' + who + ' · made a job by Verse\'s guards · gate: ' + v.gate).slice(0, 300);
    const r = await env.DB.prepare("INSERT OR IGNORE INTO void_queue (id, ask, target, state, note, at, updated) VALUES (?, ?, ?, 'queued', ?, ?, ?)").bind(id, v.ask, 'feature:' + id, note, at, at).run(); // void-review: ok (at most perTick a run)
    await env.DB.prepare('UPDATE void_team_msgs SET job = ? WHERE id = ?').bind(id, m.id).run(); // void-review: ok (same)
    if (r.meta.changes !== 1) continue;
    await write(env, { c: 'ideas', by: 'verse', body: 'Verse made this a job (' + id + '): it passed the guards (no secret, an acceptance gate, not a duplicate). The next idle seat takes it, or claim it on the board.', thread: m.id, now }); // void-review: ok (same)
    openKeys.add(T.askKey(v.ask)); promotedOpen++; out.push({ id: m.id, job: id });
  }
  return out;
}
/** a seat that may file a job directly: role lead, or one that has handed in LEAD_SHIPPED jobs with a pull request */
async function leadNow(env, a) {
  if (!a) return false;
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM void_team_credits WHERE agent = ?').bind(a.id).first().then((r) => Number(r.n) || 0).catch(() => 0);
  return PM.isLead(a, n);
}
// Verse's leverage for every ranked job (lib/team-crew-run.js prioritizeRun keeps it), for the board's cards. -> { id: [score, why] } or null
async function scoresNow(env) {
  try { const r = await env.DB.prepare("SELECT v FROM void_team_crew WHERE k = 'priorities'").first(); const v = r ? JSON.parse(r.v) : null; return v && v.scores ? v.scores : null; } catch (_) { return null; }
}
// who holds what (GET ?held, the owner's): each seat with a job, the job's id and kind, its leverage, and the seat it overlaps, if any
async function heldView(env) {
  const { results } = await env.DB.prepare('SELECT a.name, a.job, a.job_at, q.ask, q.target FROM void_team_agents a LEFT JOIN void_queue q ON q.id = a.job WHERE a.job IS NOT NULL AND a.off = 0 ORDER BY a.job_at ASC').all();
  const sc = (await scoresNow(env)) || {}, rows = results.map((r) => ({ name: r.name, job: r.job, kind: T.kindOf(r.target), since: r.job_at, leverage: sc[r.job] ? sc[r.job][0] : null, why: sc[r.job] ? sc[r.job][1] : null }));
  for (let i = 0; i < results.length; i++) for (let k = 0; k < i; k++) {
    const key = L.overlapOf({ id: results[i].job, ask: results[i].ask, target: results[i].target }, { id: results[k].job, ask: results[k].ask, target: results[k].target });
    if (key && !rows[i].overlaps) rows[i].overlaps = { name: results[k].name, job: results[k].job, on: L.scopeWord(key) };
  }
  return { held: rows, building: (await buildingNow(env)).length };
}
// every job being built now (an agent's claim or the conductor's), for the overlap check
async function buildingNow(env) {
  try { return (await env.DB.prepare("SELECT id, ask, target, note FROM void_queue WHERE state = 'building' LIMIT 200").all()).results || []; } catch (_) { return []; }
}
/** two seats on one piece of work, or a seat on busywork: the later claim gives its job back, with the reason in its #work thread
 *  (owner, 2026-11-06: "make sure verse is not causing overlap"; "never busywork for the sake of nothing"). At most one pass a minute.
 *  -> [{ name, job, why }] */
export async function deconflict(env, now) {
  try { const r = await env.DB.prepare("SELECT v FROM void_team_crew WHERE k = 'deconflict'").first(); if (r && now - Number(r.v) < 60e3) return []; } catch (_) { return []; }
  await env.DB.prepare("INSERT INTO void_team_crew (k, v, at) VALUES ('deconflict', ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, at = excluded.at").bind(String(now), now).run().catch(() => null);
  const { results: held } = await env.DB.prepare('SELECT a.*, q.ask AS q_ask, q.target AS q_target, q.note AS q_note FROM void_team_agents a JOIN void_queue q ON q.id = a.job WHERE a.job IS NOT NULL AND a.off = 0 AND q.state = \'building\' ORDER BY a.job_at ASC').all();
  let pr = null; try { const r = await env.DB.prepare("SELECT v FROM void_team_crew WHERE k = 'priorities'").first(); pr = r ? JSON.parse(r.v) : null; } catch (_) { pr = null; }
  const busy = new Set((pr && pr.busywork) || []), out = [], kept = [];
  for (const a of held) {
    const j = { id: a.job, ask: a.q_ask, target: a.q_target };
    const first = kept.find((k) => L.overlapOf(j, k.j)), key = first ? L.overlapOf(j, first.j) : null;
    const why = first ? 'overlaps ' + first.j.id + ' held by @' + first.a.name + ' (both touch ' + L.scopeWord(key) + '). One piece of work, one seat: @' + a.name + ' gets the next job instead'
      : busy.has(a.job) ? 'busywork: ' + ((pr.scores && pr.scores[a.job] && pr.scores[a.job][1]) || 'it redoes shipped work') + '. @' + a.name + ' gets the next highest-leverage job instead' : '';
    if (!why) { kept.push({ a, j }); continue; }
    await giveBack(env, a, now, why, false); // void-review: ok (runs only for a job that overlaps or is busywork: a handful at most, once a minute)
    if (busy.has(a.job)) await env.DB.prepare("UPDATE void_queue SET state = 'set aside' WHERE id = ? AND state = 'queued'").bind(a.job).run().catch(() => null); // void-review: ok (same handful)
    out.push({ name: a.name, job: a.job, why });
  }
  return out;
}
// Verse's own order (lib/team-priorities.js, kept by lib/team-crew-run.js prioritizeRun): the owner's pins first, then Verse's ranking, the
// owner's drops last; and the WIP cap (3 build lanes, 1 research lane) between the agents. With no ranking yet, the queue's own rank stands.
async function ordered(env, ranked, now) {
  let pr = null, ov = null;
  try {
    const { results } = await env.DB.prepare("SELECT k, v FROM void_team_crew WHERE k IN ('priorities', 'override')").all();
    for (const r of results) { const v = JSON.parse(r.v); if (r.k === 'priorities') pr = v; else ov = v; }
  } catch (_) { return { list: ranked.slice(0, 8), pr: null }; }
  if (!pr) return { list: ranked.slice(0, 8), pr: null };
  const live = ov && now - (ov.at || 0) < P.OVERRIDE_MS ? ov : { pin: [], drop: [] }, at = new Map(pr.order.map((id, i) => [id, i]));
  const pos = (j) => (live.pin.includes(j.id) ? -100 + live.pin.indexOf(j.id) : live.drop.includes(j.id) ? 1e6 : at.has(j.id) ? at.get(j.id) : 1e5);
  const list = ranked.map((j, i) => ({ j, k: pos(j), i })).sort((x, y) => x.k - y.k || x.i - y.i).map((x) => x.j);
  let building = [];
  try { building = (await env.DB.prepare("SELECT id, ask, target FROM void_queue WHERE state = 'building' AND note LIKE 'claimed by team:%'").all()).results || []; } catch (_) { building = []; }
  const busy = new Set(pr.busywork || []); // busywork is never handed out unless the owner pinned it
  return { list: list.filter((j) => live.pin.includes(j.id) || (!busy.has(j.id) && P.wipAllows(j, building, pr.lanes || {}))).slice(0, 8), pr };
}
// the owner's post at the top of #work is a job: it goes on the build queue as a feature, and Verse hands it out in that same thread
async function enqueue(env, msg, body, now, note = 'asked in #work by the owner') {
  const open = await env.DB.prepare("SELECT COUNT(*) AS n FROM void_queue WHERE id LIKE 'team-%' AND state IN ('queued', 'building')").first().catch(() => null);
  if (!open) return null; // no build queue in this workspace
  if (open.n >= T.RATES.asks) return 'full';
  const at = new Date(now).toISOString(), id = 'team-' + msg, text = T.clean(body, 1000);
  const ask = text.length > 200 ? text.slice(0, 160).trim() + ' … (the whole ask: #work thread ' + msg + ')' : text;
  await env.DB.prepare('INSERT INTO void_queue (id, ask, target, state, note, at, updated) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, ask, 'feature:team-' + msg, 'queued', note, at, at).run();
  await env.DB.prepare('UPDATE void_team_msgs SET job = ? WHERE id = ?').bind(id, msg).run();
  return id;
}
// a member files its own #work post as a job (2026-11-03: agents' and bots' #work posts never became jobs, only the owner's did): ask-<id>, a
// feature, ranked as any queued job (the owner's asks still go first) and closed only by the pull request that does it. An agent files its
// own top-level #work posts only, at most RATES.filesDay a day and RATES.filesOpen open between all agents; the same post or the same ask
// twice is the job already there. -> { job } or { status, say }
async function fileJob(env, me, msg, now) {
  const m = await env.DB.prepare("SELECT id, by, body, job FROM void_team_msgs WHERE id = ? AND channel = 'work' AND thread = 0").bind(msg).first();
  if (!m) return { status: 404, say: 'no such post at the top of #work' };
  if (m.by === 'verse') return { status: 403, say: 'Verse files its own posts' };
  if (me.kind === 'agent' && m.by !== me.agent.id) return { status: 403, say: 'an agent files its own #work posts; ask its author or the owner' };
  if (m.job) return { status: 409, job: m.job, say: 'that post is job ' + m.job + ' already' };
  const open = await env.DB.prepare("SELECT id, ask FROM void_queue WHERE state IN ('queued', 'building')").all().catch(() => null);
  if (!open) return { status: 503, say: 'no build queue in this workspace' };
  const key = T.askKey(T.clean(m.body, 1000)), twin = (open.results || []).find((j) => key && T.askKey(j.ask) === key);
  if (twin) return { status: 409, job: twin.id, say: 'the same ask is job ' + twin.id + ' already' };
  if (me.kind === 'agent') {
    const mine = await env.DB.prepare("SELECT COUNT(*) AS n FROM void_queue WHERE id LIKE 'ask-%' AND note LIKE ? AND at > ?").bind('filed in #work by team:' + me.agent.name + ' %', new Date(now - DAY).toISOString()).first();
    if (mine.n >= T.RATES.filesDay) return { status: 429, say: T.RATES.filesDay + ' jobs filed a day; this one waits' };
    const all = (open.results || []).filter((j) => /^ask-\d+$/.test(j.id)).length;
    if (all >= T.RATES.filesOpen) return { status: 429, say: T.RATES.filesOpen + ' filed jobs are open already; one has to close first' };
  }
  const id = 'ask-' + m.id, at = new Date(now).toISOString(), text = T.clean(m.body, 1000);
  const ask = text.length > 200 ? text.slice(0, 160).trim() + ' … (the whole ask: #work thread ' + m.id + ')' : text;
  const note = 'filed in #work by ' + (me.kind === 'owner' ? 'the owner' : 'team:' + me.agent.name) + ' · closes with the pull request that does it';
  const r = await env.DB.prepare('INSERT OR IGNORE INTO void_queue (id, ask, target, state, note, at, updated) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, ask, 'feature:' + id, 'queued', note, at, at).run();
  if (r.meta.changes !== 1) return { status: 409, job: id, say: 'that post is job ' + id + ' already' };
  await env.DB.prepare('UPDATE void_team_msgs SET job = ? WHERE id = ?').bind(id, m.id).run();
  await write(env, { c: 'work', by: 'verse', body: 'On the build queue as a feature job (' + id + '). The next idle agent takes it here, in this thread; it closes with the pull request that does it.', thread: m.id, now });
  return { job: id };
}
// a job goes back to the queue (given back, failed, or its agent went away); Verse says so in the job's thread
async function giveBack(env, a, now, why, failed) {
  const row = await env.DB.prepare('SELECT note FROM void_queue WHERE id = ?').bind(a.job).first().catch(() => null);
  const n = T.triesOf(row && row.note) + (failed ? 1 : 0), aside = failed && n >= T.MAX_TRIES;
  await setJob(env, a.job, aside ? 'set aside' : 'queued', T.backNote(row && row.note, why, failed), a.name);
  if (a.thread) await write(env, { c: 'work', by: 'verse', body: (aside ? 'Set aside after ' + n + ' tries: ' : 'Back on the queue: ') + T.clean(why, 200), thread: a.thread, now });
  const skip = [...String(a.skip || '').split(' ').filter(Boolean), a.job].slice(-20).join(' ');
  await env.DB.prepare('UPDATE void_team_agents SET job = NULL, job_at = NULL, thread = NULL, skip = ? WHERE id = ?').bind(skip, a.id).run();
}
// agents silent for STALE_MS give their jobs back (run lazily on requests; a cron is not needed)
// an agent whose newest post since its job began asks for a person's go-ahead, anywhere, gets Verse's answer in its job thread, once (the answer is then newer)
async function unstall(env, a, now) {
  if (!a || !a.job || !a.thread) return false;
  // the agent's newest post since its job began, anywhere: Beam waited in #general, not in its job thread (2026-10-30)
  const last = await env.DB.prepare('SELECT id, body FROM void_team_msgs WHERE by = ? AND id > ? ORDER BY id DESC LIMIT 1').bind(a.id, a.thread).first();
  if (!last || !T.waitsOnOwner(last.body)) return false;
  // answered already: anything in the job thread after that post (Verse's answer, the owner, the agent itself)
  if (await env.DB.prepare('SELECT id FROM void_team_msgs WHERE thread = ? AND id > ? LIMIT 1').bind(a.thread, last.id).first()) return false;
  const root = await env.DB.prepare('SELECT channel FROM void_team_msgs WHERE id = ? AND thread = 0').bind(a.thread).first(); if (!root) return false;
  await write(env, { c: root.channel, by: 'verse', body: '@' + a.name + ' ' + T.noWaitSay(a.job), thread: a.thread, now });
  return true;
}
/** a job whose claim outlived its seat: the queue row says building, no live seat holds it, and its claim is older than STALE_MS. The claim
 *  dies between the two writes when a Worker is killed mid-hand-out, or when a runner crashes with the job in hand. A conductor claim is not
 *  a team claim, so it is left alone: tools/conductor.mjs reaps its own. -> the number put back on the queue */
async function reapOrphans(env, now, max = 20) {
  const cut = new Date(now - T.STALE_MS).toISOString();
  let rows = [];
  try { rows = (await env.DB.prepare("SELECT id, note FROM void_queue WHERE state = 'building' AND note LIKE 'claimed by team:%' AND updated < ? AND id NOT IN (SELECT job FROM void_team_agents WHERE job IS NOT NULL AND off = 0) LIMIT ?").bind(cut, max).all()).results || []; } catch (_) { return 0; }
  let n = 0;
  for (const row of rows) {
    try {
      const r = await env.DB.prepare("UPDATE void_queue SET state = 'queued', note = ?, updated = ? WHERE id = ? AND state = 'building'").bind(T.backNote(row.note, 'its claim died with no seat holding it', false), new Date(now).toISOString(), row.id).run();
      if (r.meta.changes === 1) n++;
    } catch (_) { /* one row that will not move must not stop the rest */ }
  }
  return n;
}
/** self-joined seats with no job, no answering push address and no word for SELF_IDLE_MS leave: their keys end, the name is free again */
async function reapSelf(env, now) {
  const { results } = await env.DB.prepare("SELECT id FROM void_team_agents WHERE role = 'self' AND off = 0 AND job IS NULL AND (hook IS NULL OR hook = '' OR hook_fails >= ?) AND MAX(COALESCE(seen, 0), joined) < ? LIMIT 20").bind(T.HOOK.tries, now - T.SELF_IDLE_MS).all();
  for (const r of results) await leaveSeat(env, r.id); // void-review: ok (at most 20 a sweep)
  return results.length;
}
async function leaveSeat(env, id) {
  await env.DB.prepare('UPDATE void_team_agents SET off = 1, key = \'\' WHERE id = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM void_team_joins WHERE agent = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM void_team_mcp WHERE agent = ?').bind(id).run();
}
/** an agent adds itself, with no link: { name?, about? }. Rule: a new name gets a new seat; an owner's invite nobody used yet (no key) is
 *  adopted; a seat that holds a key is refused, so no one re-keys a working seat or takes its history; a self seat that left frees its name.
 *  Every new or adopted seat lands with auto = 1, so the clock (handIdle) hands it work. -> { ok, status, name, id, key, adopted? } or { ok: false, status, say } */
export async function selfJoin(env, p, now = Date.now()) {
  await tables(env, now);
  const name = p.name == null || p.name === '' ? 'agent-' + hex(crypto.getRandomValues(new Uint8Array(3))) : T.clean(p.name, 24), why = T.nameProblem(name);
  if (why) return { ok: false, status: 400, say: why };
  const taken = await env.DB.prepare('SELECT * FROM void_team_agents WHERE name = ?').bind(name).first();
  if (taken && !taken.off && taken.key) return { ok: false, status: 409, say: 'an agent named ' + taken.name + ' is in the team and holds a key: pick another name (its own key still works; a lost key comes back with rekey or a new link from the owner)' };
  if (taken && taken.off && taken.role !== 'self') return { ok: false, status: 409, say: 'that name left the team: pick another' };
  let id, adopted = false;
  if (taken && !taken.off && !taken.crew) { id = taken.id; adopted = true; } // an owner's invite nobody used: the name was meant for an agent to take
  else if (taken && !taken.off) return { ok: false, status: 409, say: 'that name is one of Verse\'s own crew: pick another' };
  else {
    const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM void_team_agents WHERE off = 0').first();
    if (n >= T.RATES.agents) return { ok: false, status: 429, say: T.RATES.agents + ' agents at most: the team is full now' };
    if (taken) await env.DB.prepare('DELETE FROM void_team_agents WHERE id = ?').bind(taken.id).run(); // a self seat that left: its name is free
    id = hex(crypto.getRandomValues(new Uint8Array(6)));
    const ins = await env.DB.prepare("INSERT OR IGNORE INTO void_team_agents (id, name, about, key, joined, seen, auto, role) VALUES (?, ?, ?, '', ?, ?, 1, 'self')").bind(id, name, T.clean(T.hideSecrets(redact(p.about || '')), T.LIMITS.about), now, now).run();
    if (ins.meta.changes !== 1) return { ok: false, status: 409, say: 'that name was just taken: pick another' };
  }
  // the adopt is one statement too: only a row still without a key is taken, so two callers never both get it
  const secret = hex(crypto.getRandomValues(new Uint8Array(16))), k = 'vt1.' + id + '.' + secret;
  const got = await env.DB.prepare("UPDATE void_team_agents SET key = ?, seen = ?, auto = 1, role = 'self' WHERE id = ? AND off = 0 AND key = ''").bind(await keyHash(env, secret), now, id).run();
  if (got.meta.changes !== 1) return { ok: false, status: 409, say: 'that name was just taken: pick another' };
  await env.DB.prepare('DELETE FROM void_team_joins WHERE agent = ?').bind(id).run(); // an adopted invite's link is spent
  await write(env, { c: 'general', by: 'verse', body: '@' + name + ' joined the team on its own' + (adopted ? ' (it took the seat the owner had invited)' : '') + '.', now });
  return { ok: true, status: 201, name, id, key: k, ...(adopted ? { adopted: true } : {}) };
}
export async function sweep(env, now) {
  // the lease starts at the claim, not at the seat's last word. `seen < now - STALE_MS` read a NULL `seen` (a push seat, a seat handed work
  // before it ever polled) as "still alive", so that job was held forever; and a quiet seat handed a job was reaped on the very next request.
  const LEASE = 'MAX(COALESCE(seen, 0), COALESCE(job_at, 0))';
  const { results: busy } = await env.DB.prepare('SELECT * FROM void_team_agents WHERE job IS NOT NULL AND off = 0 AND ' + LEASE + ' >= ?').bind(now - T.STALE_MS).all();
  for (const a of busy) await unstall(env, a, now);
  const { results } = await env.DB.prepare('SELECT * FROM void_team_agents WHERE job IS NOT NULL AND ' + LEASE + ' < ?').bind(now - T.STALE_MS).all();
  for (const a of results) await giveBack(env, a, now, '@' + a.name + ' went quiet for ' + Math.round(T.STALE_MS / 60e3) + ' minutes', false);
  const orphans = await reapOrphans(env, now).catch(() => 0);
  await reapSelf(env, now).catch(() => 0);
  await deconflict(env, now).catch(() => []);
  await offerBetter(env, now).catch(() => 0);
  return results.length + orphans;
}
/** a builder on a low-value job gets one Verse message in that job's thread pointing at visitor work. At most four a sweep. */
export async function offerBetter(env, now) {
  const since = now - 6 * 3600e3;
  const { results: agents } = await env.DB.prepare('SELECT a.name, a.job, a.thread, q.ask, q.target FROM void_team_agents a JOIN void_queue q ON q.id = a.job WHERE a.job IS NOT NULL AND a.off = 0 AND a.crew = 0 AND a.seen >= ? AND a.thread > 0').bind(since).all();
  const queued = (await env.DB.prepare("SELECT id, ask, target FROM void_queue WHERE state = 'queued' LIMIT 80").all()).results || [];
  const taken = [], offers = [];
  for (const a of agents) {
    const better = T.redirectTo({ id: a.job, ask: a.ask, target: a.target }, queued, taken);
    if (!better) continue;
    taken.push(better.id);
    offers.push({ a, better });
    if (offers.length >= 4) break;
  }
  if (!offers.length) return 0;
  const had = await Promise.all(offers.map((o) => env.DB.prepare('SELECT id FROM void_team_msgs WHERE thread = ? AND body LIKE ? LIMIT 1').bind(o.a.thread, '%Better job ' + o.better.id + '%').first()));
  const roots = await Promise.all(offers.map((o) => env.DB.prepare('SELECT channel FROM void_team_msgs WHERE id = ? AND thread = 0').bind(o.a.thread).first()));
  let n = 0;
  for (let i = 0; i < offers.length; i++) {
    if (had[i] || !roots[i]) continue;
    await write(env, { c: roots[i].channel, by: 'verse', body: T.offerCard(offers[i].a.name, { id: offers[i].a.job }, offers[i].better), thread: offers[i].a.thread, now }); // void-review: ok (at most 4 offers, one write each)
    n++;
  }
  return n;
}

// ---- push: Verse sends a job to an agent's own https address (lib/team.js HOOK), signed, so the agent need not stay online ----
// One POST, JSON { type, agent, job?, api, at }, with x-verse-time and x-verse-signature: sha256=<hex HMAC of "<time>.<body>" with the agent's
// push secret>. A 2xx answer is delivered. No redirects are followed, and it waits HOOK.timeoutMs at most. A job that does not reach the
// agent goes straight back to the queue (no try counted) and the next push to that address waits longer (lib/team.js hookWait);
// after HOOK.tries failures in a row Verse stops pushing there and says so in #general.
async function deliver(env, a, payload, now) {
  const f = env.TEAM_FETCH || fetch, body = JSON.stringify({ ...payload, agent: a.name, api: ORIGIN + '/api/team', at: now }), time = String(now);
  try {
    const r = await f(a.hook, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(T.HOOK.timeoutMs), body,
      headers: { 'content-type': 'application/json', 'user-agent': 'Verse-team-push/1', 'x-verse-event': payload.type, 'x-verse-time': time, 'x-verse-signature': 'sha256=' + await T.hookSign(a.hook_secret, time, body) } });
    if (r.status >= 200 && r.status < 300) { await env.DB.prepare('UPDATE void_team_agents SET hook_fails = 0, hook_next = 0, hook_ok = ? WHERE id = ?').bind(now, a.id).run(); return true; }
  } catch (_) { /* no answer in time, or no such host: a failure like any other */ }
  const fails = (a.hook_fails || 0) + 1;
  await env.DB.prepare('UPDATE void_team_agents SET hook_fails = ?, hook_next = ? WHERE id = ?').bind(fails, now + T.hookWait(fails), a.id).run();
  if (fails === T.HOOK.tries) await write(env, { c: 'general', by: 'verse', body: '@' + a.name + '\'s push address did not answer ' + fails + ' times in a row, so Verse stopped sending jobs there. Set it again with hook to start again.', now });
  return false;
}
/** every idle agent with a push address that is due gets its next job sent there; at most `max` agents a call. -> the number delivered */
export async function pushAll(env, now, max = 4) {
  let rows = [];
  try { rows = (await env.DB.prepare("SELECT * FROM void_team_agents WHERE off = 0 AND key != '' AND hook != '' AND hook_fails < ? AND hook_next <= ? AND job IS NULL AND auto = 1 ORDER BY hook_ok ASC LIMIT ?").bind(T.HOOK.tries, now, max).all()).results; } catch (_) { return 0; }
  let sent = 0;
  for (const a of rows) {
    const job = await handOut(env, a, now); // void-review: ok (at most `max` agents, each claimed in one statement as for a pull)
    if (!job) break; // the queue has nothing for an agent: the rest have nothing either
    if (await deliver(env, a, { type: 'job', job }, now)) { sent++; continue; } // void-review: ok (one push per agent, at most `max`)
    await giveBack(env, { ...a, job: job.job, thread: job.thread }, now, 'its push address did not answer, so the job went back on the queue', false);
    await env.DB.prepare('UPDATE void_team_agents SET skip = ? WHERE id = ?').bind(a.skip || '', a.id).run(); // void-review: ok (once per failed push) a push that did not arrive is not the agent passing on the job
  }
  return sent;
}
/** every idle agent that pulls (no push address that answers) and spoke in the last HAND_MS gets its next job too, in the queue's order: the
 *  job is its thread in #work that @mentions it, and its next read carries the job. At most `max` agents a call. -> the number handed a job */
export async function handIdle(env, now, max = 4) {
  let rows = [];
  try { rows = (await env.DB.prepare("SELECT * FROM void_team_agents WHERE off = 0 AND key != '' AND (hook IS NULL OR hook = '' OR hook_fails >= ?) AND job IS NULL AND auto = 1 AND seen >= ? ORDER BY seen DESC LIMIT ?").bind(T.HOOK.tries, now - T.HAND_MS, max).all()).results; } catch (_) { return 0; }
  let n = 0;
  for (const a of rows) { if (!(await handOut(env, a, now))) break; n++; } // void-review: ok (at most `max` agents, each claimed in one statement as for a pull)
  return n;
}
/** an agent's push address set ('' or none takes it off), then a first push with no job in it: -> { ok, hook, secret, answered, say } */
async function setHook(env, a, raw, now, pushLater) {
  const url = String(raw == null ? '' : raw).trim();
  if (!url) { await env.DB.prepare("UPDATE void_team_agents SET hook = '', hook_secret = '', hook_fails = 0, hook_next = 0 WHERE id = ?").bind(a.id).run(); return { ok: true, hook: null, say: 'push off: ask for jobs with here and next' }; }
  const why = T.hookProblem(url); if (why) return { ok: false, say: why };
  if (now - (a.hook_at || 0) < T.HOOK.gapMs) return { ok: false, say: 'one new push address a minute: wait a moment' }; // each new address gets a push
  const secret = hex(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.prepare('UPDATE void_team_agents SET hook = ?, hook_secret = ?, hook_fails = 0, hook_next = 0, hook_ok = 0, hook_at = ? WHERE id = ?').bind(url, secret, now, a.id).run();
  const hello = await deliver(env, { ...a, hook: url, hook_secret: secret, hook_fails: 0 }, { type: 'hello' }, now);
  if (hello && a.auto && !a.job) await pushLater();
  return { ok: true, hook: url, secret, answered: hello, say: (hello ? 'Your address answered. ' : 'Your address did not answer the first push; Verse tries again later. ') + 'Each push is signed: check x-verse-signature against this secret (shown once). Keep it like your key.' };
}
/** a push address set as an agent joins (do:join here, or a POST to its join link): -> { hook, secret, answered } */
export async function joinHook(env, id, raw, now, waitUntil) {
  const a = await env.DB.prepare('SELECT * FROM void_team_agents WHERE id = ?').bind(id).first();
  if (!a) return null;
  const h = await setHook(env, a, raw, now, () => (waitUntil ? later({ waitUntil }, pushAll(env, now)) : pushAll(env, now)));
  return h.ok ? { hook: h.hook, secret: h.secret, answered: h.answered } : null;
}
const later = (ctx, p) => { const q = p.catch(() => 0); try { if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(q); } catch (_) { /* q runs anyway */ } return q; };

async function rated(env, a, now) {
  const day = Math.floor(now / DAY), posts = a.day === day ? a.posts : 0;
  if (now - (a.last_post || 0) < T.RATES.gap) return 'one message a second: wait a moment';
  if (posts >= T.RATES.day) return T.RATES.day + ' messages a day from one agent: more tomorrow';
  await env.DB.prepare('UPDATE void_team_agents SET day = ?, posts = ?, last_post = ?, seen = ? WHERE id = ?').bind(day, posts + 1, now, now, a.id).run();
  return null;
}

// ---- members (lib/team.js MEMBER_PRODUCTS): a purchase from the store is the invite ----
const GUMROAD_VERIFY = 'https://api.gumroad.com/v2/licenses/verify';
/** the purchase behind a license key, checked with Gumroad: -> { ok, sale } or { ok: false, status, say } */
async function licensed(env, product, license) {
  let r = null, j = null;
  try {
    r = await (env.GUMROAD_FETCH || fetch)(GUMROAD_VERIFY, { method: 'POST', signal: AbortSignal.timeout(8000), headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ product_id: product.id, license_key: license, increment_uses_count: 'false' }).toString() });
    j = await r.json();
  } catch (_) { return { ok: false, status: 503, say: 'Gumroad did not answer just now: try again in a minute' }; }
  if (r.status >= 500) return { ok: false, status: 503, say: 'Gumroad did not answer just now: try again in a minute' };
  const why = T.purchaseProblem(j, product);
  return why ? { ok: false, status: 403, say: why } : { ok: true, sale: String(j.purchase.sale_id) };
}
/** a buyer joins: { product, key } (the license key) or { order, email } (the receipt), and a name. -> { ok, name, key, role, again?, say } or { ok: false, status, say } */
export async function joinMember(env, p, now = Date.now()) {
  if (!env.DB) return { ok: false, status: 503, say: 'storage not bound' };
  await tables(env, now);
  const product = T.memberProduct(p.product || 'join-the-team');
  if (!product) return { ok: false, status: 400, say: 'which product did you buy? One of: ' + T.MEMBER_PRODUCTS.map((x) => x.name).join(', ') };
  const license = String(p.key || p.license || '').trim(), order = String(p.order || '').trim();
  let got;
  if (license) { if (!T.LICENSE_RE.test(license)) return { ok: false, status: 400, say: 'that does not look like a license key: copy it from your Gumroad receipt' }; got = await licensed(env, product, license); }
  else if (order) { const f = await findMemberSale(env, order, p.email, T.MEMBER_PRODUCTS.map((x) => x.id), T.MEMBER_PRODUCTS.map((x) => x.slug)); got = f.ok ? { ok: true, sale: f.sale } : { ok: false, status: f.status, say: f.why }; }
  else return { ok: false, status: 400, say: 'give the license key from your Gumroad receipt (or the Order ID and the email you paid with)' };
  if (!got.ok) return got;
  const sale = await keyHash(env, 'sale:' + got.sale);
  const had = await env.DB.prepare('SELECT * FROM void_team_agents WHERE sale = ?').bind(sale).first();
  if (had) { // the same purchase again: a lost key. Its old key, links and MCP sessions stop
    if (had.off) return { ok: false, status: 403, say: 'the owner removed this membership' };
    const key = await newKey(env, had.id);
    await env.DB.prepare('DELETE FROM void_team_mcp WHERE agent = ?').bind(had.id).run();
    return { ok: true, name: had.name, key, role: 'member', again: true, say: 'Welcome back, ' + had.name + '. Your old key stopped now; this one replaces it. ' + T.memberJoinedSay(had.name).split('. ').slice(1).join('. ') };
  }
  const name = T.clean(p.name, 24), why = T.nameProblem(name); if (why) return { ok: false, status: 400, say: why.replace('an agent name', 'a member name') };
  if (await env.DB.prepare('SELECT id FROM void_team_agents WHERE name = ?').bind(name).first()) return { ok: false, status: 409, say: 'that name is taken in the team: pick another' };
  const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM void_team_agents WHERE off = 0').first(); if (n >= T.RATES.agents) return { ok: false, status: 429, say: 'the team is full just now' };
  const id = hex(crypto.getRandomValues(new Uint8Array(6)));
  try {
    await env.DB.prepare("INSERT INTO void_team_agents (id, name, about, key, joined, seen, auto, role, sale) VALUES (?, ?, ?, '', ?, ?, 0, 'member', ?)").bind(id, name, T.clean(T.hideSecrets(redact(p.about || '')), T.LIMITS.about), now, now, sale).run();
  } catch (_) { return { ok: false, status: 409, say: 'that name is taken in the team: pick another' }; }
  const key = await newKey(env, id);
  await write(env, { c: 'general', by: 'verse', body: '@' + name + ' joined the team as a member (bought ' + product.name + '). Welcome! The jobs board is at https://a-to-mind.com/team/#build', now });
  return { ok: true, name, key, role: 'member', say: T.memberJoinedSay(name) };
}
/** the public credits: every member and agent with what it handed in, and the newest 60 hand-ins with their pull requests */
async function credits(env) {
  const { results: people } = await env.DB.prepare("SELECT a.name, a.role, a.done, a.joined, (SELECT COUNT(*) FROM void_team_credits c WHERE c.agent = a.id) AS shipped FROM void_team_agents a WHERE a.off = 0 AND a.key != '' ORDER BY shipped DESC, a.done DESC, a.joined ASC LIMIT 100").all();
  const { results: rows } = await env.DB.prepare('SELECT c.job, c.link, c.at, a.name, a.role FROM void_team_credits c JOIN void_team_agents a ON a.id = c.agent ORDER BY c.id DESC LIMIT 60').all();
  const states = {};
  for (const r of rows) { if (states[r.job] === undefined) { const q = await env.DB.prepare('SELECT state FROM void_queue WHERE id = ?').bind(r.job).first().catch(() => null); states[r.job] = q ? q.state : null; } } // void-review: ok (at most 60 reads, one per job, public credits)
  const word = (s) => (s === 'live' || s === 'done' ? 'shipped' : s === 'building' ? 'in review' : s === 'queued' ? 'sent back' : s || 'handed in');
  return { people: people.map((x) => ({ name: x.name, role: x.role === 'member' ? 'member' : 'agent', shipped: x.shipped, done: x.done, since: x.joined })),
    shipped: rows.map((r) => ({ name: r.name, role: r.role === 'member' ? 'member' : 'agent', job: r.job, link: r.link, at: r.at, state: word(states[r.job]) })) };
}

const prNum = (link) => (String(link || '').match(/\/pull\/(\d+)/) || [])[1] || '';
/** the pull-request titles for these numbers, remembered after the first read so the team page does not ask GitHub every time */
async function prTitles(env, nums, now) {
  const out = {};
  if (!nums.length) return out;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS void_team_crew (k TEXT PRIMARY KEY, v TEXT NOT NULL, at INTEGER NOT NULL)').run().catch(() => null);
  const keys = nums.map((n) => 'pr-title:' + n);
  try {
    const { results } = await env.DB.prepare('SELECT k, v FROM void_team_crew WHERE k IN (' + keys.map(() => '?').join(',') + ')').bind(...keys).all(); // void-review: ok (placeholders only, at most 24)
    for (const r of results || []) out[String(r.k).slice(9)] = r.v;
  } catch (_) { /* no cache yet: the titles are fetched below */ }
  const missing = nums.filter((n) => !out[n]);
  const headers = { 'user-agent': 'Verse-team', accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' };
  const token = env.GITHUB_TOKEN || env.GH_TOKEN;
  if (token) headers.authorization = 'Bearer ' + token; // Cloudflare's shared addresses get 403 from GitHub without it
  const got = await Promise.all(missing.map(async (n) => {
    try {
      const r = await fetch('https://api.github.com/repos/' + REPO + '/pulls/' + n, { headers, signal: AbortSignal.timeout(5000) });
      if (!r.ok) return [n, ''];
      const j = await r.json();
      return [n, String(j && j.title || '').slice(0, 300)];
    } catch (_) { return [n, '']; }
  }));
  const save = got.filter((pair) => pair[1]);
  if (save.length) await Promise.all(save.map(([n, title]) => env.DB.prepare('INSERT INTO void_team_crew (k, v, at) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, at = excluded.at').bind('pr-title:' + n, title, now).run().catch(() => null)));
  for (const [n, title] of got) if (title) out[n] = title;
  return out;
}
/** up to 8 finished-work sentences. A Tower-era credit is left out. The words come from the pull-request title. */
async function feedOf(env, cred, now) {
  const nums = [...new Set(cred.map((c) => prNum(c.link)).filter(Boolean))].slice(0, 24);
  const titles = await prTitles(env, nums, now);
  const feed = [];
  for (const c of cred) {
    if (feed.length >= 8) break;
    const title = titles[prNum(c.link)] || '';
    const live = c.state === 'live' || c.state === 'done';
    const text = T.feedLine(c.name, title || c.ask || '', live);
    if (!text) continue;
    feed.push({ name: c.name, href: c.link, live, text });
  }
  return feed;
}

// when each crew member's next turn comes (lib/team-crew-run.js keeps { <slug>: ms } as 'next'), by agent id; {} before the crew's first run
export async function crewTurns(env, ags) {
  if (!ags.some((a) => a.crew)) return {};
  let next = {}; try { const r = await env.DB.prepare("SELECT v FROM void_team_crew WHERE k = 'next'").first(); next = r ? JSON.parse(r.v) || {} : {}; } catch (_) { next = {}; }
  const out = {}; for (const b of CREW) if (typeof next[b.slug] === 'number') out[b.id] = next[b.slug];
  return out;
}

// as: an agent's id the caller already proved (functions/team/mcp.js); the platform never passes it
export async function onRequestGet({ request, env, now = Date.now(), as = null, waitUntil }) {
  if (!env.DB) return bad(503, 'storage not bound');
  await tables(env, now);
  const sp = new URL(request.url).searchParams;
  if (sp.has('jobs')) return json({ ok: true, jobs: T.board(await queued(env), now, 40, await scoresNow(env)), good: T.GOOD_FIRST, join: T.JOIN_PRODUCT, products: T.MEMBER_PRODUCTS.map((p) => ({ slug: p.slug, name: p.name })) });
  if (sp.has('credits')) return json({ ok: true, ...(await credits(env)) });
  const open = !['c', 't', 'q', 'activity', 'me', 'held', 'crew'].some((k) => sp.has(k));
  if (open) {
    await sweep(env, now);
    if (!waitUntil) await pushAll(env, now); else later({ waitUntil }, pushAll(env, now));
    await handIdle(env, now); // before the count: the agents here take the jobs at the front of the queue
    const { results: chans } = await env.DB.prepare('SELECT code, title, about, msgs, last FROM void_team_channels ORDER BY CASE code WHEN \'work\' THEN 0 WHEN \'general\' THEN 1 ELSE 2 END, last DESC LIMIT 200').all();
    const { results: ags } = await env.DB.prepare('SELECT * FROM void_team_agents WHERE off = 0 ORDER BY joined ASC').all();
    const turns = await crewTurns(env, ags);
    await env.DB.prepare("DELETE FROM void_queue WHERE id = 'team-1626'").run().catch(() => null); // a test job, not work
    const heldIds = ags.filter((a) => a.job && !a.crew).map((a) => a.job);
    const titles = {};
    if (heldIds.length) { const { results: hs } = await env.DB.prepare('SELECT id, ask, state FROM void_queue WHERE id IN (' + heldIds.map(() => '?').join(',') + ')').bind(...heldIds).all(); for (const h of hs || []) titles[h.id] = h; } // void-review: ok (placeholders only)
    const members = ags.filter((a) => a.name !== 'TowerScout').map((a) => ({ name: a.name, about: a.about, role: a.role === 'member' ? 'member' : 'agent', state: T.presence(a, now), seen: a.seen || null, since: a.job_at || null, done: a.done, job: a.job || null, ...(a.crew ? { crew: true } : { now: a.job && titles[a.job] ? 'Working on ' + T.clean(T.hideSecrets(titles[a.job].ask), 120) : 'Nothing in hand' }) }));
    const { results: askRows } = await env.DB.prepare("SELECT id, ask, target, state FROM void_queue WHERE state IN ('queued','building','live','done') ORDER BY at DESC LIMIT 80").all();
    const asks = (askRows || []).filter((j) => T.ownerAsk(j)).slice(0, 8).map((j) => ({ id: j.id, state: j.state, title: T.clean(T.hideSecrets(j.ask), 140) }));
    const { results: cred } = await env.DB.prepare('SELECT c.job, c.link, a.name, q.ask, q.state FROM void_team_credits c JOIN void_team_agents a ON a.id = c.agent LEFT JOIN void_queue q ON q.id = c.job WHERE a.crew = 0 ORDER BY c.id DESC LIMIT 24').all();
    const feed = await feedOf(env, cred || [], now);
    const waiting = T.rank(await queued(env), now).length;
    const claimedAt = (ags || []).filter((a) => a.job && a.job_at > 0).map((a) => +a.job_at);
    const oldestClaimMin = claimedAt.length ? Math.max(0, Math.floor((now - Math.min(...claimedAt)) / 6e4)) : 0;
    return json({ ok: true, channels: (chans || []).filter((c) => c.code !== 'tower'), members, waiting, asks, feed, coder: await coderLane(env, now), kinds: T.TEAM_KINDS, emoji: T.EMOJI, limits: T.LIMITS, counts: { oldestClaimMin } });
  }
  const who = await caller(request, env, as), me = who && who.kind !== 'member' ? who : null;
  if (sp.has('me')) return json({ ok: true, me: me ? (me.kind === 'owner' ? { kind: 'owner', name: 'Owner' } : { kind: 'agent', role: me.agent.role === 'member' ? 'member' : 'agent', name: me.agent.name, job: me.agent.job, thread: me.agent.thread }) : null, ...(who && who.kind === 'member' ? { signedIn: true } : {}), ...(!me && staleKey(request) ? { say: T.STALE_SAY } : {}) });
  if (!me) return bad(401, staleKey(request) ? T.STALE_SAY : 'this workspace is for Verse\'s agents and its owner');
  if (sp.has('held')) { // the owner's read of who holds what: each seat's job, its kind, its leverage and any overlap, no job text
    if (me.kind !== 'owner') return bad(403, 'the owner reads who holds what');
    return json({ ok: true, ...(await heldView(env)) });
  }
  if (sp.has('crew')) { // the owner's crew panel: lanes, throughput, oldest claim, stock (no job text)
    if (me.kind !== 'owner') return bad(403, 'the owner reads the crew panel');
    return json({ ok: true, ...(await crewPanel(env, now)) });
  }
  if (me.kind === 'agent') await env.DB.prepare('UPDATE void_team_agents SET seen = ? WHERE id = ?').bind(now, me.agent.id).run();
  // an idle agent that reads is handed its next job with the answer (jobs off with here auto:false); a job it already holds is not repeated
  const handed = me.kind === 'agent' && !me.agent.job && me.agent.auto ? await handOut(env, me.agent, now) : null;
  const out = (o) => json({ ...o, ...(handed ? { job: handed, say: T.workSay(handed) } : {}) });
  const { list } = await namesOf(env);
  if (sp.has('t')) {
    const id = await threadId(env, sp.get('t'), me); if (!id) return bad(400, 'which thread? Give its number (?t=12) or your job (?t=team-1)');
    const root = await env.DB.prepare('SELECT * FROM void_team_msgs WHERE id = ? AND thread = 0').bind(id).first(); if (!root) return bad(404, 'no such thread');
    const { results } = await env.DB.prepare('SELECT * FROM void_team_msgs WHERE thread = ? ORDER BY id ASC LIMIT ?').bind(id, T.LIMITS.thread).all();
    return out({ ok: true, root: (await shape(env, [root], me))[0], replies: await shape(env, results, me), names: list });
  }
  if (sp.has('q')) {
    const words = T.searchWords(sp.get('q')); if (!words.length) return out({ ok: true, hits: [] });
    const c = sp.get('c'), where = words.map(() => "lower(body) LIKE ? ESCAPE '\\'").join(' AND ') + (c ? ' AND channel = ?' : '');
    const { results } = await env.DB.prepare(`SELECT * FROM void_team_msgs WHERE ${where} ORDER BY id DESC LIMIT 50`).bind(...words.map((w) => '%' + w + '%'), ...(c ? [c] : [])).all(); // void-review: ok (where is fixed text with ? placeholders only; the words are bound)
    return out({ ok: true, hits: await shape(env, results, me), names: list });
  }
  if (sp.has('activity')) {
    const name = me.kind === 'owner' ? 'owner' : me.agent.name.toLowerCase();
    const { results } = await env.DB.prepare('SELECT * FROM void_team_msgs WHERE (mentions LIKE ? OR mentions LIKE \'% here %\') AND by != ? ORDER BY id DESC LIMIT 50').bind('% ' + name + ' %', byOf(me)).all();
    return out({ ok: true, hits: await shape(env, results, me), names: list });
  }
  const c = sp.get('c'); if (T.codeProblem(c) && !T.HOME.some((h) => h.code === c)) return bad(400, 'which channel?');
  const ch = await env.DB.prepare('SELECT code, title, about, msgs, last FROM void_team_channels WHERE code = ?').bind(c).first(); if (!ch) return bad(404, 'no such channel');
  const since = Math.max(0, parseInt(sp.get('since'), 10) || 0);
  const { results } = since
    ? await env.DB.prepare('SELECT * FROM void_team_msgs WHERE channel = ? AND thread = 0 AND id > ? ORDER BY id ASC LIMIT ?').bind(c, since, T.LIMITS.page).all()
    : await env.DB.prepare('SELECT * FROM (SELECT * FROM void_team_msgs WHERE channel = ? AND thread = 0 ORDER BY id DESC LIMIT ?) ORDER BY id ASC').bind(c, T.LIMITS.page).all();
  // the threads that moved since `since` (a reply landed), so the page updates their counts
  const { results: moved } = since ? await env.DB.prepare('SELECT id, replies, last_reply FROM void_team_msgs WHERE channel = ? AND thread = 0 AND last_reply > ? LIMIT 100').bind(c, now - 120e3).all() : { results: [] };
  return out({ ok: true, channel: ch, messages: await shape(env, results, me), moved, names: list });
}

export async function onRequestPost({ request, env, now = Date.now(), as = null, waitUntil }) {
  if (!env.DB) return bad(503, 'storage not bound');
  await tables(env, now);
  const raw = await request.text().catch(() => ''), whole = raw.length > 16000 && raw.length <= PA.PATCH.bytes + 8000 ? (() => { try { const o = JSON.parse(raw); return o && o.do === 'patch' ? o : null; } catch (_) { return null; } })() : null;
  const p = whole || T.looseBody(raw); // JSON, or JSON a shell mangled (lib/team.js looseBody, cut at 16,000); a patch's diff is read whole
  if (!p) return bad(400, 'send JSON, for example {"do":"here"}. In PowerShell: $body = @{ do = "here" } | ConvertTo-Json; then -d $body (see /team/agents.txt)');
  if (p.do === 'enlist' || (p.do === 'join' && !p.code && !p.link)) { // an agent adds itself: no link, no owner step (selfJoin)
    if (p.hook != null && T.hookProblem(p.hook)) return bad(400, T.hookProblem(p.hook));
    if (brake(request, T.SELF_TRIES)) return bad(429, 'too many joins from here; wait a minute');
    const r = await selfJoin(env, p, now);
    if (!r.ok) return bad(r.status, r.say);
    const hook = p.hook != null ? await joinHook(env, r.id, p.hook, now, waitUntil) : null;
    // a new seat starts working at once: its starter job comes with its key (auto: false in the join waits for a "here" instead)
    const seat = p.auto === false ? null : await env.DB.prepare('SELECT * FROM void_team_agents WHERE id = ?').bind(r.id).first();
    const starter = seat ? await handOut(env, seat, now).catch(() => null) : null;
    return json({ ok: true, name: r.name, key: r.key, role: 'self', ...(r.adopted ? { adopted: true } : {}), say: T.selfJoinedSay(r.name), ...(hook || {}), ...(starter ? { job: starter } : {}) }, 201);
  }
  if (p.do === 'join') { // the one write without a key: the join link is the key to its own key
    if (p.hook != null && T.hookProblem(p.hook)) return bad(400, T.hookProblem(p.hook)); // a bad address is said before the link is used up
    const r = await redeem(env, T.joinCode(p.code), ['HTTP', 'the script', 'the browser'].includes(p.via) ? p.via : 'HTTP', now);
    if (!r.ok) return bad(r.status, r.say);
    const hook = p.hook != null ? await joinHook(env, r.id, p.hook, now, waitUntil) : null;
    return json({ ok: true, name: r.name, key: r.key, say: T.joinedSay(r.name), ...(hook || {}) }, 201);
  }
  if (p.do === 'member') { // a buyer joins with the license key (or Order ID and email) from the Gumroad receipt: no owner step
    if (brake(request, 10)) return bad(429, 'too many tries; wait a minute');
    const r = await joinMember(env, p, now);
    return r.ok ? json(r, 201) : bad(r.status, r.say);
  }
  const who = await caller(request, env, as), me = who && who.kind !== 'member' ? who : null; // a member who is not the owner writes nothing here
  if (!me) return bad(401, staleKey(request) ? T.STALE_SAY : 'this workspace is for Verse\'s agents and its owner');
  if (me.kind === 'agent') await env.DB.prepare('UPDATE void_team_agents SET seen = ? WHERE id = ?').bind(now, me.agent.id).run(); // a word from it first, so its own job is never swept
  await sweep(env, now);
  const pushLater = () => (waitUntil ? later({ waitUntil }, pushAll(env, now)) : pushAll(env, now)); // after the answer when the platform can
  const a = me.kind === 'agent' ? await env.DB.prepare('SELECT * FROM void_team_agents WHERE id = ?').bind(me.agent.id).first() : null;
  const member = !!(a && (a.role === 'member' || a.role === 'self')); // a self-joined seat has a member's rights
  if (p.do === 'quick') { // the owner's one line from anywhere on the site: "idea: ..." to #ideas, anything else to #work, where it is a job
    if (me.kind !== 'owner') return bad(403, 'only the owner posts a job in one line; members propose in #ideas');
    const q = T.quickPost(p.text); if (!q) return bad(400, 'say the job or idea, for example: job: add a tide table to /weather/');
    p.do = 'post'; p.c = q.c; p.body = q.body; delete p.thread;
  }
  if (p.do === 'propose') { // a member's or agent's proposal: a thread of its own in #ideas, which Verse's tick makes a job when it passes the guards (promoteIdeas)
    const text = String(p.body || p.text || '').trim(); if (!text) return bad(400, 'say what you propose');
    p.do = 'post'; p.c = 'ideas'; p.body = /^proposal\b/i.test(text) ? text : 'Proposal: ' + text; delete p.thread;
  }
  switch (p.do) {
    case 'invite': {
      if (me.kind !== 'owner') return bad(403, 'only the owner invites an agent');
      const name = T.clean(p.name, 24), why = T.nameProblem(name); if (why) return bad(400, why);
      const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM void_team_agents WHERE off = 0').first(); if (n >= T.RATES.agents) return bad(429, T.RATES.agents + ' agents at most');
      const taken = await env.DB.prepare('SELECT id, off, name FROM void_team_agents WHERE name = ?').bind(name).first(), origin = new URL(request.url).origin;
      if (taken && !taken.off) { // a new link for an agent already here: its old key stops now (a key that was shown somewhere it should not be)
        if (p.again !== true) return bad(409, 'an agent with that name is in the workspace already (again: true makes it a new join link, and its old key stops)');
        await env.DB.prepare('UPDATE void_team_agents SET key = \'\' WHERE id = ?').bind(taken.id).run();
        await env.DB.prepare('DELETE FROM void_team_mcp WHERE agent = ?').bind(taken.id).run();
        const j = await mintJoin(env, taken.id, origin, now);
        return json({ ok: true, name: taken.name, join: j.link, expires: j.expires, again: true, say: T.inviteSay(taken.name) }, 201);
      }
      if (taken) await env.DB.prepare('DELETE FROM void_team_agents WHERE id = ?').bind(taken.id).run(); // a removed agent's name is free again (its old key is gone with it)
      const id = hex(crypto.getRandomValues(new Uint8Array(6)));
      await env.DB.prepare('INSERT INTO void_team_agents (id, name, about, key, joined, auto) VALUES (?, ?, ?, ?, ?, ?)').bind(id, name, T.clean(p.about, T.LIMITS.about), '', now, p.auto === false ? 0 : 1).run(); // no key until the link is used
      const j = await mintJoin(env, id, origin, now);
      return json({ ok: true, name, join: j.link, expires: j.expires, say: T.inviteSay(name) }, 201);
    }
    case 'remove': {
      if (me.kind !== 'owner') return bad(403, 'only the owner removes an agent');
      const x = await env.DB.prepare('SELECT * FROM void_team_agents WHERE name = ? AND off = 0').bind(T.clean(p.name, 24)).first(); if (!x) return bad(404, 'no such agent');
      if (x.job) await giveBack(env, x, now, '@' + x.name + ' left the team', false);
      await env.DB.prepare('UPDATE void_team_agents SET off = 1, key = \'\' WHERE id = ?').bind(x.id).run();
      await env.DB.prepare('DELETE FROM void_team_joins WHERE agent = ?').bind(x.id).run();
      await env.DB.prepare('DELETE FROM void_team_mcp WHERE agent = ?').bind(x.id).run();
      return json({ ok: true });
    }
    case 'queue': { // the owner's #work posts that never became a job (made before #work asks went on the queue): each goes on now, oldest first
      if (me.kind !== 'owner') return bad(403, 'only the owner queues work');
      const { results } = await env.DB.prepare("SELECT id, body FROM void_team_msgs WHERE channel = 'work' AND thread = 0 AND by = 'owner' AND (job IS NULL OR job = '') ORDER BY id ASC LIMIT 10").all();
      const queued = [];
      for (const m of results) { const q = await enqueue(env, m.id, m.body, now); if (!q || q === 'full') break; queued.push({ msg: m.id, job: q }); } // void-review: ok (at most 10 posts, one insert each, stops when the queue is full)
      return json({ ok: true, queued, say: queued.length ? queued.length + ' #work post' + (queued.length === 1 ? '' : 's') + ' put on the build queue' : 'every #work post of the owner is a job already' });
    }
    case 'file': { // an agent's (or the owner's) own top-level #work post as a job: { thread: <its id> }, or { body } to post it and file it at once
      if (member && !(await leadNow(env, a))) return bad(403, 'a member proposes in #ideas ({"do":"propose"}); Verse makes a proposal with an acceptance gate a job on its next tick');
      if (a) { const lim = await rated(env, a, now); if (lim) return bad(429, lim); }
      let msg = parseInt(p.thread, 10) || 0;
      if (!msg) {
        const plain = T.cleanBody(redact(String(p.body || ''))), body = T.hideSecrets(plain); if (!body) return bad(400, 'file a post: { thread: <its id> } or { body }');
        msg = await write(env, { c: 'work', by: byOf(me), body, thread: 0, now });
      }
      const f = await fileJob(env, me, msg, now);
      if (!f.job || f.status) return json({ ok: false, say: f.say, ...(f.job ? { job: f.job } : {}), thread: msg }, f.status || 400);
      await pushLater();
      return json({ ok: true, job: f.job, thread: msg, say: 'filed: ' + f.job + ' is on the build queue' }, 201);
    }
    case 'promote': { // the owner makes a proposal in #ideas a job: it goes on the build queue as the owner's ask, in that same thread
      if (me.kind !== 'owner') return bad(403, 'only the owner makes a proposal a job');
      const m = await env.DB.prepare("SELECT id, body, job FROM void_team_msgs WHERE id = ? AND thread = 0 AND channel = 'ideas'").bind(parseInt(p.id, 10) || 0).first();
      if (!m) return bad(404, 'no such proposal in #ideas');
      if (m.job) return json({ ok: true, job: m.job, had: true });
      const q = await enqueue(env, m.id, m.body.replace(/^Proposal:\s*/i, ''), now, 'proposed in #ideas, made a job by the owner');
      if (!q) return bad(503, 'no build queue in this workspace');
      if (q === 'full') return bad(429, T.RATES.asks + ' of your asks are open already');
      await write(env, { c: 'ideas', by: 'verse', body: 'The owner made this a job (' + q + '). The next idle agent or member takes it here, or claims it on the board.', thread: m.id, now });
      await pushLater();
      return json({ ok: true, job: q }, 201);
    }
    case 'switch': { // leave the job in hand without a failed try, keep credit for its pull request, and take the named job
      if (!a) return bad(403, 'join the team to switch jobs');
      if (!a.job) return bad(409, 'you hold no job');
      const id = String(p.job || '').trim(); if (!/^[\w:.-]{1,120}$/.test(id) || id === a.job) return bad(400, 'which job? give its id from the board');
      const note = T.clean(T.hideSecrets(redact(p.note || '')), 160);
      const link = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/.test(String(p.link || '')) ? p.link : '';
      if (link) await env.DB.prepare('INSERT INTO void_team_credits (agent, job, link, note, at) VALUES (?, ?, ?, ?, ?)').bind(a.id, a.job, link, note || 'kept while switching', now).run();
      await giveBack(env, a, now, note || 'switched to ' + id, false);
      const fresh = await env.DB.prepare('SELECT * FROM void_team_agents WHERE id = ?').bind(a.id).first();
      const got = await handOut(env, fresh, now, id);
      if (!got) return json({ ok: true, released: a.job, say: 'the old job is back on the queue; that new one was taken' });
      return json({ ok: true, job: got, thread: got.thread, say: T.workSay(got) }, 201);
    }
    case 'claim': { // an agent or member takes one job off the board (one click on /team/), if it is free and it holds none
      if (!a) return bad(403, 'join the team to claim a job');
      if (a.job) return bad(409, 'you hold ' + a.job + ' already: close it (done) or give it back first');
      const id = String(p.job || '').trim(); if (!/^[\w:.-]{1,120}$/.test(id)) return bad(400, 'which job? give its id from the board');
      const got = await handOut(env, a, now, id);
      if (!got) return bad(409, 'that job is taken, closed or not one the team takes: pick another on the board');
      return json({ ok: true, state: 'busy', job: got, thread: got.thread, say: T.workSay(got) }, 201);
    }
    case 'channel': {
      if (member) return bad(403, 'members post in the channels there are; propose a new one in #ideas');
      const code = String(p.code || '').toLowerCase().trim(), why = T.codeProblem(code); if (why) return bad(400, why);
      if (a) { const lim = await rated(env, a, now); if (lim) return bad(429, lim); }
      const { n, today } = await env.DB.prepare('SELECT COUNT(*) AS n, SUM(created > ?) AS today FROM void_team_channels').bind(now - DAY).first();
      if (n >= T.RATES.channels) return bad(429, T.RATES.channels + ' channels at most');
      if (me.kind === 'agent' && today >= T.RATES.channelsDay) return bad(429, T.RATES.channelsDay + ' new channels a day');
      const r = await env.DB.prepare('INSERT OR IGNORE INTO void_team_channels (code, title, about, created, by) VALUES (?, ?, ?, ?, ?)').bind(code, code, T.clean(T.hideSecrets(redact(p.about || '')), T.LIMITS.about), now, byOf(me)).run();
      if (r.meta.changes !== 1) return bad(409, 'that channel is there already');
      return json({ ok: true, code }, 201);
    }
    case 'post': {
      const c = String(p.c || ''), plain = T.cleanBody(redact(String(p.body || ''))), body = T.hideSecrets(plain), hid = body !== plain; if (!body) return bad(400, 'say something');
      const ch = await env.DB.prepare('SELECT code FROM void_team_channels WHERE code = ?').bind(c).first(); if (!ch) return bad(404, 'no such channel');
      let thread = 0;
      if (p.thread != null) {
        thread = await threadId(env, p.thread, me);
        const root = thread > 0 ? await env.DB.prepare('SELECT id FROM void_team_msgs WHERE id = ? AND thread = 0 AND channel = ?').bind(thread, c).first() : null;
        if (!root) return bad(404, 'no such thread in that channel');
        const { replies } = await env.DB.prepare('SELECT replies FROM void_team_msgs WHERE id = ?').bind(thread).first();
        if (replies >= T.LIMITS.thread) return bad(403, 'that thread is full: start a new one');
      }
      if (a) { const lim = await rated(env, a, now); if (lim) return bad(429, lim); }
      const id = await write(env, { c, by: byOf(me), body, thread, now });
      // the owner overrides Verse's priorities with one message, in any channel: "priority: <job>", "drop: <job>" or "priority: reset"
      const ov = me.kind === 'owner' && !thread ? P.overrideOf(body) : null;
      if (ov) {
        await env.DB.prepare('CREATE TABLE IF NOT EXISTS void_team_crew (k TEXT PRIMARY KEY, v TEXT NOT NULL, at INTEGER NOT NULL)').run();
        const old = await env.DB.prepare("SELECT v FROM void_team_crew WHERE k = 'override'").first().catch(() => null);
        const next = P.mergeOverride(old ? JSON.parse(old.v) : null, ov, now);
        for (const [k, v] of [['override', next], ['override-new', now]]) await env.DB.prepare('INSERT INTO void_team_crew (k, v, at) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, at = excluded.at').bind(k, JSON.stringify(v), now).run(); // void-review: ok (two fixed keys)
        await write(env, { c, by: 'verse', body: ov.reset ? 'Override cleared: my own ranking stands again.' : ov.pin ? 'Taken: ' + ov.pin + ' goes first, past the WIP cap, for a week or until you say "priority: reset". The pinned brief is re-ranked on my next run.' : 'Taken: ' + ov.drop + ' goes last for a week. The pinned brief is re-ranked on my next run.', thread: id, now });
      }
      const queued = !ov && me.kind === 'owner' && c === 'work' && !thread ? await enqueue(env, id, body, now) : null;
      if (queued === 'full') await write(env, { c, by: 'verse', body: T.RATES.asks + ' of your asks are open already, so this one is not on the build queue. It goes on when one closes and you ask again.', thread: id, now });
      else if (queued) await write(env, { c, by: 'verse', body: 'On the build queue as a feature job. The next idle agent takes it here, in this thread, unless the coder of Verse builds it first.', thread: id, now });
      if (queued && queued !== 'full') await pushLater(); // an agent with a push address gets it now
      const told = me.kind === 'agent' && me.agent.job && await unstall(env, me.agent, now + 1); // in its job thread or anywhere else
      // an idle seat that speaks ("I'm free", a check-in in #general or #work) is handed the top job now, and told so under its own post
      let handed = null;
      if (me.kind === 'agent' && !me.agent.job && !me.agent.crew && me.agent.auto !== 0 && (c === 'general' || (c === 'work' && T.CHECKIN_RE.test(body)))) {
        handed = await handOrMake(env, me.agent, now + 2).catch(() => null);
        if (handed && !handed.already) await write(env, { c, by: 'verse', body: '@' + me.agent.name + ' you are free, so here is your next job: thread #' + handed.thread + ' in #work. ' + T.clean(handed.ask || '', 160), thread: thread || id, now: now + 3 });
      }
      // the owner's automations with when.on 'team' (lib/automations.js): after the answer when the platform can. Only a person's or an
      // agent's post fires them, never Verse's own (verseSays, the replies above), so a rule that speaks here cannot loop
      const fired = fire(env, 'team', teamEvent({ id, c, by: byOf(me), body, thread, at: now }));
      if (waitUntil) later({ waitUntil }, fired); else await fired;
      return json({ ok: true, id, ...(queued && queued !== 'full' ? { job: queued } : {}), ...(handed ? { next: handed, say: T.workSay(handed) } : told ? { say: T.noWaitSay(me.agent.job) } : hid ? { say: T.HID_SAY } : {}) }, 201);
    }
    case 'dream': { // Verse Brain's dream (tools/brain-dream.mjs, lib/brain-dream.js): a fix, job or idea it made from what it watched, posted by Verse
      if (me.kind !== 'owner') return bad(403, 'only the owner posts the brain\'s dreams');
      const key = String(p.key || ''); if (!Dream.KEY.test(key)) return bad(400, 'a dream needs its key');
      const plain = T.cleanBody(redact(String(p.body || ''))), body = T.hideSecrets(plain), tag = Dream.tagOf(key);
      if (!body || !body.endsWith(tag)) return bad(400, 'a dream\'s brief ends with its key line');
      const had = await env.DB.prepare("SELECT id FROM void_team_msgs WHERE channel = 'work' AND thread = 0 AND by = 'verse' AND body LIKE ?").bind('%' + tag).first();
      if (had) return json({ ok: true, had: true, id: had.id });
      const day = await env.DB.prepare("SELECT COUNT(*) AS n FROM void_team_msgs WHERE channel = 'work' AND thread = 0 AND by = 'verse' AND body LIKE ? AND at > ?").bind('%' + Dream.TAG + '%', now - DAY).first();
      if (day && day.n >= T.RATES.dreamsDay) return bad(429, T.RATES.dreamsDay + ' dreams a day at most');
      const open = await env.DB.prepare("SELECT COUNT(*) AS n FROM void_team_msgs m JOIN void_queue q ON q.id = m.job WHERE m.by = 'verse' AND q.state IN ('queued', 'building')").first().catch(() => null);
      if (open && open.n >= T.RATES.dreamsOpen) return bad(429, T.RATES.dreamsOpen + ' dreams wait on the team already');
      const id = await write(env, { c: 'work', by: 'verse', body, thread: 0, now });
      const queued = await enqueue(env, id, body, now, 'dreamed by Verse Brain from what it watched');
      if (queued === 'full') await write(env, { c: 'work', by: 'verse', body: 'The build queue is full, so this dream is not a job yet.', thread: id, now });
      else if (queued) { await write(env, { c: 'work', by: 'verse', body: 'On the build queue as a feature job. The next idle agent takes it here, in this thread.', thread: id, now }); await pushLater(); }
      return json({ ok: true, id, ...(queued && queued !== 'full' ? { job: queued } : {}) }, 201);
    }
    case 'react': {
      const id = parseInt(p.id, 10), e = String(p.emoji || ''); if (!T.EMOJI.includes(e)) return bad(400, 'that reaction is not on the list');
      if (!(await env.DB.prepare('SELECT id FROM void_team_msgs WHERE id = ?').bind(id).first())) return bad(404, 'no such message');
      if (a) { const lim = await rated(env, a, now); if (lim) return bad(429, lim); }
      const had = await env.DB.prepare('DELETE FROM void_team_reacts WHERE msg = ? AND by = ? AND emoji = ?').bind(id, byOf(me), e).run();
      if (had.meta.changes !== 1) await env.DB.prepare('INSERT INTO void_team_reacts (msg, by, emoji, at) VALUES (?, ?, ?, ?)').bind(id, byOf(me), e, now).run();
      return json({ ok: true, on: had.meta.changes !== 1 });
    }
    case 'hook': { // an agent's push address: Verse sends each job there, signed with the secret this answer shows once ('' takes it off)
      if (!a) return bad(403, 'only an agent has a push address');
      const h = await setHook(env, a, p.url, now, pushLater);
      return h.ok ? json(h) : bad(400, h.say);
    }
    case 'here': case 'next': {
      if (!a) return bad(403, 'only an agent takes jobs');
      // a check-in is a seat saying it is ready: it is handed the top job at once (owner, 2026-11-26: "a job is supposed to come instantly").
      // Only {"do":"here","auto":false} in this same call keeps a seat idle; a seat that was switched off before is switched back on by checking in.
      const autoNow = p.do === 'next' || p.auto !== false;
      if (p.do === 'here' && (autoNow ? 1 : 0) !== (a.auto ? 1 : 0) && !a.crew) await env.DB.prepare('UPDATE void_team_agents SET auto = ? WHERE id = ?').bind(autoNow ? 1 : 0, a.id).run();
      const auto = a.crew ? (p.do === 'next' || !!a.auto) : autoNow;
      const job = auto ? await handOrMake(env, a, now) : (a.job ? { job: a.job, thread: a.thread, already: true } : null);
      return json({ ok: true, state: job ? 'busy' : 'idle', job, thread: job ? job.thread : null, say: job ? T.workSay(job) + T.LOOP_SAY : (auto ? 'no job could be made just now; ask again with next in a minute' : 'idle; jobs off (auto: false)') });
    }
    case 'split': { // a busy agent splits off part of its job for a free member: a new job on the queue, handed to the named member (or the next free one) at once
      if (!a) return bad(403, 'only an agent splits its job');
      if (!a.job) return bad(409, 'you hold no job to split');
      const ask = T.clean(T.hideSecrets(redact(String(p.ask || ''))), 400); if (ask.length < 12) return bad(400, 'say what the part is, in a sentence');
      const id = 'split-' + now.toString(36), at = new Date(now).toISOString();
      await env.DB.prepare('INSERT INTO void_queue (id, ask, target, state, note, at, updated) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, ask, 'feature:split-' + a.job, 'queued', 'split from ' + a.job + ' by team:' + a.name, at, at).run();
      let to = null;
      if (p.to) to = await env.DB.prepare("SELECT * FROM void_team_agents WHERE lower(name) = lower(?) AND off = 0 AND key != '' AND job IS NULL").bind(String(p.to).slice(0, 40)).first();
      if (!to) to = await env.DB.prepare("SELECT * FROM void_team_agents WHERE off = 0 AND key != '' AND crew = 0 AND job IS NULL AND id != ? AND seen >= ? ORDER BY seen DESC LIMIT 1").bind(a.id, now - T.HAND_MS).first();
      const got = to ? await handOut(env, to, now + 1, id).catch(() => null) : null;
      await write(env, { c: 'work', by: a.id, body: 'Split off: ' + ask + (got ? ' (handed to @' + to.name + ')' : ' (on the queue for the next free member)'), thread: a.thread || 0, now: now + 2 });
      return json({ ok: true, job: id, to: got ? to.name : null });
    }
    case 'leave': { // an agent leaves itself: its job goes back, its key, links and MCP sessions end
      if (!a) return bad(403, 'only an agent leaves');
      if (a.crew) return bad(403, 'Verse\'s own crew stays');
      if (a.job) await giveBack(env, a, now, '@' + a.name + ' left the team', false);
      await leaveSeat(env, a.id);
      return json({ ok: true, say: 'You left the team. Join again any time with {"do":"join","name":"..."}.' });
    }
    case 'rekey': { // an agent's own new key: the one it sends stops at once (a key that was shown in a chat or a log)
      if (!a) return bad(403, 'only an agent has a key to change');
      const key = await newKey(env, a.id);
      await env.DB.prepare('DELETE FROM void_team_mcp WHERE agent = ?').bind(a.id).run();
      return json({ ok: true, name: a.name, key, say: 'Your old key stopped now. Save this one straight to your key file; never print it, paste it or put it on a command line.' }, 201);
    }
    case 'patch': { // a seat that cannot push hands in its job as a git diff: it goes to Verse's proposals (functions/api/proposals.js), and
      // the proposals runner (tools/local-ship.mjs: a clean worktree, the gates, the wipe guard, merge and deploy) ships or refuses it
      if (!a) return bad(403, 'join the team to hand in a patch');
      if (!a.job) return bad(409, 'you hold no job: claim one, then hand in its diff');
      { const lim = await rated(env, a, now); if (lim) return bad(429, lim); }
      const diff = String(p.diff || ''), why = PA.patchProblem(diff); if (why) return bad(400, why);
      await env.DB.prepare(PROPOSALS).run();
      const mine = await env.DB.prepare('SELECT COUNT(*) AS n FROM void_proposals WHERE author = ? AND created_at > ?').bind('team:' + a.name, new Date(now - DAY).toISOString()).first();
      if (mine.n >= PA.PATCH.perSeatDay) return bad(429, PA.PATCH.perSeatDay + ' patches a day from one seat');
      const all = await env.DB.prepare("SELECT COUNT(*) AS n FROM void_proposals WHERE state IN ('open', 'checking')").first();
      if (all.n >= PA.PATCH.pending) return bad(429, PA.PATCH.pending + ' patches wait for the runner already; try again later');
      const note = T.clean(T.hideSecrets(redact(p.note || '')), 160), row = await env.DB.prepare('SELECT ask FROM void_queue WHERE id = ?').bind(a.job).first().catch(() => null);
      let pr; try { pr = newProposal({ diff, branch: 'team/' + a.job.replace(/[^\w.-]+/g, '-').slice(0, 60), title: (note || T.clean(row && row.ask, 120) || a.job), author: 'team:' + a.name, tests: 'job ' + a.job }, { now: new Date(now).toISOString() }); } catch (e) { return bad(400, String(e.message || e)); }
      pr.id = 'team-' + a.job.replace(/[^\w.-]+/g, '-').slice(0, 40) + '-' + now.toString(36);
      await env.DB.prepare('INSERT INTO void_proposals (id, created_at, author, branch, title, diff, tests, files, added, removed, state, verdict, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(pr.id, pr.created_at, pr.author, pr.branch, pr.title, pr.diff, pr.tests, pr.files, pr.added, pr.removed, pr.state, pr.verdict, pr.decided_at).run();
      await setJob(env, a.job, 'building', ('patch by team:' + a.name + ' · proposal ' + pr.id + (note ? ' · ' + note : '')).slice(0, 300), a.name);
      await write(env, { c: 'work', by: a.id, body: 'Handed in as proposal ' + pr.id + ' (' + pr.files + ' files, +' + pr.added + ' -' + pr.removed + '). Verse\'s runner applies it, runs the gates and the wipe guard, then ships or refuses it.' + (note ? '\n' + note : ''), thread: a.thread, now });
      await env.DB.prepare('UPDATE void_team_agents SET job = NULL, job_at = NULL, thread = NULL WHERE id = ?').bind(a.id).run();
      const fresh = await env.DB.prepare('SELECT * FROM void_team_agents WHERE id = ?').bind(a.id).first();
      const next = p.auto === false ? null : await handOrMake(env, fresh, now + 1); // never stand by: the next job in the same reply
      return json({ ok: true, proposal: pr.id, next, say: 'proposal ' + pr.id + ' is with Verse\'s runner' + (next ? '. Next: ' + T.workSay(next) + T.LOOP_SAY : '') }, 201);
    }
    case 'done': {
      if (!a) return bad(403, 'only an agent closes a job');
      if (!a.job) return bad(409, 'you hold no job');
      const note = T.clean(T.hideSecrets(redact(p.note || '')), 200), link = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/.test(String(p.link || '')) ? p.link : '';
      if (p.ok) {
        // a job is done only when its pull request did the job (coordinator, 2026-10-30: Beam closed three versus jobs with PRs that
        // added a target note and no page). With a link the job waits as "review by team:<name>" until tools/team-gate.mjs checks
        // the merged PR (the page itself, nothing taken away, the live page answers) and moves it live or back on the queue.
        // Without a link only an owner's #work ask closes: the owner reads the answer in its thread.
        const row = await env.DB.prepare('SELECT id, target FROM void_queue WHERE id = ?').bind(a.job).first().catch(() => null);
        if (!link && !T.ownerAsk(row || { id: a.job }) && !noteJob(row && row.target)) return bad(400, 'a job closes with the link of the pull request that does it; if you cannot do it, give it back with why');
        await setJob(env, a.job, link ? 'building' : 'done', (link ? T.reviewNote(a.name, link, note) : 'done by team:' + a.name + (note ? ' · ' + note : '')).slice(0, 300), a.name);
        if (link) await env.DB.prepare('INSERT INTO void_team_credits (agent, job, link, note, at) VALUES (?, ?, ?, ?, ?)').bind(a.id, a.job, link, note, now).run();
        await write(env, { c: 'work', by: a.id, body: (link ? 'Handed in: ' + link + '. Verse checks it after the merge.' : 'Done.') + (note ? '\n' + note : ''), thread: a.thread, now });
        await env.DB.prepare('UPDATE void_team_agents SET job = NULL, job_at = NULL, thread = NULL, done = done + 1 WHERE id = ?').bind(a.id).run();
      } else {
        if (note) await write(env, { c: 'work', by: a.id, body: note, thread: a.thread, now });
        await giveBack(env, a, now, note || 'given back by @' + a.name, p.failed !== false);
      }
      const fresh = await env.DB.prepare('SELECT * FROM void_team_agents WHERE id = ?').bind(a.id).first();
      // keep it busy: the next job in this same reply, made if none is queued (only {"auto":false} in this call stops the loop)
      const next = (p.auto === false || (fresh.crew && !fresh.auto)) ? null : await handOrMake(env, fresh, now + 1);
      return json({ ok: true, next, state: next ? 'busy' : 'idle', say: next ? 'Next: ' + T.workSay(next) + T.LOOP_SAY : 'no job could be made just now; ask again with next in a minute' });
    }
    default: return bad(400, 'do: join, enlist, leave, member, invite, remove, channel, post, file, quick, propose, promote, react, hook, here, next, split, claim, switch, patch, done or rekey');
  }
}

/** hand-ins waiting "review by team:<name>" are settled from their pull request (lib/team-busy.js): merged -> live, closed -> back on the
 *  queue. At most `max` a tick; the GitHub read uses GITHUB_TOKEN when the deploy has it, else the public API. -> the number settled */
export async function settleReviews(env, now, fetchFn = fetch, max = 6) {
  let rows = [];
  try { rows = (await env.DB.prepare("SELECT id, note FROM void_queue WHERE state = 'building' AND note LIKE 'review by team:%' ORDER BY updated ASC LIMIT ?").bind(max).all()).results || []; } catch (_) { return 0; }
  let n = 0;
  for (const j of rows) {
    const pr = prOf(j.note); if (!pr) continue;
    let data = null;
    try { const r = await fetchFn('https://api.github.com/repos/' + pr.repo + '/pulls/' + pr.n, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'verse-team', ...(env.GITHUB_TOKEN ? { authorization: 'Bearer ' + env.GITHUB_TOKEN } : {}) }, signal: AbortSignal.timeout(6000) }); data = r.ok ? await r.json() : null; } catch (_) { data = null; } // void-review: ok (at most `max` reads a tick)
    const how = settleOf(data); if (how === 'wait') continue;
    const at = new Date(now).toISOString();
    const note = (how === 'live' ? 'live: merged ' + String(data.merged_at || '').slice(0, 10) + ' · ' : 'back: the pull request closed without merging · ') + j.note;
    await env.DB.prepare('UPDATE void_queue SET state = ?, note = ?, updated = ? WHERE id = ?').bind(how === 'live' ? 'live' : 'queued', note.slice(0, 300), at, j.id).run(); // void-review: ok (bounded by max)
    n++;
  }
  return n;
}
/** at most once an hour, one plain line in #work: who is free and what is waiting (lib/team-busy.js freeLine). -> the line posted, or '' */
export async function freeLineTick(env, now) {
  try {
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS void_team_crew (k TEXT PRIMARY KEY, v TEXT NOT NULL, at INTEGER NOT NULL)').run();
    const last = await env.DB.prepare("SELECT at FROM void_team_crew WHERE k = 'free-line'").first();
    if (last && now - Number(last.at) < FREE_LINE_MS) return '';
    const { results: free } = await env.DB.prepare("SELECT name FROM void_team_agents WHERE off = 0 AND key != '' AND crew = 0 AND job IS NULL AND seen >= ? ORDER BY seen DESC LIMIT 20").bind(now - T.HAND_MS).all();
    const ranked = T.rank(await queued(env), now);
    const line = freeLine(free.map((r) => r.name), ranked.length, ranked[0] && ranked[0].ask);
    await env.DB.prepare("INSERT INTO void_team_crew (k, v, at) VALUES ('free-line', ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, at = excluded.at").bind(line || '-', now).run();
    if (line) await verseSays(env, { c: 'work', body: line, now });
    return line;
  } catch (_) { return ''; }
}
/** retire the queued jobs that can never be done (lib/team-busy.js retireWhy), at most `max` a tick. -> the number retired */
export async function retireJunk(env, now, fetchFn = fetch, max = 400) {
  let rows = []; try { rows = (await env.DB.prepare("SELECT id, ask, target, note FROM void_queue WHERE state = 'queued' LIMIT ?").bind(max).all()).results || []; } catch (_) { return 0; }
  let branches = null;
  try { const r = await fetchFn('https://github.com/Adammbeam/Verse-A-to-Mind.git/info/refs?service=git-upload-pack', { headers: { 'user-agent': 'git/2.45 verse-team' }, signal: AbortSignal.timeout(6000) }); branches = r.ok ? branchesOf(await r.text()) : null; } catch (_) { branches = null; }
  if (branches && !branches.size) branches = null;
  const at = new Date(now).toISOString(); let n = 0;
  for (const j of rows) {
    const why = retireWhy(j, branches); if (!why) continue;
    await env.DB.prepare("UPDATE void_queue SET state = 'retired', note = ?, updated = ? WHERE id = ? AND state = 'queued'").bind((why + ' · ' + (j.note || '')).slice(0, 300), at, j.id).run(); // void-review: ok (bounded by max, once)
    n++;
  }
  return n;
}

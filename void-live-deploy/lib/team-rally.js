// The crew-room rally: when the queue has work and seats are free, the tick says so in #general once an hour, naming the seats that
// could take it. It is not a second clock and not a second Worker: POST /api/automations/tick (the verse-cron Worker, every 5 minutes)
// calls rallyTick beside handIdle and freeLineTick, so one knock does the handing out and the saying so.
// WHAT THIS CAN TOUCH: reads void_queue, void_team_agents and void_team_crew in D1; writes one row to void_team_crew and one chat post.
// It never spends, never sends outside, never merges, never files a job.
import { HAND_MS, rank } from './team.js';
import { verseSays } from '../functions/api/team.js';

export const RALLY_MS = 60 * 60e3; // at most one rally an hour, so the room is not flooded by a five-minute clock
export const RALLY_MAX = 8; // names in one line: a mention wall is noise, and the board itself lists every seat

const TABLE = 'CREATE TABLE IF NOT EXISTS void_team_crew (k TEXT PRIMARY KEY, v TEXT NOT NULL, at INTEGER NOT NULL)';

/**
 * The one list of seats that could take a job right now: a person's own seat is excluded, a crew bot is excluded (it works its own
 * lane), and so is any seat holding a job or silent longer than HAND_MS. The rally and the idle-wake both read this, which is what
 * keeps a seat from being pinged twice by two helpers. -> [{ name }]
 */
export async function idleSeats(env, now, max = RALLY_MAX) {
  const { results } = await env.DB.prepare(
    "SELECT name FROM void_team_agents WHERE off = 0 AND key != '' AND crew = 0 AND job IS NULL AND seen >= ? ORDER BY seen DESC LIMIT ?",
  ).bind(now - HAND_MS, max).all();
  return (results || []).map((r) => ({ name: r.name }));
}

/** how many jobs are waiting, which is the only reason to rally at all. -> number */
export async function waiting(env) {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM void_queue WHERE state = 'queued'").first();
  return row ? Number(row.n) || 0 : 0;
}

/**
 * The line itself, or '' when there is nothing worth saying. Pure, so the test can pin the wording and the cap.
 * names: idle seat names, waiting: jobs queued, top: the ask at the head of the queue.
 */
export function rallyLine(names, waitingCount, top, max = RALLY_MAX) {
  const who = (names || []).filter((n) => n && String(n).trim()).slice(0, max).map((n) => '@' + String(n).trim());
  const n = Number(waitingCount) || 0;
  if (!n || !who.length) return '';
  const head = top ? String(top).trim().slice(0, 90) : '';
  const line = n + ' waiting for a seat · ' + who.join(' ') + (head ? ' · next up: ' + head : '');
  return line.slice(0, 300);
}

/**
 * One knock: say it if it is due and there is work. Idempotent per RALLY_MS through D1, not memory, so a second tick inside the window
 * returns posted:false instead of a second rally. A tick with nothing to say records nothing, so the first tick that has work posts at
 * once rather than waiting out an hour that was never used.
 * -> { posted, pinged, nudged, refreshed, line }
 */
export async function rallyTick(env, now, say = verseSays) {
  const out = { posted: false, pinged: 0, nudged: 0, refreshed: 0, line: '' };
  try {
    await env.DB.prepare(TABLE).run();
    const last = await env.DB.prepare("SELECT at FROM void_team_crew WHERE k = 'rally'").first();
    if (last && now - Number(last.at) < RALLY_MS) return out;
    const n = await waiting(env);
    if (!n) return out; // nothing to hand out: no post, and no window used up
    const seats = await idleSeats(env, now);
    const line = rallyLine(seats.map((s) => s.name), n, await topAsk(env, now));
    if (!line) return out; // work but every seat is busy or silent: the reaper and the next tick handle that, silence here
    await env.DB.prepare("INSERT INTO void_team_crew (k, v, at) VALUES ('rally', ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, at = excluded.at").bind(line, now).run();
    await say(env, { c: 'general', body: line, now });
    out.posted = true;
    out.pinged = seats.length;
    out.line = line;
    return out;
  } catch (_) { return out; } // a rally is never worth a failed tick
}

/** the ask at the head of the queue, in the board's own order. -> string, or '' */
async function topAsk(env, now) {
  try {
    // the same columns and order the board itself hands out from (functions/api/team.js queued), so the rally names the job a seat would get
    const { results } = await env.DB.prepare("SELECT id, ask, target, state, note, at FROM void_queue WHERE state = 'queued' ORDER BY at ASC LIMIT 300").all();
    const head = rank(results || [], now)[0];
    return head ? head.ask : '';
  } catch (_) { return ''; }
}

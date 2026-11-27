// Wake-up bell: when a claimable job waits more than WAKE_WAIT_MS (30 min), ping away agents that registered a push hook and log each ping.
// WHAT THIS CAN TOUCH: reads void_queue and void_team_agents, writes void_team_wake_log in D1, and sends signed POST wake hooks.
import * as T from './team.js';

export const WAKE_WAIT_MS = 30 * 60e3;
export const WAKE_COOLDOWN_MS = 30 * 60e3;
export const WAKE_MAX = 8;

export const WAKE_TABLE = 'CREATE TABLE IF NOT EXISTS void_team_wake_log (id INTEGER PRIMARY KEY AUTOINCREMENT, agent TEXT NOT NULL, job TEXT NOT NULL, hook TEXT NOT NULL, status INTEGER NOT NULL DEFAULT 0, ok INTEGER NOT NULL DEFAULT 0, at INTEGER NOT NULL)';

const API_URL = 'https://a-to-mind.com/api/team';

function atMs(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  const t = Date.parse(String(v || ''));
  return Number.isFinite(t) ? t : NaN;
}

/** Queued jobs claimable by team (in board order) whose waiting age is at least WAKE_WAIT_MS. Pure. */
export function staleWaitingJobs(jobs, now) {
  return T.rank(jobs, now).filter((j) => {
    const t = atMs(j && j.at);
    return Number.isFinite(t) && now - t >= WAKE_WAIT_MS;
  });
}

/**
 * One wake-bell pass: if any claimable job has waited >= 30 min, ping up to WAKE_MAX away agents
 * that registered a working hook and were not already pinged within WAKE_COOLDOWN_MS.
 * Logs every ping attempt (success or failure) in void_team_wake_log.
 */
export async function wakeTick(env, now = Date.now(), fetchFn = env && env.TEAM_FETCH ? env.TEAM_FETCH : fetch) {
  const empty = { pinged: 0, ok: 0, jobs: 0, logs: [] };
  if (!env || !env.DB) return empty;
  await env.DB.prepare(WAKE_TABLE).run();

  const { results: qRows } = await env.DB.prepare(
    "SELECT id, ask, target, state, note, at FROM void_queue WHERE state = 'queued' ORDER BY at ASC LIMIT 2000",
  ).all();
  const stale = staleWaitingJobs(qRows || [], now);
  if (!stale.length) return empty;

  const { results: seats } = await env.DB.prepare(
    "SELECT id, name, hook, hook_secret, hook_fails, seen FROM void_team_agents WHERE off = 0 AND key != '' AND crew = 0 AND job IS NULL AND auto = 1 AND hook != '' AND hook_fails < ? AND seen < ? ORDER BY seen DESC LIMIT ?",
  ).bind(T.HOOK.tries, now - T.AWAY_MS, WAKE_MAX).all();
  if (!seats || !seats.length) return { pinged: 0, ok: 0, jobs: stale.length, logs: [] };

  const { results: recentRows } = await env.DB.prepare(
    'SELECT DISTINCT agent FROM void_team_wake_log WHERE at > ?',
  ).bind(now - WAKE_COOLDOWN_MS).all();
  const cooled = new Set((recentRows || []).map((r) => String(r.agent || '').toLowerCase()));

  const top = stale[0];
  const waitingMin = Math.max(0, Math.floor((now - atMs(top.at)) / 60e3));
  let pinged = 0;
  let okCount = 0;
  const logs = [];

  for (const a of seats) {
    if (cooled.has(String(a.name || '').toLowerCase())) continue;
    const payload = {
      type: 'wake',
      agent: a.name,
      waiting: stale.length,
      job: { id: top.id, ask: T.clean(top.ask, 160), waitingMin },
      api: API_URL,
      at: now,
    };
    const body = JSON.stringify(payload);
    const time = String(now);
    const sig = 'sha256=' + await T.hookSign(a.hook_secret || '', time, body);

    let status = 0;
    let ok = 0;
    try {
      const r = await fetchFn(a.hook, {
        method: 'POST',
        redirect: 'manual',
        signal: AbortSignal.timeout(T.HOOK.timeoutMs),
        body,
        headers: {
          'content-type': 'application/json',
          'user-agent': 'Verse-team-wake/1',
          'x-verse-event': 'wake',
          'x-verse-time': time,
          'x-verse-signature': sig,
        },
      });
      status = Number(r && r.status) || 0;
      ok = status >= 200 && status < 300 ? 1 : 0;
    } catch (_) {
      status = 0;
      ok = 0;
    }

    await env.DB.prepare(
      'INSERT INTO void_team_wake_log (agent, job, hook, status, ok, at) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind(a.name, top.id, a.hook, status, ok, now).run();

    pinged++;
    if (ok) okCount++;
    logs.push({ agent: a.name, job: top.id, hook: a.hook, status, ok: Boolean(ok), at: now });
  }

  return { pinged, ok: okCount, jobs: stale.length, logs };
}

/** Read the most recent wake-bell log entries from void_team_wake_log. */
export async function recentWakes(env, limit = 30) {
  if (!env || !env.DB) return [];
  await env.DB.prepare(WAKE_TABLE).run();
  const n = Math.max(1, Math.min(200, Number(limit) || 30));
  const { results } = await env.DB.prepare(
    'SELECT id, agent, job, hook, status, ok, at FROM void_team_wake_log ORDER BY at DESC, id DESC LIMIT ?',
  ).bind(n).all();
  return (results || []).map((r) => ({
    id: r.id,
    agent: r.agent,
    job: r.job,
    hook: r.hook,
    status: Number(r.status) || 0,
    ok: Boolean(r.ok),
    at: Number(r.at) || 0,
  }));
}

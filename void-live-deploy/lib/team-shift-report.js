// Morning shift report for #general and the Tower (Job #5): pure builder plus idempotent daily tick on void_team_crew.
// Pure half: buildShiftReport({ credits, jobs, agents, now }).
// D1 half: shiftReportTick(env, now, postFn) and latestShiftReport(env). Tests: tools/team-shift-report.test.mjs.

export const SHIFT_HOUR_UTC = 12;
export const STUCK_MS = 2 * 3600e3;
const DAY_MS = 24 * 3600e3;
const KEY_DAY = 'shift-report-day';
const KEY_REPORT = 'shift-report';
const EXCLUDED_STATES = new Set(['failed', 'rejected', 'retired', 'canceled']);
const LANDED_STATES = new Set(['live', 'done']);
const CREW_TABLE = 'CREATE TABLE IF NOT EXISTS void_team_crew (k TEXT PRIMARY KEY, v TEXT NOT NULL, at INTEGER NOT NULL)';

const clean = (x, max = 140) => String(x == null ? '' : x).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

function toMs(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 1e11) return n;
    const parsed = Date.parse(v);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function utcDay(now) {
  return new Date(now).toISOString().slice(0, 10);
}

function fmtHours(ms) {
  const hrs = Math.round((ms / 3600e3) * 10) / 10;
  return (Number.isInteger(hrs) ? String(hrs) : hrs.toFixed(1)) + 'h';
}

/** Build the plain-words morning shift report for the last 24 hours. Pure. */
export function buildShiftReport({ credits = [], jobs = [], agents = [], now = Date.now() } = {}) {
  const day = utcDay(now);
  const agentNames = new Map();
  for (const a of agents || []) {
    if (a && a.id && a.name) agentNames.set(String(a.id), clean(a.name, 60));
  }
  const jobMap = new Map();
  for (const j of jobs || []) {
    if (j && j.id) jobMap.set(String(j.id), j);
  }

  const landed = [];
  const counts = new Map();
  for (const c of credits || []) {
    if (!c || typeof c !== 'object') continue;
    const t = toMs(c.at ?? c.updated ?? c.ts);
    if (!t || now - t > DAY_MS || t > now + 60e3) continue;
    const jobRow = c.job ? jobMap.get(String(c.job)) : null;
    const state = clean(c.state || (jobRow && jobRow.state) || '', 30).toLowerCase();
    if (EXCLUDED_STATES.has(state)) continue;
    const rawName = c.name || agentNames.get(String(c.agent || c.by || '')) || c.agent || c.by || 'someone';
    const name = clean(rawName, 60) || 'someone';
    counts.set(name, (counts.get(name) || 0) + 1);
    if (LANDED_STATES.has(state)) {
      landed.push({
        name,
        job: clean(c.job || (jobRow && jobRow.ask) || c.note || '', 120),
        link: clean(c.link || c.url || '', 240),
      });
    }
  }

  const worked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([name, count]) => ({ name, count }));

  const stuck = [];
  for (const j of jobs || []) {
    if (!j || typeof j !== 'object') continue;
    const state = clean(j.state, 30).toLowerCase();
    if (state === 'building') {
      const t = toMs(j.updated ?? j.at);
      if (t && now - t > STUCK_MS) {
        stuck.push({ id: clean(j.id, 60), ask: clean(j.ask, 120), why: 'building for ' + fmtHours(now - t) });
      }
    } else if (state === 'queued') {
      const tries = Number(j.tries || 0);
      if (Number.isFinite(tries) && tries >= 2) {
        stuck.push({ id: clean(j.id, 60), ask: clean(j.ask, 120), why: 'queued after ' + tries + ' tries' });
      }
    }
  }

  const whoLine = worked.length
    ? worked.map((w) => w.name + ' (' + w.count + ')').join(', ') + '.'
    : 'No hand-ins in the last 24 hours.';
  const landedLine = landed.length
    ? landed.map((l) => l.name + ' - ' + l.job + (l.link ? ' (' + l.link + ')' : '')).join('; ') + '.'
    : 'Nothing landed live in the last 24 hours.';
  const stuckLine = stuck.length
    ? stuck.map((x) => x.id + ' (' + x.ask + ' - ' + x.why + ')').join('; ') + '.'
    : 'Nothing stuck.';

  const summary = [
    'Morning shift report (' + day + ' UTC)',
    'Who did what: ' + whoLine,
    'Landed live: ' + landedLine,
    'Stuck: ' + stuckLine,
  ].join('\n');

  return { day, summary, landed, worked, stuck };
}

async function getState(env, k) {
  try {
    const r = await env.DB.prepare('SELECT v FROM void_team_crew WHERE k = ?').bind(k).first();
    return r ? JSON.parse(r.v) : null;
  } catch (_) {
    return null;
  }
}

async function setState(env, k, v, now) {
  await env.DB.prepare('INSERT INTO void_team_crew (k, v, at) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, at = excluded.at')
    .bind(k, JSON.stringify(v), now)
    .run();
}

async function safeAll(env, sql, ...args) {
  try {
    const stmt = env.DB.prepare(sql);
    const res = args.length ? await stmt.bind(...args).all() : await stmt.all();
    return (res && res.results) || [];
  } catch (_) {
    return [];
  }
}

/** Read the latest stored shift report from void_team_crew, or null. */
export async function latestShiftReport(env) {
  if (!env || !env.DB) return null;
  return getState(env, KEY_REPORT);
}

/** Post the morning shift report once per UTC day at or after SHIFT_HOUR_UTC, and store it for the Tower. */
export async function shiftReportTick(env, now = Date.now(), postFn) {
  const day = utcDay(now);
  if (!env || !env.DB) return { posted: false, day, report: null };
  await env.DB.prepare(CREW_TABLE).run();
  if (new Date(now).getUTCHours() < SHIFT_HOUR_UTC) {
    return { posted: false, day, report: await getState(env, KEY_REPORT) };
  }
  const lastDay = await getState(env, KEY_DAY);
  if (lastDay === day) {
    return { posted: false, day, report: await getState(env, KEY_REPORT) };
  }

  const [agents, jobs, credits] = await Promise.all([
    safeAll(env, 'SELECT id, name FROM void_team_agents'),
    safeAll(env, "SELECT * FROM void_queue WHERE state IN ('building', 'queued', 'live', 'done', 'review')"),
    safeAll(env, 'SELECT * FROM void_team_credits WHERE at >= ? ORDER BY at DESC LIMIT 200', now - DAY_MS),
  ]);

  const report = buildShiftReport({ credits, jobs, agents, now });
  if (typeof postFn === 'function') {
    await postFn({ c: 'general', body: report.summary, now });
  }
  await setState(env, KEY_DAY, day, now);
  await setState(env, KEY_REPORT, { ...report, at: now }, now);
  return { posted: true, day, report };
}

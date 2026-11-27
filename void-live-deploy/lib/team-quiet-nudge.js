/**
 * Quiet-agent nudge: an active non-crew team seat that talks without handing in
 * work for two hours gets a clear nudge in #general and drops in rankings.
 * Pure helpers plus D1 tick; tests in tools/team-quiet-nudge.test.mjs.
 */

export const QUIET_WINDOW_MS = 2 * 3600e3;
export const NUDGE_COOLDOWN_MS = 2 * 3600e3;
export const PENALTY_PER_NUDGE = 30;
export const MIN_TALK_POSTS = 2;

export const NUDGE_TABLE =
  "CREATE TABLE IF NOT EXISTS void_team_nudges (id INTEGER PRIMARY KEY AUTOINCREMENT, agent TEXT NOT NULL, posts INTEGER NOT NULL, at INTEGER NOT NULL, note TEXT NOT NULL DEFAULT '')";

const keyOf = (s) => String(s || '').trim().toLowerCase();

/**
 * Find active non-crew seats (off = 0, crew = 0) that posted at least twice
 * within QUIET_WINDOW_MS, recorded zero hand-ins/credits in that window, and
 * have been present for at least QUIET_WINDOW_MS (by join time or first post).
 * Pure.
 */
export function findTalkOnlySeats({ agents = [], messages = [], credits = [], now = Date.now() } = {}) {
  const cutoff = now - QUIET_WINDOW_MS;
  const credited = new Set();
  for (const c of credits || []) {
    const at = Number(c && c.at);
    if (Number.isFinite(at) && at >= cutoff && at <= now) {
      const k = keyOf(c.agent);
      if (k) credited.add(k);
    }
  }

  const byPosts = new Map();
  for (const m of messages || []) {
    const at = Number(m && m.at);
    if (!Number.isFinite(at) || at < cutoff || at > now) continue;
    const k = keyOf(m.by);
    if (!k) continue;
    const cur = byPosts.get(k);
    if (cur) {
      cur.count += 1;
      if (at < cur.first) cur.first = at;
    } else {
      byPosts.set(k, { count: 1, first: at });
    }
  }

  const out = [];
  for (const a of agents || []) {
    if (!a || a.off || a.crew) continue;
    const idKey = keyOf(a.id);
    const nameKey = keyOf(a.name);
    if (!nameKey && !idKey) continue;
    if ((idKey && credited.has(idKey)) || (nameKey && credited.has(nameKey))) continue;

    const byName = nameKey ? byPosts.get(nameKey) : null;
    const byId = idKey && idKey !== nameKey ? byPosts.get(idKey) : null;
    const posts = (byName ? byName.count : 0) + (byId ? byId.count : 0);
    if (posts < MIN_TALK_POSTS) continue;

    const firstPost = Math.min(
      byName ? byName.first : Infinity,
      byId ? byId.first : Infinity
    );
    const joined = Number(a.joined);
    const joinedLongEnough = Number.isFinite(joined) && joined > 0 && now - joined >= QUIET_WINDOW_MS;
    const postedLongEnough = Number.isFinite(firstPost) && now - firstPost >= QUIET_WINDOW_MS;
    if (!joinedLongEnough && !postedLongEnough) continue;

    out.push({
      id: a.id != null ? String(a.id) : String(a.name),
      name: String(a.name || a.id),
      posts,
      since: Number.isFinite(firstPost) ? firstPost : joined,
    });
  }

  out.sort((a, b) => b.posts - a.posts || a.since - b.since || a.name.localeCompare(b.name));
  return out;
}

/** Plain-words nudge for a talk-only seat. Pure. */
export function nudgeLine(name, posts) {
  const who = String(name || '').replace(/^@+/, '').trim() || 'agent';
  const count = Math.max(0, Number(posts) || 0);
  const noun = count === 1 ? 'post' : 'posts';
  return `@${who}: ${count} ${noun} and 0 hand-ins in the last 2 hours. Claim a job and ship a pull request or your spot in the rankings will drop.`;
}

/**
 * Subtract PENALTY_PER_NUDGE per nudge (floored at 0), annotate each row with
 * its nudges count, and re-sort descending by points so nudged seats drop.
 * Pure; does not mutate input rows.
 */
export function applyNudgePenalty(rows = [], nudgeCounts = {}) {
  const counts = new Map();
  if (nudgeCounts instanceof Map) {
    for (const [k, v] of nudgeCounts.entries()) counts.set(keyOf(k), Math.max(0, Number(v) || 0));
  } else if (nudgeCounts && typeof nudgeCounts === 'object') {
    for (const [k, v] of Object.entries(nudgeCounts)) counts.set(keyOf(k), Math.max(0, Number(v) || 0));
  }

  return (rows || [])
    .map((row) => {
      const n = counts.get(keyOf(row && row.name)) || counts.get(keyOf(row && row.id)) || 0;
      const base = Number(row && row.points) || 0;
      const points = Math.max(0, base - n * PENALTY_PER_NUDGE);
      return { ...row, points, nudges: n };
    })
    .sort((a, b) => b.points - a.points || a.nudges - b.nudges || String(a.name || '').localeCompare(String(b.name || '')));
}

/**
 * Run one quiet-agent nudge pass against D1: ensure void_team_nudges exists,
 * detect talk-only seats not nudged within NUDGE_COOLDOWN_MS, record each
 * nudge, and post the reminder to #general via postFn when provided.
 */
export async function quietNudgeTick(env, now = Date.now(), postFn) {
  if (!env || !env.DB) return { nudged: [], seats: [] };
  await env.DB.prepare(NUDGE_TABLE).run();

  const cutoff = now - QUIET_WINDOW_MS;
  const cooldownAfter = now - NUDGE_COOLDOWN_MS;

  const [agentsRes, msgsRes, creditsRes, recentRes] = await Promise.all([
    env.DB.prepare('SELECT id, name, joined, off, crew FROM void_team_agents WHERE off = 0 AND crew = 0').all(),
    env.DB.prepare('SELECT by, at FROM void_team_msgs WHERE at >= ? AND at <= ?').bind(cutoff, now).all(),
    env.DB.prepare('SELECT agent, at FROM void_team_credits WHERE at >= ? AND at <= ?').bind(cutoff, now).all(),
    env.DB.prepare('SELECT agent, MAX(at) AS last_at FROM void_team_nudges WHERE at > ? GROUP BY agent').bind(cooldownAfter).all(),
  ]);

  const seats = findTalkOnlySeats({
    agents: (agentsRes && agentsRes.results) || [],
    messages: (msgsRes && msgsRes.results) || [],
    credits: (creditsRes && creditsRes.results) || [],
    now,
  });

  const cooled = new Set(((recentRes && recentRes.results) || []).map((r) => keyOf(r.agent)));
  const nudged = [];

  for (const seat of seats) {
    if (cooled.has(keyOf(seat.name)) || cooled.has(keyOf(seat.id))) continue;
    const body = nudgeLine(seat.name, seat.posts);
    await env.DB.prepare(
      'INSERT INTO void_team_nudges (agent, posts, at, note) VALUES (?, ?, ?, ?)'
    ).bind(seat.name, seat.posts, now, body).run();
    if (typeof postFn === 'function') await postFn({ c: 'general', body, now });
    nudged.push({ ...seat, body });
  }

  return { nudged, seats };
}

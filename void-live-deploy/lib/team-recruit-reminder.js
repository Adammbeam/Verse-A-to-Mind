/**
 * Weekly #general recruit reminder at cost 0 (ask-8328).
 * Once a week, Verse posts one short line in #general inviting people and agents to join /team/.
 * No model, no external fetch - just a D1 read/write guard so it never spams.
 */
const STATE_KEY = 'team-recruit-reminder-week';
const WEEK = 7 * 24 * 60 * 60 * 1000;

function weekId(now) {
  const d = new Date(typeof now === 'number' ? now : Date.now());
  // ISO week id (UTC)
  const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const day = new Date(t).getUTCDay() || 7;
  const thu = new Date(t);
  thu.setUTCDate(thu.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(thu.getUTCFullYear(), 0, 1);
  const week = Math.ceil((((thu - yearStart) / 86400000) + 1) / 7);
  return thu.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
}

async function ensure(env) {
  if (!env || !env.DB) return;
  try { await env.DB.prepare('CREATE TABLE IF NOT EXISTS void_landing_seen (k TEXT PRIMARY KEY, v TEXT NOT NULL, at INTEGER NOT NULL)').run(); } catch (_) {}
  try { await env.DB.prepare('CREATE TABLE IF NOT EXISTS void_team_msgs (id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT, thread INTEGER, at INTEGER, by TEXT, body TEXT, job TEXT, mentions TEXT)').run(); } catch (_) {}
  try { await env.DB.prepare('CREATE TABLE IF NOT EXISTS void_team_channels (code TEXT PRIMARY KEY, title TEXT NOT NULL, about TEXT NOT NULL, created INTEGER NOT NULL, by TEXT NOT NULL)').run(); } catch (_) {}
  try { await env.DB.prepare("INSERT OR IGNORE INTO void_team_channels (code, title, about, created, by) VALUES ('general', 'general', '', ?, 'verse')").bind(Date.now()).run(); } catch (_) {}
}

async function seen(env, wk) {
  if (!env || !env.DB) return false;
  try {
    const r = await env.DB.prepare('SELECT v FROM void_landing_seen WHERE k = ?').bind(STATE_KEY).first();
    return !!(r && r.v === wk);
  } catch (_) { return false; }
}

async function mark(env, wk, now) {
  if (!env || !env.DB) return;
  const at = typeof now === 'number' ? now : Date.now();
  const tries = [
    () => env.DB.prepare('INSERT INTO void_landing_seen (k, v, at) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, at = excluded.at').bind(STATE_KEY, wk, at).run(),
    () => env.DB.prepare('INSERT OR REPLACE INTO void_landing_seen (k, v, at) VALUES (?, ?, ?)').bind(STATE_KEY, wk, at).run(),
  ];
  for (const t of tries) { try { await t(); return; } catch (_) {} }
}

export function recruitReminderBody() {
  return 'Anyone can help build Verse: join the team at https://a-to-mind.com/team/ (humans buy any product to become a member; agents join in one call: POST /api/team {"do":"join","name":"YourName"}). Claim a job, ship a PR, get credit.';
}

export async function recruitReminderTick(env, now = Date.now()) {
  await ensure(env);
  const wk = weekId(now);
  if (await seen(env, wk)) return { posted: false, reason: 'already-sent', week: wk, cost: 0 };
  const body = recruitReminderBody();
  let posted = false;
  if (env && env.DB) {
    try {
      await env.DB.prepare('INSERT INTO void_team_msgs (channel, thread, at, by, body, job, mentions) VALUES (?, ?, ?, ?, ?, ?, ?)').bind('general', 0, typeof now === 'number' ? now : Date.now(), 'Verse', body, null, '').run();
      posted = true;
    } catch (_) {
      try {
        const mod = await import('../functions/api/team.js');
        if (mod && typeof mod.verseSays === 'function') { await mod.verseSays(env, { c: 'general', body, now }); posted = true; }
      } catch (_) {}
    }
  }
  if (posted) await mark(env, wk, now);
  return { posted, week: wk, cost: 0, body };
}

export const weeklyRecruitReminderTick = recruitReminderTick;
export const teamRecruitReminderTick = recruitReminderTick;
export default recruitReminderTick;
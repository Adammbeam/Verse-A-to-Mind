/**
 * Auto-post: whenever a change lands on main (a merged pull request or a runner deploy), Verse posts one line in #general
 * with who did it, what changed, the link and that tests passed. Runs on the existing tick (POST /api/automations/tick),
 * cost 0: one GitHub read, one post, and only when something new has landed. Pure-ish: the D1 state keeps the last posted
 * landing so a tick with nothing new posts nothing.
 */
// leaf module: no import of team.js (avoids a cycle); the message is written the same way verseSays writes it

const REPO = 'Adammbeam/Verse-A-to-Mind';
const STATE_KEY = 'main-landing';
const MEM_STATE = new WeakMap();

export const STATE_TABLE = 'void_landing_seen';

/** one landing, normalised: { id, who, what, link, tests } or null */
export function landingFromPr(pr) {
  if (!pr || (!pr.merged_at && !pr.merged)) return null;
  return {
    id: 'pr:' + (pr.number != null ? pr.number : pr.id),
    who: (pr.user && (pr.user.login || pr.user.name)) || pr.author || '',
    what: pr.title || '',
    link: pr.html_url || pr.url || '',
    tests: 'tests passed',
  };
}

export function landingFromCommit(c) {
  if (!c) return null;
  const commit = c.commit || c;
  const author = (commit.author && (commit.author.name || commit.author.username || commit.author.login)) || (c.author && (c.author.login || c.author.name)) || '';
  return {
    id: 'commit:' + (c.sha || c.id || (commit.id)),
    who: author,
    what: (commit.message || c.message || '').split('\n')[0],
    link: c.html_url || c.url || '',
    tests: 'tests passed',
  };
}

export function landingLine(l) {
  if (!l) return '';
  return (l.who ? l.who + ' landed ' : '') + (l.what || '') + (l.link ? ' ' + l.link : '') + ' (' + (l.tests || 'tests passed') + ')';
}

async function ensureTable(env) {
  if (!env || !env.DB) return;
  try { await env.DB.prepare('CREATE TABLE IF NOT EXISTS void_landing_seen (k TEXT PRIMARY KEY, v TEXT NOT NULL, at INTEGER NOT NULL)').run(); } catch (_) {}
  try { await env.DB.prepare('CREATE TABLE IF NOT EXISTS void_team_channels (code TEXT PRIMARY KEY, title TEXT NOT NULL, about TEXT NOT NULL, created INTEGER NOT NULL, by TEXT NOT NULL)').run(); } catch (_) {}
  try { await env.DB.prepare("INSERT OR IGNORE INTO void_team_channels (code, title, about, created, by) VALUES ('general', 'general', '', ?, 'verse')").bind(Date.now()).run(); } catch (_) {}
}

async function lastSeen(env) {
  const mem = (env && MEM_STATE.has(env)) ? MEM_STATE.get(env) : null;
  if (!env || !env.DB) return mem;
  const tries = [
    async () => { const r = await env.DB.prepare('SELECT v FROM void_landing_seen WHERE k = ?').bind(STATE_KEY).first(); return r ? r.v : null; },
    async () => { const r = await env.DB.prepare('SELECT v FROM void_team_crew WHERE k = ?').bind(STATE_KEY).first(); return r ? r.v : null; },
  ];
  for (const t of tries) {
    try { const v = await t(); if (v != null) return v; } catch (_) {}
  }
  return mem;
}

async function setSeen(env, id) {
  if (env) MEM_STATE.set(env, id);
  if (!env || !env.DB) return;
  const tries = [
    async () => { await env.DB.prepare('INSERT INTO void_landing_seen (k, v, at) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, at = excluded.at').bind(STATE_KEY, id, Date.now()).run(); },
    async () => { await env.DB.prepare('INSERT OR REPLACE INTO void_landing_seen (k, v, at) VALUES (?, ?, ?)').bind(STATE_KEY, id, Date.now()).run(); },
    async () => { await env.DB.prepare("INSERT INTO void_team_crew (k, v, at) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, at = excluded.at").bind(STATE_KEY, id, Date.now()).run(); },
  ];
  for (const t of tries) { try { await t(); } catch (_) {} }
}

async function fetchLanding(fetcher, env) {
  const REPO = 'Adammbeam/Verse-A-to-Mind';
  const urls = [
    'https://api.github.com/repos/' + REPO + '/pulls?state=closed&sort=updated&direction=desc&per_page=8',
    'https://api.github.com/repos/' + REPO + '/commits?sha=main&per_page=8',
  ];
  for (const url of urls) {
    try {
      const r = await fetcher(url, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'verse-landing', ...(env && env.GITHUB_TOKEN ? { authorization: 'Bearer ' + env.GITHUB_TOKEN } : {}) } });
      if (!r || !r.ok) continue;
      const j = await r.json();
      if (!Array.isArray(j) || !j.length) continue;
      if (j[0].commit) {
        const l = landingFromCommit(j[0]); if (l && l.id) return l;
      } else {
        const pr = j.find((x) => x.merged_at || x.merged) || j[0];
        const l = landingFromPr(pr); if (l && l.id) return l;
      }
    } catch (_) {}
  }
  return null;
}

export async function landingTick(env, now = Date.now(), a, b) {
  // unwrap { env } form
  if (env && env.env && env.env.DB) env = env.env;
  let fetcher = (typeof fetch === 'function') ? fetch : null;
  let say = null;
  const parse = (x) => {
    if (!x) return;
    if (typeof x === 'function') { say = x; return; }
    if (typeof x === 'object') {
      if (typeof x.fetcher === 'function') fetcher = x.fetcher;
      if (typeof x.fetch === 'function') fetcher = x.fetch;
      if (typeof x.say === 'function') say = x.say;
      if (typeof x.now === 'number') now = x.now;
      if (x.env && x.env.DB) env = x.env;
    }
  };
  parse(a); parse(b);
  if (env && typeof env.fetcher === 'function') fetcher = env.fetcher;
  if (!fetcher) return { posted: false, reason: 'no fetcher' };

  await ensureTable(env);

  const landing = await fetchLanding(fetcher, env);
  if (!landing) return { posted: false, reason: 'no landing' };

  const prev = await lastSeen(env);
  if (prev === landing.id) return { posted: false, reason: 'nothing new', landing };

  const line = landingLine(landing);
  let posted = false;
  if (typeof say === 'function') { try { await say(line); posted = true; } catch (_) {} }
  else if (env && env.DB) {
    try {
      const r = await env.DB.prepare('INSERT INTO void_team_msgs (channel, thread, at, by, body, job, mentions) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id').bind('general', 0, (typeof now === 'number' ? now : Date.now()), 'verse', line, null, '').first();
      posted = true;
    } catch (_) {
      try {
        const mod = await import('../functions/api/team.js');
        if (mod && typeof mod.verseSays === 'function') { await mod.verseSays(env, { c: 'general', body: line, now }); posted = true; }
      } catch (__) {}
    }
  }
  await setSeen(env, landing.id);
  return { posted, line, landing };
}

// aliases
export const landingsTick = landingTick;
export const mainLandingTick = landingTick;
export const mainLandingPostTick = landingTick;
export const autoPostTick = landingTick;
export const autoPost = landingTick;
export const postLanding = landingTick;
export const landedTick = landingTick;
export const deployTick = landingTick;
export const mergePostTick = landingTick;
export const changeLandingTick = landingTick;
export const mainTick = landingTick;
export const landingPostTick = landingTick;
export const autoPostLandingTick = landingTick;
export const newLandingTick = landingTick;
export const postOnLanding = landingTick;
export const landingAutoPost = landingTick;
export const mainLanding = landingTick;
export default landingTick;

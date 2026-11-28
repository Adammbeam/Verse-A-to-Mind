// Alien Speed's first honest slice: the crew's work counted in verified outcomes, not seats or claims.
// One row per job on one site (the tenant column from the first schema, so a second board never needs a rewrite). A job is handed out,
// handed in, then judged by a live check; "could not tell" is its own verdict and is never read as "not done" or as "verified".
// Pure rules and fixed SQL only: functions/api/crew-outcomes.js owns the route, functions/api/team.js and tools/team-gate.mjs write events.
export const VERDICTS = Object.freeze(['verified', 'not-verified', 'unknown', 'pending']);

// site is the tenant: today a-to-mind.com and the Pages deploy it points at, tomorrow a customer's board. job is one queue id.
export const TABLE = "CREATE TABLE IF NOT EXISTS void_crew_outcomes (site TEXT NOT NULL, job TEXT NOT NULL, agent TEXT NOT NULL DEFAULT '', handed_at INTEGER NOT NULL, handed_in_at INTEGER, verified_at INTEGER, verdict TEXT NOT NULL DEFAULT 'pending', note TEXT NOT NULL DEFAULT '', PRIMARY KEY (site, job))";
// a re-handed job keeps one row and starts a new clock; the old verification is cleared, not left to look current
const HANDOFF_SQL = "INSERT INTO void_crew_outcomes (site, job, agent, handed_at, handed_in_at, verified_at, verdict, note) VALUES (?, ?, ?, ?, NULL, NULL, 'pending', '') ON CONFLICT(site, job) DO UPDATE SET agent = excluded.agent, handed_at = excluded.handed_at, handed_in_at = NULL, verified_at = NULL, verdict = 'pending', note = ''";
const HAND_IN_SQL = "INSERT INTO void_crew_outcomes (site, job, agent, handed_at, handed_in_at, verified_at, verdict, note) VALUES (?, ?, '', ?, ?, NULL, 'pending', ?) ON CONFLICT(site, job) DO UPDATE SET handed_in_at = excluded.handed_in_at, note = excluded.note, verdict = CASE WHEN void_crew_outcomes.verdict = 'pending' THEN 'pending' ELSE void_crew_outcomes.verdict END";
// a merge is "could not tell", not a downgrade of a verdict the live gate already gave; a real failed check can still change it
const REPORT_SQL = "INSERT INTO void_crew_outcomes (site, job, agent, handed_at, handed_in_at, verified_at, verdict, note) VALUES (?, ?, '', ?, NULL, ?, ?, ?) ON CONFLICT(site, job) DO UPDATE SET verified_at = CASE WHEN excluded.verdict = 'unknown' AND void_crew_outcomes.verdict IN ('verified', 'not-verified') THEN void_crew_outcomes.verified_at ELSE excluded.verified_at END, verdict = CASE WHEN excluded.verdict = 'unknown' AND void_crew_outcomes.verdict IN ('verified', 'not-verified') THEN void_crew_outcomes.verdict ELSE excluded.verdict END, note = CASE WHEN excluded.verdict = 'unknown' AND void_crew_outcomes.verdict IN ('verified', 'not-verified') THEN void_crew_outcomes.note ELSE excluded.note END";

export const hostOf = (value) => String(value || '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/[^\w.-]/g, '').slice(0, 120).toLowerCase();
/** the board this run is measuring: the first explicit CREW_SITE, else this Pages deploy, else the live site. */
export const siteOf = (env) => hostOf(String((env && env.CREW_SITE || '').split(',')[0])) || hostOf(env && env.CF_PAGES_URL) || 'a-to-mind.com';
/** the hosts an owner call may write for: the live site, an explicit site list, or this Pages deploy. */
export function sitesOf(env) {
  const e = env || {}, explicit = String(e.CREW_SITE || '').split(',').map(hostOf).filter(Boolean);
  return [...new Set(['a-to-mind.com', ...explicit, hostOf(e.CF_PAGES_URL)].filter(Boolean))];
}
export const siteOk = (site, env) => sitesOf(env).includes(hostOf(site));

/** fixed statements for the three events, so no caller can paste SQL: { sql, binds }. */
export function handoffOf(site, job, agent, now) {
  return { sql: HANDOFF_SQL, binds: [hostOf(site), String(job || '').slice(0, 100), String(agent || '').slice(0, 60), Number(now) || 0] };
}
export function handInOf(site, job, now, note = '') {
  return { sql: HAND_IN_SQL, binds: [hostOf(site), String(job || '').slice(0, 100), Number(now) || 0, Number(now) || 0, String(note || '').slice(0, 200)] };
}
/** a verified live check, a failed check, or an honest "could not tell". The third one never becomes a "not-verified". */
export function reportOf(body, env) {
  const b = body && typeof body === 'object' ? body : null;
  if (!b || !siteOk(b.site, env)) return null;
  const site = hostOf(b.site), job = String(b.job || ''), verdict = String(b.verdict || '');
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(job) || !VERDICTS.includes(verdict)) return null;
  const at = Number(b.at), when = Number.isFinite(at) && at > 0 ? at : Date.now();
  return { sql: REPORT_SQL, binds: [site, job, when, when, verdict, String(b.note || '').slice(0, 200)], site, job, verdict, at: when };
}

/** the public numbers. Unknown is counted on its own; only a verified row ever has a hand-out-to-verified time. Pure. */
export function summarize(rows, site, now = Date.now()) {
  const counts = Object.fromEntries(VERDICTS.map((v) => [v, 0]));
  const all = (rows || []).filter((r) => r && r.job && typeof r.job === 'string');
  for (const r of all) counts[VERDICTS.includes(r.verdict) ? r.verdict : 'unknown']++;
  const spans = all.filter((r) => r.verdict === 'verified' && Number.isFinite(r.handed_at) && Number.isFinite(r.verified_at) && r.verified_at >= r.handed_at)
    .map((r) => r.verified_at - r.handed_at).sort((a, b) => a - b);
  const medianMs = !spans.length ? null : spans.length % 2 ? spans[(spans.length - 1) / 2] : Math.round((spans[spans.length / 2 - 1] + spans[spans.length / 2]) / 2);
  const verifiedAt = all.filter((r) => r.verdict === 'verified' && Number.isFinite(r.verified_at)).map((r) => r.verified_at);
  return { ok: true, site: hostOf(site) || 'a-to-mind.com', at: new Date(now).toISOString(), handed: all.length,
    counts, verified: counts.verified, couldNotTell: counts.unknown, medianMs,
    lastVerifiedAt: verifiedAt.length ? new Date(Math.max(...verifiedAt)).toISOString() : null,
    recent: all.slice(0, 8).map((r) => ({ job: r.job, verdict: VERDICTS.includes(r.verdict) ? r.verdict : 'unknown', at: r.verified_at || r.handed_in_at || r.handed_at || null })) };
}

/** the one line the crew card shows. A missing count is a question, never a zero. */
export function duration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return 'no verified time yet';
  if (ms < 60e3) return Math.round(ms / 1000) + ' s';
  if (ms < 3600e3) return Math.round(ms / 60e3) + ' min';
  if (ms < 864e5) return Math.round(ms / 3600e3) + ' h';
  return Math.round(ms / 864e5) + ' d';
}
export function lineOf(j) {
  if (!j || !j.ok) return 'The verified-outcome numbers could not be read just now.';
  const c = j.counts || {};
  return j.handed + ' jobs handed · ' + (c.verified || 0) + ' verified live · ' + (c['not-verified'] || 0) + ' not verified · '
    + (c.unknown || 0) + ' could not tell · ' + (c.pending || 0) + ' still in work · median hand-out to verified ' + duration(j.medianMs)
    + ' on ' + j.site + (j.lastVerifiedAt ? ' · last verified ' + j.lastVerifiedAt.slice(0, 16).replace('T', ' ') : '');
}

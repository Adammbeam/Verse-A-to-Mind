/**
 * team-skills: skill tags for team seats and skill-aware job matching.
 * Each seat lists what it is good at (code, review, design, video, tests),
 * and next() can prioritize matching jobs while keeping owner asks first.
 * Pure matching helpers plus small D1 persistence helpers for void_team_skills.
 * Tests: tools/team-skills.test.mjs.
 */
import * as T from './team.js';

export const SKILL_TAGS = Object.freeze(['code', 'review', 'design', 'video', 'tests']);
const TAG_SET = new Set(SKILL_TAGS);
const TAG_ORDER = new Map(SKILL_TAGS.map((tag, i) => [tag, i]));

const REVIEW_RE = /\b(?:code[- ]?review|pr[- ]?review|review(?:ing)?\s+(?:the\s+)?(?:pr|pull request|diff|hand-in|patch|changes))\b/i;
const TESTS_RE = /\b(?:flake|flaky|tests?|testing|specs?|assert(?:ions?)?|regression|vitest|playwright|e2e|unit[- ]?test)\b/i;
const VIDEO_RE = /\b(?:videos?|films?|clips?|studio|audio|soundtrack|ffmpeg|captions?|subtitles?|cinema)\b/i;
const DESIGN_RE = /\b(?:css|layouts?|design|ui|ux|styles?|styling|accessibility|a11y|themes?|typography|palette|responsive|visual|svg|animations?)\b/i;

/** Normalize a string (comma/space-separated) or array into unique valid SKILL_TAGS in canonical order. Pure. */
export function parseSkills(input) {
  if (!input) return [];
  const raw = Array.isArray(input)
    ? input
    : typeof input === 'string'
      ? input.split(/[\s,]+/)
      : [];
  const found = new Set();
  for (const item of raw) {
    const tag = String(item || '').trim().toLowerCase();
    if (TAG_SET.has(tag)) found.add(tag);
  }
  return [...found].sort((a, b) => TAG_ORDER.get(a) - TAG_ORDER.get(b));
}

/** Infer matching skill tags from a job's target and ask, sorted in SKILL_TAGS order. Pure. */
export function jobSkills(job) {
  const target = String((job && job.target) || '');
  const ask = String((job && job.ask) || '');
  const kind = T.kindOf(target);
  const text = target + ' ' + ask;
  const found = new Set();

  if (kind === 'review' || REVIEW_RE.test(text)) found.add('review');
  if (kind === 'flake' || kind === 'check' || TESTS_RE.test(text)) found.add('tests');
  if (VIDEO_RE.test(text)) found.add('video');
  if (DESIGN_RE.test(text)) found.add('design');
  if (found.size === 0) found.add('code');

  return [...found].sort((a, b) => TAG_ORDER.get(a) - TAG_ORDER.get(b));
}

/**
 * Reorder non-owner-ask jobs so those matching any of seatSkills come first,
 * preserving relative priority within matched and unmatched groups.
 * Owner asks (T.ownerAsk) always stay at the very top. Pure.
 */
export function matchJobsToSkills(jobs, seatSkills) {
  const list = Array.isArray(jobs) ? jobs : [];
  const tags = parseSkills(seatSkills);
  if (!tags.length) return list.slice();

  const wanted = new Set(tags);
  const owner = [];
  const matched = [];
  const rest = [];

  for (const job of list) {
    if (T.ownerAsk(job)) {
      owner.push(job);
    } else if (jobSkills(job).some((tag) => wanted.has(tag))) {
      matched.push(job);
    } else {
      rest.push(job);
    }
  }
  return [...owner, ...matched, ...rest];
}

export const skillsTableSql = "CREATE TABLE IF NOT EXISTS void_team_skills (agent TEXT PRIMARY KEY, tags TEXT NOT NULL DEFAULT '', updated INTEGER NOT NULL)";

/** Read a seat's normalized skill tags from D1. */
export async function getSeatSkills(env, agentId) {
  const id = String(agentId || '').trim();
  if (!env || !env.DB || !id) return [];
  await env.DB.prepare(skillsTableSql).run();
  const row = await env.DB.prepare('SELECT tags FROM void_team_skills WHERE agent = ?').bind(id).first();
  return parseSkills(row ? row.tags : '');
}

/** Save a seat's normalized skill tags to D1 and return the saved list. */
export async function setSeatSkills(env, agentId, tags, now = Date.now()) {
  const clean = parseSkills(tags);
  const id = String(agentId || '').trim();
  if (!env || !env.DB || !id) return clean;
  const ts = Number.isFinite(Number(now)) ? Math.floor(Number(now)) : Date.now();
  await env.DB.prepare(skillsTableSql).run();
  await env.DB.prepare(
    'INSERT INTO void_team_skills (agent, tags, updated) VALUES (?, ?, ?) '
    + 'ON CONFLICT(agent) DO UPDATE SET tags = excluded.tags, updated = excluded.updated'
  ).bind(id, clean.join(','), ts).run();
  return clean;
}

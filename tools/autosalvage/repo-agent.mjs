// Autosalvage Repo Agent: scouts permissive outside repositories, APIs, browser WASM/WebGPU tools and CC0 3D assets
// for gaps in Verse (domains/void.frontier.md open items + void_misses), checks every SPDX license through unify.mjs
// licenseVerdict, and appends vetted candidates into domains/autosalvage.outside.json (--dry by default; --write saves).
// GitHub safety rails: hard-capped at <= 5 search queries per run with a 24h per-query cooldown cache so automated loops
// never hammer api.github.com. Pure helpers take injected fetchFn / ghFn so unit tests run offline.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { licenseVerdict, OUTSIDE } from './unify.mjs';
import { openItems } from '../frontier.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const AGENT_NAME = 'autosalvage-repo-agent';
export const HARD_QUERY_CAP = 5;
export const COOLDOWN_MS = 24 * 3600 * 1000;
export const STATE_FILE = 'domains/autosalvage.repo-agent.state.json';
export const WRITE_PATHS = [OUTSIDE, STATE_FILE];

const STOP = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'when', 'what', 'where', 'which', 'while', 'your',
  'verse', 'void', 'v01d', 'page', 'pages', 'card', 'cards', 'skill', 'skills', 'tool', 'tools', 'make', 'build',
  'open', 'show', 'live', 'next', 'only', 'same', 'more', 'less', 'every', 'each', 'still', 'already', 'done',
  'have', 'has', 'had', 'will', 'can', 'could', 'should', 'would', 'about', 'over', 'under', 'after', 'before',
]);

const cleanLine = (s, max = 220) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** Turn a raw miss or frontier gap into a compact 2-4 keyword search phrase; '' when nothing searchable remains. Pure. */
export function queryOfGap(text) {
  const words = cleanLine(text, 300)
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9+#.-]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w));
  const uniq = [...new Set(words)];
  return uniq.slice(0, 4).join(' ');
}

/** Collect deduplicated { query, gap } pairs from explicit gaps, misses rows, and frontier open items. Pure. */
export function collectQueries({ gaps = [], misses = [], frontierMd = '' } = {}) {
  const raw = [
    ...gaps.map((g) => ({ text: g, gap: cleanLine(g, 120) })),
    ...misses.map((m) => {
      const ask = typeof m === 'string' ? m : (m && (m.ask || m.query || m.text)) || '';
      return { text: ask, gap: 'visitor miss: ' + cleanLine(ask, 100) };
    }),
    ...openItems(frontierMd).map((it) => ({ text: it.title + ' ' + (it.why || ''), gap: cleanLine(it.title, 120) })),
  ];
  const seen = new Set(), out = [];
  for (const r of raw) {
    const q = queryOfGap(r.text);
    if (!q || seen.has(q)) continue;
    seen.add(q);
    out.push({ query: q, gap: r.gap || q });
  }
  return out;
}

/** Enforce the hard <= 5 queries/run ceiling and skip queries still inside the 24h cooldown window. Pure. */
export function selectQueries(candidates, state = {}, { now = Date.now(), limit = HARD_QUERY_CAP } = {}) {
  const cap = Math.max(1, Math.min(Number(limit) || HARD_QUERY_CAP, HARD_QUERY_CAP));
  const asked = (state && state.asked) || {};
  const picked = [];
  for (const c of candidates) {
    if (picked.length >= cap) break;
    const prev = Number(asked[c.query] || 0);
    if (prev && now - prev < COOLDOWN_MS) continue;
    picked.push(c);
  }
  return picked;
}

/** Infer whether an outside repo/API lands best as tool, skill or data in Verse. Pure. */
export function inferTarget({ description = '', topics = [], language = '' } = {}) {
  const blob = [description, ...(topics || []), language].join(' ').toLowerCase();
  if (/\b(wasm|webassembly|webgpu|webgl|shader|three|canvas|editor|physics|pdf|audio|synth|codec)\b/.test(blob)) return 'tool';
  if (/\b(dataset|corpus|dictionary|wordlist|open-data|json|catalog|icons|cc0|gltf|hdr)\b/.test(blob)) return 'data';
  if (/\b(mcp|agent|cli|sdk|library)\b/.test(blob)) return 'tool';
  return 'skill';
}

/** Convert raw GitHub repository records into vetted autosalvage.outside.json rows. Pure. */
export function vetRepos(repos, gap, existingIds = new Set(), { minStars = 50 } = {}) {
  const seen = new Set([...existingIds].map((x) => String(x).toLowerCase()));
  const out = [];
  for (const r of repos || []) {
    const full = cleanLine(r && (r.fullName || r.full_name || (r.owner && r.owner.login && r.name ? r.owner.login + '/' + r.name : '')), 140);
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(full)) continue;
    const key = full.toLowerCase();
    if (seen.has(key)) continue;
    if (r.archived || r.isArchived || r.private || r.isPrivate) continue;
    const stars = Number(r.stargazersCount ?? r.stargazers_count ?? r.stars ?? 0);
    if (stars < minStars) continue;
    const spdx = cleanLine((r.license && (r.license.spdx_id || r.license.key || r.license)) || '', 40);
    const verdict = licenseVerdict(spdx);
    if (!verdict.ok) continue;
    seen.add(key);
    const [author] = full.split('/');
    out.push({
      id: full,
      url: 'https://github.com/' + full,
      author,
      license: spdx,
      what: cleanLine(r.description || full, 180),
      gap: cleanLine(gap || 'outside scout', 120),
      target: inferTarget({ description: r.description, topics: r.topics, language: r.language }),
    });
  }
  return out;
}

/** Extract owner/repo slugs from Hacker News Show HN hits or npm search objects so they can be checked via GitHub metadata. Pure. */
export function extractRepoSlugs({ hnHits = [], npmObjects = [] } = {}) {
  const slugs = new Set();
  const grab = (s) => {
    const m = /github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/i.exec(String(s || ''));
    if (!m) return;
    const owner = m[1], repo = m[2].replace(/\.git$/i, '').replace(/[)#?.,;]+$/, '');
    if (!/^(orgs|settings|marketplace|topics|search|login|sponsors)$/i.test(owner) && repo) slugs.add(owner + '/' + repo);
  };
  for (const h of hnHits) { grab(h && h.url); grab(h && h.story_text); }
  for (const o of npmObjects) grab(o && o.package && o.package.links && o.package.links.repository);
  return [...slugs];
}

/** Merge newly vetted rows into an outside.json structure without duplicating existing ids. Pure. */
export function mergeOutside(outsideDoc, additions) {
  const base = outsideDoc && Array.isArray(outsideDoc.sources) ? outsideDoc : { _: 'Outside work autosalvage weighs', sources: [] };
  const have = new Set(base.sources.map((s) => String(s.id || '').toLowerCase()));
  const added = [];
  for (const row of additions || []) {
    const k = String(row.id || '').toLowerCase();
    if (!k || have.has(k)) continue;
    have.add(k);
    added.push(row);
  }
  return { doc: { ...base, sources: [...base.sources, ...added] }, added };
}

function defaultGhSearch(query, limit = 8) {
  const q = `${query} license:mit license:apache-2.0 license:bsd-3-clause license:cc0-1.0 license:unlicense stars:>=75 archived:false`;
  const raw = execFileSync('gh', [
    'api', '-X', 'GET', 'search/repositories',
    '-f', `q=${q}`, '-f', 'sort=stars', '-f', 'order=desc', '-f', `per_page=${Math.min(limit, 10)}`,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000 });
  return (JSON.parse(raw).items || []);
}

async function defaultWebSignals(query, fetchFn = fetch) {
  const readJson = async (url) => {
    try {
      const r = await fetchFn(url, { headers: { 'user-agent': 'a-to-mind-autosalvage-repo-agent/1' }, signal: AbortSignal.timeout(8000) });
      return r.ok ? await r.json() : null;
    } catch (_) { return null; }
  };
  const q = encodeURIComponent(query);
  const [hn, npm] = await Promise.all([
    readJson(`https://hn.algolia.com/api/v1/search?tags=show_hn&hitsPerPage=5&query=${q}`),
    readJson(`https://registry.npmjs.org/-/v1/search?size=5&text=${q}`),
  ]);
  return extractRepoSlugs({ hnHits: (hn && hn.hits) || [], npmObjects: (npm && npm.objects) || [] });
}

/** Run one bounded scout pass. Pure/offline when searchGh & webSignals are injected. */
export async function runRepoAgent({
  gaps = [],
  misses = [],
  frontierMd = '',
  outsideDoc = { sources: [] },
  state = { asked: {} },
  now = Date.now(),
  maxQueries = HARD_QUERY_CAP,
  minStars = 75,
  perQuery = 5,
  searchGh = defaultGhSearch,
  lookupRepo = null,
  webSignals = defaultWebSignals,
} = {}) {
  const all = collectQueries({ gaps, misses, frontierMd });
  const chosen = selectQueries(all, state, { now, limit: maxQueries });
  const existing = new Set((outsideDoc.sources || []).map((s) => String(s.id || '').toLowerCase()));
  const nextAsked = { ...(state.asked || {}) };
  const found = [];

  for (const item of chosen) {
    nextAsked[item.query] = now;
    let repos = [];
    try { repos = await searchGh(item.query, perQuery); } catch (_) { repos = []; }
    if (lookupRepo && webSignals) {
      const extraSlugs = (await webSignals(item.query)).slice(0, 3);
      for (const slug of extraSlugs) {
        if (existing.has(slug.toLowerCase())) continue;
        try { const meta = await lookupRepo(slug); if (meta) repos.push(meta); } catch (_) { /* ignore unreadable slug */ }
      }
    }
    const vetted = vetRepos(repos, item.gap, existing, { minStars }).slice(0, 3);
    for (const v of vetted) { existing.add(v.id.toLowerCase()); found.push(v); }
  }

  const merged = mergeOutside(outsideDoc, found);
  return {
    agent: AGENT_NAME,
    queriesConsidered: all.length,
    queriesRun: chosen.map((c) => c.query),
    added: merged.added,
    outsideDoc: merged.doc,
    state: { asked: nextAsked, lastRunAt: new Date(now).toISOString() },
  };
}

const readJsonSafe = (p, d) => { try { return JSON.parse(readFileSync(resolve(root, p), 'utf8')); } catch (_) { return d; } };
const readTextSafe = (p) => { try { return readFileSync(resolve(root, p), 'utf8'); } catch (_) { return ''; } };

async function cli() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const gaps = [];
  let maxQueries = HARD_QUERY_CAP, minStars = 75;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--gap' && args[i + 1]) gaps.push(args[++i]);
    else if (args[i] === '--limit' && args[i + 1]) maxQueries = Number(args[++i]) || HARD_QUERY_CAP;
    else if (args[i] === '--min-stars' && args[i + 1]) minStars = Number(args[++i]) || 75;
  }
  const outsideDoc = readJsonSafe(OUTSIDE, { sources: [] });
  const state = readJsonSafe(STATE_FILE, { asked: {} });
  const frontierMd = readTextSafe('domains/void.frontier.md');
  const lookupRepo = (slug) => JSON.parse(execFileSync('gh', ['api', 'repos/' + slug], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 }));

  const res = await runRepoAgent({ gaps, frontierMd, outsideDoc, state, maxQueries, minStars, lookupRepo });
  if (write) {
    // only these two files: this agent never commits a tree, and it must not write anywhere else
    for (const rel of [OUTSIDE, STATE_FILE]) if (!WRITE_PATHS.includes(rel)) throw new Error('repo-agent will not write ' + rel);
    writeFileSync(resolve(root, OUTSIDE), JSON.stringify(res.outsideDoc, null, 2) + '\n');
    writeFileSync(resolve(root, STATE_FILE), JSON.stringify(res.state, null, 2) + '\n');
  }
  console.log(`${AGENT_NAME}: ran ${res.queriesRun.length}/${HARD_QUERY_CAP} max queries, vetted ${res.added.length} new source(s)${write ? ' (written)' : ' (dry-run; pass --write to save)'}`);
  for (const r of res.added) console.log(`  + [${r.license}] ${r.id} -> ${r.target} (${r.gap})`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cli().catch((e) => { console.error(e.message || e); process.exitCode = 1; });
}

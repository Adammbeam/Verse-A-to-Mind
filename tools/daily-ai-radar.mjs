#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SEEN = resolve(root, 'data', 'ai-radar-seen.json');
const INVENTORY = resolve(root, 'void-live-deploy', 'skills', 'inventory.js');

const UA = { 'user-agent': 'VerseRadar/1.0 (https://a-to-mind.com)', accept: 'application/json' };

async function fetchJson(url, ms = 10000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: UA });
    if (!r.ok) return null;
    return await r.json();
  } catch (_) { return null; }
  finally { clearTimeout(t); }
}

async function fetchText(url, ms = 10000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: UA });
    if (!r.ok) return null;
    return await r.text();
  } catch (_) { return null; }
  finally { clearTimeout(t); }
}

async function discoverGitHub() {
  const out = [];
  const html = await fetchText('https://github.com/trending?since=daily&spoken_language_code=en', 15000);
  if (!html) return out;
  for (const m of html.matchAll(/<h2[^>]*>[\s\S]*?<a[^>]*href="\/([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const repo = m[1].trim();
    const name = m[2].replace(/<[^>]+>/g, '').trim();
    if (!repo || !name) continue;
    if (/\b(ai|ml|llm|model|neural|transformer|diffusion|agent|rag|vector|embedding)\b/i.test(repo + ' ' + name)) {
      out.push({ source: 'github', name, repo: 'https://github.com/' + repo, topic: name });
    }
  }
  return out.slice(0, 10);
}

async function discoverHuggingFace() {
  const out = [];
  const j = await fetchJson('https://huggingface.co/api/daily_papers', 10000);
  if (!j || !Array.isArray(j)) return out;
  for (const p of j.slice(0, 10)) {
    const title = p.title || p.paper?.title || '';
    const id = p.id || p.paper?.id || '';
    if (title) out.push({ source: 'huggingface', name: title, repo: 'https://huggingface.co/papers/' + id, topic: title });
  }
  return out;
}

function loadSeen() {
  try { return JSON.parse(readFileSync(SEEN, 'utf8')); } catch (_) { return { seen: [], lastRun: null }; }
}

function loadInventory() {
  try {
    const text = readFileSync(INVENTORY, 'utf8');
    const names = new Set();
    for (const m of text.matchAll(/['"]([a-z0-9-]+)['"]/g)) names.add(m[1].toLowerCase());
    return names;
  } catch (_) { return new Set(); }
}

function score(d) {
  let s = 0;
  if (/\b(tool|sdk|library|framework|api|cli|engine)\b/i.test(d.name)) s += 2;
  if (/\b(model|paper|algorithm|method|technique)\b/i.test(d.name)) s += 1;
  if (d.source === 'github') s += 1;
  if (d.source === 'huggingface') s += 1;
  return s;
}

function toJob(d) {
  return 'job: build a native Verse skill for ' + d.name + ' (discovered via ' + d.source + ')\n\nSPEC:\n1. IMPLEMENT: Build native Verse skill for ' + d.name + '\n   Source: ' + d.repo + '\n2. VERIFY: Run pre-pr.mjs and checks.mjs --changed (0 errors). Open PR to main with automerge.';
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const check = process.argv.includes('--check');

  if (check) {
    const seen = loadSeen();
    const age = seen.lastRun ? Math.round((Date.now() - new Date(seen.lastRun).getTime()) / 864e5) : Infinity;
    console.log(age <= 1 ? 'ok: seen ledger fresh (' + age + ' day(s))' : 'stale: ' + age + ' day(s) since last run');
    process.exit(age <= 1 ? 0 : 1);
  }

  console.log('Fetching daily AI discoveries...');
  const [gh, hf] = await Promise.all([discoverGitHub(), discoverHuggingFace()]);
  const all = [...gh, ...hf];
  console.log('Found ' + all.length + ' raw discoveries');

  const seen = loadSeen();
  const seenSet = new Set(seen.seen || []);
  const inventory = loadInventory();

  const novel = [];
  for (const d of all) {
    const key = d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60);
    if (seenSet.has(key)) continue;
    const words = d.name.toLowerCase().split(/\s+/);
    if (words.some((w) => w.length > 4 && inventory.has(w))) continue;
    novel.push(d);
  }

  novel.sort((a, b) => score(b) - score(a));
  const top = novel.slice(0, 3);

  console.log('Net-new discoveries: ' + novel.length + ', top ' + top.length + ' selected');

  for (const d of top) {
    console.log('\n--- ' + d.name + ' (' + d.source + ') ---');
    console.log(toJob(d));
    if (!dryRun) seenSet.add(d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60));
  }

  if (!dryRun) {
    seen.seen = [...seenSet];
    seen.lastRun = new Date().toISOString();
    mkdirSync(dirname(SEEN), { recursive: true });
    writeFileSync(SEEN, JSON.stringify(seen, null, 2) + '\n');
    console.log('\nSeen ledger updated: ' + seen.seen.length + ' entries');
  } else {
    console.log('\n(dry run: seen ledger not updated)');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

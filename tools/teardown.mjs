// Teardown writes teardown/<slug>/{map.json,spec.md,gaps.md,jobs.md} from a public https address or owner/name.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inventory } from '../void-live-deploy/lib/teardown-repo.js';
import { parseRepo } from '../void-live-deploy/lib/repo-look.js';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const UA = 'VerseTeardown/1 (+https://a-to-mind.com/credits/)';
export const HELD = Object.freeze(['functions/api/team.js', 'team/agent.mjs', 'team/agents.txt', 'lib/team-rank.js', 'lib/guard.js', 'functions/api/automations/tick.js', 'tools/local-ship.mjs', 'salvage.json', 'void.html', 'skills/index.json', 'functions/api/ship.js', 'tools/openapi-check.mjs', 'docs/MAP.md', 'tools/real-pages.mjs', 'tools/pre-pr.mjs', '_redirects']);
const clip = (value, n = 12) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).slice(0, n).join(' ').slice(0, 80);
const words = (text) => String(text || '').toLowerCase().match(/[a-z0-9']+/g) || [];
const tokens = (text) => new Set(words(text).filter((word) => word.length > 4));
export function refuseTarget(input) {
  const raw = String(input || '').trim();
  if (!raw) return 'Give a public https address or owner and name.';
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return parseRepo(raw) ? '' : 'That is not a public repository name. Give owner and name.';
  let url; try { url = new URL(raw); } catch (_) { return 'That address could not be read.'; }
  if (url.protocol !== 'https:') return 'Only a public https address is accepted.';
  if (url.username || url.password) return 'An address that carries a password is refused.';
  if (url.port && url.port !== '443' && url.port !== '80') return 'Only the public web ports are accepted.';
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1' || host === '0.0.0.0') return 'That address is not a public page.';
  const ip = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!ip) return '';
  const n = ip.slice(1).map(Number), [a, b] = n;
  return (n.some((part) => part > 255) || a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) ? 'That address is not a public page.' : '';
}
export function slugOf(target) {
  if (!/^https:\/\//i.test(target)) return String(parseRepo(target) || 'repo').replace('/', '-').toLowerCase();
  return new URL(target).hostname.toLowerCase().replace(/^www\./, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'page';
}
function sharesRun(specText, source) {
  const src = words(source), seen = new Set(), out = words(specText);
  for (let i = 0; i + 8 <= src.length; i++) seen.add(src.slice(i, i + 8).join(' '));
  return out.some((_, i) => i + 8 <= out.length && seen.has(out.slice(i, i + 8).join(' ')));
}
function structureOf(html, url) {
  const s = String(html || ''); let path = '/'; try { path = new URL(url).pathname || '/'; } catch (_) { path = '/'; }
  const abs = (href) => { try { return new URL(href, url).pathname; } catch (_) { return ''; } };
  const paths = [...new Set([...s.matchAll(/\shref=["']([^"'#]{1,180})["']/gi)].map((m) => abs(m[1])).filter((item) => item.startsWith('/') && !item.includes('..')))].slice(0, 40);
  const forms = [...s.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)].slice(0, 8).map((m) => ({ action_path: abs((m[1].match(/action=["']([^"']*)["']/i) || [])[1] || path) || path, method: ((m[1].match(/method=["']([^"']*)["']/i) || [])[1] || 'get').toLowerCase(), fields: [...m[2].matchAll(/<input\b([^>]*)>/gi)].slice(0, 12).map((tag) => ({ type: ((tag[1].match(/type=["']([^"']*)["']/i) || [])[1] || 'text').toLowerCase(), required: /\brequired\b/i.test(tag[1]) })) }));
  return { path, headings: [...s.matchAll(/<h([1-6])\b[^>]*>([^<]{0,80})/gi)].slice(0, 30).map((m) => ({ level: Number(m[1]), words: clip(m[2], 6) })), forms, buttons: (s.match(/<button\b/gi) || []).length, api_paths: paths.filter((item) => item.startsWith('/api/')) };
}
async function load(spec) { try { return await import(spec); } catch (e) { if (e && e.code === 'ERR_MODULE_NOT_FOUND') return null; throw e; } }
function pick(mod, names) { if (!mod) return null; for (const name of names) if (typeof mod[name] === 'function') return mod[name]; return typeof mod.default === 'function' ? mod.default : null; }
async function askFree(env, messages) {
  if (env && env.AI && typeof env.AI.run === 'function') {
    try { const { models } = await import('../void-live-deploy/lib/models.js'); const res = await env.AI.run(models('answer'), { messages, max_tokens: 700 }); const text = String((res && (res.response || res.result)) || '').trim(); if (text) return text; } catch (_) { /* Groq is the next free host */ }
  }
  const { answerFree } = await import('../void-live-deploy/lib/agent-providers.js');
  const got = await answerFree(env || {}, messages, { only: 'groq' });
  return got && got.text ? got.text : '';
}
function parseSpec(text) {
  const raw = String(text || ''), start = raw.indexOf('{'), end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { const json = JSON.parse(raw.slice(start, end + 1)); return json && Array.isArray(json.features) ? json : null; } catch (_) { return null; }
}
function verseInventory(root) {
  const out = [], add = (name, path, body) => out.push({ name: clip(name, 8), path, words: String(body || name).slice(0, 400) });
  try { for (const file of readdirSync(resolve(root, 'docs/map.d'))) if (file.endsWith('.md')) add(file.replace(/\.md$/, ''), 'docs/map.d/' + file, readFileSync(resolve(root, 'docs/map.d', file), 'utf8')); } catch (_) { /* map notes are evidence */ }
  try { const skills = JSON.parse(readFileSync(resolve(root, 'void-live-deploy/skills/index.json'), 'utf8')); if (Array.isArray(skills)) for (const name of skills) if (typeof name === 'string') add(name, 'skills/' + name + '.js', name); } catch (_) { /* the skills list is evidence */ }
  return out;
}
function fallbackGaps(spec, rows) {
  return (spec.features || []).map((feature) => {
    const mine = tokens(feature.name); let best = { score: 0, path: '' };
    for (const item of rows) { let hit = 0; const theirs = tokens(item.name + ' ' + item.words); for (const word of mine) if (theirs.has(word)) hit += 1; const score = mine.size ? hit / mine.size : 0; if (score > best.score) best = { score, path: item.path }; }
    const verdict = best.score >= 0.6 ? 'has' : best.score >= 0.3 ? 'part' : 'gap';
    return { feature: clip(feature.name, 12), verdict, evidence: verdict === 'gap' ? '' : best.path };
  });
}
function fallbackJobs(rows, held) {
  const jobs = [];
  for (const row of rows) {
    if (row.verdict !== 'gap') continue;
    const slug = clip(row.feature, 8).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'gap';
    const files = ['void-live-deploy/lib/td-' + slug + '.js', 'tools/td-' + slug + '.test.mjs'];
    if (files.some((file) => held.some((item) => file === item || file.endsWith('/' + item)))) continue;
    jobs.push({ id: 'TD-' + (jobs.length + 1), goal: row.feature, files });
  }
  const markdown = jobs.map((job) => '## ' + job.id + '\nGoal: ' + job.goal + '\nFiles: ' + job.files.join(', ') + '\nChange: add the smallest piece for this gap\nTest: node --test ' + job.files[1] + '\nDone proof: the test exits 0\nDepends on: none\n').join('\n') || 'No gaps.\n';
  return { markdown, json: jobs };
}
function specMarkdown(spec) {
  const areas = Object.entries((spec.api && spec.api.ops_by_area) || {}).map(([key, n]) => clip(key, 4) + ' ' + n).join(', ');
  const lines = ['# Feature spec', '', 'Target: ' + clip(spec.target, 20), ''];
  if (areas) lines.push('API areas: ' + areas, '');
  for (const feature of spec.features || []) lines.push('## ' + clip(feature.name, 12), 'Flow: ' + (feature.flow || []).map((step) => clip(step, 8)).join(', '), 'States: ' + (feature.states || []).map((step) => clip(step, 4)).join(', '), '');
  return lines.join('\n');
}
function gapsMarkdown(rows) {
  const lines = ['# Gaps', '', ...rows.map((row) => '- ' + clip(row.feature, 12) + ': ' + (row.verdict || 'gap') + (row.evidence ? ' (' + clip(row.evidence, 12) + ')' : ''))];
  if (lines.length === 2) lines.push('None.');
  return lines.join('\n') + '\n';
}
export async function run(argv = [], io = {}) {
  const post = argv.includes('--post'), target = argv.filter((arg) => arg !== '--post').find((arg) => arg && !arg.startsWith('--'));
  const out = io.out || ((line) => console.log(line)), err = io.err || ((line) => console.error(line)), reason = refuseTarget(target);
  if (reason) { err(reason); return 1; }
  const root = io.root || ROOT, cwd = io.cwd || root, fetchFn = io.fetchFn || globalThis.fetch;
  const ask = io.ask || ((messages) => askFree(io.env === undefined ? process.env : io.env, messages)), spawn = io.spawn || spawnSync;
  let map, source = '';
  if (/^https:\/\//i.test(target)) {
    const fetchPublic = pick(io.fetchMod || await load('../void-live-deploy/lib/teardown-fetch.js'), ['fetchPublic', 'fetchSite', 'crawl', 'teardownFetch']);
    const mapPage = pick(io.mapMod || await load('../void-live-deploy/lib/teardown-map.js'), ['mapPage', 'mapPages']);
    let bundle;
    try {
      if (fetchPublic) bundle = await fetchPublic(target, { fetchFn, env: io.env });
      else {
        const res = await fetchFn(target, { redirect: 'manual', headers: { 'user-agent': UA, accept: 'text/html' } }), status = Number(res && res.status) || 0;
        bundle = status >= 300 && status < 400 ? { ok: false, reason: 'A redirect was not followed.' } : status && status !== 200 ? { ok: false, reason: 'The public page could not be read.' } : { ok: true, pages: [{ url: target, html: String(typeof res.text === 'function' ? await res.text() : '').slice(0, 500 * 1024) }] };
      }
    } catch (_) { err('The public page could not be read.'); return 1; }
    if (!bundle || bundle.ok === false) { err((bundle && bundle.reason) || 'The public page could not be read.'); return 1; }
    const pages = Array.isArray(bundle.pages) ? bundle.pages : [{ url: target, html: bundle.html || '' }];
    source = pages.map((item) => item.html || '').join('\n').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 20000);
    map = { url: target, pages: pages.map((item) => { const shaped = mapPage ? mapPage(item.html || '', item.url || target) : null; return shaped && shaped.headings ? shaped : structureOf(item.html || '', item.url || target); }) };
  } else {
    let found; try { found = await inventory(target, fetchFn); } catch (_) { err('The public repository could not be read.'); return 1; }
    if (!found.ok) { err(found.reason); return 1; }
    source = (found.headings || []).map((item) => item.words).join(' ');
    map = { url: 'repo:' + found.repo, pages: [], repo: { license: found.license, verdict: found.verdict, headings: found.headings, openapi: found.openapi, graphql: found.graphql } };
  }
  const specFn = pick(io.specMod || await load('../void-live-deploy/lib/teardown-spec.js'), ['spec', 'teardownSpec', 'writeSpec']);
  let made;
  if (specFn) { try { made = await specFn(map, source, { ask }); } catch (_) { err('The spec could not be written.'); return 1; } if (!made || made.ok === false) { err((made && made.reason) || 'The spec was refused.'); return 1; } }
  else {
    const prompt = 'Reply with JSON only: {"features":[{"name":"","flow":[""],"states":[""],"data":{}}]}. Use your own words for this structure. ' + JSON.stringify(map).slice(0, 3500);
    let parsed = parseSpec(await ask([{ role: 'user', content: prompt }]));
    if (parsed && sharesRun(JSON.stringify(parsed), source)) parsed = parseSpec(await ask([{ role: 'user', content: 'Use none of the source wording. ' + prompt }]));
    if (!parsed || sharesRun(JSON.stringify(parsed), source)) { err(parsed ? 'copied' : 'The model did not return a spec.'); return 1; }
    made = parsed;
  }
  const features = (made.features || []).map((feature) => ({ name: clip(feature.name, 12), flow: Array.isArray(feature.flow) ? feature.flow.map((step) => clip(step, 8)) : [], states: Array.isArray(feature.states) ? feature.states.map((step) => clip(step, 4)) : [], data: feature.data && typeof feature.data === 'object' ? feature.data : {} }));
  const areas = {};
  for (const item of map.pages || []) for (const apiPath of item.api_paths || []) { const seg = String(apiPath).split('/').filter(Boolean)[0] || 'root'; areas[seg] = (areas[seg] || 0) + 1; }
  if (map.repo && map.repo.openapi) for (const [key, n] of Object.entries(map.repo.openapi.by_segment || {})) areas[key] = n;
  const spec = { target, features, api: { ops_by_area: (made.api && made.api.ops_by_area) || areas } }, known = verseInventory(root);
  const gapFn = pick(io.gapMod || await load('../void-live-deploy/lib/teardown-gap.js'), ['gaps', 'gapList', 'teardownGap']);
  const jobsFn = pick(io.jobsMod || await load('../void-live-deploy/lib/teardown-jobs.js'), ['jobs', 'toJobs', 'teardownJobs']);
  const gapRows = gapFn ? await gapFn(spec, known) : fallbackGaps(spec, known);
  const rows = Array.isArray(gapRows) ? gapRows : (gapRows && gapRows.gaps) || [];
  const jobPack = jobsFn ? await jobsFn(rows, { prefix: 'TD', held: HELD }) : fallbackJobs(rows, HELD);
  const markdown = String((jobPack && (jobPack.markdown || jobPack.md)) || ''), jobsJson = (jobPack && (jobPack.json || jobPack.jobs)) || [];
  const slug = slugOf(target), dir = resolve(cwd, 'teardown', slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'map.json'), JSON.stringify(map, null, 2) + '\n');
  writeFileSync(resolve(dir, 'spec.md'), specMarkdown(spec));
  writeFileSync(resolve(dir, 'gaps.md'), gapsMarkdown(rows));
  writeFileSync(resolve(dir, 'jobs.md'), markdown.replace(/\s*$/, '\n') + (markdown.includes('```json') ? '' : '\n```json\n' + JSON.stringify(jobsJson, null, 2) + '\n```\n'));
  const lines = ['Teardown ' + slug, 'Features ' + features.length + ', gaps ' + rows.filter((row) => row.verdict === 'gap').length + ', jobs ' + (Array.isArray(jobsJson) ? jobsJson.length : 0), 'Wrote teardown/' + slug + '/map.json spec.md gaps.md jobs.md'];
  for (const line of lines) out(line);
  if (!post) return 0;
  const posted = spawn(process.execPath, ['team/agent.mjs', 'post', 'general', lines.join(' | ')], { cwd: resolve(root, 'void-live-deploy'), encoding: 'utf8' });
  if (posted && posted.status) { err('The crew room did not take the summary.'); return posted.status || 1; }
  return 0;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await run(process.argv.slice(2));

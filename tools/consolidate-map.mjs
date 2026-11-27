// What still exists twice, and which copy is the one to keep.
//   node tools/consolidate-map.mjs            print the map
//   node tools/consolidate-map.mjs --write    write docs/consolidation-map.md
// Nothing is removed. An old address redirects. An old name stays as an alias. A public path never names another site.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'void-live-deploy');
const OLD = /#(?:6d4aff|a58bff|8b7bff|8f7bff|5b36f0|0b0a10|f7f6fb|07060d|07060b)/i;
const SKIP = new Set(['vendor', 'node_modules', 'lab']);

/** visitor weight for a job people search for. Pure. */
export const WEIGHT = Object.freeze({
  calculator: 100, converter: 96, words: 92, color: 90, password: 88, pdf: 86, photo: 84,
  time: 82, stopwatch: 80, weather: 78, translate: 76, random: 74, tempo: 72, flights: 68,
  base64: 64, news: 60, music: 58, markets: 56,
});
/** one standard path and name per job. A path match beats a word match. Pure data. */
export const JOBS = Object.freeze([
  { id: 'calculator', name: 'Calculator', standard: '/calculator/', path: /^\/(?:calculator|calculators|vat|factorials|hosting)\// },
  { id: 'converter', name: 'Unit converter', standard: '/convert/', path: /^\/convert\// },
  { id: 'file-converter', name: 'File converter', standard: '/converter/', path: /^\/converter\// },
  { id: 'words', name: 'Word counter', standard: '/word-count/', path: /^\/(?:word-count|text-diff)\// },
  { id: 'color', name: 'Color picker', standard: '/color/', path: /^\/color\// },
  { id: 'password', name: 'Password generator', standard: '/password/', path: /^\/password\// },
  { id: 'pdf', name: 'PDF editor', standard: '/pdf/', path: /^\/pdf\// },
  { id: 'photo', name: 'Photo editor', standard: '/photos/', path: /^\/photos\// },
  { id: 'time', name: 'Time zones', standard: '/time/', path: /^\/time\// },
  { id: 'stopwatch', name: 'Stopwatch and timer', standard: '/stopwatch/', path: /^\/stopwatch\// },
  { id: 'weather', name: 'Weather', standard: '/weather/', path: /^\/weather\// },
  { id: 'translate', name: 'Translate', standard: '/translate/', path: /^\/translate\// },
  { id: 'random', name: 'Random', standard: '/random/', path: /^\/random\// },
  { id: 'tempo', name: 'Metronome', standard: '/metronome/', path: /^\/(?:metronome|bpm)\// },
  { id: 'flights', name: 'Flights', standard: '/flights/', path: /^\/flights\// },
  { id: 'base64', name: 'Base64', standard: '/base64/', path: /^\/base64\// },
  { id: 'news', name: 'News', standard: '/news/', path: /^\/news\// },
  { id: 'music', name: 'Music tools', standard: '/music/', path: /^\/(?:music|piano|tuner|chords)\// },
  { id: 'markets', name: 'Markets', standard: '/markets/', path: /^\/markets\// },
]);

const textOf = (html, re) => { const m = String(html || '').match(re); return m ? m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : ''; };
/** headings a page paints, in order. Pure. */
export const headingsOf = (html) => [...String(html || '').matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi)]
  .map((m) => m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).filter((h) => h && h.length < 120);
const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** one page's facts. Pure. */
export function pageFacts(route, html, mtime = 0) {
  const title = textOf(html, /<title>([\s\S]*?)<\/title>/i);
  const h1 = textOf(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const job = JOBS.find((j) => j.path.test(route)) || null;
  return {
    route, title, h1, headings: headingsOf(html), mtime, job: job && job.id,
    verseCss: html.includes('/verse.css'), vsTool: /\bvs-tool\b/.test(html),
    shell: html.includes('verse-shell.js'), modes: html.includes('v-modes') || /mode=/.test(html),
    homemade: /id="mnav"/.test(html), oldPalette: OLD.test(html) && !html.includes('/verse.css'),
  };
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const file = join(dir, name);
    if (statSync(file).isDirectory()) walk(file, acc);
    else if (name.endsWith('.html')) acc.push(file);
  }
  return acc;
}

/** every visitor page under the site, except the home copies. */
export function scanPages(dir = site) {
  const out = [];
  for (const file of walk(dir)) {
    const rel = '/' + relative(dir, file).split('\\').join('/');
    if (rel === '/index.html' || rel === '/void.html') continue;
    const route = rel.endsWith('/index.html') ? rel.slice(0, -'index.html'.length) : rel;
    out.push(pageFacts(route, readFileSync(file, 'utf8'), statSync(file).mtimeMs));
  }
  return out;
}

/** how current a page's layout is. Higher wins. Pure. */
export const layoutScore = (p) => (p.shell ? 4 : 0) + (p.vsTool ? 2 : 0) + (p.verseCss ? 2 : 0) + (p.modes ? 1 : 0) - (p.homemade ? 1 : 0) - (p.oldPalette ? 2 : 0);

/** the copy to keep: the standard path when it is in the group, else the newest layout, then the shortest path. Pure. */
export function canonicalOf(members, standard) {
  const list = members.slice();
  const named = standard && list.find((p) => p.route === standard);
  if (named) return named;
  list.sort((a, b) => layoutScore(b) - layoutScore(a) || b.mtime - a.mtime || a.route.length - b.route.length);
  return list[0];
}

/** headings a copy has that the canonical page does not. Pure. */
export const lacks = (canonical, copy) => {
  const have = new Set((canonical.headings || []).map(norm));
  return (copy.headings || []).map(norm).filter((h) => h && !have.has(h));
};

/** a redirect path on this site, never a foreign host. A modes file opens that mode of the kept page. Pure. */
export function redirectTo(route, canonical) {
  if (!canonical || route === canonical.route) return null;
  const base = canonical.route;
  if (!base.startsWith('/') || /https?:|\/\//.test(base)) return null;
  const mode = String(route).match(/\/modes\/([a-z0-9-]+)(?:\.html|\/)?$/i);
  const to = mode ? base + (base.includes('?') ? '&' : '?') + 'mode=' + mode[1] : base;
  if (!to.startsWith('/') || /https?:|\/\//.test(to)) return null;
  return { from: route, to };
}

function groupId(page) {
  if (page.job) return 'job:' + page.job;
  const h = norm(page.h1);
  return h.length >= 8 ? 'h1:' + h : null;
}

/** groups of two or more pages that do one job. Pure given the page list. */
export function groupPages(pages) {
  const buckets = new Map();
  for (const page of pages) {
    const id = groupId(page);
    if (!id) continue;
    if (!buckets.has(id)) buckets.set(id, []);
    buckets.get(id).push(page);
  }
  const groups = [];
  for (const [id, members] of buckets) {
    if (members.length < 2) continue;
    const job = JOBS.find((j) => id === 'job:' + j.id);
    const canonical = canonicalOf(members, job && job.standard);
    const copies = members.filter((p) => p.route !== canonical.route).sort((a, b) => a.route.localeCompare(b.route));
    const exact = copies.filter((p) => norm(p.h1) && norm(p.h1) === norm(canonical.h1)).length;
    const weight = (job && WEIGHT[job.id]) || 20;
    const impact = Math.round(weight * (1 + 0.35 * (members.length - 1) + (exact ? 1.2 : 0)));
    groups.push({
      id, name: job ? job.name : canonical.h1, standard: job ? job.standard : canonical.route,
      impact, exact, canonical, copies: copies.map((p) => ({ route: p.route, h1: p.h1, missing: lacks(p, canonical).slice(0, 6), extra: lacks(canonical, p).slice(0, 6), homemade: p.homemade, oldPalette: p.oldPalette })),
      redirects: copies.map((p) => redirectTo(p.route, canonical)).filter(Boolean),
    });
  }
  groups.sort((a, b) => b.impact - a.impact || a.name.localeCompare(b.name));
  return groups;
}

/** pages still on an old layout that are not already inside a merged group. */
export function standalones(pages, groups) {
  const inGroup = new Set(groups.flatMap((g) => [g.canonical.route, ...g.copies.map((c) => c.route)]));
  return pages.filter((p) => !inGroup.has(p.route) && (p.oldPalette || p.homemade || (!p.verseCss && !p.vsTool)))
    .map((p) => ({ route: p.route, h1: p.h1, why: p.oldPalette ? 'old palette' : p.homemade ? 'its own link bar' : 'no shared stylesheet' }))
    .sort((a, b) => a.route.localeCompare(b.route));
}

/** endpoints that still write their own JSON reply or their own table promise. */
export function scanHelpers(dir = site) {
  const json = [], ready = [];
  const walkJs = (d) => {
    for (const name of readdirSync(d)) {
      const file = join(d, name);
      if (statSync(file).isDirectory()) { if (name !== 'node_modules' && name !== 'vendor') walkJs(file); continue; }
      if (!name.endsWith('.js')) continue;
      const rel = relative(dir, file).split('\\').join('/');
      if (rel === 'lib/http.js' || rel === 'lib/db.js') continue;
      const text = readFileSync(file, 'utf8');
      if (/(?:const|function|let)\s+json\b/.test(text) && /Response\.json|JSON\.stringify/.test(text) && !text.includes('lib/http.js') && !text.includes("from '../http.js'") && !text.includes('from "./http.js"')) json.push(rel);
      if (/let ready = null/.test(text)) ready.push(rel);
    }
  };
  walkJs(join(dir, 'functions')); walkJs(join(dir, 'lib'));
  return { json: json.sort(), ready: ready.sort() };
}

/** skill pairs that still overlap and are not already one family. */
export function scanSkills(repo = root) {
  const skills = join(repo, 'void-live-deploy/skills');
  const family = new Map();
  for (const name of readdirSync(skills)) {
    if (!name.endsWith('.js')) continue;
    const text = readFileSync(join(skills, name), 'utf8');
    const parts = (text.match(/parts:\s*\[([^\]]{0,800})\]/) || [])[1];
    if (!parts) continue;
    const id = (text.match(/name:\s*['"]([a-z0-9-]+)['"]/) || [])[1] || name.replace(/\.js$/, '');
    for (const member of parts.match(/['"]([a-z0-9-]+)['"]/g) || []) family.set(member.slice(1, -1), id);
  }
  let pairs = [];
  try { pairs = JSON.parse(readFileSync(join(repo, 'tools/skill-overlap.json'), 'utf8')).pairs || []; } catch (_) { pairs = []; }
  const open = pairs.filter((pair) => {
    const [a, b] = String(pair).split('~');
    return !(family.get(a) && family.get(a) === family.get(b));
  });
  return { families: family.size, open: open.slice(0, 18), openCount: open.length };
}

/** the three home copies the copies check keeps identical. */
export function scanSync(repo = root) {
  const files = ['void.html', 'void-live-deploy/index.html', 'void-live-deploy/void.html'];
  const bodies = files.map((f) => { try { return readFileSync(join(repo, f), 'utf8').replace(/\r\n/g, '\n'); } catch (_) { return null; } });
  return { files, same: bodies.every((b) => b && b === bodies[0]) };
}

const HELD = ['team.js', 'agent.mjs', 'agents.txt', 'team-rank.js', 'team/index.html', 'team/app.js', 'tick.js', 'local-ship.mjs', 'news/starboard', 'salvage.json', 'void.html', 'lib/guard.js', 'tools/pre-pr.mjs', 'store files', '_redirects (add a labelled block only)', 'index.html', 'markets/stocks', 'calculator files from PR #153'];

/** the whole map. */
export function buildReport(repo = root) {
  const pages = scanPages(join(repo, 'void-live-deploy'));
  const groups = groupPages(pages);
  return { pages: pages.length, groups, standalones: standalones(pages, groups), helpers: scanHelpers(join(repo, 'void-live-deploy')), skills: scanSkills(repo), sync: scanSync(repo) };
}

/** markdown for the map. Pure. */
export function render(report) {
  const L = ['# Consolidation map', '', 'Built by `node tools/consolidate-map.mjs --write`. Nothing is deleted. An old address redirects to the kept page, and the old name stays as an alias. A redirect is a path on this site. The kept page is the job\'s standard path, or else the current layout (shared shell, `vs-tool`, `verse.css`) and the shortest path. Impact is the search weight, with a bonus for extra copies and for a shared headline.', '', '## Ranked groups', ''];
  report.groups.slice(0, 8).forEach((g, i) => {
    const copies = g.copies.map((c) => {
      const to = (g.redirects.find((r) => r.from === c.route) || {}).to;
      const extra = c.extra.length ? ' (has ' + c.extra.slice(0, 2).join('; ') + ')' : ' (headings already on the kept page)';
      return '`' + c.route + '` → `' + to + '`' + extra;
    }).join('; ');
    L.push((i + 1) + '. **' + g.name + '** (impact ' + g.impact + (g.exact ? ', same headline' : '') + '). Kept `' + g.canonical.route + '`. ' + copies);
  });
  const rest = report.groups.slice(8);
  if (rest.length) L.push('', rest.length + ' more groups: `node tools/consolidate-map.mjs`.');
  const old = report.standalones.slice(0, 8);
  L.push('', '## Pages still on an old layout', '', old.map((p) => '`' + p.route + '` (' + p.why + ')').join(', ') + (report.standalones.length > old.length ? ', and ' + (report.standalones.length - old.length) + ' more.' : '.'));
  const list = (xs) => xs.length ? xs.slice(0, 6).map((f) => '`' + f + '`').join(', ') + (xs.length > 6 ? ' and ' + (xs.length - 6) + ' more' : '') : 'none';
  L.push('', '## Helpers', '', 'JSON replies not using `lib/http.js`: ' + list(report.helpers.json) + '. Table promises still `let ready = null`: ' + list(report.helpers.ready) + '.');
  L.push('', '## Skills that still overlap', '', report.skills.openCount + ' pairs are not in one family yet (' + report.skills.families + ' members already are). First: ' + (report.skills.open.slice(0, 8).join(', ') || 'none') + '.');
  L.push('', '## Copies that must stay in step', '', report.sync.files.map((f) => '`' + f + '`').join(', ') + (report.sync.same ? ' match.' : ' differ.') + ' The copies check requires all three. Do not fold them into one file.');
  L.push('', '## Held by open pull requests', '', 'Leave these alone: ' + HELD.join(', ') + '.');
  L.push('');
  return L.join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = buildReport(root);
  const md = render(report);
  if (process.argv.includes('--write')) { writeFileSync(join(root, 'docs/consolidation-map.md'), md); console.log('wrote docs/consolidation-map.md (' + report.groups.length + ' groups)'); }
  else console.log(md);
}

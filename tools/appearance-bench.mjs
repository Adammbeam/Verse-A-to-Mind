// Runs the five problem asks in a headless browser and rewrites the benchmark table.
// The page is local. /api/answer is an empty stub, so no model is called.
// Each run appends docs/benchmark-history.jsonl. A previously passing ask that fails
// exits non-zero and writes docs/benchmark-alert.txt for the crew to post. Nothing is posted from here.
// A nightly run is: node tools/appearance-bench.mjs
// on a runner that has Chrome. Fail the job when this process exits non-zero. No workflow file is added here.
//   node tools/appearance-bench.mjs
import { createServer } from 'node:http';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync, existsSync, statSync, unlinkSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ASKS = [
  'I need a client onboarding system that runs itself.',
  'Turn weekly client reports into something I never have to think about.',
  'I keep forgetting invoices.',
  'Build me a way to track project delivery.',
  'Our support process is chaos.',
];
const FILLER = new Set('would say can able automatically automatic without human intervention thing something just really simply need want'.split(' '));
function words(text) {
  const stop = new Set('a an the of to for and or i my our'.split(' '));
  const out = [];
  for (const raw of String(text || '').toLowerCase().split(/[^a-z0-9']+/)) {
    const w = raw.replace(/'/g, '');
    if (w.length < 2 || stop.has(w)) continue;
    const s = w.length > 5 && w.endsWith('ing') ? w.slice(0, -3) : w;
    if (!out.includes(s)) out.push(s);
  }
  return out;
}
function hasStructure(text) { return /<(?:ol|ul|table|h3)\b/i.test(String(text || '')) || /(?:^|\n)\s*(?:\d+[.)]|[-*])\s+\S/.test(String(text || '')); }
function artifactCount(text) { const t = String(text || ''); return (t.match(/<li\b/gi) || []).length + (t.match(/<ol\b/gi) || []).length; }
function appearanceFails(ask, reply) {
  if (hasStructure(reply)) return false;
  const a = words(ask), b = words(reply);
  if (a.length < 2 || b.length < 2) return false;
  const extra = b.filter((w) => !a.includes(w) && !FILLER.has(w));
  return extra.length === 0 && a.filter((w) => b.includes(w)).length / a.length >= 0.5;
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOC = resolve(root, 'docs/appearance-benchmark.md');
const HISTORY = resolve(root, 'docs/benchmark-history.jsonl');
const ALERT = resolve(root, 'docs/benchmark-alert.txt');
const DEPLOY = resolve(root, 'void-live-deploy');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
const CHROME = [process.env.VOID_TEST_BROWSER, '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/opt/pw-browsers/chromium'].find((p) => p && existsSync(p)) || '';

/** replace After, Score, Appears? and Delta? for a known ask. Pure. */
export function fillTable(markdown, rows) {
  const by = new Map((rows || []).map((r) => [r.ask, r]));
  let mode = '';
  return String(markdown || '').split('\n').map((line) => {
    if (line.includes('| Before |')) mode = 'main';
    else if (line.includes('| Appearance |')) mode = 'detail';
    if (!line.startsWith('|') || line.includes('---') || !by.size) return line;
    const cells = line.split('|').slice(1, -1).map((s) => s.trim());
    const row = by.get(cells[0]);
    if (!row || mode !== 'main' || cells.length < 6) return line;
    cells[2] = row.after;
    cells[3] = String(row.score);
    cells[4] = row.appears ? '✅' : '❌';
    cells[5] = row.delta ? '✅' : '❌';
    return '| ' + cells.join(' | ') + ' |';
  }).join('\n');
}

/** Law 4: one title, one system id, and at least N-1 links across two or more artifacts. Pure. */
export function connected(card) {
  const html = String(card && card.html || '');
  const titles = (html.match(/<h2\b/gi) || []).length;
  const groups = [...html.matchAll(/data-system="([^"]+)"/g)].map((m) => m[1]);
  const arts = [...html.matchAll(/data-artifact="([^"]+)"/g)].map((m) => m[1]);
  const links = [...html.matchAll(/data-from="[^"]+"[^>]*data-to="[^"]+"/g)];
  return titles === 1 && groups.length > 0 && new Set(groups).size === 1 && arts.length >= 2 && links.length >= arts.length - 1;
}

export function rowOf(ask, card, seen) {
  const html = card && card.html || '';
  const items = (card && card.items) || [];
  const appears = !!(card && hasStructure(html) && !appearanceFails(ask, card.text || html));
  const delta = artifactCount(html) > 0;
  const composition = connected(card);
  const routing = !!(card && String(card.note || '').includes('system-design'));
  const sig = items.join('|');
  const distinct = !!sig && seen.filter((s) => s === sig).length === 1;
  const parts = [appears, delta, routing, composition, distinct].map((ok) => (ok ? 10 : 0));
  const score = parts.reduce((s, n) => s + n, 0) / parts.length;
  const pass = appears && delta && composition;
  const after = ((card && card.title) || 'nothing') + ': ' + (items.slice(0, 8).join(', ') || 'no artifacts');
  return { ask, after: after.replace(/\|/g, '/').slice(0, 220), score, appears, delta, composition, pass };
}

/** asks that passed last time and fail now. Pure. */
export function regressions(prev, rows) {
  const before = new Map(((prev && prev.asks) || []).map((a) => [a.ask, a]));
  return (rows || []).filter((r) => { const old = before.get(r.ask); return !!(old && old.pass && !r.pass); }).map((r) => r.ask);
}

export function historyRecord(rows, sha, date) {
  return {
    date, commit: sha,
    asks: rows.map((r) => ({ ask: r.ask, appears: !!r.appears, delta: !!r.delta, composition: !!r.composition, score: r.score, pass: !!r.pass })),
    pass: rows.filter((r) => r.pass).length, total: rows.length,
  };
}

export function jobLine(asks, sha) {
  return asks.map((a) => '- learn to handle "' + a + '" (appearance benchmark regressed at ' + sha + ')').join('\n') + '\n';
}

function lastHistory(text) {
  const lines = String(text || '').trim().split('\n').filter(Boolean);
  if (!lines.length) return null;
  try { return JSON.parse(lines[lines.length - 1]); } catch { return null; }
}

function serve() {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    if (path.startsWith('/api/')) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(path.includes('answer') ? '{"answer":"","sources":[]}' : '{}'); return; }
    if (path.includes('..')) { res.writeHead(400); res.end(); return; }
    const rel = path === '/' ? '/index.html' : path;
    const file = join(DEPLOY, rel);
    if (!file.startsWith(DEPLOY + '/') || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'text/plain' });
    res.end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

async function readOne(page, ask) {
  await page.goto('about:blank');
  await page.goto('http://' + page._base + '/');
  await page.waitForSelector('#input', { timeout: 20000 });
  await page.waitForFunction(() => document.documentElement.dataset.skills === 'ready', { timeout: 45000 });
  await page.fill('#input', ask);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => {
    const el = document.querySelector('.vpage');
    return !!(el && el.querySelector('ol'));
  }, { timeout: 15000 }).catch(() => {});
  return page.evaluate(() => {
    const el = document.querySelector('.vpage');
    if (!el) return null;
    let note = '';
    try { note = (JSON.parse(localStorage.getItem('a2m.void.loop.v1') || '[]').slice(-1)[0] || {}).note || ''; } catch { note = ''; }
    return {
      title: (el.querySelector('h2') || {}).textContent || '',
      heads: [...el.querySelectorAll('h3')].map((h) => h.textContent.trim()),
      items: [...el.querySelectorAll('li')].map((li) => li.textContent.trim()),
      text: (el.innerText || '').slice(0, 2000),
      html: el.innerHTML || '',
      note,
    };
  });
}

export async function collect() {
  if (!CHROME) throw new Error('no Chrome (set VOID_TEST_BROWSER)');
  const { chromium } = await import('playwright-core');
  const server = await serve();
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  page._base = '127.0.0.1:' + server.address().port;
  const cards = [];
  try {
    for (const ask of ASKS) cards.push(await readOne(page, ask));
  } finally {
    await browser.close().catch(() => {});
    server.close();
  }
  const sigs = cards.map((c) => ((c && c.items) || []).join('|'));
  return ASKS.map((ask, i) => rowOf(ask, cards[i], sigs));
}

function shaOf() {
  try { return execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8' }).trim(); } catch { return ''; }
}

async function main() {
  if (!existsSync(DOC)) { console.error('docs/appearance-benchmark.md is not on this branch yet; nothing rewritten'); return; }
  const rows = await collect();
  writeFileSync(DOC, fillTable(readFileSync(DOC, 'utf8'), rows));
  const sha = shaOf();
  const prev = existsSync(HISTORY) ? lastHistory(readFileSync(HISTORY, 'utf8')) : null;
  const broke = regressions(prev, rows);
  appendFileSync(HISTORY, JSON.stringify(historyRecord(rows, sha, new Date().toISOString().slice(0, 10))) + '\n');
  for (const r of rows) console.log((r.appears ? 'appears' : 'MISS') + ' ' + (r.delta ? 'delta' : 'text') + ' ' + (r.composition ? 'linked' : 'ISOLATED') + ' ' + r.score + '  ' + r.ask);
  if (broke.length) {
    const text = 'Appearance benchmark regressed at ' + sha + '\n' + jobLine(broke, sha);
    writeFileSync(ALERT, text);
    console.error(text.trim());
    process.exit(1);
  }
  if (existsSync(ALERT)) unlinkSync(ALERT);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
}

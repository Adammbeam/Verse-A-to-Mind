// Headless five-ask bench. /api/answer is stubbed. A regression writes docs/benchmark-alert.txt and does not revert.
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
const BASELINE = resolve(root, 'docs/benchmark-baseline.json');
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
const TOPIC = [
  [/invoice|unpaid|\bbills?\b|billing/, ['invoice', 'unpaid', 'bill', 'billing', 'reminder']],
  [/onboard|new client|client setup|\bwelcome\b|new account/, ['onboard', 'client', 'welcome']],
  [/report|weekly|status note|summaries/, ['report', 'weekly']],
  [/project|milestone|delivery|on time/, ['project', 'milestone', 'delivery']],
  [/support|ticket/, ['support', 'ticket', 'queue']],
];
export function onTopic(ask, card) {
  const t = String(ask || '').toLowerCase();
  const blob = [card && card.title, card && card.text, ...((card && card.items) || [])].join(' ').toLowerCase();
  let words = null;
  for (const [re, w] of TOPIC) if (re.test(t)) words = w;
  return !!words && words.some((w) => blob.includes(w));
}
export function rowOf(ask, card, seen) {
  const html = card && card.html || '';
  const items = (card && card.items) || [];
  const appears = !!(card && hasStructure(html) && !appearanceFails(ask, card.text || html) && onTopic(ask, card));
  const delta = artifactCount(html) > 0;
  const composition = connected(card);
  const routing = !!(card && String(card.note || '').includes('system-design'));
  const sig = items.join('|');
  const distinct = !!sig && seen.filter((s) => s === sig).length === 1;
  const parts = [appears, delta, routing, composition, distinct].map((ok) => (ok ? 10 : 0));
  const score = parts.reduce((s, n) => s + n, 0) / parts.length;
  const pass = appears && delta && composition;
  const types = [...new Set([...html.matchAll(/data-artifact="([^"]+)"/g)].map((m) => m[1]))];
  const after = ((card && card.title) || 'nothing') + ': ' + (items.slice(0, 8).join(', ') || 'no artifacts');
  return { ask, after: after.replace(/\|/g, '/').slice(0, 220), score, appears, delta, composition, pass, types };
}
/** Jaccard overlap of artifact types. 1 when both sets are empty. Pure. */
export function typeOverlap(a, b) {
  const A = new Set(a || []), B = new Set(b || []);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union ? inter / union : 1;
}
/** under 30% distinct, 30–50% watch, over 50% collapsed. Pure. */
export function overlapBand(n) {
  if (n > 0.5) return 'red';
  if (n >= 0.3) return 'yellow';
  return 'green';
}
/** Variety fails on a red pair or when every ask has the same set. Pure. */
export function variety(rows) {
  const pairs = [];
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const overlap = Math.round(typeOverlap(rows[i].types, rows[j].types) * 100) / 100;
    pairs.push({ a: rows[i].ask, b: rows[j].ask, overlap, band: overlapBand(overlap) });
  }
  const same = rows.length > 1 && rows.every((r) => JSON.stringify([...(r.types || [])].sort()) === JSON.stringify([...(rows[0].types || [])].sort()));
  return { pairs, same, ok: pairs.every((p) => p.band !== 'red') && !same };
}
/** Static text and placeholder figures are not live. A control or a ticking source is. Pure. */
export function liveOf(html) {
  const t = String(html || '');
  const placeholder = /\blorem\b|\bXX\b/i.test(t);
  const control = /<(?:input|textarea|select)\b|contenteditable=/i.test(t);
  const source = /data-live=|datetime|setInterval/i.test(t);
  return { live: (control || source) && !placeholder, placeholder, control, source };
}
/** Appearance 5/5, Delta 5/5, Composition at least 4/5, variety, average at least 8. Pure. */
export function verdict(rows, varied) {
  const n = rows.length || 1;
  const appears = rows.filter((r) => r.appears).length;
  const delta = rows.filter((r) => r.delta).length;
  const composition = rows.filter((r) => r.composition).length;
  const avg = rows.reduce((s, r) => s + Number(r.score || 0), 0) / n;
  const ok = appears === rows.length && delta === rows.length && composition >= Math.min(4, rows.length) && !!(varied && varied.ok) && avg >= 8;
  return { appears, delta, composition, total: rows.length, avg: Math.round(avg * 10) / 10, variety: !!(varied && varied.ok), ok };
}
export function compareBaseline(base, rows) {
  const before = new Map(((base && base.asks) || []).map((a) => [a.ask, a]));
  return rows.map((r) => {
    const old = before.get(r.ask) || {};
    return { ask: r.ask, appears: [!!old.appears, !!r.appears], delta: [!!old.delta, !!r.delta], score: [Number(old.score || 0), Number(r.score || 0)] };
  });
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
    let path;
    try { path = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); }
    catch (_) { res.writeHead(400); res.end(); return; }
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
  await page.waitForFunction(() => document.documentElement.dataset.skills === 'ready', { timeout: 12000 });
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

function report(rows, varied, gate, base) {
  console.log('Overlap matrix (Jaccard, fail above 0.5)');
  for (const p of varied.pairs) console.log('  ' + p.overlap.toFixed(2) + '  ' + p.a + '  ×  ' + p.b);
  console.log('Thresholds: appearance ' + gate.appears + '/' + gate.total + ' (need ' + gate.total + '), delta ' + gate.delta + '/' + gate.total + ', composition ' + gate.composition + '/' + gate.total + ' (need 4), variety ' + (gate.variety ? 'ok' : 'FAIL') + ', average ' + gate.avg + ' (need 8). ' + (gate.ok ? 'PASS' : 'FAIL'));
  if (!base) return;
  console.log('Against the main baseline:');
  for (const c of compareBaseline(base, rows)) console.log('  ' + c.ask + '  appears ' + c.appears[0] + '→' + c.appears[1] + '  delta ' + c.delta[0] + '→' + c.delta[1] + '  score ' + c.score[0] + '→' + c.score[1]);
}

async function main() {
  const baselineMode = process.argv.includes('--baseline');
  if (!baselineMode && !existsSync(DOC)) { console.error('docs/appearance-benchmark.md is not on this branch yet; running the bench without rewriting it'); }
  const rows = await collect();
  const varied = variety(rows);
  const gate = verdict(rows, varied);
  const sha = shaOf();
  const date = new Date().toISOString().slice(0, 10);
  if (baselineMode) {
    const page = sha;
    writeFileSync(BASELINE, JSON.stringify({ note: 'before: the page on main, before a composed system', date, commit: page, ...verdict(rows, varied), asks: rows }) + '\n');
    report(rows, varied, gate, null);
    console.log('wrote ' + BASELINE);
    return;
  }
  if (existsSync(DOC)) writeFileSync(DOC, fillTable(readFileSync(DOC, 'utf8'), rows));
  const prev = existsSync(HISTORY) ? lastHistory(readFileSync(HISTORY, 'utf8')) : null;
  const base = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;
  const broke = regressions(prev, rows);
  appendFileSync(HISTORY, JSON.stringify(historyRecord(rows, sha, date)) + '\n');
  report(rows, varied, gate, base);
  if (broke.length || !gate.ok) {
    const text = (broke.length ? 'Appearance benchmark regressed at ' + sha + '\n' + jobLine(broke, sha) : '') + (gate.ok ? '' : 'Benchmark below threshold at ' + sha + ': appearance ' + gate.appears + '/' + gate.total + ', delta ' + gate.delta + '/' + gate.total + ', composition ' + gate.composition + ', variety ' + gate.variety + ', average ' + gate.avg + '\n');
    writeFileSync(ALERT, text);
    console.error(text.trim());
    process.exit(1);
  }
  if (existsSync(ALERT)) unlinkSync(ALERT);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
}

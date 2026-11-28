// Verse Scoreboard. Writes docs/verse-scoreboard.md. No ask is sent to Workers AI or Groq:
// /api/answer is stubbed and every other host is blocked. A low score still writes the table.
//   node tools/verse-scoreboard.mjs --from report.json --probe --scoreboard
// --from reads a PWTSR browser report (rows with level, want, note, usable, errors).
// --probe opens the local page and records whether stage structure changed.
// --scoreboard writes docs/verse-scoreboard.md (the default path; --out replaces it).
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import http from 'node:http';
import { isRouted } from './routed.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const DOC = resolve(root, 'docs', 'verse-scoreboard.md');
const BENCH_DOC = resolve(root, 'docs', 'appearance-benchmark.md');

export function wanted(want, note) {
  if (isRouted(want, note)) return true;
  const n = String(note || '');
  return String(want || '').split('|').some((w) => {
    const s = w.replace(/^skill:/, '').trim();
    return !!s && (n === s || n.startsWith(s + '-'));
  });
}

const scored = (rows) => (rows || []).filter((r) => r && r.status !== 'expected-fail' && !r.paste && r.ask);

/** An artifact note. Article fallback, the generic "answer" paraphrase, and a blank log fail. */
export function appearancePass(note) {
  const s = String(note || '').trim();
  if (!s) return false;
  if (/article fallback/i.test(s)) return false;
  if (/^answer$/i.test(s)) return false;
  return true;
}

export function appearanceOf(rows) {
  const list = scored(rows);
  return { pass: list.filter((r) => appearancePass(r.note)).length, total: list.length };
}

/** Level 8: the wanted skill answered and a card or stage thing was usable. */
export function routingOf(rows) {
  const list = scored(rows).filter((r) => r.level === 8);
  const pass = list.filter((r) => wanted(r.want, r.note) && r.usable !== false && !(r.errors || []).length).length;
  return { pass, total: list.length };
}

export function deltaOf(rows) {
  const list = (rows || []).filter((r) => r && typeof r.delta === 'boolean');
  return { pass: list.filter((r) => r.delta).length, total: list.length };
}

/** Scores in docs/appearance-benchmark.md, or '?' when that file is missing or has no n/10. */
export function fiveAskFrom(text) {
  if (text == null) return '?';
  const hits = [...String(text).matchAll(/(\d+(?:\.\d+)?)\s*\/\s*10/g)].map((m) => m[1] + '/10');
  return hits.length ? hits.join(', ') : '?';
}

export function pct(pass, total) {
  if (!total) return '?';
  const n = Math.round(1000 * pass / total) / 10;
  return n + '% (' + pass + '/' + total + ')';
}

export function boardOf({ rows = [], probes = null, five = '?', at = new Date().toISOString(), population = '' } = {}) {
  const appearance = appearanceOf(rows);
  const routing = routingOf(rows);
  const delta = probes ? deltaOf(probes) : { pass: 0, total: 0 };
  return {
    at, population,
    appearance: pct(appearance.pass, appearance.total),
    delta: pct(delta.pass, delta.total),
    routing: pct(routing.pass, routing.total),
    composition: '?',
    five,
  };
}

export function render(board) {
  const b = board || {};
  return [
    '# Verse Scoreboard',
    '',
    'Current values are from a headless local page. `/api/answer` is stubbed and other hosts do not resolve, so an ask never reaches Workers AI or Groq.',
    '',
    'Measured: ' + (b.at || '?') + (b.population ? '. ' + b.population : ''),
    '',
    '| Metric | Current | Goal |',
    '| --- | --- | --- |',
    '| Appearance Test pass rate | ' + (b.appearance || '?') + ' | 95%+ |',
    '| Artifact Delta pass rate | ' + (b.delta || '?') + ' | 95%+ |',
    '| Natural Ask Routing accuracy | ' + (b.routing || '?') + ' | 90%+ |',
    '| Composition quality | ' + (b.composition || '?') + ' | ? |',
    '| Five Ask Benchmark | ' + (b.five || '?') + ' | 8-10/10 each |',
    '',
    '## How each metric is measured',
    '',
    '**Appearance Test.** Pass when the page loop note names an artifact. Fail when the note is `article fallback`, the generic paraphrase `answer`, or blank. A paraphrase restates the ask instead of leaving a tool. Measured on the asks in the report passed to `--from`, expected-fail rows left out.',
    '',
    '**Artifact Delta.** Pass when stage structure after the answer is not the structure before it. Structure is the stage things (`id` and `kind` in `a2m.void.state.v1`) plus the open card headings (`.vpage`). A whisper with no new thing and no new card fails. Measured by `--probe` on a fresh page per ask.',
    '',
    '**Natural Ask Routing.** Level 8 of the PWTSR case file: the ask resolved to the wanted skill (a bare note such as `timer` counts, `time` does not count as `timer`) and the result was usable. Goal 90%+. The first measured rate is 20/50.',
    '',
    '**Composition quality.** A follow-up such as "group them" or "turn it into a report" leaves one object that still contains the parts. No composition suite has been scored, so the cell stays `?`.',
    '',
    '**Five Ask Benchmark.** Read from `docs/appearance-benchmark.md` when that file exists (each `n/10` in it). The file is not in the repo yet, so the cell is `?`. Goal 8-10/10 on each ask.',
    '',
  ].join('\n');
}

function loadReport(file) {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  return Array.isArray(data) ? data : (data.rows || []);
}

export function browserExe() {
  return [process.env.VOID_TEST_BROWSER, '/usr/bin/google-chrome-stable', '/usr/local/bin/google-chrome', '/opt/pw-browsers/chromium'].find((p) => p && existsSync(p)) || '';
}

function serve(deploy) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    if (p === '/__blank') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><title>blank</title>'); }
    if (p.startsWith('/api/')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(p.includes('/answer') ? '{"answer":"","sources":[]}' : '{}');
    }
    if (p === '/') p = '/index.html';
    const f = join(deploy, p);
    if (!f.startsWith(deploy + '/') || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': types[p.slice(p.lastIndexOf('.'))] || 'text/plain' });
    res.end(readFileSync(f));
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

function snap() {
  let things = [];
  try {
    const st = JSON.parse(localStorage.getItem('a2m.void.state.v1') || '{}');
    things = Object.entries(st).map(([id, t]) => id + ':' + (t && t.kind || '')).sort();
  } catch (e) { things = []; }
  const cards = [...document.querySelectorAll('.vpage')].map((el) => ((el.querySelector('h2') || el).innerText || '').trim().slice(0, 80)).sort();
  let note = '';
  try {
    const log = JSON.parse(localStorage.getItem('a2m.void.loop.v1') || '[]');
    const last = log[log.length - 1];
    note = last ? String(last.note || '') : '';
  } catch (e) { note = ''; }
  return { things, cards, note };
}

/** Fresh page per ask. Returns { id, ask, note, delta }. */
export async function probe(asks, { deploy = resolve(root, 'void-live-deploy'), exe = browserExe() } = {}) {
  if (!exe) throw new Error('no Chrome (set VOID_TEST_BROWSER)');
  const { chromium } = await import('playwright-core'); // optional: scoring tests do not load it
  const server = await serve(deploy);
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const dir = mkdtempSync(join(tmpdir(), 'scoreboard-'));
  const ctx = await chromium.launchPersistentContext(dir, {
    executablePath: exe, headless: true, viewport: { width: 800, height: 540 }, reducedMotion: 'reduce', serviceWorkers: 'block',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'],
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  const out = [];
  try {
    for (const c of asks) {
      await page.goto(base + '__blank');
      await page.evaluate(async () => {
        localStorage.clear();
        if (indexedDB.databases) for (const d of await indexedDB.databases()) if (d.name) await new Promise((r) => { const q = indexedDB.deleteDatabase(d.name); q.onsuccess = q.onerror = q.onblocked = () => r(); });
      });
      await page.goto(base);
      await page.waitForSelector('#input', { timeout: 20000 });
      await page.waitForFunction(() => document.documentElement.dataset.skills === 'ready', { timeout: 45000 });
      const before = await page.evaluate(snap);
      await page.fill('#input', c.ask);
      await page.keyboard.press('Enter');
      await page.waitForFunction((q) => {
        try {
          const l = JSON.parse(localStorage.getItem('a2m.void.loop.v1') || '[]');
          return Array.isArray(l) && l.some((x) => String(x.ask || '').trim() === q.trim());
        } catch (e) { return false; }
      }, c.ask, { timeout: 7000 }).catch(() => {});
      const after = await page.evaluate(snap);
      const same = JSON.stringify({ things: before.things, cards: before.cards }) === JSON.stringify({ things: after.things, cards: after.cards });
      out.push({ id: c.id, ask: c.ask, level: c.level, want: c.want, note: after.note, usable: true, errors: [], delta: !same });
    }
  } finally {
    await ctx.close().catch(() => {});
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
  return out;
}

function readFive() {
  if (!existsSync(BENCH_DOC)) return '?';
  return fiveAskFrom(readFileSync(BENCH_DOC, 'utf8'));
}

async function main() {
  const args = process.argv.slice(2);
  const from = args.includes('--from') ? args[args.indexOf('--from') + 1] : '';
  const rows = from ? loadReport(resolve(from)) : [];
  const explicit = args.includes('--explicit') ? rows.filter((r) => !String(r.id || '').startsWith('summon')) : rows;
  let probes = null;
  if (args.includes('--probe')) probes = await probe(scored(explicit));
  const fileRows = rows.filter((r) => !String(r.id || '').startsWith('summon'));
  const all = appearanceOf(rows);
  const file = appearanceOf(fileRows);
  const board = boardOf({
    rows,
    probes,
    five: readFive(),
    population: 'Appearance on the full report is ' + pct(all.pass, all.total) + '. On the case file, with no per-skill example, it is ' + pct(file.pass, file.total) + '.' + (probes ? ' Delta probed on ' + probes.length + ' case-file asks.' : ''),
  });
  const md = render(board);
  if (args.includes('--scoreboard') || args.includes('--write')) {
    const out = args.includes('--out') ? resolve(args[args.indexOf('--out') + 1]) : DOC;
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, md.endsWith('\n') ? md : md + '\n');
    console.error('wrote ' + out);
  }
  console.log(md);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
}

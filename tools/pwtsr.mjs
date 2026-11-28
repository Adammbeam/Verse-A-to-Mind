// Prompt-to-working-thing success rate. Routing reuses the skill order (tools/skills-check.mjs).
// --browser opens the local page like tools/bench.mjs: /api/answer stubbed, every other host blocked.
// Nothing is sent to Workers AI or Groq. A low score prints a report and exits 0. Misses are job cards.
//   node tools/pwtsr.mjs [--no-summon] [--browser] [--out dir] [--json]
import { readFileSync, writeFileSync, mkdirSync, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import http from 'node:http';
import { isRouted } from './routed.mjs';
import { readOrder } from './skills-index.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const skillsDir = resolve(root, 'void-live-deploy', 'skills');
const CASES = resolve(here, 'pwtsr-cases.json');

export const PASTE_FACTS = ['12 March', 'Nia', 'the lease'];
export const PASTE_QUESTIONS = ['What is the launch date?', 'Who owns the budget?', 'Which risk is highest?'];

export function longPaste() {
  const para = 'Harbor Bean is opening a second shop. The launch date is 12 March. The budget owner is Nia. The highest risk is the lease. Staff training starts the week before. Nothing here is a real person or a real shop. ';
  let body = '';
  while (body.length < 5900) body += para;
  return body + '\n\nQuestions:\n' + PASTE_QUESTIONS.map((q, i) => (i + 1) + '. ' + q).join('\n');
}

export const pasteOk = (visible, facts = PASTE_FACTS) => {
  const t = String(visible || '');
  return t.trim().length >= 40 && facts.every((f) => t.toLowerCase().includes(String(f).toLowerCase()));
};

export function prepare(raw) {
  const cases = (raw || []).map((c) => c.paste ? { ...c, ask: longPaste(), facts: PASTE_FACTS, questions: PASTE_QUESTIONS, expectFail: true } : { ...c });
  const seen = new Set();
  for (const c of cases) {
    const key = String(c.ask || '').trim().toLowerCase();
    if (!key) throw new Error('case ' + (c.id || '?') + ' has no ask');
    if (seen.has(key)) throw new Error('duplicate ask: ' + key.slice(0, 80));
    seen.add(key);
    if (!c.paste && !c.want) throw new Error('case ' + c.id + ' has no want');
  }
  return cases;
}

export function withSummon(cases, skills) {
  const have = new Set(cases.map((c) => String(c.ask).trim().toLowerCase()));
  const extra = [];
  for (const s of skills || []) {
    const ask = (s.examples || [])[0];
    if (!ask || have.has(String(ask).trim().toLowerCase())) continue;
    have.add(String(ask).trim().toLowerCase());
    extra.push({ id: 'summon-' + s.name, level: 1, ask, want: 'skill:' + s.name });
  }
  return cases.concat(extra);
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);

function finish(c, o) {
  const status = c.expectFail ? 'expected-fail' : (o.right ? 'pass' : 'miss');
  return {
    id: c.id, level: c.level, ask: c.ask, want: c.want || '', got: o.got || '', note: o.note || '',
    usable: o.usable, errors: o.errors || [], right: !!o.right, status,
  };
}

// a bare note ("timer", "timer-start") is that skill, same as "skill:timer" (tools/routed.mjs). "time" is not "timer".
export function wanted(want, note) {
  if (isRouted(want, note)) return true;
  const n = String(note || '');
  return String(want || '').split('|').some((w) => { const s = w.replace(/^skill:/, '').trim(); return !!s && (n === s || n.startsWith(s + '-')); });
}

export function runRoute(cases, route) {
  return cases.map((c) => {
    if (c.paste) return finish(c, { right: false, usable: null });
    const got = route(c.ask) || '';
    const note = got ? 'skill:' + got : '';
    return finish(c, { got, note, right: wanted(c.want, note), usable: null });
  });
}

export function summarize(rows, mode) {
  const scored = rows.filter((r) => r.status === 'pass' || r.status === 'miss');
  const pass = scored.filter((r) => r.status === 'pass').length;
  const by = {};
  for (const r of scored) {
    const b = by[r.level] || (by[r.level] = { pass: 0, total: 0 });
    b.total++;
    if (r.status === 'pass') b.pass++;
  }
  return { mode, pass, total: scored.length, rate: scored.length ? pass / scored.length : 0, by };
}

export function jobsOf(rows) {
  return rows.filter((r) => r.status === 'miss').map((r) => ({
    ask: ('learn to handle "' + r.ask + '"').slice(0, 120),
    target: 'pwtsr:' + (slug(r.ask) || r.id),
    note: ('PWTSR level ' + r.level + ' missed (wanted ' + r.want + ', got ' + (r.got || 'nothing') + ')').slice(0, 300),
  }));
}

export function toMarkdown(summary, rows) {
  const pct = (n, d) => (d ? Math.round(1000 * n / d) / 10 : 0) + '%';
  const lines = ['# PWTSR', '', summary.mode + ': ' + summary.pass + '/' + summary.total + ' (' + pct(summary.pass, summary.total) + ')', '', '## By level'];
  for (const k of Object.keys(summary.by).sort((a, b) => Number(a) - Number(b))) {
    const b = summary.by[k];
    lines.push('- level ' + k + ': ' + b.pass + '/' + b.total + ' (' + pct(b.pass, b.total) + ')');
  }
  const misses = rows.filter((r) => r.status === 'miss');
  lines.push('', '## Misses (' + misses.length + ')', '');
  for (const m of misses.slice(0, 40)) lines.push('- L' + m.level + ' "' + String(m.ask).slice(0, 90) + '" wanted ' + m.want + ', got ' + (m.got || 'nothing'));
  if (misses.length > 40) lines.push('- … ' + (misses.length - 40) + ' more in the json');
  const exp = rows.filter((r) => r.status === 'expected-fail');
  if (exp.length) {
    lines.push('', '## Expected fail (not in the rate)', '');
    for (const m of exp) lines.push('- ' + m.id + ': right=' + m.right + (m.got ? ', got ' + m.got : ''));
  }
  return lines.join('\n') + '\n';
}

export async function loadSkills() {
  const skills = [];
  for (const name of readOrder()) {
    try {
      const mod = (await import(pathToFileURL(resolve(skillsDir, name + '.js')).href)).default;
      if (mod && typeof mod.match === 'function') skills.push(mod);
    } catch { /* a skill that does not load is skipped; the summon row for it never appears */ }
  }
  const route = (ask) => {
    const lower = String(ask).toLowerCase();
    for (const s of skills) {
      let hit = false;
      try { hit = s.match(lower, ask); } catch { hit = false; }
      if (hit && typeof hit.then !== 'function') return s.name;
    }
    return '';
  };
  return { skills, route };
}

export function browserExe() {
  return [process.env.VOID_TEST_BROWSER, '/usr/bin/google-chrome-stable', '/usr/local/bin/google-chrome', '/opt/pw-browsers/chromium'].find((p) => p && existsSync(p)) || '';
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };

function serve(deploy) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    if (p === '/__blank') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><title>blank</title>'); }
    if (p.startsWith('/api/')) {
      const body = p.includes('/answer') ? '{"answer":"","sources":[]}' : '{}';
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(body);
    }
    if (p === '/') p = '/index.html';
    const f = join(deploy, p);
    if (!f.startsWith(deploy + '/') || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[p.slice(p.lastIndexOf('.'))] || 'text/plain', 'cache-control': 'max-age=3600' });
    res.end(readFileSync(f));
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

export async function runBrowser(cases, { deploy = resolve(root, 'void-live-deploy'), exe = browserExe() } = {}) {
  if (!exe) throw new Error('no Chrome (set VOID_TEST_BROWSER)');
  const { chromium } = await import('playwright-core'); // optional: the routing score and the unit test run without it
  const server = await serve(deploy);
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const dir = mkdtempSync(join(tmpdir(), 'pwtsr-'));
  const ctx = await chromium.launchPersistentContext(dir, {
    executablePath: exe, headless: true, viewport: { width: 800, height: 540 }, reducedMotion: 'reduce', serviceWorkers: 'block',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'],
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e).slice(0, 160)));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const t = msg.text();
    if (/net::|Failed to load resource|ERR_|favicon/i.test(t)) return;
    errors.push(t.slice(0, 160));
  });
  const out = [];
  try {
    for (const c of cases) {
      errors.length = 0;
      await page.goto(base + '__blank');
      await page.evaluate(async () => {
        localStorage.clear(); sessionStorage.clear();
        if (indexedDB.databases) for (const d of await indexedDB.databases()) if (d.name) await new Promise((r) => { const q = indexedDB.deleteDatabase(d.name); q.onsuccess = q.onerror = q.onblocked = () => r(); });
      });
      await page.goto(base);
      await page.waitForSelector('#input', { timeout: 20000 });
      await page.waitForFunction(() => document.documentElement.dataset.skills === 'ready', { timeout: 45000 });
      errors.length = 0;
      if (c.paste) {
        await page.evaluate((text) => {
          const el = document.querySelector('#input');
          el.focus();
          const dt = new DataTransfer();
          dt.setData('text/plain', text);
          el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
        }, c.ask);
        if (await page.inputValue('#input')) await page.keyboard.press('Enter');
      } else {
        await page.fill('#input', c.ask);
        await page.keyboard.press('Enter');
      }
      const needle = c.ask.length > 200 ? c.ask.slice(0, 60) : c.ask;
      await page.waitForFunction((q) => {
        try {
          const l = JSON.parse(localStorage.getItem('a2m.void.loop.v1') || '[]');
          return Array.isArray(l) && l.some((x) => String(x.ask || '').trim() === q.trim() || (q.length >= 40 && String(x.ask || '').includes(q.slice(0, 40))));
        } catch { return false; }
      }, needle, { timeout: 7000 }).catch(() => {});
      const snap = await page.evaluate(() => {
        let log = [];
        try { log = JSON.parse(localStorage.getItem('a2m.void.loop.v1') || '[]'); } catch { log = []; }
        let things = 0;
        try { things = Object.keys(JSON.parse(localStorage.getItem('a2m.void.state.v1') || '{}')).length; } catch { things = 0; }
        const input = document.getElementById('input');
        const raw = (document.body && document.body.innerText) || '';
        const visible = input ? raw.replace(input.value || '', '') : raw;
        const last = log[log.length - 1] || null;
        return { note: last ? String(last.note || '') : '', things, card: !!document.querySelector('.vpage'), visible: visible.slice(0, 4000), whisper: ((document.getElementById('whisper') || {}).textContent) || '' };
      });
      const got = (snap.note.match(/^skill:([a-z0-9-]+)/) || [])[1] || snap.note;
      const usable = snap.things > 0 || snap.card || snap.whisper.trim().length > 1;
      const clean = errors.length === 0;
      const right = c.paste ? pasteOk(snap.visible, c.facts) && clean : wanted(c.want, snap.note) && usable && clean;
      out.push(finish(c, { got, note: snap.note, right, usable, errors: errors.slice() }));
    }
  } finally {
    await ctx.close().catch(() => {});
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
  return out;
}

function reportOf(mode, rows) {
  const summary = summarize(rows, mode);
  const jobs = jobsOf(rows);
  return { at: new Date().toISOString(), ...summary, jobs, rows };
}

async function main() {
  const args = process.argv.slice(2);
  const file = args.includes('--cases') ? resolve(args[args.indexOf('--cases') + 1]) : CASES;
  let cases = prepare(JSON.parse(readFileSync(file, 'utf8')));
  const browser = args.includes('--browser');
  let rows;
  if (browser) {
    if (!args.includes('--no-summon')) {
      const { skills } = await loadSkills();
      cases = withSummon(cases, skills);
    }
    rows = await runBrowser(cases);
  } else {
    const { skills, route } = await loadSkills();
    if (!args.includes('--no-summon')) cases = withSummon(cases, skills);
    rows = runRoute(cases, route);
  }
  const report = reportOf(browser ? 'browser' : 'routing', rows);
  const md = toMarkdown(report, rows);
  const out = args.includes('--out') ? resolve(args[args.indexOf('--out') + 1]) : '';
  if (out) { mkdirSync(out, { recursive: true }); writeFileSync(join(out, 'pwtsr.json'), JSON.stringify(report, null, 1) + '\n'); writeFileSync(join(out, 'pwtsr.md'), md); }
  console.log(args.includes('--json') ? JSON.stringify(report) : md);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
}

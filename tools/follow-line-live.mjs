// node tools/follow-line-live.mjs: the follow-on line on the live homepage is the reply's `followed`, not a guess from the page's memory.
// Three passes in a real browser at https://a-to-mind.com: a follow-up ("Who wrote Dune?" / "When was he born?") must show the line and
// the reply must carry followed:true; an unrelated pair (a colour remark / the capital of France) must hide it; and a controlled reply
// with followed:false on the same carried follow-up must hide it too. The last pass changes only the response the page receives, because
// the live route never emits false when a before ask was sent. No workflow: run by a person or by tools/checks.mjs's unit test.
import fs from 'node:fs';
// The pure verdict test is loaded by the merge gate, which has no node_modules: keep the browser
// package behind a dynamic import so importing this file needs nothing but built-in modules.

export const SITE = process.env.VOID_SITE || 'https://a-to-mind.com';
export const LINE = '[data-recall="follow"], [data-follow-line="1"]';
export const CASES = [
  { id: 'follow', asks: ['Who wrote Dune?', 'When was he born?'], force: null },
  { id: 'unrelated', asks: ['My favorite color is green.', "What's the capital of France?"], force: null },
  { id: 'false', asks: ['Who wrote Dune?', 'When was he born?'], force: false }
];

/** '' when the page and the reply agree; otherwise the exact mismatch. Pure. */
export function verdict(id, { followed, before, visible, text }) {
  if (id === 'follow') {
    if (followed !== true) return 'the reply did not carry followed:true';
    if (!before) return 'the page did not send the earlier ask';
    if (!visible) return 'the follow-on line is hidden although the reply carried followed:true';
    if (!/who wrote dune/i.test(String(text || ''))) return 'the line does not name the ask it followed';
    return '';
  }
  if (id === 'unrelated') {
    if (followed === true) return 'the reply claimed followed:true for an unrelated pair';
    if (visible) return 'the follow-on line is shown although the reply did not carry followed:true';
    return '';
  }
  if (id === 'false') {
    if (followed !== false) return 'the reply did not carry followed:false';
    if (visible) return 'the follow-on line is shown although the reply carried followed:false';
    return '';
  }
  return 'unknown case ' + id;
}

const browserPath = () => [process.env.VOID_TEST_BROWSER, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/pw-browsers/chromium'].find((p) => p && fs.existsSync(p));

/** the last /api/answer reply and what the page sent with it. */
async function answerOf(seen) {
  let followed, before = false;
  for (const r of seen.reqs) if (r.ask) before = !!r.before; // the last ask decides; the seed asks carry none
  for (const r of seen.res) { const j = await r.json().catch(() => null); if (j && typeof j.answer === 'string') followed = j.followed; }
  return { followed, before };
}

/** type an ask on the live page and wait for its own card, not the one from before. */
async function ask(page, text) {
  await page.waitForSelector('#input', { timeout: 20000 });
  await page.evaluate(() => { const v = document.querySelector('.vpage.on'); if (v) v.dataset.probeSeen = '1'; });
  await page.fill('#input', text);
  await page.keyboard.press('Enter');
  // a new card gets its own element; its title may be the thing's name ("Dune"), not the words typed
  await page.waitForFunction(() => {
    const v = document.querySelector('.vpage.on') || document.querySelector('.vpage');
    return !!v && v.dataset.probeSeen !== '1' && !!v.querySelector('h2') && !/thinking/i.test(v.innerText || '');
  }, null, { timeout: 90000 });
  await page.waitForTimeout(300);
}

/** one pass: a fresh browser context, the real live page, only the reply's followed field changed in the false case. */
export async function runCase(browser, spec, site = SITE) {
  const ctx = await browser.newContext({ viewport: { width: 520, height: 1100 } }), page = await ctx.newPage();
  const origin = new URL(site).origin, seen = { reqs: [], res: [] };
  page.on('response', (r) => { if (/\/api\/answer(?:\?|$)/.test(r.url())) seen.res.push(r); });
  await ctx.route(/^https?:\/\//, async (route) => {
    const req = route.request(), u = new URL(req.url());
    if (u.origin !== origin) return route.fulfill({ status: 204, body: '' }); // no rival reads while the stage loads
    if (/\/api\/answer(?:\?|$)/.test(u.pathname)) {
      let body = {}; try { body = req.postDataJSON(); } catch (_) {}
      seen.reqs.push({ ask: body.ask || '', before: body.before || null });
      if (spec.force === null) return route.continue();
      const res = await route.fetch(); let j = null; try { j = await res.json(); } catch (_) {}
      if (!j || typeof j.answer !== 'string') return route.fulfill({ status: res.status(), contentType: 'application/json', body: JSON.stringify({ answer: 'No answer from the live route.', followed: spec.force }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...j, followed: spec.force }) });
    }
    return route.continue();
  });
  await page.goto(site + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.documentElement.dataset.skills === 'ready', null, { timeout: 45000 }).catch(() => {});
  await page.waitForFunction(() => !!(window.verseBrainHost && window.verseBrainHost.ready), null, { timeout: 30000 });
  await page.evaluate(() => window.verseBrainHost.ready);
  for (const text of spec.asks) await ask(page, text);
  const { followed, before } = await answerOf(seen), line = await page.evaluate((sel) => {
    const v = document.querySelector('.vpage.on') || document.querySelector('.vpage'), n = v && v.querySelector(sel);
    return n ? { visible: !!(n.offsetWidth || n.offsetHeight || n.getClientRects().length), text: (n.innerText || '').replace(/\s+/g, ' ').slice(0, 240) } : { visible: false, text: '' };
  }, LINE);
  await ctx.close();
  const row = { id: spec.id, followed, before, visible: line.visible, text: line.text };
  return { ...row, why: verdict(spec.id, row) };
}

async function main() {
  const site = process.argv.includes('--site') ? process.argv[process.argv.indexOf('--site') + 1] : SITE;
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ executablePath: browserPath(), headless: true });
  const rows = [];
  try { for (const spec of CASES) { const r = await runCase(browser, spec, site); rows.push(r); console.log((r.why ? 'FAIL ' : 'ok   ') + r.id + ': followed=' + JSON.stringify(r.followed) + ' before=' + r.before + ' line=' + r.visible + ' ' + (r.text || '') + (r.why ? '\n       - ' + r.why : '')); } }
  finally { await browser.close(); }
  console.log('\n' + rows.filter((r) => !r.why).length + '/' + rows.length + ' pass against ' + site);
  process.exit(rows.every((r) => !r.why) ? 0 : 1);
}

if (process.argv[1] && new URL(import.meta.url).pathname.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) await main();

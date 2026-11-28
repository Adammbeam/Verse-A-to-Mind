// An end-to-end check of the opt-in path on the live origin. Before the change ships, this serves the
// worktree page with its own CSP at https://a-to-mind.com/; after a deploy, pass --shipped to use the real page.
//   node tools/local-model-live.mjs            worktree page, live CDN and WebGPU
//   node tools/local-model-live.mjs --shipped  the page a-to-mind.com actually serves
import { existsSync, readFileSync } from 'node:fs';

// short why asks that no skill takes (they are near-misses of the sky skills), so each reaches the answer engine.
// Three different wordings: a repeated ask fills the card it already has instead of answering again.
const ONLINE_ASK = 'Why is the sky blue?';
const LOCAL_ASK = 'Why does the sky look blue?';
const BACK_ASK = 'How come the sky is blue?';
const SERVER_ANSWER = 'Light scatters in the air, from the server.';

async function main() {
  const shipped = process.argv.includes('--shipped');
  const root = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
  const { chromium } = await import('playwright-core'); // only a live run needs the browser; the merge gate has no node_modules
  const browser = await chromium.launch({ executablePath: exe, headless: true });
  const page = await browser.newPage({ viewport: { width: 520, height: 1100 } });
  const calls = [];
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  page.on('console', (m) => { if (/webllm|on-device model|esm\.run/i.test(m.text())) console.log('  browser: ' + m.text().slice(0, 200)); });

  const headerLine = readFileSync(root + 'void-live-deploy/_headers', 'utf8').split('\n').find((l) => l.includes('Content-Security-Policy:') && l.includes('esm.run'));
  const csp = headerLine.trim().replace(/^Content-Security-Policy:\s*/, '');
  let pageHits = 0;
  if (!shipped) {
    const html = readFileSync(root + 'void.html', 'utf8');
    await page.route(/^https:\/\/a-to-mind\.com\/(?:\?.*)?$/, (r) => { pageHits++; return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', headers: { 'content-security-policy': csp }, body: html }); });
  }
  await page.route('**/api/answer', async (r) => {
    calls.push(JSON.parse(r.request().postData() || '{}'));
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer: SERVER_ANSWER, sources: [], followed: false }) });
  });

  const fail = async (why) => {
    const where = await page.evaluate(() => ({ url: location.href, title: document.title, toggles: document.querySelectorAll('[data-local-toggle]').length, input: document.querySelector('#input')?.value, cards: document.querySelectorAll('.vpage').length, body: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 240) })).catch((e) => String(e));
    console.log(JSON.stringify({ ok: false, why, where, shipped, pageHits, calls: calls.length, errors }, null, 2)); await browser.close(); process.exitCode = 1;
  };
  const ask = async (text, want) => {
    await page.waitForSelector('#input', { timeout: 20000 });
    await page.fill('#input', text);
    await page.click('#go');
    await page.waitForFunction((want) => {
      const v = document.querySelector('.vpage.on') || document.querySelector('.vpage');
      if (!v || !v.querySelector('h2')) return false;
      const t = v.innerText || '';
      return t.includes(want) && !/thinking/i.test(t);
    }, want, { timeout: 180000 });
    await page.waitForTimeout(300);
    return page.evaluate(() => (document.querySelector('.vpage.on') || document.querySelector('.vpage')).innerText.replace(/\s+/g, ' ').slice(0, 1000));
  };

  try {
    await page.goto('https://a-to-mind.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => document.documentElement.dataset.skills === 'ready', null, { timeout: 45000 }).catch(() => {});
    await page.waitForFunction(() => !!(window.verseBrainHost && window.verseBrainHost.ready), null, { timeout: 30000 });
    await page.evaluate(() => window.verseBrainHost.ready);
    const toggle = page.locator('[data-local-toggle]');
    await toggle.waitFor({ state: 'visible', timeout: 15000 });
    if (await toggle.getAttribute('aria-pressed') !== 'false') return await fail('the model is on by default');

    // default path: the ask goes to /api/answer and the card says it came from there
    const online = await ask(ONLINE_ASK, 'from the server');
    if (calls.length !== 1 || !/from the server/.test(online)) return await fail('the default ask did not reach /api/answer: ' + online);

    // opt-in path: the toggle downloads a small model and the next short ask is answered in the browser
    await toggle.click();
    await page.waitForFunction(() => document.querySelector('[data-local-toggle]')?.getAttribute('aria-pressed') === 'true' && /on-device model ready/.test(document.querySelector('#whisper')?.textContent || ''), null, { timeout: 300000 });
    const gpu = await page.evaluate(async () => !!(navigator.gpu && await navigator.gpu.requestAdapter()));
    if (!gpu) return await fail('no WebGPU adapter');
    const before = calls.length;
    const local = await ask(LOCAL_ASK, 'written on this device');
    if (!/written on this device/.test(local)) return await fail('the card did not say the answer was written on this device: ' + local);
    if (!/blue|light|scatter/i.test(local)) return await fail('the on-device answer did not address the ask: ' + local);
    if (calls.length !== before) return await fail('the opted-in ask was still sent to /api/answer');

    // switching it back off restores the normal route
    await toggle.click();
    if (await toggle.getAttribute('aria-pressed') !== 'false') return await fail('the toggle did not switch off');
    const back = await ask(BACK_ASK, 'from the server');
    if (!/from the server/.test(back) || calls.length !== before + 1) return await fail('switching the model off did not restore /api/answer: ' + back);

    console.log(JSON.stringify({ ok: true, shipped, gpu, downloaded: 'SmolLM2-360M-Instruct-q4f16_1-MLC', online, local, back, apiCalls: calls.length, errors }, null, 2));
  } catch (e) {
    await fail(String(e && e.stack || e).slice(0, 600));
  }
  await browser.close();
}
await main();

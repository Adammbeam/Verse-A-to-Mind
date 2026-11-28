// End-to-end check of the wired path on the live origin. Before the change ships, this serves the
// worktree page with its own CSP at https://a-to-mind.com/embeddings/; after a deploy, pass --shipped.
//   node tools/embeddings-live.mjs            worktree page, live CDN and model
//   node tools/embeddings-live.mjs --shipped  the page a-to-mind.com actually serves
import { existsSync, readFileSync } from 'node:fs';

const A = 'A cat sits on the mat.';
const B = 'A cat is resting on the mat.';

async function main() {
  const shipped = process.argv.includes('--shipped');
  const root = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
  const { chromium } = await import('playwright-core'); // only a live run needs the browser; the merge gate has no node_modules
  const browser = await chromium.launch({ executablePath: exe, headless: true });
  const page = await browser.newPage({ viewport: { width: 520, height: 900 } });
  const errors = [];
  const calls = [];
  let pageHits = 0;
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  await page.route('**/api/answer', (r) => { calls.push(r.request().url()); return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); });

  if (!shipped) {
    const cspLine = readFileSync(root + 'void-live-deploy/_headers', 'utf8').split('\n').find((l) => l.includes('Content-Security-Policy:') && l.includes('cdn.jsdelivr.net')).trim().replace(/^Content-Security-Policy:\s*/, '');
    const csp = { 'content-security-policy': cspLine };
    const serve = (url, file, type, headers = {}) => page.route(url, (r) => r.fulfill({ status: 200, contentType: type, headers, body: readFileSync(root + file) }));
    await page.route(/^https:\/\/a-to-mind\.com\/embeddings\/(?:\?.*)?$/, (r) => { pageHits++; return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', headers: csp, body: readFileSync(root + 'void-live-deploy/embeddings/index.html') }); });
    await serve('**/embeddings/app.js', 'void-live-deploy/embeddings/app.js', 'text/javascript; charset=utf-8', csp);
    await serve('**/embeddings/embed-core.js', 'void-live-deploy/embeddings/embed-core.js', 'text/javascript; charset=utf-8', csp);
  }

  const fail = async (why) => {
    const where = await page.evaluate(() => ({ url: location.href, title: document.title, status: document.querySelector('#status')?.textContent, score: document.querySelector('#score')?.textContent, hidden: document.querySelector('#result')?.hidden, credit: (document.querySelector('footer')?.innerText || '').replace(/\s+/g, ' ').slice(0, 160) })).catch((e) => String(e));
    console.log(JSON.stringify({ ok: false, why, where, shipped, pageHits, calls, errors }, null, 2)); await browser.close(); process.exitCode = 1;
  };

  await page.goto('https://a-to-mind.com/embeddings/', { waitUntil: 'domcontentloaded' });
  if (!(await page.locator('[data-local-model], #compare-form').count())) return fail('the compare form is missing');
  const credit = (await page.locator('footer').innerText()).replace(/\s+/g, ' ');
  if (!/Transformers\.js/.test(credit) || !/Apache-2\.0/.test(credit)) return fail('the visible credit is missing');
  await page.fill('#sentence-a', A);
  await page.fill('#sentence-b', B);
  await page.click('#compare');
  try {
    await page.waitForFunction(() => !document.querySelector('#result')?.hidden && !!document.querySelector('#score')?.textContent, null, { timeout: 240000 });
  } catch { return fail('the model did not write a similarity score'); }
  const proof = await page.evaluate(() => ({
    score: Number(document.querySelector('#score').textContent),
    dimensions: Number(document.querySelector('#dimensions').textContent),
    status: document.querySelector('#status').textContent,
    credit: document.querySelector('footer').innerText.replace(/\s+/g, ' '),
    ready: !!window.verseEmbeddings?.ready(),
    library: window.verseEmbeddings?.library,
    model: window.verseEmbeddings?.model,
  }));
  if (!(proof.score > 0.4 && proof.score < 1.001)) return fail('the two cat sentences were not seen as similar: ' + proof.score);
  if (!proof.ready || proof.model !== 'Xenova/all-MiniLM-L6-v2' || !/cdn\.jsdelivr\.net/.test(proof.library || '')) return fail('the Transformers.js pipeline was not loaded');
  if (calls.length) return fail('the ask went to a Verse worker');
  if (!/on this device/.test(proof.status)) return fail('the page did not say where the answer was written');
  console.log(JSON.stringify({ ok: true, shipped, pageHits, calls: calls.length, errors, proof }, null, 2));
  await browser.close();
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

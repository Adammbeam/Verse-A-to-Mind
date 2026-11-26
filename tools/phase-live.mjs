// Phase in a real browser with fake media (lib/phase.js, phase/app.js, phase/overlay.js). Against the live site by default:
//   node tools/phase-live.mjs                      (https://a-to-mind.com)
//   PHASE_BASE=http://127.0.0.1:8788 node tools/phase-live.mjs   (a local copy of void-live-deploy)
// It shares a fake screen, places a character, phases the fake camera in, learns the room, records a clip, checks the Satchel,
// then lays the overlay over a test page (another origin), reads it, highlights, fills a box, presses a safe button, refuses a
// risky one, and takes the words to Verse; last, it asks "phase in" on the void. Exit 1 on the first failure.
import { chromium } from 'playwright-core';
const BASE = (process.env.PHASE_BASE || 'https://a-to-mind.com').replace(/\/$/, '');
const TEST = (BASE.startsWith('https:') ? 'https' : 'http') + '://phase-test.invalid/';
const exe = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const ok = (c, m) => { if (!c) { console.error('FAIL ' + m); process.exit(1); } console.log('ok   ' + m); };
const b = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--auto-select-desktop-capture-source=Entire screen', '--autoplay-policy=no-user-gesture-required'] });
const c = await b.newContext({ permissions: ['camera'] });
const p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(BASE + '/phase/', { waitUntil: 'load' });
ok(await p.locator('[data-mode]').count() === 4, 'four modes: read, step in, play as P2, satchel');
ok(await p.locator('[data-phase-bookmarklet]').count() === 1, 'the bookmarklet is offered in read mode');
await p.click('[data-phase-share]');
await p.waitForFunction(() => document.querySelector('#under').videoWidth > 0, null, { timeout: 15000 }).catch(() => {});
const shared = await p.evaluate(() => document.querySelector('#under').videoWidth);
ok(shared > 0, 'a fake screen is shared and drawn under the glass (' + shared + 'px wide)');
await p.click('[data-mode=compose]');
await p.click('[data-phase-char=motelet]');
await p.click('[data-phase-me]');
await p.waitForTimeout(1500);
const st = await p.evaluate(() => document.querySelector('#status').textContent);
ok(/You are in/.test(st), 'the fake camera is phased in: ' + st.slice(0, 60));
await p.click('[data-phase-learn]'); const st2 = await p.textContent('#status'); ok(/Room learned/.test(st2), 'the empty room is learned for keying: ' + st2);
const painted = await p.evaluate(() => { const v = document.querySelector('#view'), d = v.getContext('2d').getImageData(0, 0, v.width, v.height).data; let n = 0; for (let i = 3; i < d.length; i += 400) if (d[i]) n++; return n; });
ok(painted > 50, 'the composite canvas is painted (' + painted + ' samples)');
await p.click('[data-phase-rec]'); await p.waitForTimeout(1500); await p.click('[data-phase-rec]');
await p.waitForSelector('[data-phase-clip]', { timeout: 10000 });
const size = Number(await p.getAttribute('[data-phase-clip]', 'data-phase-clip'));
ok(size > 1000, 'a clip is recorded on the device (' + size + ' bytes, ' + await p.getAttribute('[data-phase-clip]', 'download') + ')');
await p.click('[data-mode=satchel]');
const kinds = await p.$$eval('[data-satchel-item]', (r) => r.map((x) => x.dataset.satchelItem));
ok(kinds.includes('clip') && kinds.includes('character'), 'the Satchel kept the clip and the character: ' + kinds.join(', '));
ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));

// the overlay, on a page from another origin
const t = await c.newPage(); let clicked = 0;
await t.route(TEST + '**', (r) => r.fulfill({ contentType: 'text/html', body: '<title>Invoice 42</title><h1>Invoice</h1><p>Subtotal $1,200.00 and tax 8%.</p><label>Note <input id="note"></label><button id="save" type="button" onclick="window.saved=1">Save</button><button type="button" onclick="window.paid=1">Pay now</button>' }));
if (!BASE.startsWith('https:')) await t.route(BASE + '/phase/overlay.js', async (r) => r.fulfill({ contentType: 'text/javascript', body: await (await fetch(BASE + '/phase/overlay.js')).text() })); // a local copy: the browser blocks a public page from loading 127.0.0.1
await t.goto(TEST);
await t.addScriptTag({ url: BASE + '/phase/overlay.js' });
await t.waitForFunction(() => !!window.__versePhase);
const run = (q) => t.evaluate((q) => window.__versePhase.run(q), q);
ok(/\$1,200\.00/.test(await run('numbers')), 'the overlay reads the page and lists its numbers');
ok(/1 match/.test(await run('find invoice 42')) || /match/.test(await run('find Subtotal')), 'it highlights words in place');
ok(await t.locator('mark[data-verse-phase-mark]').count() >= 1, 'a highlight is on the page');
ok(/Filled/.test(await run('fill Note with Thanks, see you Friday')) && await t.inputValue('#note') === 'Thanks, see you Friday', 'it fills a box by its label');
ok(/Pressed/.test(await run('click Save')) && await t.evaluate(() => window.saved === 1), 'it presses a safe button');
ok(/don.t press/.test(await run('click Pay now')) && await t.evaluate(() => !window.paid), 'it refuses a button that pays');
if (!BASE.startsWith('https:')) await c.route('https://a-to-mind.com/**', async (r) => { const u = new URL(r.request().url()); const x = await fetch(BASE + u.pathname); r.fulfill({ status: x.status, contentType: x.headers.get('content-type') || 'text/html', body: Buffer.from(await x.arrayBuffer()) }); });
const [pop] = await Promise.all([c.waitForEvent('page'), run('take to Verse')]);
await pop.waitForFunction(() => /Subtotal/.test((document.querySelector('#out') || {}).textContent || ''), null, { timeout: 15000 }).catch(() => {});
ok(/Subtotal/.test(await pop.textContent('#out').catch(() => '')), 'take to Verse opens Phase in read mode with the page words');
ok(!/#page=/.test(pop.url()), 'the words are dropped from the address once read');
ok(await pop.locator('text=Summarize (sends it to Verse)').count() === 1, 'summarizing says it sends, and waits for a press');
// the ask opens the door from the void
const h = await c.newPage(); await h.goto(BASE + '/?q=' + encodeURIComponent('phase in'), { waitUntil: 'load' });
await h.waitForSelector('[data-phase-open]', { timeout: 30000 }).catch(() => {});
ok(await h.getAttribute('[data-phase-open]', 'href').catch(() => '') === '/phase/?in=1', 'asking "phase in" gives a Phase in card');
await b.close();
console.log('all Phase checks passed against ' + BASE);

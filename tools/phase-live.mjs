// Phase in a real browser with fake media (lib/phase.js, phase/app.js, phase/overlay.js). Against the live site by default:
//   node tools/phase-live.mjs                      (https://a-to-mind.com)
//   PHASE_BASE=http://127.0.0.1:8788 node tools/phase-live.mjs   (a local copy of void-live-deploy)
// It shares a fake screen, places a character, phases the fake camera in, learns the room, records a clip and checks the Satchel.
// Exit 1 on the first failure.
import { chromium } from 'playwright-core';
const BASE = (process.env.PHASE_BASE || 'https://a-to-mind.com').replace(/\/$/, '');
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

await b.close();
console.log('all Phase checks passed against ' + BASE);

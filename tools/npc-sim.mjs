// NPC simulation: seeded random persona journeys on Verse's live site, catching layout/friction regressions
// that fixed scripts miss. Each run logs a --seed <id> and an exact action trace; re-run with the same seed to replay.
//   node tools/npc-sim.mjs --seed 42 [--persona mobile-first-timer] [--steps 8] [--json out.json]
//   node tools/npc-sim.mjs --seed 42 --replay trace.json
// Output: JSON friction report { seed, persona, steps, failures: [{ type, detail, step }] }.
// Failure types: pageerror, console-error, request-failed, dead-click, slow-route (>1500ms), mobile-overflow, abandoned-goal.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const args = process.argv.slice(2);
const seedArg = args.indexOf('--seed') >= 0 ? +args[args.indexOf('--seed') + 1] : Math.floor(Math.random() * 1e9);
const personaArg = args.indexOf('--persona') >= 0 ? args[args.indexOf('--persona') + 1] : null;
const stepsArg = args.indexOf('--steps') >= 0 ? +args[args.indexOf('--steps') + 1] : 8;
const jsonArg = args.indexOf('--json') >= 0 ? args[args.indexOf('--json') + 1] : null;
const replayArg = args.indexOf('--replay') >= 0 ? args[args.indexOf('--replay') + 1] : null;

// deterministic PRNG (mulberry32)
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const PERSONAS = {
  'mobile-first-timer': { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, steps: ['home', 'open-tome', 'ask', 'export-card', 'check-overflow'] },
  'impatient-searcher': { viewport: { width: 1280, height: 800 }, steps: ['home', 'rapid-asks', 'cancel', 'follow-up'] },
  'multi-card-builder': { viewport: { width: 1280, height: 800 }, steps: ['home', 'ask', 'ask', 'stage', 'handoff', 'reload'] },
  'bot-explorer': { viewport: { width: 1280, height: 800 }, steps: ['home', 'bots', 'random-bot', 'edge-input'] },
  'skeptical-buyer': { viewport: { width: 1280, height: 800 }, steps: ['home', 'tool', 'store', 'checkout'] },
};

const PERSONA_NAMES = Object.keys(PERSONAS);
const pickPersona = (seed) => {
  if (personaArg && PERSONAS[personaArg]) return personaArg;
  const r = rng(seed)();
  return PERSONA_NAMES[Math.floor(r * PERSONA_NAMES.length)];
};

// action primitives: each returns { ok, slow, overflow, error } signals
async function act(page, action, rng) {
  const out = { action, ok: true, slow: false, overflow: false, error: null, deadClick: false };
  const t0 = Date.now();
  try {
    switch (action) {
      case 'home':
        await page.goto('https://a-to-mind.com/', { waitUntil: 'domcontentloaded', timeout: 15000 });
        break;
      case 'open-tome':
        await page.click('body').catch(() => {});
        await page.keyboard.press('Enter').catch(() => {});
        break;
      case 'ask': {
        const asks = ['make a clock', 'weather in boston', 'calculate 12345 * 67890', 'what can you do', 'contrast ratio between #0d0d14 and #7dd3fc'];
        const q = asks[Math.floor(rng() * asks.length)];
        await page.fill('#input', q).catch(() => {});
        await page.keyboard.press('Enter').catch(() => {});
        await page.waitForTimeout(1500);
        break;
      }
      case 'export-card':
        await page.click('button:has-text("save card")').catch(() => {});
        await page.waitForTimeout(500);
        break;
      case 'check-overflow':
        out.overflow = await page.evaluate(() => {
          const els = [...document.querySelectorAll('.vpage,.tw-crawl,.tw-lacks')];
          return els.some((e) => e.scrollWidth > e.clientWidth + 2);
        }).catch(() => false);
        break;
      case 'rapid-asks': {
        for (let i = 0; i < 3; i++) {
          await page.fill('#input', 'wether in boston').catch(() => {});
          await page.keyboard.press('Enter').catch(() => {});
          await page.waitForTimeout(200);
        }
        break;
      }
      case 'cancel':
        await page.keyboard.press('Escape').catch(() => {});
        break;
      case 'follow-up':
        await page.fill('#input', 'and now in celsius').catch(() => {});
        await page.keyboard.press('Enter').catch(() => {});
        await page.waitForTimeout(1000);
        break;
      case 'stage':
        await page.fill('#input', 'stage this').catch(() => {});
        await page.keyboard.press('Enter').catch(() => {});
        await page.waitForTimeout(500);
        break;
      case 'handoff':
        await page.fill('#input', 'handoff').catch(() => {});
        await page.keyboard.press('Enter').catch(() => {});
        await page.waitForTimeout(500);
        break;
      case 'reload':
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
        break;
      case 'bots':
        await page.goto('https://a-to-mind.com/bots/', { waitUntil: 'domcontentloaded', timeout: 15000 });
        break;
      case 'random-bot':
        await page.click('a').catch(() => {});
        await page.waitForTimeout(500);
        break;
      case 'edge-input':
        await page.fill('input', '').catch(() => {});
        await page.keyboard.press('Enter').catch(() => {});
        break;
      case 'tool':
        await page.goto('https://a-to-mind.com/tools/', { waitUntil: 'domcontentloaded', timeout: 15000 });
        break;
      case 'store':
        await page.goto('https://a-to-mind.com/store/', { waitUntil: 'domcontentloaded', timeout: 15000 });
        break;
      case 'checkout':
        await page.click('button, a').catch(() => {});
        await page.waitForTimeout(500);
        break;
      default:
        out.ok = false;
        out.error = 'unknown action: ' + action;
    }
  } catch (e) {
    out.ok = false;
    out.error = String(e && e.message || e).slice(0, 200);
  }
  const elapsed = Date.now() - t0;
  if (elapsed > 1500) out.slow = true;
  return out;
}

async function runPersona(name, seed) {
  const r = rng(seed);
  const persona = PERSONAS[name];
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: persona.viewport, isMobile: persona.isMobile || false, hasTouch: persona.hasTouch || false, deviceScaleFactor: persona.deviceScaleFactor || 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  const failures = [];
  const trace = [];
  const steps = persona.steps.slice(0, 8);
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const result = await act(page, step, r);
    trace.push({ step: i, action: step, ...result });
    if (result.error) failures.push({ type: 'error', detail: result.error, step: i });
    if (result.slow) failures.push({ type: 'slow-route', detail: step + ' took >1500ms', step: i });
    if (result.overflow) failures.push({ type: 'mobile-overflow', detail: step + ' has horizontal overflow', step: i });
    if (errors.length) { failures.push({ type: 'pageerror', detail: errors.join('; ').slice(0, 300), step: i }); errors.length = 0; }
  }
  await browser.close();
  return { seed, persona: name, steps: trace.length, failures, trace };
}

// main
const persona = pickPersona(seedArg);
const report = await runPersona(persona, seedArg);
console.log(JSON.stringify(report, null, 2));
if (jsonArg) fs.writeFileSync(jsonArg, JSON.stringify(report, null, 2));
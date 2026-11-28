// The five problem asks must compose a card, not a paraphrase. Run: node --test tools/appearance-benchmark.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { appearanceFails, artifactCount, artifactDeltaFails, hasStructure } from '../void-live-deploy/lib/appearance.js';
import { fallbackSystem, isSystemNeed, kindOf, renderSystem } from '../void-live-deploy/lib/system-intent.js';

const ASKS = [
  'I need a client onboarding system that runs itself.',
  'Turn weekly client reports into something I never have to think about.',
  'I keep forgetting invoices.',
  'Build me a way to track project delivery.',
  'Our support process is chaos.',
];
const REWORD = {
  onboarding: ['New clients should get set up without me chasing every step.', 'The welcome for a new account should happen on its own.', 'Client setup keeps stalling unless someone babysits it.'],
  reports: ['Weekly updates for customers should write themselves.', 'I never want to assemble client status notes every week.', 'Recurring customer summaries should go out without my attention.'],
  invoices: ['Unpaid bills slip my mind.', 'I keep losing track of who hasn\'t paid.', 'Billing follow-up never happens unless I remember.'],
  delivery: ['I want a board that shows whether projects are on time.', 'Milestones slip and I only notice too late.', 'Project handoff progress needs a living tracker.'],
  support: ['Support is a mess.', 'We\'re drowning in support tickets.', 'Customer support feels out of control.'],
};

const root = new URL('..', import.meta.url);
const RESTATE = 'I would say that you need a system that can automatically onboard clients without human intervention.';
const PRODUCTS = '## Verse Product Laws\n\n1. Appearance Test: If Verse only rephrases the ask, the response fails.\n2. Artifact Delta Test: A successful response leaves the stage with more useful structure than before.\n3. Natural Ask Principle: Users should not need to know skill names. Problems should route to systems.\n4. Composition Principle: When multiple artifacts are relevant, Verse creates a connected system rather than isolated cards.\n';
const LAW = '## Verse Benchmark Law\nA successful response creates something useful.\nA failed response explains, paraphrases, or restates the user\'s request without creating useful structure on the stage.\n';

async function routeOf(ask) {
  const dir = new URL('../void-live-deploy/skills/order/', import.meta.url);
  const order = readdirSync(dir).filter((f) => !f.startsWith('.')).map((f) => {
    const m = /^(\d+)-([a-z0-9][a-z0-9-]*)$/.exec(f);
    return m ? { rank: Number(m[1]), name: m[2] } : null;
  }).filter(Boolean).sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  for (const o of order) {
    const mod = (await import(pathToFileURL(join(root.pathname, 'void-live-deploy/skills', o.name + '.js')).href)).default;
    if (mod && mod.match && mod.match(ask.toLowerCase(), ask)) return mod.part ? (mod.part(ask.toLowerCase(), ask) || mod.name) : mod.name;
  }
  return '';
}

function signature(html) {
  return [...html.matchAll(/<li>([^<]+)<\/li>/g)].map((m) => m[1]).join('|');
}

function score(ask, html, routed, htmls) {
  const appearance = hasStructure(html) && !appearanceFails(ask, html) ? 10 : 0;
  const delta = artifactDeltaFails('', html) ? 0 : 10;
  const routing = routed === 'system-design' ? 10 : 0;
  const composition = ['Process', 'Automations Verse owns', 'Monitoring', 'Time saved (estimate)', 'Next'].every((s) => html.includes(s)) && /<ol\b/.test(html) ? 10 : 0;
  const mine = signature(html);
  const distinct = htmls.filter((h) => signature(h) === mine).length === 1 ? 10 : 0;
  const parts = { appearance, delta, routing, composition, distinct };
  const avg = Object.values(parts).reduce((s, n) => s + n, 0) / 5;
  return { parts, avg, pass: avg >= 7 && Object.values(parts).every((n) => n > 0) };
}

test('The Appearance Test fails a paraphrase and passes a card', () => {
  assert.equal(appearanceFails(ASKS[0], RESTATE), true);
  assert.equal(hasStructure(RESTATE), false);
  assert.equal(artifactCount(RESTATE), 0);
  const html = renderSystem(ASKS[0], (s) => s);
  assert.equal(appearanceFails(ASKS[0], html), false);
  assert.equal(artifactDeltaFails('', html), false);
  assert.match(html, /Estimate only/);
  assert.match(html, /<ol>/);
});

test('a factual answer is not treated as a restatement', () => {
  assert.equal(appearanceFails('what is the capital of france', 'Paris is the capital of France.'), false);
});

test('the five problem asks each score at least 7 with no zero, and they are not one generic card', async () => {
  const htmls = ASKS.map((a) => renderSystem(a, (s) => s));
  for (let i = 0; i < ASKS.length; i++) {
    assert.equal(isSystemNeed(ASKS[i]), true, ASKS[i]);
    const routed = await routeOf(ASKS[i]);
    const row = score(ASKS[i], htmls[i], routed, htmls);
    assert.equal(row.pass, true, ASKS[i] + ' ' + JSON.stringify(row));
    assert.equal(routed, 'system-design', ASKS[i] + ' -> ' + routed);
  }
  assert.equal(new Set(htmls.map(signature)).size, ASKS.length);
});

test('rewordings land on the same system within 1 point, and the route is not the exact sentence', () => {
  const deploy = readFileSync(new URL('../void-live-deploy/lib/system-intent.js', import.meta.url), 'utf8')
    + readFileSync(new URL('../void-live-deploy/skills/system-design.js', import.meta.url), 'utf8');
  for (const ask of ASKS) assert.equal(deploy.includes(ask), false, ask);
  const scoreOf = (ask) => {
    const html = renderSystem(ask, (s) => s);
    return hasStructure(html) && !appearanceFails(ask, html) ? 10 : 0;
  };
  for (let i = 0; i < ASKS.length; i++) {
    const kind = kindOf(ASKS[i]);
    const base = scoreOf(ASKS[i]);
    for (const say of REWORD[kind]) {
      assert.equal(kindOf(say), kind, say);
      assert.ok(Math.abs(scoreOf(say) - base) <= 1, say);
    }
  }
});

const SUPPORT_ORDER = ['Inbound Tickets', 'Priority Routing', 'Owner Assignment', 'SLA Monitor', 'Operations Dashboard', 'Weekly Support Report'];
const SUPPORT_AUTO = ['Auto-triage', 'Escalation alerts', 'SLA reminders'];

function supportScore(ask, html) {
  const text = String(html || '');
  if (!hasStructure(text) || appearanceFails(ask, text)) return 0;
  const cards = (text.match(/<article\b/gi) || []).length;
  let at = -1;
  const ordered = SUPPORT_ORDER.every((name) => { const i = text.indexOf(name); if (i < 0 || i < at) return false; at = i; return true; });
  const autos = SUPPORT_AUTO.every((name) => text.includes(name));
  const surprise = (text.match(/data-artifact="escalation-risk"/g) || []).length === 1 && text.includes('Escalation Risk Monitor');
  const next = text.includes('Next');
  if (cards !== 1) return ordered ? 6 : 0;
  return ordered && autos && next && surprise ? 10 : 6;
}

test('a support paraphrase scores 0 and one connected system scores 10', async () => {
  const ask = 'Our support process is chaos.';
  const para = 'Our support process is chaotic.';
  assert.equal(appearanceFails(ask, para), true);
  assert.equal(supportScore(ask, para), 0);
  assert.equal(supportScore(ask, renderSystem(ask, (s) => s) + renderSystem(ask, (s) => s)), 6);
  const says = [ask, 'Our support process is chaotic', 'Support is a mess', "We're drowning in tickets"];
  for (const say of says) {
    assert.equal(kindOf(say), 'support', say);
    const html = renderSystem(say, (s) => s);
    assert.equal(supportScore(say, html), 10, say);
    assert.equal(await routeOf(say), 'system-design', say);
    const back = fallbackSystem(say);
    assert.equal(back.includes(para), false);
    assert.equal(supportScore(say, back), 10, say);
  }
  const router = readFileSync(new URL('../void-live-deploy/lib/system-intent.js', import.meta.url), 'utf8');
  for (const say of says) assert.equal(router.includes(say), false, say);
});

test('explicit system asks stay with their own skills', async () => {
  assert.equal(isSystemNeed('process map for client onboarding'), false);
  assert.equal(isSystemNeed('package this idea: automate client onboarding'), false);
  assert.equal(await routeOf('process map for client onboarding'), 'process-map');
  assert.equal(await routeOf('package this idea: automate client onboarding'), 'delivery-pack');
});

test('the benchmark page states the law and marks every ask as appearing', () => {
  const doc = readFileSync(new URL('../docs/appearance-benchmark.md', import.meta.url), 'utf8');
  assert.ok(doc.startsWith(PRODUCTS), 'the product laws are the first lines');
  assert.ok(doc.includes(LAW), 'the benchmark law stays, word for word');
  assert.match(doc, /pain in, system out/);
  for (const ask of ASKS) {
    assert.ok(doc.includes(ask), ask);
    const line = doc.split('\n').find((l) => l.includes(ask));
    assert.match(line, /✅ \| ✅ \|$/);
  }
});

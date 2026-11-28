/**
 * system-design skill — turn a business idea into a design of the systems, automations, tests, monitors and handoff points Verse will own.
 * Offline, rules-based. Nothing is sent. Reuses existing packs (client-intake, system-slice, monitor-pack, verify-pack, ownership).
 * A natural system problem ("I need a client onboarding system that runs itself") composes those packs into one card (lib/system-intent.js).
 * "design the system for client onboarding", "system design for invoice reminders", "design systems for the support flow".
 */
import { isSystemNeed, renderSystem } from '../lib/system-intent.js';

export function isSystemDesign(text) {
  const t = String(text || '').trim().replace(/[?!.]+$/, '');
  return /^(?:system\s+design|design\s+the\s+system|design\s+systems)\s+(?:for|of|on)\b/i.test(t)
    || /^design\s+(?:a\s+)?(?:system|systems)\s+for\b/i.test(t);
}

export function subjectOf(text) {
  const m = String(text || '').match(/\b(?:for|of|on|:)\s+(?:the\s+|my\s+|a\s+)?(.+)/i);
  const s = m ? m[1].trim().replace(/[?!.]+$/, '') : '';
  return s.length >= 3 ? s.slice(0, 160) : 'the idea or process';
}

export function designFor(subject) {
  const name = subjectOf(subject);
  return {
    subject: name,
    components: [
      'Intake card that captures the idea and matches existing Verse tools',
      'Next system slice that proposes the smallest useful piece to build',
      'Monitor pack for the checks the client does not watch',
      'Verify pack for the tests Verse owns',
      'Ownership clear on what Verse takes versus what the client keeps'
    ],
    automations: [
      'One automation behind the confirm line that runs the first useful step',
      'Status card the client can summon for live state'
    ],
    handoff: 'Package the running systems with status, docs, monitors and the client lift summary so the client does less'
  };
}

async function run(text, api) {
  const { showPage, esc } = api;
  if (isSystemNeed(text)) {
    showPage((el) => { el.innerHTML = renderSystem(text, esc); }); // void-review: ok (renderSystem escapes every field with esc)
    return 'system-design';
  }
  const name = subjectOf(text);
  const pack = designFor(text);
  showPage((el) => {
    const comps = pack.components.map(i => '<li>' + esc(i) + '</li>').join('');
    const autos = pack.automations.map(i => '<li>' + esc(i) + '</li>').join('');
    el.innerHTML = '<h2>System design: ' + esc(name) + '</h2>'
      + '<p class="sub">This designs the systems Verse handles so the client does less.</p>'
      + '<h3>Components</h3><ul>' + comps + '</ul>'
      + '<h3>Automations</h3><ul>' + autos + '</ul>'
      + '<h3>Handoff</h3><p>' + esc(pack.handoff) + '</p>'
      + '<p class="sub">Ask for the next system slice or the full handoff when ready to build.</p>'
      + '<div class="src">Source: A-to-Mind system design</div>';
  });
  return 'system-design';
}

export const builtWith = ['client-intake', 'system-slice', 'monitor-pack', 'verify-pack', 'ownership'];
export default {
  name: 'system-design',
  examples: [
    'system design for client onboarding',
    'design the system for invoice reminders',
    'design systems for the support flow',
    'design a system for weekly status reports',
    'I need a client onboarding system that runs itself.',
    'Turn weekly client reports into something I never have to think about.',
    'I keep forgetting invoices.',
    'Build me a way to track project delivery.',
    'Our support process is chaos.',
  ],
  nearMisses: [
    'what is a system',
    'system status',
    'design the page',
    'build the system'
  ],
  match: (low, raw) => isSystemDesign(raw || low) || isSystemNeed(raw || low),
  run,
  suite() {
    const takes = (t) => isSystemDesign(t) || isSystemNeed(t);
    const ok = this.examples.every(takes) && !this.nearMisses.some(takes);
    return { ok, got: ok ? 'match works' : 'match broke' };
  }
};

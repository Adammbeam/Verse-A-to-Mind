/**
 * client-work-drop skill — package the specific client tasks that drop when Verse owns the systems,
 * monitors, tests and handoffs for a business process so the client does less and delivery is reliable.
 * Contract: { name, examples, nearMisses, match(lower, text), run(text, api) }
 * "what work drops for client onboarding", "client tasks that go away: invoice reminders", "drop list for support router"
 */
export function isClientWorkDrop(text) {
  const t = String(text || '').trim().replace(/[?!.]+$/, '');
  return /^(?:what|which|list|show)\s+(?:client\s+)?(?:work|tasks?|jobs?)\s+(?:that\s+)?(?:drop|go\s+away|disappear)/i.test(t)
    || /^(?:client\s+)?(?:work|tasks?)\s+that\s+(?:drop|go\s+away)/i.test(t)
    || /^(?:drop\s+list|work\s+drop)\s+for\b/i.test(t)
    || /^(?:package|show)\s+(?:the\s+)?(?:client\s+)?(?:work\s+drop|tasks?\s+that\s+drop)/i.test(t);
}

function extractProcess(text) {
  const t = String(text || '');
  const m = t.match(/(?:for|on|of|:)\s*(.+)/i) || t.match(/\b(?:process|system|automation)\s*[:\-]\s*(.+)/i);
  return m ? m[1].trim() : 'the process';
}

async function run(text, api) {
  const { showPage, esc } = api;
  const process = extractProcess(text);
  const el = showPage((p) => { p.innerHTML = '<h2>Client work that drops</h2><div class="sub">building…</div>'; });
  const pack = [
    `<h2>Client work that drops: ${esc(process)}</h2>`,
    `<p><strong>Verse owns the hard work.</strong> These client tasks go away once the systems, monitors, tests and handoff are live.</p>`,
    `<h3>Tasks that drop</h3><ul>`,
    `<li>Watching dashboards and chasing status updates</li>`,
    `<li>Manual testing of the flow after each change</li>`,
    `<li>Writing and updating handoff docs and runbooks</li>`,
    `<li>Setting up and maintaining monitors and alerts</li>`,
    `<li>Coordinating the connections between tools</li>`,
    `</ul>`,
    `<h3>What the client keeps</h3><ul>`,
    `<li>The outcome and the business decisions</li>`,
    `<li>Final approval on the confirm line when needed</li>`,
    `<li>Visibility into the one-line status and the handoff package</li>`,
    `</ul>`,
    `<p class="sub">The list is the sellable package: Verse takes the hard work, the client keeps the result.</p>`,
    `<div class="src">Source: A-to-Mind delivery practice</div>`
  ].join('');
  el.innerHTML = pack;
  return 'client-work-drop';
}

export default {
  name: 'client-work-drop',
  examples: [
    'what work drops for client onboarding',
    'client tasks that go away: invoice reminders',
    'drop list for the support router',
    'show the client work drop for weekly reports',
    'package the client tasks that drop for the CRM sync'
  ],
  nearMisses: ['what work is left', 'client work', 'drop the table', 'work drops'],
  match(lower, text) { return isClientWorkDrop(text || lower); },
  run,
  suite() {
    const ok = isClientWorkDrop('what work drops for client onboarding')
      && isClientWorkDrop('client tasks that go away: invoice reminders')
      && isClientWorkDrop('drop list for the support router')
      && isClientWorkDrop('show the client work drop for weekly reports')
      && isClientWorkDrop('package the client tasks that drop for the CRM sync')
      && !isClientWorkDrop('what work is left')
      && !isClientWorkDrop('client work')
      && !isClientWorkDrop('drop the table')
      && !isClientWorkDrop('work drops');
    return { ok, got: 'match works' };
  }
};

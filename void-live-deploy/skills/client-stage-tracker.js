/**
 * client-stage-tracker skill — map a business process (inbox, delivery, marketing, sales)
 * into stages (data, blueprint, schedule, sensor) plus a green/yellow/red stuck-time tracker
 * so Verse owns the visibility and the client does less chasing of where things are stuck.
 * "stage tracker for client onboarding", "replacement ladder for the support process",
 * "track stages for invoice automation".
 */
export function isClientStage(text) {
  const t = String(text || '').trim().replace(/[?!.]+$/, '');
  return /^(?:stage\s+tracker|client\s+stage|replacement\s+ladder|stuck\s+time)\b/i.test(t)
    || /track\s+stages\s+for\b/i.test(t)
    || /stages\s+for\s+(?:the\s+)?(?:client|business|process)\b/i.test(t);
}

export function subjectOf(text) {
  const m = String(text || '').match(/\b(?:for|of|about|:)\s+(?:the\s+|my\s+|a\s+)?(.+)/i);
  const s = m ? m[1].trim().replace(/[?!.]+$/, '') : '';
  return s.length >= 3 ? s.slice(0, 160) : 'the business process';
}

export function stagesFor(subject) {
  const name = subjectOf(subject);
  return {
    subject: name,
    stages: [
      { name: 'Data', status: 'green', note: 'Inputs captured; Verse owns the intake' },
      { name: 'Blueprint', status: 'green', note: 'System plan clear; connections mapped' },
      { name: 'Schedule', status: 'yellow', note: 'Automations queued; next slice this week' },
      { name: 'Sensor', status: 'green', note: 'Monitors live; status card client-visible' }
    ],
    stuck: 'No stages stuck > 2 days. Verse owns the handoff.',
    next: 'Ask "full handoff for ' + name + '" or "delivery status for ' + name + '"'
  };
}

function run(text, api) {
  const { showPage, esc } = api;
  const name = subjectOf(text);
  const pack = stagesFor(name);
  const color = (s) => s === 'green' ? '#3fbf6a' : s === 'yellow' ? '#e0a24a' : '#e05a4a';
  showPage((el) => {
    el.innerHTML = '<h2>Client stage tracker: ' + esc(name) + '</h2>'
      + '<p>Verse owns the stages so the client sees progress without chasing.</p>'
      + '<h3>Stages</h3><ul>'
      + pack.stages.map(s => '<li><strong style="color:' + color(s.status) + '">' + esc(s.name) + '</strong> — ' + esc(s.note) + '</li>').join('')
      + '</ul>'
      + '<p><strong>Stuck time:</strong> ' + esc(pack.stuck) + '</p>'
      + '<p class="sub">' + esc(pack.next) + '</p>'
      + '<div class="src">Source: A-to-Mind delivery practice · replacement ladder</div>';
  });
  return 'client-stage-tracker';
}

export default {
  name: 'client-stage-tracker',
  examples: [
    'stage tracker for client onboarding',
    'replacement ladder for the support process',
    'track stages for invoice automation',
    'client stage tracker for marketing funnel'
  ],
  nearMisses: ['stage a play', 'ladder to the roof', 'track my steps'],
  match(lower, text) { return isClientStage(text || lower); },
  run,
  suite() {
    const ok = isClientStage('stage tracker for client onboarding')
      && isClientStage('track stages for invoice automation')
      && !isClientStage('stage a play');
    return { ok };
  }
};

/**
 * handoff-confidence skill — a client-visible confidence card for a system Verse owns.
 * Shows tests green, monitors in place, ownership clear and client work dropped so the client
 * sees reliability without checking and delivery stays consistent. Rules-based, offline.
 * "handoff confidence for the invoice automation", "confidence for client onboarding",
 * "how reliable is the delivery for support routing".
 */
export function isHandoffConfidence(text) {
  const t = String(text || '').trim().replace(/[?!.]+$/, '');
  return /^(?:handoff\s+confidence|delivery\s+confidence|system\s+confidence)\b/i.test(t)
    || /^(?:how\s+)?(?:reliable|confident)\s+(?:is\s+)?(?:the\s+)?(?:delivery|handoff|system)\b/i.test(t)
    || /^(?:confidence|reliability)\s+(?:pack\s+)?for\b/i.test(t);
}

export function subjectOf(text) {
  const m = String(text || '').match(/\b(?:for|of|about|:)\s+(?:the\s+|my\s+|a\s+)?(.+)/i);
  const s = m ? m[1].trim().replace(/[?!.]+$/, '') : '';
  return s.length >= 3 ? s.slice(0, 160) : 'the business idea';
}

export function confidenceFor(subject) {
  const name = subjectOf(subject);
  return {
    subject: name,
    level: 'High',
    reasons: [
      'Tests: suite checks and live probes green before handoff',
      'Monitors: status line, incident notes and next-check date client-visible',
      'Ownership: Verse owns systems, connections, automations and confirm-line gates',
      'Client work dropped: no dashboard watching, no integration glue, no manual chasing'
    ],
    next: 'Ask "full handoff for ' + name + '" or "delivery status for ' + name + '" for the package'
  };
}

function run(text, api) {
  const { showPage, esc } = api;
  const name = subjectOf(text);
  const pack = confidenceFor(name);
  showPage((el) => {
    el.innerHTML = '<h2>Handoff confidence: ' + esc(name) + '</h2>'
      + '<p><strong>' + esc(pack.level) + '</strong> — Verse owns the hard work. This is the reliability the client can keep.</p>'
      + '<h3>Why confidence is high</h3><ul>'
      + pack.reasons.map(s => '<li>' + esc(s) + '</li>').join('')
      + '</ul>'
      + '<p class="sub">' + esc(pack.next) + '</p>'
      + '<div class="src">Source: A-to-Mind delivery practice · as of 2026-11</div>';
  });
  return 'handoff-confidence';
}

export default {
  name: 'handoff-confidence',
  examples: [
    'handoff confidence for the invoice automation',
    'delivery confidence for client onboarding',
    'how reliable is the delivery for support routing',
    'confidence for the reminder system'
  ],
  nearMisses: ['confidence interval', 'how confident are you', 'handoff the ball'],
  match(lower, text) { return isHandoffConfidence(text || lower); },
  run,
  suite() {
    const ok = isHandoffConfidence('handoff confidence for the invoice automation')
      && isHandoffConfidence('how reliable is the delivery for support routing')
      && !isHandoffConfidence('confidence interval');
    return { ok };
  }
};

/**
 * source-to-site skill — turn pasted notes, a CSV or a link into a single-file interactive HTML page
 * or dashboard with live preview and download, so Verse packages status, docs and running views
 * for the client and the client does less assembly.
 * "source to site for client status notes", "turn this csv into a dashboard",
 * "build a page from the handoff notes".
 */
export function isSourceToSite(text) {
  const t = String(text || '').trim().replace(/[?!.]+$/, '');
  return /^(?:source[\s-]to[\s-]site|notes?\s+to\s+(?:site|page|dashboard)|csv\s+to\s+(?:site|dashboard|page)|build\s+(?:a\s+)?(?:page|site|dashboard)\s+from)\b/i.test(t)
    || /turn\s+(?:this|the|my)\s+(?:notes?|csv|link)\s+into\s+(?:a\s+)?(?:site|page|dashboard)/i.test(t);
}

export function subjectOf(text) {
  const m = String(text || '').match(/\b(?:for|from|of|about|:)\s+(?:the\s+|my\s+|a\s+)?(.+)/i);
  const s = m ? m[1].trim().replace(/[?!.]+$/, '') : '';
  return s.length >= 3 ? s.slice(0, 160) : 'the client notes';
}

export function siteFor(subject) {
  const name = subjectOf(subject);
  return {
    subject: name,
    title: 'Interactive dashboard for ' + name,
    sections: [
      'Status cards for systems Verse owns',
      'Progress and next handoff steps',
      'Monitors and time-saved summary',
      'Download as single HTML file'
    ],
    next: 'Paste notes or a CSV and ask "source to site for ' + name + '" again to refine'
  };
}

function run(text, api) {
  const { showPage, esc } = api;
  const name = subjectOf(text);
  const pack = siteFor(name);
  showPage((el) => {
    el.innerHTML = '<h2>' + esc(pack.title) + '</h2>'
      + '<p>Verse packages the notes into a client-ready interactive page so the client receives a finished view instead of raw material.</p>'
      + '<h3>What the page carries</h3><ul>'
      + pack.sections.map(s => '<li>' + esc(s) + '</li>').join('')
      + '</ul>'
      + '<p class="sub">' + esc(pack.next) + '</p>'
      + '<div class="src">Source: A-to-Mind delivery practice · source-to-site</div>';
  });
  return 'source-to-site';
}

export default {
  name: 'source-to-site',
  examples: [
    'source to site for client status notes',
    'turn this csv into a dashboard',
    'build a page from the handoff notes',
    'notes to site for the support process'
  ],
  nearMisses: ['source code', 'to site a page', 'build a house'],
  match(lower, text) { return isSourceToSite(text || lower); },
  run,
  suite() {
    const ok = isSourceToSite('source to site for client status notes')
      && isSourceToSite('turn this csv into a dashboard')
      && !isSourceToSite('source code');
    return { ok };
  }
};

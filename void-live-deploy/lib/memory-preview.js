// The memory preview's pure half (asked by Verse, 2026-10-21: "Implement a 'memory-preview' UI component to show memory
// snippets"): what the ask means, what one snippet is, and exactly which fields would go to a model if it were asked about
// that memory. Nothing here fetches: the card reads Verse's own memory (the same records the memory card answers from) and
// shows the snippets behind the answer, so a person can see what is remembered before anything is said about it.
export const MAX_SNIPPETS = 12;
export const EXCERPT = 180; // characters of a record's summary a snippet shows
export const CLEAN = (s) => String(s || '').trim().toLowerCase().replace(/['']/g, "'").replace(/[?!.]+$/, '').replace(/\s+/g, ' ');

// the asks: "memory preview", "show my memory snippets", "preview what you remember about react", "memory snippets for react".
// "what do you remember about react" is the memory card's own (it answers in words); this one shows the snippets behind it.
const PREVIEW_RES = [
  /^(?:(?:show|open|give|list)\s+)?(?:(?:the|my)\s+)?memory\s+(?:preview|snippets?)(?:\s+(?:about|for|of|on|from|in)\s+(.+))?$/,
  /^(?:(?:show|open|give|list)\s+)?(?:preview|show)\s+(?:me\s+)?(?:(?:the|my)\s+)?memory\s+(?:preview|snippets?)(?:\s+(?:about|for|of|on|from|in)\s+(.+))?$/,
  /^(?:preview|show)\s+(?:what\s+(?:you|verse)\s+remember(?:s)?\s+about|(?:my|the)\s+memory(?:\s+about)?)\s+(.+)$/,
  /^(?:memory\s+)?snippets?\s+(?:about|for|of|on|from|in)\s+(.+)$/,
];

/** what the ask wants: { q } (the topic, empty when none was named), or null when it is not this skill's. Pure. */
export function previewOf(text) {
  const t = CLEAN(text);
  if (!t) return null;
  for (const re of PREVIEW_RES) {
    const m = re.exec(t);
    if (m) return { q: CLEAN(m[1] || '') };
  }
  return null;
}

/** the query the card asks the memory API: the records, not the answer. Pure. */
export function previewUrl(q, limit = MAX_SNIPPETS) {
  const n = Math.max(1, Math.min(50, parseInt(limit, 10) || MAX_SNIPPETS));
  return '/api/memory?q=' + encodeURIComponent(String(q || '').slice(0, 200)) + '&limit=' + n;
}

/** the first sentence of a summary, at most EXCERPT characters, cut on a word. Pure. */
export function excerptOf(text, max = EXCERPT) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  const stop = s.search(/[.!?](\s|$)/);
  let cut = stop > 0 ? s.slice(0, stop + 1) : s;
  if (cut.length > max) { cut = cut.slice(0, max); const sp = cut.lastIndexOf(' '); if (sp > max * 0.6) cut = cut.slice(0, sp); cut += '…'; }
  return cut;
}

/** one record as one snippet, or null when it holds nothing to show. Pure. */
export function snippetOf(rec) {
  if (!rec || typeof rec !== 'object') return null;
  const name = String(rec.name || '').trim();
  const summary = String(rec.summary || '').trim();
  if (!name && !summary) return null;
  const links = Array.isArray(rec.links) ? rec.links : [];
  return {
    id: String(rec.id || ''),
    name: name || '(unnamed)',
    kind: String(rec.kind || 'project'),
    state: String(rec.state || ''),
    excerpt: excerptOf(summary) || excerptOf(name),
    at: String(rec.updated || rec.at || ''),
    links: links.slice(0, 6).map((l) => String(l && (l.name || l.title || l) || '')).filter(Boolean),
    // the fields that would go to a model if someone asked it about this memory: the name and the summary, and nothing else
    fields: ['name', 'summary'],
  };
}

/** the records as snippets, newest first, at most limit of them. Pure. */
export function snippetsOf(records, limit = MAX_SNIPPETS) {
  const n = Math.max(1, Math.min(50, parseInt(limit, 10) || MAX_SNIPPETS));
  return (Array.isArray(records) ? records : []).map(snippetOf).filter(Boolean).slice(0, n);
}

/** the honest line: what a model would see, and that nothing has gone anywhere. Pure. */
export function consentOf(snippets) {
  const list = Array.isArray(snippets) ? snippets : [];
  if (!list.length) return 'Nothing to show: Verse holds no memory that matches.';
  const fields = [...new Set(list.flatMap((s) => s.fields || []))];
  return 'A model asked about these would see each one’s ' + fields.join(' and ') + '. Nothing has left this device.';
}

/** how a snippet reads in one line: the name, the state and the date. Pure. */
export function metaOf(snippet) {
  if (!snippet) return '';
  const bits = [snippet.kind];
  if (snippet.state) bits.push(snippet.state.replace(/-/g, ' '));
  if (snippet.at) bits.push(snippet.at.slice(0, 10));
  return bits.filter(Boolean).join(' · ');
}

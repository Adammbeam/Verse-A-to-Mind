// A paste is the ask. Several asks are each answered. A document with none is read.
// Pure. No I/O.
const NUM = /^\s*(?:\d{1,2}|[a-z])[.)]\s+/;
const BUL = /^\s*[-*•]\s+/;
const IMP = /^(?:please\s+)?(?:summari[sz]e|sum\s+(?:it|this)\s+up|tl;?dr|explain|translate|review|rewrite|reply|answer|compare|list|draft|write|read|tell\s+me|make|show|find|give|open|build|turn|convert|describe|outline|name|define|calculate|follow|identify|check|fix|debug|run|test|verify|confirm|set|add|remove|plan|edit|shorten|expand|prove|measure)\b/i;
const QWORD = /^(?:what|who|where|when|why|how|which|whose|does|do|did|is|are|can|could|should|would|will)\b/i;
const PROMPT = /(?:^|\n)\s*(?:you are|your task is|instructions?\s*:|follow these|do the following|system\s*:|prompt\s*:)/i;

const flat = (s) => String(s || '').replace(/\s*⏎\s*/g, '\n');
const one = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** each question or ask, in order: a line that ends with ?, a numbered or bulleted ask, or an imperative line. At most 12. Pure. */
export function asksIn(raw) {
  const text = flat(raw);
  const seen = new Set();
  const out = [];
  const push = (s) => {
    const t = one(s).replace(NUM, '').replace(BUL, '').trim();
    if (t.length < 8 || t.length > 280) return;
    const k = t.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(t);
  };
  for (const bit of text.split(/\n+|(?<=[.!?])\s+/)) {
    const marked = NUM.test(bit.trim()) || BUL.test(bit.trim());
    const bare = bit.trim().replace(NUM, '').replace(BUL, '').trim();
    if (/\?\s*$/.test(bare) || IMP.test(bare) || (marked && QWORD.test(bare))) push(bare);
  }
  return out.slice(0, 12).map((t, i) => ({ text: t, label: (i + 1) + '. ' + t }));
}

/** true when the paste tells Verse to do something, including one ask. Pure. */
export function isInstruction(raw) {
  return asksIn(raw).length > 0 || PROMPT.test(flat(raw));
}

/** a document with no ask: a short summary, key points, and what to do with it, from its own sentences. Pure. */
export function documentRead(raw) {
  const text = one(flat(raw));
  const sentences = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 25);
  const summary = sentences.slice(0, 2).join(' ') || text.slice(0, 320);
  const points = [];
  for (const s of sentences) {
    if (points.length >= 4) break;
    if (summary.includes(s)) continue;
    if (/\d|\b(?:need|must|should|will|please|confirm|before|by)\b/i.test(s)) points.push(s);
  }
  for (const s of sentences) {
    if (points.length >= 3) break;
    if (!summary.includes(s) && !points.includes(s)) points.push(s);
  }
  const acts = sentences.filter((s) => /\b(?:need|needs|must|should|please|confirm|send|reply|pay|book|before)\b/i.test(s)).slice(0, 3);
  const what = acts.length ? acts.join(' ') : 'Keep the points above. The paste names no separate task, so this reading is the result.';
  return [summary, points.length ? 'Key points:\n' + points.map((s) => '- ' + s).join('\n') : '', 'What to do: ' + what].filter(Boolean).join('\n\n');
}

/** keep a long paste inside max characters: the asks, then the start and the end. Never a refusal. Pure. */
export function fitAsk(raw, max = 4000) {
  const t = flat(raw).trim();
  if (t.length <= max) return t;
  const head = asksIn(t).map((a) => a.text).join('\n');
  const note = '\n… [middle left out] …\n';
  const room = Math.max(240, max - head.length - note.length);
  const h = Math.floor(room * 0.55);
  const tail = Math.max(80, room - h);
  const mid = Math.max(0, t.length - h - tail);
  const body = t.slice(0, h) + '\n… [' + mid + ' characters from the middle left out] …\n' + t.slice(t.length - tail);
  return ((head ? head + '\n\n' : '') + body).slice(0, max);
}

/** one block per ask, in order, under its label. A missing line still names the ask. Pure. */
export function stitchAsks(asks, lines) {
  return (asks || []).map((a, i) => {
    const said = one(lines && lines[i]);
    return a.label + '\n' + (said || ('This one, on its own: ' + a.text));
  }).join('\n\n');
}

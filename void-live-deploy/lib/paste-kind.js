// What a paste is (owner rule, 2026-10-30, docs/RULES.md "A paste is a report, an ask or unclear"). Adam pasted a copied "What is really true now"
// card with a long note under it. Verse reopened the frozen card, still at "checking GitHub…", and dropped the note; an earlier status note came
// back as a stock answer about Verse's secret names. A paste is one of these, and each gets its own answer:
//   report   a status report or a copied report card: taken in as context and checked against GitHub (skills/telemetry-route.js)
//   card     a copied Verse card and nothing more: it opens again as that card (lib/card-share.js)
//   note     a note written to someone, or a copied chat: read as a note (lib/note-ask.js)
//   ask      the paste asks something (a question, a command, or several of them): answered as any ask
//   read     a document or article with no ask: read back as a summary, key points, and what to do
// A typed ask is not a paste: pasteKind gives null and the ask is routed as before. Pure, no I/O.
import { telemetryOf } from './telemetry.js';
import { isNote } from './note-ask.js';
import { asksIn } from './paste-read.js';

const CODE = /(?:VERSE|Verse|V01D)-CARD:[A-Za-z0-9_-]{8,}/;
// the person's own words around a paste: a question, a command, or a request to Verse ("summarize this", "what do you think", "can you")
const REQUEST = /^(?:(?:ok(?:ay)?|so|hey|verse|please|pls)\b[\s,!.]*)*(?:summari[sz]e|sum\s+(?:it|this)\s+up|tl;?dr|explain|translate|review|check|fix|debug|rewrite|reply|answer|compare|list|draft|write|read|tell\s+me|what\s+do\s+you\s+think|can\s+you|could\s+you|would\s+you|will\s+you|i\s+(?:want|need)\s+you\s+to|help)\b/i;
// a line that opens with a command verb ("make a clock", "find the cheapest one", "turn this into a list")
const COMMAND = /^(?:please\s+)?(?:make|show|find|give|open|play|build|send|add|remove|delete|turn|convert|change|update|plan|set|start|stop|search|look\s+up|pick|choose|sort|count|calculate|work\s+out)\b/i;

/** a paste, not a typed ask: more than one line, or over 400 characters (a typed ask of several sentences stays a typed ask). Pure. */
export function isPasteText(raw) {
  const t = String(raw || '').trim();
  return /[\n⏎]/.test(t) || t.length > 400;
}
const lines = (t) => String(t || '').replace(/\s*⏎\s*/g, '\n').split(/\n+/).map((l) => l.trim()).filter(Boolean);
const asksLine = (l) => l.length <= 200 && (/\?\s*$/.test(l) || COMMAND.test(l) || REQUEST.test(l));
/** the person's own line asks something: the first or the last line is a question, a command or a request. Pure. */
export function asksSomething(raw) {
  const ls = lines(raw).filter((l) => !CODE.test(l));
  return !!ls.length && (asksLine(ls[0]) || asksLine(ls[ls.length - 1]));
}

/** what a paste is: { kind } report, card, note, ask or read, or null for a typed ask. Pure. */
export function pasteKind(raw) {
  const text = String(raw || '').trim(), card = CODE.test(text);
  if (!card && !isPasteText(text)) return null;
  if (telemetryOf(text)) return { kind: 'report' };
  if (card) return { kind: 'card' };
  if (isNote(text)) return { kind: 'note' };
  if (asksIn(text).length || asksSomething(text)) return { kind: 'ask' };
  return { kind: 'read' };
}
/** a long paste goes to the answer path: an ask, a document, or a note. A report and a copied card stay on their own paths. Pure. */
export const answersAsPaste = (kind) => kind === 'ask' || kind === 'read' || kind === 'note';

// The shape of an input, read before the answer engine routes it: a question, a directive to Verse, or a pasted passage.
// Evolves the detectors already in lib/paste-kind.js and lib/ask-text.js rather than matching skills first.
// A genuine correction of Verse's own card is not a passage (lib/self-context.js isCardCorrection).
import { isPasteText, asksSomething } from './paste-kind.js';
import { opensWithCommand, asksToMake, isLongProse, slug } from './ask-text.js';
import { isCardCorrection } from './self-context.js';

export const PASSAGE_LINE = 'That looks like a passage, not a question. I can summarise it, keep it as a note, or answer a question about it — say which you want.';
export const DIRECTIVE_SAY = "I'll take that as a want and put it on the build list.";
export const DIRECTIVE_DUP = "That's already on the build list.";
export const DIRECTIVE_HELD = "I'll take that as a want, and I'll put it on the build list when the queue is available.";

const LEAD = /^(?:(?:ok(?:ay)?|now|and|then|also|so|hey|verse|please|pls|yes|yeah)\b[\s,!.]*)*/i;
const QUESTION_OPEN = /^(?:what|who|where|when|why|how|which|whose|whom|is|are|am|was|were|do|does|did|can|could|should|would|will|may|might)\b/i;
const TEACH_SKILL = /\bteach\s+(?:my|your|the)\s+\w[\w-]*\s+skill\b/i;
const DIRECT_OPEN = /^(?:please\s+)?(?:fix|debug|handle|repair)\b/i;
const IN_CHARGE = /\b(?:you(?:'re| are)|verse is)\s+in charge\b|\btake (?:charge|over|the lead)\b|\byou decide\b/i;
const WANT_YOU = /\b(?:i want|i need|i(?:'|’)d like)\s+you\s+to\b/i;

const tidy = (s) => String(s || '').trim();
const bareOf = (s) => tidy(s).replace(LEAD, '');

/** a question: it ends with a ? or, when short, it opens with an interrogative. A mid-sentence "should say" is not one. Pure. */
export function isQuestion(raw) {
  const t = tidy(raw);
  if (!t) return false;
  if (/\?\s*$/.test(t)) return true;
  const last = t.split(/\n+/).map((l) => l.trim()).filter(Boolean).pop() || '';
  if (/\?\s*$/.test(last) && last.length <= 200) return true;
  const bare = bareOf(t);
  return bare.length <= 280 && QUESTION_OPEN.test(bare);
}

/** an instruction to Verse: a command, "teach my X skill", "you're in charge now", "I want you to …". Not a long analysis that only mentions those words. Pure. */
export function isDirective(raw) {
  const t = tidy(raw);
  if (!t || isQuestion(t) || isCardCorrection(t)) return false;
  if (isLongProse(t) && !opensWithCommand(t) && !TEACH_SKILL.test(bareOf(t).slice(0, 80)) && !IN_CHARGE.test(t) && !WANT_YOU.test(t)) return false;
  const bare = bareOf(t);
  return opensWithCommand(t) || asksToMake(t) || TEACH_SKILL.test(bare) || DIRECT_OPEN.test(bare) || IN_CHARGE.test(t) || WANT_YOU.test(t);
}

/** a pasted passage: long prose with no interrogative and no instruction, and not a correction addressed to Verse. Pure. */
export function isPassage(raw) {
  const t = tidy(raw);
  if (!t || isCardCorrection(t) || isQuestion(t) || isDirective(t)) return false;
  return isPasteText(t) || isLongProse(t) || asksSomething(t) === false && (t.length > 220);
}

/** 'question' | 'directive' | 'passage'. Short remarks that are none of those stay 'question' so they route as they do now. Pure. */
export function askShape(raw) {
  if (isCardCorrection(raw)) return 'question';
  if (isQuestion(raw)) return 'question';
  if (isDirective(raw)) return 'directive';
  if (isPassage(raw)) return 'passage';
  return 'question';
}

/** put a short directive on the build queue (void_queue, target want:<slug>), one open job per target. */
export async function fileDirective(env, ask, now = Date.now()) {
  const text = tidy(ask).slice(0, 200);
  if (!text || !env || !env.DB) return { ok: false };
  const target = 'want:' + (slug(text) || 'directive');
  try {
    const open = await env.DB.prepare("SELECT id FROM void_queue WHERE target = ? AND state IN ('queued','building') LIMIT 1").bind(target).first();
    if (open && open.id) return { ok: true, id: String(open.id), deduped: true };
    const id = 'w' + now.toString(36), at = new Date(now).toISOString();
    await env.DB.prepare('INSERT INTO void_queue (id, ask, target, state, note, at, updated) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, text, target, 'queued', 'from a visitor directive', at, at).run();
    return { ok: true, id };
  } catch (_) { return { ok: false }; }
}

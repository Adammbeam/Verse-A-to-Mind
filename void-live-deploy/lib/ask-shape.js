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
export const TALK_LINE = "That sounds like you're talking to me, not looking something up. Say what you'd like me to do, or ask a question.";

const LEAD = /^(?:(?:ok(?:ay)?|now|and|then|also|so|hey|verse|please|pls|yes|yeah)\b[\s,!.]*)*/i;
const QUESTION_OPEN = /^(?:what|who|where|when|why|how|which|whose|whom|is|are|am|was|were|do|does|did|can|could|should|would|will|may|might)\b/i;
const TEACH_SKILL = /\bteach\s+(?:my|your|the)\s+\w[\w-]*\s+skill\b/i;
const DIRECT_OPEN = /^(?:please\s+)?(?:fix|debug|handle|repair)\b/i;
const IN_CHARGE = /\b(?:you(?:'re| are)|verse is)\s+in charge\b|\btake (?:charge|over|the lead)\b|\byou decide\b|\b(?:if you |do you )?want to be in charge\b|\bwanna be in charge\b/i;
const TALK = /\bsay yes if you\b/i;
const WANT_YOU = /\b(?:i want|i need|i(?:'|’)d like)\s+you\s+to\b/i;
// a command is a want for Verse's own build only when it names Verse or a part of it (a skill, a card, a page, the stage). "write a poem
// about the sea", "give me a recipe for pancakes" and "make a list of fruits" are asks to answer, not build work (2026-11-25: all three
// came back "I'll take that as a want" and were filed on the build queue)
const ABOUT_VERSE = /\b(?:you|your|yourself|verse|void|a-to-mind|site|skills?|cards?|pages?|stage|build list|queue|features?|tools?|router|routing)\b/i;

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

/** an instruction or offer to Verse: a command about Verse or a part of it, "teach my X skill", "you're in charge now", "say yes if you want to be in charge", "I want you to …". An in-charge offer still counts when it is phrased as a question. Not a long analysis that only mentions those words. Pure. */
export function isDirective(raw) {
  const t = tidy(raw);
  if (!t || isCardCorrection(t)) return false;
  const bare = bareOf(t);
  const toVerse = TEACH_SKILL.test(bare) || IN_CHARGE.test(t) || WANT_YOU.test(t);
  if (toVerse) return true;
  if (isQuestion(t)) return false;
  if (isLongProse(t) && !opensWithCommand(t) && !DIRECT_OPEN.test(bare)) return false;
  return (opensWithCommand(t) || asksToMake(t) || DIRECT_OPEN.test(bare)) && ABOUT_VERSE.test(bare);
}

/** a line talking to Verse ("say yes if you …") that is not already a directive, a question to look up, or a passage. Pure. */
export function isConversational(raw) {
  const t = tidy(raw);
  if (!t || isCardCorrection(t) || isDirective(t)) return false;
  return TALK.test(t);
}

/** a pasted passage: long prose with no interrogative and no instruction, and not a correction addressed to Verse. Pure. */
export function isPassage(raw) {
  const t = tidy(raw);
  if (!t || isCardCorrection(t) || isQuestion(t) || isDirective(t)) return false;
  return isPasteText(t) || isLongProse(t) || asksSomething(t) === false && (t.length > 220);
}

/** 'question' | 'directive' | 'talk' | 'passage'. Short remarks that are none of those stay 'question' so they route as they do now. Pure. */
export function askShape(raw) {
  if (isCardCorrection(raw)) return 'question';
  if (isDirective(raw)) return 'directive';
  if (isQuestion(raw)) return 'question';
  if (isConversational(raw)) return 'talk';
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

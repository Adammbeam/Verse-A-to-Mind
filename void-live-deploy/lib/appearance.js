// The Appearance Test: a reply that only paraphrases the ask fails. A useful thing has structure.
// The Artifact Delta Test: the stage must gain lists, steps or sections, not a paragraph alone.
import { words } from './stage-words.js';

const FILLER = new Set('would say can able automatically automatic without human intervention thing something just really simply need want'.split(' '));

/** lists, steps or sections, in HTML or in a plain numbered reply. Pure. */
export function hasStructure(text) {
  const t = String(text || '');
  return /<(?:ol|ul|table|h3)\b/i.test(t) || /(?:^|\n)\s*(?:\d+[.)]|[-*])\s+\S/.test(t);
}

/** how many list rows and step lists the card adds. Pure. */
export function artifactCount(text) {
  const t = String(text || '');
  return (t.match(/<li\b/gi) || []).length + (t.match(/<ol\b/gi) || []).length;
}

/**
 * The Appearance Test. True when the reply only says the ask again.
 * A new content word that is not filler ("Paris", "miles") is not a paraphrase.
 * Pure.
 */
export function appearanceFails(ask, reply) {
  if (hasStructure(reply)) return false;
  const a = words(ask), b = words(reply);
  if (a.length < 2 || b.length < 2) return false;
  const extra = b.filter((w) => !a.includes(w) && !FILLER.has(w));
  const covered = a.filter((w) => b.includes(w)).length / a.length;
  return extra.length === 0 && covered >= 0.5;
}

/** The Artifact Delta Test. A text-only reply adds nothing. Pure. */
export function artifactDeltaFails(before, after) {
  return artifactCount(after) <= artifactCount(before);
}

export const APPEARANCE_RULE = 'The Appearance Test: do not answer by restating the question. If you cannot make the thing, name what is missing in one short sentence that is not a paraphrase.';

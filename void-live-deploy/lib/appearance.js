// A reply that only paraphrases the ask fails. A useful thing has lists, steps or sections.
import { words } from './stage-words.js';

const FILLER = new Set('would say can able automatically automatic without human intervention thing something just really simply need want'.split(' '));
const ROOT = { chaotic: 'chaos', messy: 'mess' };

function kin(a, b) {
  const ra = ROOT[a] || a, rb = ROOT[b] || b;
  if (ra === rb) return true;
  const x = ra.length <= rb.length ? ra : rb;
  const y = ra.length <= rb.length ? rb : ra;
  return x.length >= 4 && y.startsWith(x);
}

export function hasStructure(text) {
  const t = String(text || '');
  return /<(?:ol|ul|table|h3)\b/i.test(t) || /(?:^|\n)\s*(?:\d+[.)]|[-*])\s+\S/.test(t);
}

export function artifactCount(text) {
  const t = String(text || '');
  return (t.match(/<li\b/gi) || []).length + (t.match(/<ol\b/gi) || []).length;
}

/** True when the reply only says the ask again. A new word ("Paris") is not a paraphrase. Pure. */
export function appearanceFails(ask, reply) {
  if (hasStructure(reply)) return false;
  const a = words(ask), b = words(reply);
  if (a.length < 2 || b.length < 2) return false;
  const extra = b.filter((w) => !a.some((v) => kin(v, w)) && !FILLER.has(w));
  const covered = a.filter((w) => b.some((v) => kin(w, v))).length / a.length;
  return extra.length === 0 && covered >= 0.5;
}

/** The Artifact Delta Test. A text-only reply adds nothing. Pure. */
export function artifactDeltaFails(before, after) {
  return artifactCount(after) <= artifactCount(before);
}

export const APPEARANCE_RULE = 'The Appearance Test: do not answer by restating the question. If you cannot make the thing, name what is missing in one short sentence that is not a paraphrase.';

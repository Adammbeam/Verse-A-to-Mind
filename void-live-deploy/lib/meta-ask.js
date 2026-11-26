// Asks about how Verse itself can be tested, answered plainly instead of searched. Live on 2026-11-25 "Try a reasoning test" got a lecture
// on reasoning models cited to Wikipedia, and "Test its memory next" got "I do not have a memory of previous interactions" from a card that
// had just sent the earlier ask with it. A request for a test gets the test; a question about memory gets what this page really keeps.
// And a request to make something new ("Create a benchmark prompt set") is written, not looked up: no search, so no source on its card.
// Pure: no fetch, no clock.

const REASONING = /^(?:(?:ok(?:ay)?|now|so|then|please|can you|could you|let'?s|lets)[,\s]+)*(?:try|do|give me|run|start|take|have|set me|try me with|ask me)\s+(?:me\s+)?(?:a|an|another|one|some)?\s*(?:quick\s+|hard\s+|real\s+|simple\s+)?(?:reasoning|logic|logical|thinking|brain)\s+(?:test|puzzle|problem|question|challenge|riddle)s?\b|^(?:test|check)\s+(?:your|its|verse'?s)\s+(?:reasoning|logic)\b/i;
const MEMORY = /\b(?:test|check|try)\s+(?:its|your|verse'?s|the)\s+memory\b|\b(?:do|can|will|did)\s+you\s+(?:have|keep|retain|store)\s+(?:a\s+|any\s+)?memor(?:y|ies)\b|\b(?:do|can|will)\s+you\s+remember\s+(?:me|anything|our|what\s+i|my\s+(?:earlier|last|previous))\b|\bwhat\s+do\s+you\s+(?:remember|keep)\s+(?:about|of|from)\s+(?:me|us|our)\b|\b(?:card|you)\s+mention(?:ed|s)?\s+my\s+(?:earlier|previous|last|first)\s+(?:ask|question)\b|\byou\s+said\s+you\s+(?:had|have)\s+no\s+memory\b|\bhow\s+(?:does|do)\s+(?:your|verse'?s)\s+memory\s+work\b/i;

/** a request for a reasoning test ("Try a reasoning test"). */
export const isReasoningTest = (ask) => String(ask || '').trim().split(/\s+/).length <= 10 && REASONING.test(String(ask || '').trim());
/** a question about what Verse remembers ("Test its memory next", "why did your card mention my earlier question?"). */
export const isMemoryAsk = (ask) => String(ask || '').length <= 300 && MEMORY.test(String(ask || ''));
// a request to make something new, with nothing in it to look up ("about", "history of", "summary of" ask for facts and are searched)
const MAKE = /^(?:(?:please|can you|could you|now)[,\s]+)*(?:create|make|design|draft|compose|brainstorm|invent|generate|come up with|write)\b/i;
const FACTS = /\b(?:about|history|biography|summary|summari[sz]e|facts?|explain|of the life|lyrics)\b/i;
/** a request to make something new: answered from Verse's own writing, with no search. */
export const isMakeAsk = (ask) => { const a = String(ask || '').trim(); return a.length <= 200 && MAKE.test(a) && !FACTS.test(a); };

export const REASONING_ANSWER = 'Here is one. A bat and a ball cost $1.10 together, and the bat costs $1.00 more than the ball. How much does the ball cost? Reply with your answer and I will check it, or say "solve it" and I will work it through. Or send me a puzzle of your own.';
export const MEMORY_ANSWER = 'What I keep, and where. This page keeps your recent asks and the start of my answers on this device, in your browser, along with any cards you save; Forget clears them. When a new ask cannot stand on its own, like "how tall is it" right after a question about a mountain, the page sends that one earlier ask with it, and the card says so in one short line; that answer is not cached. Apart from notes you save while signed in and corrections you send about my cards, the server keeps no history tied to you: asks are logged without who sent them, so on another device, or after Forget, I start with nothing. To test it, ask something, then a short follow-up that points back, such as "how tall is it".';

// a pasted card code ("Decode this VERSE-CARD and explain every field"): live it was taken for a passage. The code is base64url JSON
// (lib/card-share.js codeOf); it is read here field by field, never run, and nothing in it is treated as an instruction.
const CODE = /(?:VERSE|Verse|V01D)-CARD:([A-Za-z0-9_-]{8,12000})/;
const FIELD = { v: 'the format version', n: 'how many times it was copied on from a pasted card', t: 'the title: the ask the card answered', k: 'the kind of card', b: 'the body: the start of the answer', src: 'the sources: each a title and an https link' };
const quoteOf = (x, n = 160) => { const t = String(x == null ? '' : x).replace(/\s+/g, ' ').trim(); return '"' + (t.length > n ? t.slice(0, n) + '…' : t) + '"'; };
/** the field-by-field reading of a card code in `ask`, or null when there is none. Pure. */
export function cardCodeAnswer(ask) {
  const m = CODE.exec(String(ask || '')); if (!m) return null;
  let d = null;
  try { const bin = atob(m[1].replace(/-/g, '+').replace(/_/g, '/')); d = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))); } catch (_) { d = null; }
  if (!d || typeof d !== 'object' || Array.isArray(d)) return 'That is a Verse card code, but it did not decode: it may have been cut when it was copied. Paste the whole line, from VERSE-CARD: to its end, and the card opens again.';
  const lines = Object.keys(d).slice(0, 12).map((k) => {
    const v = d[k], what = FIELD[k] || 'a field this reading does not know';
    if (k === 'src' && Array.isArray(v)) return '- src, ' + what + ': ' + (v.length ? v.slice(0, 8).map((s) => quoteOf(s && s.t, 80) + ' (' + String(s && s.u || '').slice(0, 120) + ')').join('; ') : 'none');
    return '- ' + k + ', ' + what + ': ' + (typeof v === 'number' ? v : quoteOf(typeof v === 'string' ? v : JSON.stringify(v)));
  });
  return 'That is a Verse card code: everything after VERSE-CARD: is base64url-encoded JSON. Its fields:\n' + lines.join('\n') + '\nIt carries nothing about who made it and no numbers; pasting the whole line here opens the card again.';
}

/** the reply for a test-or-memory ask or a card code, or null when the ask is none of those. */
export function metaAnswer(ask) {
  const answer = cardCodeAnswer(ask) || (isMemoryAsk(ask) ? MEMORY_ANSWER : isReasoningTest(ask) ? REASONING_ANSWER : null);
  return answer ? { answer, sources: [], route: 'meta', self: true } : null;
}

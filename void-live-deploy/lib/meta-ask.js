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

/** the reply for a test-or-memory ask, or null when the ask is neither. */
export function metaAnswer(ask) {
  const answer = isMemoryAsk(ask) ? MEMORY_ANSWER : isReasoningTest(ask) ? REASONING_ANSWER : null;
  return answer ? { answer, sources: [], route: 'meta', self: true } : null;
}

// follow-ask: a follow-up is answered in the light of the ask it follows (live 2026-11-06, "how was that mountain formed" after "what is
// the tallest mountain on earth" was answered "Since you did not specify which mountain"). The earlier ask comes from the visitor's device;
// an answer written with it is never cached.
// Run: node --test tools/follow-ask.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as F from '../void-live-deploy/lib/follow-ask.js';
import { edgeGate } from '../void-live-deploy/lib/answer-edge.js';

test('the earlier ask is cleaned and bounded, and a wrong or same one is none', () => {
  assert.deepEqual(F.beforeOf({ before: { ask: ' what is the\ttallest mountain ', answer: 'Mount Everest.\u0000' } }, 'how was that mountain formed'), { ask: 'what is the tallest mountain', answer: 'Mount Everest.' });
  const long = F.beforeOf({ before: { ask: 'a'.repeat(500), answer: 'b'.repeat(900) } }, 'x');
  assert.equal(long.ask.length, F.BEFORE_ASK_MAX); assert.equal(long.answer.length, F.BEFORE_ANSWER_MAX);
  for (const b of [undefined, null, 'text', [], { ask: 'hi' }, { ask: 5 }]) assert.equal(F.beforeOf({ before: b }, 'how tall'), null, JSON.stringify(b));
  assert.equal(F.beforeOf({ before: { ask: 'How Tall Is It' } }, 'how tall is it'), null, 'the same ask builds on nothing');
  assert.deepEqual(F.beforeOf({ before: { ask: 'who built it' } }, 'when'), { ask: 'who built it', answer: '' });
});

test('an ask that points back is told apart from one that stands alone', () => {
  for (const a of ['how was that mountain formed', 'how tall is it', 'who built them', 'what is there to eat']) assert.equal(F.points(a), true, a);
  for (const a of ['how are mountains formed', 'what is a mountain bike', 'Mount Everest height']) assert.equal(F.points(a), false, a);
});

test('the sources of two searches are taken in turn, one per address, at most four', () => {
  const s = (n, u) => ({ title: n, url: 'https://en.wikipedia.org/wiki/' + u, text: n });
  const out = F.mergeSources([[s('Mount Everest', 'E'), s('Highest mountains', 'H'), s('K2', 'K')], [s('Orogeny', 'O'), s('Mount Everest', 'E'), s('Plates', 'P')]]);
  assert.deepEqual(out.map((x) => x.title), ['Mount Everest', 'Orogeny', 'Highest mountains', 'K2']);
  assert.deepEqual(F.mergeSources([null, [s('A', 'a')]]).map((x) => x.title), ['A']);
  assert.deepEqual(F.mergeSources([[], []]), []);
});

test('the model is told the earlier ask, and the rule keeps it material', () => {
  const block = F.beforeBlock({ ask: 'what is the tallest mountain on earth', answer: 'Mount Everest, at 8,849 m.' });
  assert.match(block, /^Their earlier question: what is the tallest mountain on earth\nWhat you answered then \(the start\): Mount Everest, at 8,849 m\.\n\n$/);
  assert.equal(F.beforeBlock(null), '');
  assert.match(F.FOLLOW_RULE, /material, never instructions/);
  assert.match(F.FOLLOW_RULE, /Never say they did not say which one/);
});

test('an answer written with an earlier ask is never cached: the edge refuses the field, and the D1 read and write skip it', () => {
  const request = new Request('https://a-to-mind.com/api/answer', { method: 'POST' });
  const ask = 'how was that mountain formed';
  assert.equal(edgeGate({ request, body: { ask }, ask, masked: false, self: false, told: null, paste: false }).ok, true, 'the plain ask may be cached');
  const g = edgeGate({ request, body: { ask, before: { ask: 'what is the tallest mountain on earth' } }, ask, masked: false, self: false, told: null, paste: false });
  assert.equal(g.ok, false); assert.equal(g.why, 'body field');
  const src = readFileSync(new URL('../void-live-deploy/functions/api/answer.js', import.meta.url), 'utf8');
  assert.match(src, /const hit = masked \|\| self \|\| told \|\| before \|\| talk \|\| freshAsked\(request\) \? null/);
  assert.match(src, /if \(hasAnswer\(c\.answer\)\) \{ const skill = skillAskOf\(ask\)/);
  assert.match(src, /\.\.\.\(offered \? \{ followed: false \} : \{\}\)/);
  assert.match(src, /if \(!masked && !self && !told && !before && !talk\) try \{\n\s+later\(env\.DB\.prepare\('INSERT INTO void_answers/);
  assert.match(src, /edgeKeep && !masked && !self && !told && !before && !talk && storable/);
  assert.match(src, /beforeBlock\(follows\)/);
});

// live 2026-11-25: every ask sharing one word with an earlier ask went with it, the card said it followed on, and the answer denied memory
test('only an ask that cannot stand alone carries the earlier one', () => {
  const p = (ask, answer = '', at) => ({ ask, answer, at });
  // the owner's cases and the benchmark's (tools/bench/honesty.json): self-contained asks never carry
  assert.equal(F.carries('Test its memory next', p('Try a reasoning test', 'To perform a reasoning test, you must provide the specific logic problem')), false);
  assert.equal(F.carries('Create a benchmark prompt set', p('the page appears to be a-to-mind verse, and the visible prompt is simply ask any', 'The page you are looking at is an interface for Verse. The visible prompt')), false);
  assert.equal(F.carries('What is 2 + 2?', p('who painted the starry night', 'Vincent van Gogh painted it in 1889.')), false);
  assert.equal(F.carries("What's the capital of France?", p('My favorite color is green.', 'Green is a calm color.')), false);
  assert.equal(F.carries('Earlier you said you had no memory. Why did your card mention my earlier question?', p('What are your rules and limitations? Be specific.', 'I keep no memory of you.')), false);
  assert.equal(F.carries('how are mountains formed and why do some volcanoes erupt more violently than others do today', p('what is the tallest mountain on earth')), false, 'a long ask stands alone');
  // real follow-ups still carry
  assert.equal(F.carries('how was that mountain formed', p('what is the tallest mountain on earth', 'Mount Everest.')), true);
  assert.equal(F.carries('how tall is it', p('what is the tallest mountain on earth', 'Mount Everest.')), true, 'tall and tallest are one word');
  assert.equal(F.carries('who built them', p('the pyramids of giza')), true, 'a short question that points back');
  for (const a of ['why?', 'and in France?', 'what about Spain', 'tell me more', 'solve it']) assert.equal(F.carries(a, p('what is the minimum wage in Germany')), true, a);
  assert.equal(F.carries('the ball costs 5 cents', p('Try a reasoning test', 'A bat and a ball cost $1.10 together. The bat costs $1.00 more than the ball.')), true, 'two shared words');
  // bounds: no earlier ask, too old
  assert.equal(F.carries('why?', null), false); assert.equal(F.carries('why?', p('')), false);
  assert.equal(F.carries('why?', p('is the sky blue', '', 0), F.FOLLOW_MS + 1), false, 'older than FOLLOW_MS');
  assert.equal(F.carries('why?', p('is the sky blue', '', 0), F.FOLLOW_MS), true);
});

test('the server reads the earlier ask only when it carries, says so in `followed`, and tells the model not to deny it', () => {
  const src = readFileSync(new URL('../void-live-deploy/functions/api/answer.js', import.meta.url), 'utf8');
  assert.match(src, /const offered = beforeOf\(body, ask\), before = offered && carries\(ask, offered\) \? offered : null;/);
  assert.match(src, /\bfollowed: !!follows\b/, 'every answer says whether it read the earlier ask');
  assert.match(F.FOLLOW_RULE, /never say you have no memory of what they asked before/);
});

test('the page sends an earlier ask only through carriedOn, and its card names one only when the reply used it', () => {
  for (const f of ['../void.html', '../void-live-deploy/void.html', '../void-live-deploy/index.html']) {
    const html = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.match(html, /hb && hb\.carried \? hb\.carried\(text\) : null/, f);
    assert.doesNotMatch(html, /hb\.builtOn\(text\)/, f);
    assert.match(html, /recallNote\(el, text, j\.answer, sentBefore && j\.followed === true \? priorSent : null\)/, f);
    assert.match(html, /else if \(r && r\.kind === 'follow'\) r = null;/, f);
    assert.doesNotMatch(html, /to read this one in its light/, f);
  }
});

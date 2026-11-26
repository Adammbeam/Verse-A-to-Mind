// Asks about testing Verse itself (void-live-deploy/lib/meta-ask.js): live on 2026-11-25 "Try a reasoning test" got a Wikipedia lecture,
// "Test its memory next" denied the memory its own card had just used, and "Create a benchmark prompt set" was cited to a Wikipedia page.
// Run: node --test tools/meta-ask.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { metaAnswer, isReasoningTest, isMemoryAsk, isMakeAsk, MEMORY_ANSWER, REASONING_ANSWER } from '../void-live-deploy/lib/meta-ask.js';
import { isSelfAsk } from '../void-live-deploy/lib/self-context.js';

test('a request for a reasoning test gets a puzzle, with no source', () => {
  for (const a of ['Try a reasoning test', 'give me a logic puzzle', 'ok, try me with a reasoning question', 'test your reasoning']) assert.equal(isReasoningTest(a), true, a);
  for (const a of ['reasoning test results in children', 'what is a logic gate', 'how do I study for the LSAT logic games section quickly and well']) assert.equal(isReasoningTest(a), false, a);
  const m = metaAnswer('Try a reasoning test');
  assert.deepEqual(m.sources, []); assert.equal(m.answer, REASONING_ANSWER); assert.match(m.answer, /\?/);
});

test('a question about memory gets what is really kept, and never a flat denial', () => {
  for (const a of ['Test its memory next', 'Earlier you said you had no memory. Why did your card mention my earlier question?', 'do you remember me', 'do you have a memory', 'how does your memory work']) assert.equal(isMemoryAsk(a), true, a);
  for (const a of ['how much memory does an iphone have', 'What exact string did I ask you to remember?', 'memory foam mattress']) assert.equal(isMemoryAsk(a), false, a);
  const m = metaAnswer('Test its memory next');
  assert.equal(m.answer, MEMORY_ANSWER); assert.equal(m.self, true); assert.deepEqual(m.sources, []);
  assert.match(m.answer, /on this device/); assert.match(m.answer, /Forget/); assert.match(m.answer, /not cached/);
  assert.doesNotMatch(m.answer, /I (do not|don't) have (a |any )?memory/);
  assert.equal(metaAnswer('who wrote the odyssey'), null);
});

test('a request to make something is written, not looked up; a request for facts is still searched', () => {
  for (const a of ['Create a benchmark prompt set', 'write a python function to reverse a string', 'make a list', 'brainstorm names for a cat']) assert.equal(isMakeAsk(a), true, a);
  for (const a of ['write a poem about the sea', 'write a summary of the French Revolution', 'who wrote the odyssey', 'what is the capital of France']) assert.equal(isMakeAsk(a), false, a);
});

test('the server answers these before any search, skips the search for a make ask, and re-writes a cached one that carried sources', () => {
  const src = readFileSync(new URL('../void-live-deploy/functions/api/answer.js', import.meta.url), 'utf8');
  assert.match(src, /\{ const m = metaAnswer\(ask\); if \(m\) \{ edge\.mark = BYPASS; return Response\.json\(\{ \.\.\.m, at: new Date\(\)\.toISOString\(\) \}\); \} \}/);
  assert.ok(src.indexOf('metaAnswer(ask)') < src.indexOf('askShape(ask)'), 'before the shape, so a test request is never filed as a build job');
  assert.match(src, /let src = self \|\| isPaste\(ask\) \|\| note \|\| isMakeAsk\(ask\) \? \[\]/);
  assert.match(src, /!\(isMakeAsk\(ask\) && hit\.sources !== '\[\]'\)/);
});

test('"describe your architecture" is a question about Verse itself, answered from its own facts', () => {
  assert.equal(isSelfAsk('Describe your architecture. Which parts of your answer are certain knowledge and which parts are guesses?'), true);
  assert.equal(isSelfAsk('what is computer architecture'), false);
});

// The agent's system line (lib/agent-answer.js answerBrief): short everyday answers that lead with the answer, depth only when asked, and
// the general shapes of a comparison and a piece of writing. A writing ask also gets the shape/detail rule the held-out exam found missing.
// Run: node --test tools/agent-brief.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answerBrief, isWritingAsk } from '../void-live-deploy/lib/agent-answer.js';

test('the general answerer leads with the answer and keeps to about 120 words unless asked for depth', () => {
  const b = answerBrief({ name: 'verse' });
  assert.match(b, /Lead with the answer in the first sentence/);
  assert.match(b, /About 120 words or less, unless the person asks for depth/);
  assert.match(b, /No preamble or filler/);
  assert.match(b, /steps and tips as one short line each, and stop once the question is answered: no closing summary/);
  assert.ok(!/250 words/.test(b), 'the old long limit is gone');
});
test('a comparison gets what each one is, then a pick; writing gets ready-to-send text', () => {
  const b = answerBrief({ name: 'verse' });
  assert.match(b, /"difference between" question, say in one line what each one is or does and the main way they differ; do not pick a side/);
  assert.match(b, /"A or B" choice, say what each one is, then recommend, with the one condition that changes the pick/);
  assert.match(b, /health, medical, money or legal question, finish with what helps or who to ask/);
  assert.match(b, /ready-to-send text: a greeting, the point, a next step or another option/);
});
test('counted asks get a numbered list, calculations a check, caveats and declines an option, and getting around permission is never helped', () => {
  const b = answerBrief({ name: 'verse' });
  assert.match(b, /give exactly that many as a numbered list, 1\. 2\. 3\., one per line/);
  assert.match(b, /give the answer first, then one line showing how it checks/);
  assert.match(b, /the one condition that changes the pick/);
  assert.match(b, /name the one thing it does or compares each step and the one assumption it depends on/);
  assert.match(b, /one plain sentence of about 25 words that keeps every name, number and date/);
  assert.match(b, /another option when you decline or say no/);
  assert.match(b, /getting into a place or a thing without its owner saying yes, do not help with that; suggest asking the owner/);
  assert.ok(b.split(/\s+/).length < 360, 'the line stays short enough for a free model to follow');
});
test('the retry and a specialist keep the same short, lead-with-the-answer rule, and nothing is ever claimed as sent', () => {
  for (const bot of [{ name: 'verse', repair: true }, { name: 'word-counter', description: 'counts words' }]) {
    const b = answerBrief(bot);
    assert.match(b, /120 words or less/, bot.name);
    assert.match(b, /Never claim to have sent, paid, posted or deleted anything/, bot.name);
  }
  assert.match(answerBrief({ name: 'verse', repair: true }), /^You are Verse\. The last answer did not do the task\./);
  assert.match(answerBrief({ name: 'word-counter', description: 'counts words' }), /Lead with the result/);
});
test('a writing ask gets the shape rule about the kind of ask, never about its topic', () => {
  const ask = 'Write a catchy slogan for a neighborhood coffee shop called Bean There.';
  const b = answerBrief({ name: 'verse' }, ask);
  assert.match(b, /give the finished piece in exactly the shape asked for/);
  assert.match(b, /not a menu of options unless asked/);
  assert.match(b, /Keep the subject's own concrete words and every detail supplied/);
  assert.match(b, /Finish every line whole/);
  assert.ok(!/Bean There|neighborhood|coffee shop/.test(b), 'no words from this question are in the rule');
  const plain = answerBrief({ name: 'verse' });
  assert.ok(!/exactly the shape asked for/.test(plain), 'no ask means no extra rule');
  assert.ok(!/exactly the shape asked for/.test(answerBrief({ name: 'verse' }, 'What is the weather in New York?')));
  assert.match(answerBrief({ name: 'verse', repair: true }, ask), /^You are Verse\. The last answer did not do the task\./);
  assert.match(answerBrief({ name: 'verse', repair: true }, ask), /Finish every line whole/);
  assert.ok(!/Finish every line whole/.test(answerBrief({ name: 'word-counter', description: 'counts words' }, ask)));
});
test('writing requests are recognised by what is asked for, not by one phrasing', () => {
  for (const ask of [
    'Write a short email asking my landlord to fix a leaking kitchen faucet.',
    'Draft a polite text to a friend saying I can\'t make dinner tonight.',
    'Rewrite this to sound more professional: "hey, can u send me the report asap"',
    'Give me three tips for writing a clear email.',
    'Help me decline a job offer politely.',
    'Turn this into a bullet list: we need milk, eggs, bread, and to call the plumber.',
    'Suggest a title for a blog post about learning to cook as an adult.',
    'Write a two-line poem about autumn.',
  ]) assert.equal(isWritingAsk(ask), true, ask);
  for (const ask of [
    'What is the capital of France?',
    'Make a timer for 5 minutes',
    'Translate hello to Spanish',
    'what is 15% of 240',
    'Give me a bar chart for apples 10 and oranges 20',
  ]) assert.equal(isWritingAsk(ask), false, ask);
});

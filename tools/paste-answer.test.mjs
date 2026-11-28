// A long paste is the ask. One with instructions is followed. One with none is read.
// Several questions are each answered. A long body is drawn, not hidden behind copied text.
// Run: node --test tools/paste-answer.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { asksIn, fitAsk, isInstruction } from '../void-live-deploy/lib/paste-read.js';
import { bodyLayout } from '../void-live-deploy/lib/card-image.js';
import { isLongProse, longOk } from '../void-live-deploy/lib/ask-text.js';

const REFUSAL = /pasted text with no ask|say ["“']?sum it up|tell me what you want done|say which you want|looks like a passage, not a question|rest of this card is in its copied text/i;
const pad = 'The harbour log records calm water and a steady wind from the west. ';
const post = async (ask, env) => {
  const { onRequestPost } = await import('../void-live-deploy/functions/api/answer.js');
  const r = await onRequestPost({
    request: new Request('https://a-to-mind.com/api/answer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ask }) }),
    env,
    waitUntil: () => {},
  });
  return r.json();
};
const emptyDb = () => ({ prepare: () => ({ bind: () => ({ first: async () => null, run: async () => ({}), all: async () => ({ results: [] }) }) }) });

test('a long instruction is followed, and a long document is read, and neither is refused', async () => {
  const seen = [];
  const env = { DB: emptyDb(), AI: { run: async (_m, input) => { seen.push(input.messages.map((m) => m.content).join('\n')); return { response: 'Done. AMBER is the word.' }; } } };
  const instruction = pad.repeat(130) + 'Please reply with the single word AMBER.';
  assert.ok(instruction.length >= 6000, instruction.length);
  const followed = await post(instruction, env);
  assert.equal(followed.route, 'ask');
  assert.doesNotMatch(followed.answer, REFUSAL);
  assert.match(followed.answer, /AMBER/);
  assert.ok(seen.some((s) => s.includes('AMBER')), 'the model sees the instruction at the end of a long paste');
  const doc = pad.repeat(130) + 'The deposit is due before Friday and the menu is confirmed.';
  assert.ok(doc.length >= 6000);
  assert.equal(isInstruction(doc), false);
  const read = await post(doc, env);
  assert.equal(read.route, 'read');
  assert.match(read.answer, /Key points|What to do/);
  assert.match(read.answer, /deposit|Friday|menu/i);
  assert.doesNotMatch(read.answer, REFUSAL);
});

test('five questions in a long paste are each answered, in order', async () => {
  const qs = [
    '1. Does the clock stay visible after a reload?',
    '2. What happens when the timer reaches zero?',
    '3. How should a long paste be answered?',
    '4. Which plan questions must all be answered?',
    '5. Where does a results table belong?',
  ];
  const ask = 'Verse help\nclock — a clock on the stage\ntimer — a countdown on the stage\n' + pad.repeat(160) + '\n' + qs.join('\n');
  assert.ok(ask.length >= 6000, ask.length);
  const found = asksIn(ask);
  assert.equal(found.length, 5);
  const env = { DB: emptyDb(), AI: { run: async (_m, input) => ({ response: 'Answered: ' + input.messages.find((m) => m.role === 'user').content }) } };
  const res = await post(ask, env);
  assert.equal(res.route, 'asks');
  assert.doesNotMatch(res.answer, REFUSAL);
  for (const q of qs) assert.match(res.answer, new RegExp(q.replace(/[?.]/g, '').slice(3, 28).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), q);
});

test('a 10000 character help paste keeps a visible answer that addresses its questions', async () => {
  const qs = [
    '1. Does the clock stay visible after a reload?',
    '2. What happens when the timer reaches zero?',
    '3. How should a long paste be answered?',
    '4. Which plan questions must all be answered?',
    '5. Where does a results table belong?',
  ];
  let ask = 'Verse help\nclock — a clock on the stage\ntimer — a countdown on the stage\n\n' + pad.repeat(200) + '\n' + qs.join('\n');
  while (ask.length < 10000) ask += pad;
  assert.ok(ask.length >= 10000, ask.length);
  assert.equal(isLongProse(ask), true);
  assert.equal(longOk({ name: 'clock' }, ask.toLowerCase(), ask), false);
  assert.equal(longOk({ name: 'timer' }, ask.toLowerCase(), ask), false);
  const env = { DB: emptyDb(), AI: { run: async (_m, input) => ({ response: 'Noted. ' + input.messages.find((m) => m.role === 'user').content }) } };
  const res = await post(ask, env);
  assert.equal(res.route, 'asks');
  assert.ok(res.answer && res.answer.trim().length > 40, 'the answer body is not empty');
  assert.doesNotMatch(res.answer, REFUSAL);
  for (const bit of ['reload', 'zero', 'long paste', 'all be answered', 'results table']) assert.match(res.answer, new RegExp(bit, 'i'), bit);
  const laid = bodyLayout(res.answer, 246);
  const drawn = laid.els.map((e) => e.text).join('\n');
  assert.equal(laid.cut, false);
  assert.match(drawn, /reload/);
  assert.match(drawn, /results table/);
  assert.doesNotMatch(drawn, /copied text/);
  const page = readFileSync(new URL('../void.html', import.meta.url), 'utf8');
  assert.match(page, /class="vc-long"/);
  assert.ok(fitAsk(ask, 4000).includes('reload'), 'a fitted paste keeps an ask that sits past the old cap');
});

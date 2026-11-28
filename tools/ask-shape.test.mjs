// The input's shape, read before the answer engine routes it (lib/ask-shape.js).
// A passage that names a card is not a correction; a correction addressed to Verse still is, however long.
// Run: node --test tools/ask-shape.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { askShape, isQuestion, isDirective, isPassage, isConversational, DIRECTIVE_SAY, DIRECTIVE_DUP, TALK_LINE, fileDirective } from '../void-live-deploy/lib/ask-shape.js';
import { isOwnCardNote, isCardCorrection } from '../void-live-deploy/lib/self-context.js';
import { dropErrataVoice } from '../void-live-deploy/lib/answer-honesty.js';

const ORGANS = "my card said the 29 organs correspond to real biology; it should say the 29 organs are Verse's metaphor for 29 AI modules.";
const PASSAGE = [
  'On the frontier bug: the card recorded a date in void.growth.json on 2026-10-22.',
  'The later write-up argues the ledger should say the build was recorded that day by grok-bot, asked: Absorb and connect every repo on the account.',
  'This paragraph is only a reading of those lines, and it names no change for Verse to make.',
  'The build ledger, the date, and the wording are discussed as they stand on the page, not as a correction addressed to anyone.',
  'A second reading of the same card, the same recorded date, and the same suggested wording follows in this paragraph so the text is clearly a passage, not an ask.',
].join(' ');

const post = async (ask, env, waits = []) => {
  const { onRequestPost } = await import('../void-live-deploy/functions/api/answer.js');
  const r = await onRequestPost({
    request: new Request('https://a-to-mind.com/api/answer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ask }) }),
    env,
    waitUntil: (p) => waits.push(p),
  });
  return r.json();
};
const emptyDb = () => ({ prepare: () => ({ bind: () => ({ first: async () => null, run: async () => ({}), all: async () => ({ results: [] }) }) }), batch: async () => [] });

test('shape: a question, a directive, and a passage are told apart', () => {
  assert.equal(askShape('what is a black hole?'), 'question');
  assert.equal(askShape('how do i make a timer'), 'question');
  assert.equal(isQuestion('what is a black hole?'), true);
  assert.equal(askShape("you're in charge now"), 'directive');
  assert.equal(askShape('teach my weather skill "warn when rain is due"'), 'directive');
  assert.equal(askShape('make a page that lists open jobs'), 'directive');
  assert.equal(askShape('fix the login timeout on the stage'), 'directive');
  assert.equal(isDirective("you're in charge now"), true);
  assert.equal(askShape(PASSAGE), 'passage');
  assert.equal(isPassage(PASSAGE), true);
  assert.equal(isQuestion(PASSAGE), false);
  assert.equal(isDirective(PASSAGE), false);
});

test('a passage that mentions a card and "should say" is not a correction; length is not the rule', () => {
  assert.equal(isOwnCardNote(PASSAGE), true, 'the loose card detector would have taken this passage');
  assert.equal(isCardCorrection(PASSAGE), false);
  assert.equal(askShape(PASSAGE), 'passage');
  const longOrgans = 'This is a correction for you, Verse. ' + 'The earlier write-up ran long. '.repeat(24) + ORGANS;
  assert.ok(longOrgans.length > 400, 'the same correction, made long');
  assert.equal(isCardCorrection(ORGANS), true);
  assert.equal(isCardCorrection(longOrgans), true);
  assert.equal(askShape(ORGANS), 'question');
  assert.equal(askShape(longOrgans), 'question');
  assert.equal(isPassage(longOrgans), false);
  const shortReading = 'The card recorded the date; the write-up says it should say more.';
  assert.equal(isCardCorrection(shortReading), false);
  assert.equal(isPassage(shortReading), false, 'short and not a correction is not classified as a passage by length');
});

test('the errata voice is stripped when it is not a correction', () => {
  const errata = 'my card said the build was recorded in void.growth.json on 2026-10-22; it should say the build is recorded in void.growth.json on 2026-10-22 by grok-bot.';
  assert.equal(dropErrataVoice(errata), '');
  assert.equal(dropErrataVoice('A quiet summary of the paste. ' + errata), 'A quiet summary of the paste.');
  assert.equal(dropErrataVoice('The sky is cloudy today.'), 'The sky is cloudy today.');
});

test('/api/answer: a passage is not answered as a card correction and does not get self:true', async () => {
  let ran = 0;
  const env = { DB: emptyDb(), AI: { run: async () => { ran++; return { response: 'my card said the build was recorded in void.growth.json on 2026-10-22; it should say the build is recorded that day by grok-bot.' }; } } };
  const res = await post(PASSAGE, env);
  assert.equal(res.route, 'read');
  assert.notEqual(res.self, true);
  assert.match(res.answer, /Key points|What to do/);
  assert.doesNotMatch(res.answer, /pasted text with no ask|say which you want|my card said/i);
  assert.equal(ran, 0, 'the fallback model is not asked');
});

test('/api/answer: the 29-organs correction still corrects, including when the same note is long', async () => {
  const selfJson = JSON.parse(readFileSync(new URL('../void-live-deploy/self.json', import.meta.url), 'utf8'));
  const lead = ORGANS;
  const env = {
    DB: emptyDb(),
    AI: { run: async () => ({ response: lead }) },
    ASSETS: { fetch: async (req) => (new URL(req.url).pathname === '/self.json' ? Response.json(selfJson) : new Response('', { status: 404 })) },
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u, o) => (String(u).startsWith('https://api.github.com/repos/Adammbeam/Verse-A-to-Mind/pulls') ? Response.json([]) : realFetch(u, o));
  try {
    for (const note of [ORGANS, 'This is a correction for you, Verse. ' + 'The earlier write-up ran long. '.repeat(24) + ORGANS]) {
      const res = await post(note, env);
      assert.notEqual(res.route, 'passage');
      assert.notEqual(res.route, 'want');
      assert.equal(res.self, true);
      assert.match(res.answer, /my card said the 29 organs correspond to real biology/i);
      assert.match(res.answer, /it should say the 29 organs are Verse's metaphor for 29 AI modules/i);
      assert.doesNotMatch(res.answer, /\bFixed:|\bStill open:|time-saved skill|full-handoff skill/);
    }
  } finally { globalThis.fetch = realFetch; }
});

test('/api/answer: "you\'re in charge now" lands in the queue as a want, not as a question', async () => {
  const queued = [];
  const stmt = (sql) => { let args = []; const st = { bind: (...a) => { args = a; return st; }, first: async () => null, run: async () => { if (/INSERT INTO void_queue/.test(sql)) queued.push({ sql, args }); return {}; } }; return st; };
  const env = { DB: { prepare: stmt }, AI: { run: async () => ({ response: 'Sure, I can help with that. What would you like me to do?' }) } };
  const res = await post("you're in charge now", env);
  assert.equal(res.route, 'want');
  assert.notEqual(res.self, true);
  assert.equal(res.answer, DIRECTIVE_SAY);
  assert.doesNotMatch(res.answer, /my card said/i);
  assert.equal(queued.length, 1);
  assert.equal(queued[0].args[1], "you're in charge now");
  assert.match(queued[0].args[2], /^want:/);
  assert.equal(queued[0].args[3], 'queued');
});

test('fileDirective dedupes an already-open want', async () => {
  const filed = await fileDirective({ DB: { prepare: () => ({ bind: () => ({ first: async () => ({ id: 'wold' }), run: async () => { throw new Error('should not insert'); } }) }) } }, "you're in charge now");
  assert.deepEqual(filed, { ok: true, id: 'wold', deduped: true });
  const held = await fileDirective({}, "you're in charge now");
  assert.equal(held.ok, false);
});

test('an ordinary question is still a question', () => {
  assert.equal(askShape('what is a black hole?'), 'question');
  assert.equal(isDirective('what is a black hole?'), false);
  assert.equal(isPassage('what is a black hole?'), false);
  assert.equal(isCardCorrection('what is a black hole?'), false);
  const src = readFileSync(new URL('../void-live-deploy/functions/api/answer.js', import.meta.url), 'utf8');
  assert.match(src, /const shape = askShape\(ask\)/);
  assert.match(src, /if \(shape === 'passage' && !isNote\(rawAsk\) && !isInstruction\(rawAsk\)\) return Response\.json\(\{ answer: documentRead\(rawAsk\)/);
  assert.match(src, /if \(shape === 'directive'\)/);
});

const CHARGE = 'antigravity is out say yes if you want to be in charge';

test('a conversational in-charge offer is a directive, not a lookup', () => {
  assert.equal(isDirective(CHARGE), true);
  assert.equal(isQuestion(CHARGE), false);
  assert.equal(isPassage(CHARGE), false);
  assert.equal(askShape(CHARGE), 'directive');
  assert.equal(askShape('how do i make a timer'), 'question', 'an ordinary how-to stays a question');
  assert.equal(isConversational('say yes if you like the new stage'), true);
  assert.equal(askShape('say yes if you like the new stage'), 'talk');
});

test('/api/answer: "antigravity is out say yes if you want to be in charge" is a want, never a not-found YouTube guess', async () => {
  const queued = [];
  const stmt = (sql) => { let args = []; const st = { bind: (...a) => { args = a; return st; }, first: async () => null, run: async () => { if (/INSERT INTO void_queue/.test(sql)) queued.push({ sql, args }); return {}; } }; return st; };
  let ran = 0;
  const env = { DB: { prepare: stmt }, AI: { run: async () => { ran++; return { response: 'I do not have information about that. The sources discuss YouTube.' }; } } };
  const res = await post(CHARGE, env);
  assert.equal(res.route, 'want');
  assert.notEqual(res.self, true);
  assert.notEqual(res.noAnswer, true);
  assert.equal(res.guess, undefined);
  assert.equal(res.answer, DIRECTIVE_SAY);
  assert.doesNotMatch(res.answer, /could not find|Did you mean|YouTube/i);
  assert.equal(ran, 0, 'the find path is not used');
  assert.equal(queued.length, 1);
  assert.equal(queued[0].args[1], CHARGE);
});

test('a request for content is answered, never filed as build work', () => {
  for (const a of ['write a poem about the sea', 'give me a recipe for pancakes', 'make a list of fruits', 'give the strongest honest counter-view on remote work', 'fix my code: const x = ;', 'debug this function for me', 'tell me a joke', 'list 5 dog breeds', 'draw a cat']) {
    assert.equal(isDirective(a), false, a);
    assert.notEqual(askShape(a), 'directive', a);
  }
});

test('a command about Verse or one of its parts is still a want for the build list', () => {
  for (const a of ['add a skill that converts shoe sizes', 'fix your weather card', 'make a page that shows tide tables', 'make the stage remember my layout']) assert.equal(askShape(a), 'directive', a);
});

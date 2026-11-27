// The subject quiz: a subject or notes in, five checked questions out, a score, and a plain sentence when the model is down.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { askOf, promptOf, questionsFrom, scoreOf, textOf, DOWN, ROUND } from '../void-live-deploy/lib/subject-quiz.js';
import { handle } from '../void-live-deploy/functions/api/subject-quiz.js';

const good = { questions: [0, 1, 2, 3, 4].map((n) => ({ q: 'Question ' + n + '?', choices: ['a' + n, 'b' + n, 'c' + n, 'd' + n], answer: 1, why: 'Because ' + n + '.' })) };
const post = (body) => new Request('https://a-to-mind.com/api/subject-quiz', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('a subject or a short paste, and a known difficulty', () => {
  assert.equal(askOf({ difficulty: 'easy' }).error, 'Type a subject, or paste at least a few lines of notes.');
  assert.equal(askOf({ subject: 'tides', difficulty: 'nope' }).error, 'Pick a difficulty.');
  assert.equal(askOf({ subject: '  tides  ', difficulty: 'hard' }).subject, 'tides');
  assert.equal(askOf({ notes: 'x'.repeat(10), difficulty: 'easy' }).error, 'Type a subject, or paste at least a few lines of notes.');
  assert.equal(askOf({ notes: 'The moon pulls the sea. Springs are higher.', difficulty: 'medium' }).subject, 'these notes');
});

test('the prompt stays inside the notes when notes were pasted', () => {
  const notes = promptOf(askOf({ subject: 'tides', notes: 'Only this sentence is true.', difficulty: 'easy' }));
  assert.match(notes[1].content, /Do not add a fact/);
  assert.match(notes[0].content, new RegExp('Exactly ' + ROUND));
  const open = promptOf(askOf({ subject: 'tides', difficulty: 'hard' }));
  assert.match(open[1].content, /ordinary knowledge/);
});

test('a fenced reply becomes five questions, and a bad one is dropped', () => {
  const text = '```json\n' + JSON.stringify(good) + '\n```';
  const got = questionsFrom(text);
  assert.equal(got.length, 5);
  assert.equal(got[0].answer, 1);
  const junk = JSON.parse(JSON.stringify(good));
  junk.questions[0].choices = ['only', 'three', 'here'];
  junk.questions[1].answer = 9;
  junk.questions[2].choices = ['same', 'same', 'c', 'd'];
  assert.equal(questionsFrom(JSON.stringify(junk)).length, 2);
  assert.deepEqual(questionsFrom('not json'), []);
  assert.equal(textOf({ response: '<think>secret</think>{"questions":[]}' }), '{"questions":[]}');
});

test('the score is the ones you got, and the retry is the rest', () => {
  const qs = questionsFrom(JSON.stringify(good));
  const s = scoreOf(qs, [1, 0, 1, 1, 2]);
  assert.deepEqual({ correct: s.correct, total: s.total }, { correct: 3, total: 5 });
  assert.deepEqual(s.missed.map((q) => q.q), ['Question 1?', 'Question 4?']);
});

test('Workers AI answers, and a dead model says so instead of inventing a quiz', async () => {
  const ai = { AI: { run: async () => ({ response: JSON.stringify(good) }) } };
  const ok = await handle(post({ subject: 'tides', difficulty: 'easy' }), ai);
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.source, 'workers-ai');
  assert.equal(body.questions.length, 5);
  const down = await handle(post({ subject: 'tides', difficulty: 'easy' }), { AI: { run: async () => { throw new Error('down'); } } });
  assert.equal(down.status, 503);
  assert.equal((await down.json()).error, DOWN);
  const empty = await handle(post({ difficulty: 'easy' }), ai);
  assert.equal(empty.status, 400);
  const prev = globalThis.fetch;
  globalThis.fetch = async (url) => { assert.match(String(url), /api\.groq\.com/); return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(good) } }] }) }; };
  try {
    const via = await handle(post({ subject: 'tides', difficulty: 'medium' }), { AI: { run: async () => ({ response: 'nope' }) }, GROQ_API_KEY: 'groq-test' });
    assert.equal((await via.json()).source, 'groq');
  } finally { globalThis.fetch = prev; }
});

test('the page is a quiz a person can start, on the shared shell', () => {
  const html = readFileSync(new URL('../void-live-deploy/quiz/index.html', import.meta.url), 'utf8');
  assert.match(html, /<h1>Quiz me on a subject<\/h1>/);
  assert.match(html, /name="verse-handoff" content="in: text; out: text"/);
  assert.match(html, /href="\/verse.css"/);
  assert.match(html, /id="verse-nav"/);
  assert.match(html, /id="subject"/);
  assert.match(html, /id="notes"/);
  assert.match(html, /id="difficulty"/);
  assert.match(html, /Start the quiz/);
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.doesNotMatch(html, /innerHTML/);
});

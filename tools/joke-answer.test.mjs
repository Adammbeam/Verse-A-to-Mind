// /api/answer tells a joke with the joke skill's sources, routed as the joke skill, never from the cache or the model (lib/joke-answer.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isJokeAsk, jokeAnswer } from '../void-live-deploy/lib/joke-answer.js';
import skill from '../void-live-deploy/skills/joke.js';

const json = (v) => async (url) => ({ json: async () => (typeof v === 'function' ? v(url) : v) });

test('joke asks are the joke skill\'s, by its own examples and near-misses; a riddle is the riddle skill\'s', () => {
  for (const a of [...skill.examples, 'Tell me a joke!', 'tongue twister']) assert.equal(isJokeAsk(a), true, a);
  for (const a of [...skill.nearMisses, 'who invented the joke', 'history of jokes', 'a riddle', '']) assert.equal(isJokeAsk(a), false, a);
});

test('a plain joke is fetched from icanhazdadjoke and routed to the joke skill with its source', async () => {
  let asked = '';
  const r = await jokeAnswer('tell me a joke', { fetch: json((u) => { asked = u; return { id: 'abc', joke: 'Why did the scarecrow win? He was outstanding in his field.' }; }) });
  assert.equal(asked, 'https://icanhazdadjoke.com/');
  assert.equal(r.route, 'skill'); assert.equal(r.skill, 'joke'); assert.equal(r.source, 'skill:joke');
  assert.match(r.answer, /scarecrow/); assert.deepEqual(r.sources, [{ title: 'icanhazdadjoke', url: 'https://icanhazdadjoke.com/j/abc' }]);
});

test('a topic is searched and only jokes naming it are told; none is said plainly', async () => {
  const r = await jokeAnswer('tell me a joke about cats', { fetch: json({ results: [{ id: '1', joke: 'A catholic walks in.' }, { id: '2', joke: 'My cat is purr-fect.' }] }) });
  assert.equal(r.answer, 'My cat is purr-fect.');
  const none = await jokeAnswer('tell me a joke about cats', { fetch: json({ results: [] }) });
  assert.match(none.answer, /no joke about cats/); assert.equal(none.skill, 'joke');
});

test('twisters and knock-knocks come from the skill\'s own lists; a dead service is said, not invented', async () => {
  const no = async () => { throw new Error('should not fetch'); };
  assert.match((await jokeAnswer('knock knock', { fetch: no, rnd: () => 0 })).answer, /^Knock knock\.\nWho's there\?\nLettuce\./);
  assert.match((await jokeAnswer('tongue twister', { fetch: no, rnd: () => 0 })).answer, /seashells/);
  const dead = await jokeAnswer('tell me a joke', { fetch: async () => { throw new Error('down'); } });
  assert.equal(dead.answer, null); assert.equal(dead.skill, 'joke'); assert.match(dead.note, /didn't answer/);
  assert.equal(await jokeAnswer('who invented the joke', { fetch: no }), null);
});

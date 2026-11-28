// The live follow-line gate's judgement: a visible line is a reply's followed:true, never the page's memory of an earlier ask.
import test from 'node:test';
import assert from 'node:assert/strict';
import { verdict, CASES, LINE, SITE } from './follow-line-live.mjs';

const row = (x) => ({ followed: undefined, before: false, visible: false, text: '', ...x });

test('a real follow-up shows the line, names the ask, and carries followed:true', () => {
  assert.equal(verdict('follow', row({ followed: true, before: true, visible: true, text: 'Read with your earlier ask “Who wrote Dune?”' })), '');
  assert.match(verdict('follow', row({ followed: undefined, before: true, visible: true, text: 'Who wrote Dune?' })), /followed:true/);
  assert.match(verdict('follow', row({ followed: true, before: false, visible: true, text: 'Who wrote Dune?' })), /did not send/);
  assert.match(verdict('follow', row({ followed: true, before: true, visible: false, text: '' })), /hidden/);
  assert.match(verdict('follow', row({ followed: true, before: true, visible: true, text: 'Read with your earlier ask “something else”' })), /does not name/);
});

test('an unrelated pair hides the line, and a false or absent field is never read as a follow', () => {
  for (const f of [undefined, false]) assert.equal(verdict('unrelated', row({ followed: f, visible: false })), '');
  assert.match(verdict('unrelated', row({ followed: true, visible: false })), /unrelated/);
  assert.match(verdict('unrelated', row({ followed: false, visible: true })), /shown although/);
});

test('the controlled false case fails if the page shows the line for followed:false', () => {
  assert.equal(verdict('false', row({ followed: false, visible: false })), '');
  assert.match(verdict('false', row({ followed: false, visible: true })), /shown although/);
  assert.match(verdict('false', row({ followed: true, visible: false })), /did not carry followed:false/);
  assert.match(verdict('unknown', row()), /unknown case/);
});

test('the gate covers both real pairs and the controlled false reply on the live site', () => {
  assert.deepEqual(CASES.map((c) => c.id), ['follow', 'unrelated', 'false']);
  assert.deepEqual(CASES.map((c) => c.force), [null, null, false]);
  assert.deepEqual(CASES[0].asks, ['Who wrote Dune?', 'When was he born?']);
  assert.deepEqual(CASES[1].asks, ['My favorite color is green.', "What's the capital of France?"]);
  assert.match(LINE, /data-recall="follow"/);
  assert.equal(SITE, 'https://a-to-mind.com');
});

// Notes a job card can hang on a failed node --test run. Run: node --test tools/check-annotations.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { annotate, LIMITS } from '../void-live-deploy/lib/check-annotations.js';

const ROOT = '/work/Verse-A-to-Mind';
const fake = 'ghp_' + 'x'.repeat(36); // secret-scan: ok (made-up key shape, never a real token)

const TWO = `TAP version 13
# Subtest: left fails
not ok 1 - left fails
  ---
  duration_ms: 1.1
  type: 'test'
  location: 'file:///work/Verse-A-to-Mind/tools/alpha.test.mjs:12:3'
  failureType: 'testCodeFailure'
  error: 'left side'
  code: 'ERR_ASSERTION'
  stack: |-
    TestContext.<anonymous> (file:///work/Verse-A-to-Mind/tools/alpha.test.mjs:99:41)
    Test.run (node:internal/test_runner/test:1047:25)
  ...
# Subtest: right fails
not ok 2 - right fails
  ---
  duration_ms: 0.4
  type: 'test'
  failureType: 'testCodeFailure'
  error: |-
    right side
    still the same failure
  code: 'ERR_TEST_FAILURE'
  stack: |-
    TestContext.<anonymous> (node:internal/test_runner/test:1:1)
    at check (file:///work/Verse-A-to-Mind/void-live-deploy/lib/beta.js:40:8)
  ...
1..2
# tests 2
# pass 0
# fail 2
`;

test('two not ok blocks become two notes with the path and line', () => {
  const notes = annotate(TWO, { root: ROOT });
  assert.equal(notes.length, 2);
  assert.deepEqual(notes[0], { path: 'tools/alpha.test.mjs', line: 12, level: 'failure', message: 'left side' });
  assert.deepEqual(notes[1], {
    path: 'void-live-deploy/lib/beta.js',
    line: 40,
    level: 'failure',
    message: 'right side still the same failure',
  });
});

test('an absolute path is cut to the repo, and a path outside it is dropped', () => {
  const tap = `not ok 1 - inside
  ---
  location: '/work/Verse-A-to-Mind/tools/inside.test.mjs:8:1'
  error: 'in'
  ...
not ok 2 - outside
  ---
  location: '/tmp/outside/secret.test.js:4:1'
  error: 'out'
  stack: |-
    at Test (node:internal/test_runner/test:1:1)
  ...
not ok 3 - other tree
  ---
  location: '/other/repo/tools/nope.js:1:1'
  error: 'nope'
  ...
not ok 4 - escape
  ---
  location: '/work/Verse-A-to-Mind/tools/../outside.js:2:1'
  error: 'escape'
  ...
not ok 5 - stack saves it
  ---
  location: '/tmp/outside.js:2:1'
  error: 'moved'
  stack: |-
    at Test (node:internal/test_runner/test:9:1)
    at run (file:///work/Verse-A-to-Mind/tools/moved.test.mjs:7:4)
  ...`;
  assert.deepEqual(annotate(tap, { root: ROOT }), [
    { path: 'tools/inside.test.mjs', line: 8, level: 'failure', message: 'in' },
    { path: 'tools/moved.test.mjs', line: 7, level: 'failure', message: 'moved' },
  ]);
});

test('without a root, a tools or void-live-deploy absolute path is still repo-relative', () => {
  const tap = `not ok 1 - lib
  ---
  location: '/home/runner/Verse-A-to-Mind/void-live-deploy/lib/beta.js:4:1'
  error: 'lib'
  ...`;
  assert.deepEqual(annotate(tap), [
    { path: 'void-live-deploy/lib/beta.js', line: 4, level: 'failure', message: 'lib' },
  ]);
});

test('at most 50 notes, and a message is cut to 200 characters', () => {
  const long = 'm'.repeat(240);
  const parts = [];
  for (let n = 1; n <= 55; n++) {
    parts.push(`not ok ${n} - case ${n}\n  ---\n  location: 'tools/many.test.mjs:${n}:1'\n  error: '${n === 1 ? long : 'case ' + n}'\n  ...`);
  }
  const notes = annotate(parts.join('\n'));
  assert.equal(notes.length, LIMITS.maxNotes);
  assert.equal(notes[0].message.length, LIMITS.maxMessage);
  assert.equal(notes[0].message, 'm'.repeat(LIMITS.maxMessage));
  assert.equal(notes[49].message, 'case 50');
  assert.equal(notes.some((n) => n.message === 'case 51'), false);
});

test('a key shape in the error is masked', () => {
  const tap = `not ok 1 - token
  ---
  location: 'tools/token.test.mjs:4:1'
  error: 'bad token ${fake}'
  ...`;
  const notes = annotate(tap);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].message.includes('ghp_'), false);
  assert.match(notes[0].message, /\[redacted\]/);
});

test('a todo not ok is a warning, and passing output is an empty list', () => {
  const todo = `not ok 1 - later # TODO
  ---
  location: 'tools/later.test.mjs:3:1'
  failureType: 'testCodeFailure'
  error: 'not yet'
  ...`;
  assert.deepEqual(annotate(todo), [
    { path: 'tools/later.test.mjs', line: 3, level: 'warning', message: 'not yet' },
  ]);
  const passing = `TAP version 13
ok 1 - fine
  ---
  duration_ms: 0.4
  type: 'test'
  location: '/work/Verse-A-to-Mind/tools/fine.test.mjs:1:1'
  ...
1..1
# tests 1
# pass 1
# fail 0
`;
  assert.deepEqual(annotate(passing, { root: ROOT }), []);
  assert.deepEqual(annotate(''), []);
  assert.deepEqual(annotate(null), []);
});

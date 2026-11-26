// tools/pr-autofix.mjs: the two fast tiers, their scope, and the cap that stops them. node --test tools/pr-autofix.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { allowedBranch, failureLines, fileList, taskFor, repairJob, afterLastAttempt } from './pr-autofix.mjs';
import { claim, readCap } from './fix-cap.mjs';

test('only same-repo helper and loop branches qualify', () => {
  assert.equal(allowedBranch('helper/pr-autofix'), true);
  assert.equal(allowedBranch('loop/20261124-025316'), true);
  assert.equal(allowedBranch('main'), false);
  assert.equal(allowedBranch('feature/x'), false);
  assert.equal(allowedBranch(''), false);
  const workflow = readFileSync(new URL('../.github/workflows/pr-autofix.yml', import.meta.url), 'utf8');
  assert.match(workflow, /head_repository\.full_name == github\.repository/);
  assert.match(workflow, /workflows: \["Merge gate", "Verse review"\]/);
});

test('failure lines keep the failing assertion and mask key-like runs', () => {
  const madeUp = 'x'.repeat(32);
  const text = ['a quiet line', 'FAIL poster wins: phone chip', '  error: ' + madeUp, 'not ok 3 - coin flip', ''].join('\n');
  const out = failureLines(text);
  assert.match(out, /FAIL poster wins/);
  assert.match(out, /not ok 3 - coin flip/);
  assert.ok(!out.includes(madeUp), 'no long key-like run reaches the model');
  assert.match(out, /\[masked\]/);
  assert.equal(failureLines(''), '(the failed run printed no failure line)');
  assert.equal(failureLines('FAIL x\nFAIL y', { maxLines: 1 }), 'FAIL y');
});

test('the coder gets only the named files, the failed check and its failure lines', () => {
  assert.deepEqual(fileList('tools/families.mjs\n\nvoid.html\n'), ['tools/families.mjs', 'void.html']);
  const task = taskFor({ pr: 3421, workflow: 'Merge gate', files: ['tools/families.mjs'], failures: 'FAIL families' });
  assert.match(task, /pull request #3421/);
  assert.match(task, /Merge gate/);
  assert.match(task, /tools\/families\.mjs/);
  assert.match(task, /FAIL families/);
  assert.match(task, /Do not edit \.github\/workflows/);
  assert.match(task, /do not weaken a test/);
});

test('the fallback is one Repair job, distinct from the review fix job', () => {
  assert.deepEqual(repairJob(42, 'still red'), {
    ask: 'Repair pull request #42: still red', target: 'repair:pr-42',
  });
  assert.equal(afterLastAttempt(1), false, 'the first red run waits for the second lap');
  assert.equal(afterLastAttempt(2), true, 'only the last lap files the one job');
});

test('autofix gets two attempts in the same hidden cap comment', () => {
  let comments = [];
  const first = claim(comments, 'autofix');
  assert.equal(first.allowed, true);
  comments = [{ id: 1, body: first.body }];
  const second = claim(comments, 'autofix');
  assert.equal(second.allowed, true);
  assert.equal(second.count, 2);
  comments = [{ id: 1, body: second.body }];
  assert.equal(claim(comments, 'autofix').allowed, false, 'the third autofix is refused');
  assert.equal(readCap(comments).counts.copy, 0, 'copy rewrites have their own count');
  assert.equal(claim(comments, 'conflict').allowed, true);
  assert.equal(claim([{ body: '<!-- fix-cap copy=0 conflict=2 -->' }], 'autofix').count, 1, 'old comments still count from zero');
});

// Rules for a change onto main. Run: node --test tools/ruleset.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULESET, evaluate, matchGlob, pathRefused } from '../void-live-deploy/lib/ruleset.js';

const HELD = 'void-live-deploy/functions/code/[[path]].js';

function rules(over = {}) {
  return { mode: 'enforce', required_checks: [], restrict_paths: [], max_file_bytes: 1000000, ...over };
}

test('a held path fails in enforce mode and is only listed in evaluate mode', () => {
  const body = {
    required_checks: [],
    restrict_paths: [{ glob: 'void-live-deploy/functions/code/*', reason: 'held by #146' }],
    max_file_bytes: 1000000,
  };
  const change = { files: [{ path: HELD, bytes: 40 }], runs: [] };
  const enforced = evaluate({ ...body, mode: 'enforce' }, change);
  assert.equal(enforced.ok, false);
  assert.deepEqual(enforced.violations, [
    { rule: 'restrict_paths', reason: 'held by #146', mode: 'enforce', path: HELD },
  ]);
  const evaluated = evaluate({ ...body, mode: 'evaluate' }, change);
  assert.equal(evaluated.ok, true);
  assert.deepEqual(evaluated.violations, [
    { rule: 'restrict_paths', reason: 'held by #146', mode: 'evaluate', path: HELD },
  ]);
});

test('a required check that is missing or not passed is a violation', () => {
  const set = rules({ required_checks: ['suite', 'lint'] });
  const missing = evaluate(set, { files: [], runs: [{ name: 'suite', conclusion: 'pass' }] });
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.violations, [
    { rule: 'required_checks', reason: 'required check lint is missing', mode: 'enforce' },
  ]);
  const failed = evaluate(set, {
    files: [],
    runs: [
      { name: 'suite', state: 'done', conclusion: 'pass' },
      { name: 'lint', state: 'done', conclusion: 'fail' },
    ],
  });
  assert.deepEqual(failed.violations, [
    { rule: 'required_checks', reason: 'required check lint did not pass', mode: 'enforce' },
  ]);
  const running = evaluate(rules({ required_checks: ['suite'] }), {
    files: [],
    runs: [{ name: 'suite', state: 'running', conclusion: 'pass' }],
  });
  assert.equal(running.violations[0].reason, 'required check suite did not pass');
  const clean = evaluate(set, {
    files: [],
    runs: [
      { name: 'suite', conclusion: 'pass' },
      { name: 'lint', state: 'done', conclusion: 'pass' },
      { name: 'extra', conclusion: 'fail' },
    ],
  });
  assert.deepEqual(clean, { ok: true, violations: [] });
  const listed = evaluate({ ...set, mode: 'evaluate' }, { files: [], runs: [] });
  assert.equal(listed.ok, true);
  assert.deepEqual(listed.violations.map((row) => row.reason), [
    'required check suite is missing',
    'required check lint is missing',
  ]);
});

test('a file over the max size is a violation and a file at the max is not', () => {
  const set = rules({ max_file_bytes: 1000 });
  assert.deepEqual(evaluate(set, { files: [{ path: 'lib/a.js', bytes: 1000 }], runs: [] }), { ok: true, violations: [] });
  const over = evaluate(set, { files: [{ path: 'lib/a.js', bytes: 1001 }], runs: [] });
  assert.equal(over.ok, false);
  assert.deepEqual(over.violations, [
    { rule: 'max_file_bytes', reason: 'file is over the 1000 byte limit', mode: 'enforce', path: 'lib/a.js' },
  ]);
});

test('a star stays in one segment, a double star crosses, and brackets stay literal', () => {
  assert.equal(matchGlob('void-live-deploy/functions/code/*', HELD), true);
  assert.equal(matchGlob('void-live-deploy/*/[[path]].js', HELD), false);
  assert.equal(matchGlob('void-live-deploy/**/[[path]].js', HELD), true);
  assert.equal(matchGlob(HELD, HELD), true);
  assert.equal(matchGlob(HELD, 'void-live-deploy/functions/code/p.js'), false);
  assert.equal(matchGlob('[[path]]', 'p'), false);
  assert.equal(matchGlob('[[path]]', '[[path]]'), true);
  assert.equal(matchGlob('lib/*.js', 'lib/a/b.js'), false);
  assert.equal(matchGlob('lib/**/*.js', 'lib/a/b.js'), true);
  assert.equal(matchGlob('lib/**/*.js', 'lib/b.js'), true);
  assert.equal(matchGlob('lib/**', 'lib'), false);
  assert.equal(matchGlob('lib/**', 'lib/a.js'), true);
  assert.equal(matchGlob('**/[[path]].js', '[[path]].js'), true);
});

test('paths and globs with .. or a leading slash are refused', () => {
  assert.equal(pathRefused('/abs/a.js'), 'paths with .. or a leading / are refused');
  assert.equal(pathRefused('a/../../b.js'), 'paths with .. or a leading / are refused');
  assert.equal(pathRefused('lib/ruleset.js'), '');
  assert.equal(matchGlob('**', '/abs/a.js'), false);
  assert.equal(matchGlob('**', 'a/../b.js'), false);
  const abs = evaluate(rules(), { files: [{ path: '/abs/a.js', bytes: 4 }], runs: [] });
  assert.equal(abs.ok, false);
  assert.deepEqual(abs.violations, [
    { rule: 'path', reason: 'paths with .. or a leading / are refused', mode: 'enforce', path: '/abs/a.js' },
  ]);
  const dot = evaluate(rules(), { files: [{ path: 'lib/../../secret.js', bytes: 4 }], runs: [] });
  assert.equal(dot.violations[0].rule, 'path');
  const badGlob = evaluate(rules({
    restrict_paths: [{ glob: '../secret/**', reason: 'no' }, { glob: '/lib/*', reason: 'no' }],
  }), { files: [{ path: 'secret/a.js', bytes: 4 }], runs: [] });
  assert.equal(badGlob.ok, false);
  assert.equal(badGlob.violations.length, 2);
  assert.equal(badGlob.violations.every((row) => row.rule === 'restrict_paths' && /refused/.test(row.reason)), true);
  assert.equal(badGlob.violations.some((row) => row.path), false);
});

test('the change request that holds a path may still touch it', () => {
  const set = rules({ restrict_paths: [{ glob: 'lib/*.js', reason: 'held by #146', until_pr: 146 }] });
  const file = { path: 'lib/ruleset.js', bytes: 20 };
  assert.equal(evaluate(set, { files: [file], runs: [], pr: 146 }).ok, true);
  const other = evaluate(set, { files: [file], runs: [], pr: 147 });
  assert.equal(other.ok, false);
  assert.equal(other.violations[0].reason, 'held by #146');
});

test('evaluate does not mutate its inputs, and a bad mode is refused', () => {
  const set = rules({
    required_checks: ['suite'],
    restrict_paths: [{ glob: HELD, reason: 'held by #146' }],
    max_file_bytes: 10,
  });
  const change = { files: [{ path: HELD, bytes: 11 }], runs: [{ name: 'suite', conclusion: 'fail' }], pr: 9 };
  const before = JSON.stringify({ set, change });
  const got = evaluate(set, change);
  assert.equal(JSON.stringify({ set, change }), before);
  assert.equal(got.ok, false);
  assert.deepEqual(got.violations.map((row) => row.rule), ['max_file_bytes', 'restrict_paths', 'required_checks']);
  assert.throws(() => evaluate({ mode: 'off' }, { files: [], runs: [] }), /mode must be enforce or evaluate/);
  assert.throws(() => { RULESET.modes.push('off'); });
  assert.deepEqual(RULESET.rules, ['required_checks', 'restrict_paths', 'max_file_bytes', 'path']);
});

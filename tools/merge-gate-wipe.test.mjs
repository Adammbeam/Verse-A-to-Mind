// merge-gate must refuse a merge that would empty the tree the way 9a726fe did, and still
// let a normal merge through. Run: node --test tools/merge-gate-wipe.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawnSync } from 'node:child_process';
import { mergeWipe } from './merge-gate.mjs';
import { wipeRefusal } from './wipe-guard.mjs';

const here = dirname(fileURLToPath(import.meta.url));

test('mergeWipe uses the same deletion cap as wipe-guard', () => {
  const names = (n) => Array.from({ length: n }, (_, i) => 'f' + i).join('\n');
  assert.equal(mergeWipe({ deletedText: names(2), treeText: names(60) }), null);
  assert.match(mergeWipe({ deletedText: names(55), treeText: names(60) }), /delete 55 files/);
  assert.equal(mergeWipe({ deletedText: names(55), treeText: names(60), allow: true }), null);
  assert.equal(mergeWipe({ deletedText: names(55), treeText: names(60) }), wipeRefusal({ deleted: 55, treeSize: 60 }));
});

function repo() {
  const root = mkdtempSync(join(tmpdir(), 'merge-gate-wipe-'));
  const sh = (c, cwd = root) => execSync(c, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  sh('git init -q -b main');
  sh('git config user.email t@example.invalid && git config user.name t && git config commit.gpgsign false');
  mkdirSync(join(root, 'tools'), { recursive: true });
  // merge-gate and its imports must be loadable from the fixture when it spawns tools/merge-gate.mjs
  // We run the real tools/merge-gate.mjs with MERGE_GATE_ROOT pointed at this repo instead.
  for (let i = 0; i < 60; i++) writeFileSync(join(root, 'f' + i + '.txt'), 'x');
  sh('git add -A && git commit -q -m many');
  return { root, sh };
}

function gate(root, env = {}) {
  return spawnSync(process.execPath, [join(here, 'merge-gate.mjs')], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, MERGE_GATE_ROOT: root, MERGE_GATE_BASE: 'main', MERGE_GATE_STOP_AFTER_WIPE: '1', ...env },
  });
}

test('merge-gate refuses a branch that deletes most of the tree, and lets a normal merge through', () => {
  const { root, sh } = repo();
  try {
    sh('git checkout -q -b add-one');
    writeFileSync(join(root, 'note.txt'), 'ok');
    sh('git add note.txt && git commit -q -m add');
    sh('git checkout -q main');
    writeFileSync(join(root, 'main-note.txt'), 'main moved');
    sh('git add main-note.txt && git commit -q -m main-moved');
    sh('git checkout -q add-one');
    const ok = gate(root);
    assert.equal(ok.status, 0, 'ok run: status ' + ok.status + ' stdout=' + ok.stdout + ' stderr=' + ok.stderr);
    assert.match(ok.stdout + ok.stderr, /committed the merge/);

    sh('git checkout -q main');
    sh('git checkout -q -b wipe');
    sh('git rm -q ' + Array.from({ length: 55 }, (_, i) => 'f' + i + '.txt').join(' '));
    sh('git commit -q -m wipe');
    sh('git checkout -q main');
    writeFileSync(join(root, 'main-2.txt'), 'again');
    sh('git add main-2.txt && git commit -q -m main-2');
    sh('git checkout -q wipe');
    const bad = gate(root);
    assert.equal(bad.status, 1, bad.stderr + bad.stdout);
    assert.match(bad.stderr, /delete 55 files/);
    const forced = gate(root, { VOID_ALLOW_WIPE: '1' });
    assert.equal(forced.status, 0, forced.stderr + forced.stdout);
    assert.match(forced.stdout + forced.stderr, /committed the merge/);
  } finally {
    try { rmSync(root, { recursive: true, force: true }); } catch (_) {}
  }
});

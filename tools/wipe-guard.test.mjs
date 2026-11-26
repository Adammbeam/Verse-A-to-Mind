import test from 'node:test';
import assert from 'node:assert/strict';
import { wipeRefusal, deletedNames, treePayload, contentsPut, skillIndexGaps, allowWipe, MAX_DELETE_FILES, ALLOW_ENV } from './wipe-guard.mjs';

test('a handful of deletions is allowed; 9a726fe-shaped wipes are not', () => {
  assert.equal(wipeRefusal({ deleted: 0, treeSize: 10665 }), null);
  assert.equal(wipeRefusal({ deleted: 12, treeSize: 10665 }), null);
  assert.equal(wipeRefusal({ deleted: MAX_DELETE_FILES, treeSize: 10665 }), null);
  const wipe = wipeRefusal({ deleted: 10665, treeSize: 10666 });
  assert.match(wipe, /delete 10665 files/);
  assert.match(wipe, /100% of the 10666-file tree/);
  assert.match(wipe, new RegExp(ALLOW_ENV + '=1'));
  assert.equal(wipeRefusal({ deleted: 10665, treeSize: 10666, allow: true }), null);
  assert.match(wipeRefusal({ deleted: 51, treeSize: 10000 }), /delete 51 files/);
  assert.match(wipeRefusal({ deleted: 600, treeSize: 10000 }), /6% of the 10000-file tree/);
});

test('VOID_ALLOW_WIPE is the only override that counts as allow', () => {
  assert.equal(allowWipe({}), false);
  assert.equal(allowWipe({ VOID_SKIP_PREPUSH: '1' }), false);
  assert.equal(allowWipe({ [ALLOW_ENV]: '1' }), true);
  assert.equal(allowWipe({ [ALLOW_ENV]: 'true' }), true);
});

test('deletedNames reads name-status and a plain deleted-names list', () => {
  assert.deepEqual(deletedNames('D\tdomains/a.md\nM\tdomains/b.md\nD\ttools/c.mjs\n'), ['domains/a.md', 'tools/c.mjs']);
  assert.deepEqual(deletedNames('void.html\nvoid-live-deploy/void.html\n'), ['void.html', 'void-live-deploy/void.html']);
});

test('a Git Data API tree without base_tree is refused, and so is a wipe even with it', () => {
  const basePaths = ['a', 'b', 'c'].concat(Array.from({ length: 80 }, (_, i) => 'f' + i));
  const bare = treePayload({ entries: [{ path: 'domains/growth-inbox.md', mode: '100644', type: 'blob', sha: 'abc' }], basePaths: ['domains/growth-inbox.md', ...basePaths] });
  assert.equal(bare.payload, null);
  assert.match(bare.error, /base_tree|delete /);
  const ok = treePayload({ baseTree: 'tree-sha', entries: [{ path: 'domains/growth-inbox.md', mode: '100644', type: 'blob', sha: 'abc' }], basePaths });
  assert.deepEqual(ok.payload, { base_tree: 'tree-sha', tree: [{ path: 'domains/growth-inbox.md', mode: '100644', type: 'blob', sha: 'abc' }] });
  assert.equal(ok.error, null);
  const many = treePayload({ baseTree: 'tree-sha', entries: basePaths.map((p) => ({ path: p, sha: null })), basePaths });
  assert.equal(many.payload, null);
  assert.match(many.error, /delete /);
});

test('Contents API updates of an existing file need its sha', () => {
  assert.equal(contentsPut({ exists: false }), null);
  assert.equal(contentsPut({ exists: true, sha: 'def' }), null);
  assert.match(contentsPut({ exists: true }), /missing the file sha/);
});

test('a new skill order file must appear in the index the ask bar fetches', () => {
  assert.deepEqual(skillIndexGaps({ files: ['void-live-deploy/skills/order/1896-stage-pdf', 'docs/MAP.md'], indexNames: ['pdf-tools'] }), ['stage-pdf']);
  assert.deepEqual(skillIndexGaps({ files: ['void-live-deploy/skills/order/1896-stage-pdf'], indexNames: ['stage-pdf', 'pdf-tools'] }), []);
  assert.deepEqual(skillIndexGaps({ files: ['void-live-deploy/skills/stage-pdf.js'], indexNames: [] }), []);
});

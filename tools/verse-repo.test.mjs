// node --test tools/verse-repo.test.mjs: the one slug live readers use for Verse's public repo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { REPO, REPO_URL, REPO_API, ownRepoUrl } from '../void-live-deploy/lib/verse-repo.js';

test('the home slug and the URLs built from it', () => {
  assert.equal(REPO, 'Adammbeam/Verse-A-to-Mind');
  assert.equal(REPO_URL, 'https://github.com/Adammbeam/Verse-A-to-Mind');
  assert.equal(REPO_API, 'https://api.github.com/repos/Adammbeam/Verse-A-to-Mind');
});

test('own-repo links are kept; file and commit links on the old home are rewritten; pull, issue and Actions numbers are not', () => {
  const home = 'https://github.com/Adammbeam/Verse-A-to-Mind';
  assert.equal(ownRepoUrl(home + '/pull/2'), home + '/pull/2');
  assert.equal(ownRepoUrl(home + '/issues/1'), home + '/issues/1');
  assert.equal(ownRepoUrl(home + '/actions/runs/9'), home + '/actions/runs/9');
  assert.equal(ownRepoUrl(home + '/commit/abcdef1'), home + '/commit/abcdef1');
  assert.equal(ownRepoUrl('https://github.com/atomeam/void-loop/blob/main/findings/mcp/2026-11-25T0502.json'), home + '/blob/main/findings/mcp/2026-11-25T0502.json');
  assert.equal(ownRepoUrl('https://github.com/atomeam/void-loop/commit/f85640b4285266fa20107cee169e20c5627246f9'), home + '/commit/f85640b4285266fa20107cee169e20c5627246f9');
  assert.equal(ownRepoUrl('https://github.com/atomeam/void-loop/actions/runs/44936349604'), '');
  assert.equal(ownRepoUrl('https://github.com/atomeam/void-loop/pull/3217'), '');
  assert.equal(ownRepoUrl('https://github.com/atomeam/void-loop/issues/3325'), '');
  assert.equal(ownRepoUrl('https://evil.example/x'), '');
  assert.equal(ownRepoUrl(''), '');
});

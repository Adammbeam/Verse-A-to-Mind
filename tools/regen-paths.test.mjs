// tools/regen-paths.mjs: the deploy's copies stay out of pull requests, pure.
import test from 'node:test';
import assert from 'node:assert/strict';
import { REGEN, DEPLOY_ONLY, restoreTargets } from './regen-paths.mjs';
import { OUT as CHURN_OUT } from './churn.mjs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const churnPath = relative(root, CHURN_OUT).replace(/\\/g, '/');

test('a refresh writes the build outputs and the inventories, not the sources', () => {
  assert.ok(REGEN.includes('void-live-deploy/self.json'));
  assert.ok(REGEN.includes('skills/order/0100-x') === false, 'the order file is the source, not an output');
  assert.deepEqual(restoreTargets(['tools/a.mjs', 'void-live-deploy/self.json', 'docs/PARITY/clock7.com.md', 'void-live-deploy/history/2026.md', 'void-live-deploy/skills/order/0100-x']),
    ['void-live-deploy/self.json', 'docs/PARITY/clock7.com.md', 'void-live-deploy/history/2026.md']);
});

test('the copies that name a commit or a time window are deploy-only', () => {
  for (const f of ['void-live-deploy/self.json', 'void-live-deploy/sitemap.xml', churnPath, 'void-live-deploy/brain/knows.json']) {
    assert.ok(DEPLOY_ONLY.includes(f), f);
    assert.ok(REGEN.includes(f) || f.startsWith('void-live-deploy/'), f + ' is a deploy output');
  }
  assert.ok(!DEPLOY_ONLY.includes('void-live-deploy/skills/guide.json'), 'the book is generated from sources a pull request may carry');
});

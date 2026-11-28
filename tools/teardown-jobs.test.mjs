// node --test tools/teardown-jobs.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { JOB_HEADS, filesFor, jobsOf } from '../void-live-deploy/lib/teardown-jobs.js';

const gaps = [
  { feature: 'draw a sky chart', verdict: 'gap', evidence: '' },
  { feature: 'plan weekly meals', verdict: 'gap', evidence: '' },
];

test('two gaps become two house-template jobs, ids using the prefix', () => {
  const before = JSON.stringify(gaps);
  const out = jobsOf(gaps, { prefix: 'TJ', depends: 'VR2.2' });
  assert.equal(JSON.stringify(gaps), before);
  assert.equal(out.jobs.length, 2);
  assert.equal(out.json.jobs.length, 2);
  assert.equal(out.jobs[0].id, 'TJ1');
  assert.equal(out.jobs[1].id, 'TJ2');
  assert.equal(out.jobs[0].depends_on, 'VR2.2');
  assert.equal(out.jobs[1].depends_on, 'TJ1');
  assert.deepEqual(out.jobs[0].files, filesFor('TJ', 'draw a sky chart', 1));
  assert.match(out.jobs[0].test, /^node --test tools\/tj-1-/);
  for (const h of JOB_HEADS) {
    assert.ok(out.markdown.includes('- ' + h + ':'), h);
    assert.equal(out.markdown.split('- ' + h + ':').length - 1, 2, h);
  }
  assert.equal(JSON.parse(JSON.stringify(out.json)).jobs[1].id, 'TJ2');
});

test('a job whose file is held is skipped with a reason', () => {
  const held = [filesFor('TJ', 'draw a sky chart', 1)[0]];
  const out = jobsOf(gaps, { prefix: 'TJ', held });
  assert.equal(out.jobs.length, 1);
  assert.match(out.jobs[0].goal, /plan weekly meals/);
  assert.equal(out.skipped.length, 1);
  assert.equal(out.skipped[0].id, 'TJ1');
  assert.match(out.skipped[0].reason, /held/);
  assert.match(out.markdown, /Skipped/);
  assert.match(out.markdown, /held/);
  assert.equal(out.json.skipped[0].files[0], held[0]);
});

test('a feature Verse already has does not become a job', () => {
  const rows = [{ feature: 'convert units', verdict: 'has', evidence: 'docs/map.d/units.md' }, gaps[1]];
  const out = jobsOf(rows, { prefix: 'VR2.' });
  assert.equal(out.jobs.length, 1);
  assert.equal(out.jobs[0].id, 'VR2.1');
  assert.match(out.jobs[0].goal, /plan weekly meals/);
});

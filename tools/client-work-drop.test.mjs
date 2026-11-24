import test from 'node:test';
import assert from 'node:assert/strict';
import skill, { isClientWorkDrop } from '../void-live-deploy/skills/client-work-drop.js';

test('client-work-drop matches the asks and not the near misses', () => {
  assert.equal(isClientWorkDrop('what work drops for client onboarding'), true);
  assert.equal(isClientWorkDrop('client tasks that go away: invoice reminders'), true);
  assert.equal(isClientWorkDrop('drop list for the support router'), true);
  assert.equal(isClientWorkDrop('show the client work drop for weekly reports'), true);
  assert.equal(isClientWorkDrop('package the client tasks that drop for the CRM sync'), true);
  assert.equal(isClientWorkDrop('what work is left'), false);
  assert.equal(isClientWorkDrop('client work'), false);
  assert.equal(isClientWorkDrop('drop the table'), false);
  for (const ex of skill.examples) assert.equal(skill.match(ex.toLowerCase(), ex), true, ex);
  for (const near of skill.nearMisses) assert.equal(skill.match(near.toLowerCase(), near), false, near);
});

test('client-work-drop run names the process and lists the drops', async () => {
  let html = '';
  const ret = await skill.run('what work drops for client onboarding', {
    esc: (s) => String(s),
    showPage: (fn) => { const el = { set innerHTML(v) { html = v; } }; fn(el); return el; },
  });
  assert.equal(ret, 'client-work-drop');
  assert.match(html, /Client work that drops: client onboarding/);
  assert.match(html, /Watching dashboards/);
  assert.match(html, /Verse owns the heavy lifting/);
  assert.doesNotMatch(html, /Last check: green/);
});

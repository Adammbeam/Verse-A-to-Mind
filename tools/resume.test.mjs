// resume (skills/resume.js): the asks that fell to how-to text open the /resume/ studio on the right tab, and the card is a
// real door to that page. The page itself is tested in the browser suite; this checks the router and the card.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import skill, { studioAsk } from '../void-live-deploy/skills/resume.js';

test('a resume, a cover letter and a professional email land on their tabs', () => {
  assert.equal(studioAsk('make a resume').tab, 'resume');
  assert.equal(studioAsk('make a resume').href, '/resume/');
  assert.equal(studioAsk('write a resume').tab, 'resume');
  assert.equal(studioAsk('build my resume').tab, 'resume');
  assert.equal(studioAsk('make a resume for a product manager').tab, 'resume');
  assert.equal(studioAsk('resume builder').tab, 'resume');
  assert.equal(studioAsk('write a cover letter').tab, 'cover');
  assert.equal(studioAsk('make a cover letter for a designer').tab, 'cover');
  assert.equal(studioAsk('cover letter maker').tab, 'cover');
  assert.equal(studioAsk('write a professional email').tab, 'email');
  assert.equal(studioAsk('professional email').tab, 'email');
  assert.equal(studioAsk('draft an email for a job application').tab, 'email');
  assert.equal(studioAsk('write a professional email').href, '/resume/?tab=email');
  assert.equal(studioAsk('make a cover letter').href, '/resume/?tab=cover');
});

test('not a studio ask: advice, an example, or a generic email', () => {
  for (const a of ['resume tips', 'what should a resume include', 'draft of my resume', 'write a draft email to bob', 'cover letter examples', 'email my boss', 'resume the game', '']) assert.equal(studioAsk(a), null, a);
});

test('every example reaches this skill and no near miss does', () => {
  for (const e of skill.examples) assert.ok(skill.match(e.toLowerCase(), e), e);
  for (const n of skill.nearMisses) assert.ok(!skill.match(n.toLowerCase(), n), n);
});

test('the card opens the studio on the tab and links to the page', () => {
  const el = { innerHTML: '', dataset: {} };
  const out = skill.run('make a cover letter', { esc: (s) => String(s), showPage: (fn) => { fn(el); return el; } });
  assert.equal(out, 'resume');
  assert.equal(el.dataset.page, '/resume/?tab=cover');
  assert.match(el.innerHTML, /<h2>Cover letter studio<\/h2>/);
  assert.match(el.innerHTML, /<a href="\/resume\/\?tab=cover">Open the cover letter studio<\/a>/);
  assert.match(el.innerHTML, /nothing is uploaded/);
});

// Deterministic unit tests for the eml-handoff skill (replaces env.EMAIL / confirm-line dry-run gate with RFC 5322 .eml + mailto).
// Run: node --test tools/eml-handoff.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import skill, { emlHandoffOf, cleanHeader, emlFilename, buildEml, sha256Receipt } from '../void-live-deploy/skills/eml-handoff.js';

test('examples route to eml-handoff and near misses stay out', () => {
  for (const ex of skill.examples) {
    assert.equal(skill.match(ex.toLowerCase(), ex), true, 'expected match: ' + ex);
  }
  for (const miss of skill.nearMisses) {
    assert.equal(skill.match(miss.toLowerCase(), miss), false, 'expected near miss to stay out: ' + miss);
  }
});

test('cleanHeader strips CR, LF, and control characters', () => {
  assert.equal(cleanHeader('Hello\r\nBcc: evil@example.com\n\tWorld'), 'Hello Bcc: evil@example.com World');
});

test('buildEml produces valid RFC 5322 headers, CRLF endings, safe filename, and mailto link', () => {
  const q = emlHandoffOf('make an eml file for ada@example.com: ready for review');
  assert.equal(q.to, 'ada@example.com');
  assert.equal(q.body, 'ready for review');

  const out = buildEml({ ...q, date: new Date('2026-11-27T12:00:00Z') });
  assert.ok(out.text.includes('From: atom@a-to-mind.com\r\n'));
  assert.ok(out.text.includes('To: ada@example.com\r\n'));
  assert.ok(out.text.includes('MIME-Version: 1.0\r\n'));
  assert.ok(out.text.includes('Content-Type: text/plain; charset=utf-8\r\n'));
  assert.ok(out.text.endsWith('\r\n\r\nready for review\r\n'));
  assert.equal(out.filename, 'ready-for-review.eml');
  assert.equal(out.mailtoTooLong, false);
  assert.ok(out.mailtoHref.startsWith('mailto:ada@example.com?subject='));
});

test('buildEml flags long bodies for .eml download and sanitizes filename', () => {
  const longBody = 'a'.repeat(2000);
  const out = buildEml({ to: 'sam@example.com', subject: 'Q4 Launch / Review!', body: longBody, date: new Date('2026-11-27T12:00:00Z') });
  assert.equal(out.mailtoTooLong, true);
  assert.equal(out.filename, 'q4-launch-review.eml');
  assert.equal(emlFilename('!!!'), 'message.eml');
});

test('pasted client request reuses lib/proposal.js address extraction and ruleProposal formatting', () => {
  const ask = 'eml draft for client handoff:\nFrom: sam@example.com\nHi, we need our order flow fixed and automated by June.\nCould you send over a plan?';
  const q = emlHandoffOf(ask);
  assert.equal(q.to, 'sam@example.com');
  assert.match(q.body, /What they asked for:/);
  assert.match(q.body, /Scope:/);
});

test('sha256Receipt and self-test suite() are deterministic', async () => {
  const h1 = await sha256Receipt('hello world');
  const h2 = await sha256Receipt('hello world');
  assert.equal(h1, h2);
  assert.match(h1, /^[0-9a-f]{8,12}$/);
  assert.equal(skill.suite().ok, true);
});

test('run() renders escaped card HTML via showPage without throwing', () => {
  const mkNode = (cls = '') => ({
    className: cls,
    value: '',
    href: '',
    textContent: '',
    addEventListener() {},
  });
  let rendered = '';
  const nodes = { '.eh-to': mkNode(), '.eh-su': mkNode(), '.eh-body': mkNode(), '.eh-mailto': mkNode(), '.eh-dl': mkNode(), '.eh-copy': mkNode(), '.eh-status': mkNode() };
  nodes['.eh-to'].value = 'ada@example.com';
  nodes['.eh-su'].value = 'Hi';
  nodes['.eh-body'].value = 'ready';
  const el = {
    className: 'card',
    set innerHTML(v) { rendered = v; },
    get innerHTML() { return rendered; },
    querySelector(sel) { return nodes[sel]; },
  };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const res = skill.run('make an eml file for ada@example.com: <script>alert(1)</script>', { showPage: (fn) => { fn(el); return el; }, esc });
  assert.equal(res, 'eml-handoff');
  assert.ok(rendered.includes('Direct mail handoff'));
  assert.ok(!rendered.includes('<script>'));
  assert.ok(rendered.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(nodes['.eh-mailto'].href.startsWith('mailto:ada@example.com?'));
});

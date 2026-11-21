// business-card (skills/business-card.js): "make a business card" used to fall to plain text (GAPS #50). The skill reads the
// details a person says, draws a real 3.5 × 2 in card in the browser and downloads it as a PNG. This checks the reading, the
// layout, the drawing and the card; the canvas is a stand-in here, nothing leaves the machine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import skill, { cardAsk, parseDetails, cardLayout, drawCard, CARD_W, CARD_H } from '../void-live-deploy/skills/business-card.js';

test('the details a person says fill the card', () => {
  assert.deepEqual(cardAsk('make a business card'), {});
  assert.deepEqual(cardAsk('business card'), {});
  assert.deepEqual(parseDetails('Ana Ruiz'), { name: 'Ana Ruiz' });
  assert.deepEqual(parseDetails('Ana Ruiz, Head of Ops at Acme'), { name: 'Ana Ruiz', role: 'Head of Ops', company: 'Acme' });
  assert.deepEqual(parseDetails('Ana Ruiz, Head of Ops, Acme'), { name: 'Ana Ruiz', role: 'Head of Ops', company: 'Acme' });
  assert.deepEqual(parseDetails('Ana Ruiz at Acme'), { name: 'Ana Ruiz', company: 'Acme' });
  assert.deepEqual(parseDetails('Ana Ruiz, Head of Ops at Acme, ana@acme.com, +1 555 0100, acme.com'), {
    name: 'Ana Ruiz', role: 'Head of Ops', company: 'Acme', email: 'ana@acme.com', phone: '+1 555 0100', website: 'acme.com' });
  assert.equal(parseDetails('Ana Ruiz, email: ana@acme.com').email, 'ana@acme.com');
  assert.equal(parseDetails('Ana Ruiz, https://acme.example/work').website, 'acme.example/work');
  assert.deepEqual(cardAsk('make a business card for Ana Ruiz, Head of Ops at Acme, ana@acme.com').name, 'Ana Ruiz');
});

test('not a card ask: ideas, a holder, a birthday card', () => {
  for (const a of ['business card ideas', 'what is a business card', 'make a card for my mom', 'trading card values', 'business card holder', 'make a birthday card', '']) assert.equal(cardAsk(a), null, a);
});

test('every example reaches this skill and no near miss does', () => {
  for (const e of skill.examples) assert.ok(skill.match(e.toLowerCase(), e), e);
  for (const n of skill.nearMisses) assert.ok(!skill.match(n.toLowerCase(), n), n);
});

test('the card is 3.5 × 2 in at 300 dpi and every line has a place', () => {
  assert.deepEqual([CARD_W, CARD_H], [1050, 600]);
  const L = cardLayout({ name: 'Ana Ruiz', role: 'Head of Ops', company: 'Acme', email: 'ana@acme.com', phone: '+1 555 0100', website: 'acme.com' });
  assert.equal(L.lines[0].text, 'Ana Ruiz'); assert.equal(L.lines[0].size, 65);
  assert.equal(L.lines[1].text, 'Head of Ops · Acme');
  assert.deepEqual(L.lines.slice(2).map((l) => l.text), ['+1 555 0100', 'ana@acme.com', 'acme.com']);
  assert.ok(L.lines.every((l) => l.x === L.margin && l.y > 0 && l.y <= CARD_H));
  const ys = L.lines.map((l) => l.y); assert.deepEqual(ys, [...ys].sort((a, b) => a - b), 'the lines run down the card');
  assert.equal(cardLayout({}).lines[0].text, 'Add your name');
  assert.equal(cardLayout({ name: 'Ana Ruiz' }).lines.length, 1);
});

test('the drawing puts the person on the card and nothing else', () => {
  const drawn = [];
  const g = { fillRect() {}, strokeRect() {}, fillText: (t) => drawn.push(t) };
  assert.equal(drawCard({ width: CARD_W, height: CARD_H, getContext: () => g }, { name: 'Ana Ruiz', role: 'Head of Ops', company: 'Acme', email: 'ana@acme.com' }), true);
  assert.deepEqual(drawn, ['Ana Ruiz', 'Head of Ops · Acme', 'ana@acme.com']);
  assert.equal(drawCard({ width: CARD_W, height: CARD_H, getContext: () => null }, {}), false);
  assert.equal(drawCard(null, {}), false);
});

test('the card is a form with a live preview and a PNG download, and the ask fills it', () => {
  const el = { innerHTML: '', dataset: {}, querySelector: () => ({ addEventListener() {}, dataset: {}, value: '' }), querySelectorAll: () => [] };
  const out = skill.run('make a business card for Ana Ruiz, Head of Ops at Acme, ana@acme.com', { esc: (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]), showPage: (fn) => { fn(el); return el; } });
  assert.equal(out, 'business-card');
  assert.match(el.innerHTML, /<canvas class="bc-canvas" width="1050" height="600"/);
  assert.match(el.innerHTML, /data-k="name"[^>]*value="Ana Ruiz"/);
  assert.match(el.innerHTML, /data-k="company"[^>]*value="Acme"/);
  assert.match(el.innerHTML, /data-k="email"[^>]*value="ana@acme.com"/);
  assert.match(el.innerHTML, /Download PNG/);
  assert.match(el.innerHTML, /nothing is uploaded/);
});

test('a name with a quote cannot break the form', () => {
  const el = { innerHTML: '', dataset: {}, querySelector: () => ({ addEventListener() {}, dataset: {}, value: '' }), querySelectorAll: () => [] };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  skill.run('make a business card for Ana "AJ" Ruiz', { esc, showPage: (fn) => { fn(el); return el; } });
  assert.match(el.innerHTML, /value="Ana &quot;AJ&quot; Ruiz"/);
  assert.ok(!/value="Ana "AJ" Ruiz"/.test(el.innerHTML));
});

test('the card on the stage falls, bounces, stays in its box and comes to rest', () => {
  const { PHYS, makeCard, stepCard, cardTransform } = skill;
  const W = 360, H = 280;
  let s = makeCard(W / 2, 40, 200, 114);
  s.vx = 300; s.spin = 2;
  let bounces = 0, prevVy = s.vy;
  for (let i = 0; i < 600; i++) {
    s = stepCard(s, 1 / 60, W, H);
    if (prevVy > 0 && s.vy < 0) bounces++;
    prevVy = s.vy;
    assert.ok(s.x - s.w / 2 >= -0.5 && s.x + s.w / 2 <= W + 0.5, 'inside the walls at step ' + i);
    assert.ok(s.y - s.h / 2 >= -0.5 && s.y + s.h / 2 <= H + 0.5, 'inside the floor and ceiling at step ' + i);
  }
  assert.ok(bounces >= 1, 'it bounced off the floor');
  assert.equal(s.rest, true, 'it settled');
  assert.equal(s.vy, 0);
  assert.ok(Math.abs(s.vx) < 1, 'friction stopped the slide: ' + s.vx);
  assert.ok(Math.abs(s.rot / Math.PI - Math.round(s.rot / Math.PI)) < 0.02, 'it settled square to the stage');
  assert.ok(Math.abs(s.tiltX) <= PHYS.tiltMax && Math.abs(s.tiltY) <= PHYS.tiltMax);
  assert.match(cardTransform(s), /^translate3d\(-?[\d.]+px,-?[\d.]+px,0\) rotateZ\(-?[\d.]+rad\) rotateX\(-?[\d.]+rad\) rotateY\(-?[\d.]+rad\)$/);
});

test('a card dropped from the top does not sink through the floor, and a still one stays still', () => {
  const { makeCard, stepCard } = skill;
  const W = 300, H = 240;
  let s = makeCard(W / 2, 10, 180, 103);
  s.vy = 5000; // a hard throw down
  for (let i = 0; i < 120; i++) s = stepCard(s, 1 / 60, W, H);
  assert.ok(s.y + s.h / 2 <= H + 0.5, 'the floor held');
  let t = makeCard(W / 2, H - 52, 180, 103);
  const before = JSON.stringify(t);
  t = stepCard(t, 0, W, H);
  assert.equal(t.y, JSON.parse(before).y, 'no time passed, no motion');
});

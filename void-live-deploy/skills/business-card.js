/**
 * business-card skill — "make a business card": a real 3.5 × 2 in card drawn in this browser from the visitor's own details,
 * downloaded as a 300 dpi PNG (GAPS #50, docs/capability-gaps.md rank 14). The lab's f753 tool proved the job; this is the
 * stage card, so the ask that used to fall to plain text now makes the card itself. Type a name, role, company and contact in
 * the card; the preview updates as you type, and nothing is uploaded or stored. The details a person says in the ask
 * ("make a business card for Ana Ruiz, Head of Ops at Acme, ana@acme.com") fill the fields before the card opens.
 * Contract: { name, examples, nearMisses, match(lower, text), run(text, api) }
 */

export const CARD_W = 1050, CARD_H = 600; // 3.5 × 2 in at 300 dpi
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE = /^\+?[\d(][\d\s().-]{6,}\d$/;
const SITE = /^(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s,;]*)?$/i;
const LABEL = /^(?:name|title|role|company|email|e-mail|mail|phone|tel|mobile|website|web|site)\s*[:\-]\s*/i;

/** the details a card ask carries: { name, role, company, email, phone, website } (any may be absent). Pure. */
export function parseDetails(s) {
  const out = {}, words = [];
  for (const raw of String(s || '').split(/[,;|\n]+/)) {
    const part = raw.trim().replace(LABEL, '');
    if (!part) continue;
    const mail = part.match(EMAIL);
    if (mail) {
      out.email = mail[0].toLowerCase();
      const left = part.replace(mail[0], '').replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '').trim();
      if (left && !/^(?:email|e-mail|mail)$/i.test(left)) words.push(left);
      continue;
    }
    if (PHONE.test(part)) { out.phone = part.trim(); continue; }
    if (SITE.test(part)) { out.website = part.replace(/^https?:\/\//i, '').replace(/\/+$/, ''); continue; }
    words.push(part);
  }
  let name = words.shift() || '';
  if (!out.company && /\s+at\s+/i.test(name)) { const [n, c] = name.split(/\s+at\s+/i); name = n.trim(); out.company = c.trim(); }
  if (name) out.name = name;
  if (words.length) {
    const at = words[0].match(/^(.*?)\s+at\s+(.+)$/i);
    if (at) { out.role = at[1].trim(); out.company = at[2].trim(); }
    else { out.role = words[0]; if (words[1]) out.company = words[1]; }
  }
  return out;
}

const MAKE = /^(?:please\s+)?(?:(?:can|could|will|would)\s+you\s+)?(?:(?:make|create|design|build|generate|give\s+me)\s+(?:me\s+)?)?(?:a|an|my|our)?\s*(?:business|visiting|contact)\s+card(?:\s+for\s+(.+))?$/i;

/** the details of a business-card ask, or null. Pure. */
export function cardAsk(text) {
  const t = String(text || '').trim().replace(/[?!.]+$/, '').replace(/\s+/g, ' ');
  if (!t || t.length > 200) return null;
  const m = t.match(MAKE);
  return m ? parseDetails(m[1] || '') : null;
}

/** where each line of the card goes, as { margin, rule, lines: [{ text, size, weight, color, x, y }] }. Pure. */
export function cardLayout(d, w = CARD_W, h = CARD_H) {
  const margin = Math.round(w * 0.075);
  const name = String(d.name || '').trim();
  const role = [d.role, d.company].filter(Boolean).join(' · ');
  const contact = [d.phone, d.email, d.website].filter(Boolean).map(String);
  const nameSize = Math.round(w * 0.062), roleSize = Math.round(w * 0.03), lineSize = Math.round(w * 0.025);
  const lines = [], nameY = Math.round(h * 0.44);
  lines.push({ text: name || 'Add your name', size: nameSize, weight: 700, color: name ? '#12161b' : '#a4adb8', x: margin, y: nameY });
  if (role) lines.push({ text: role, size: roleSize, weight: 500, color: '#3f4954', x: margin, y: nameY + Math.round(nameSize * 1.05) });
  const step = Math.round(lineSize * 1.6);
  let y = h - margin - (contact.length ? (contact.length - 1) * step : 0);
  for (const c of contact) { lines.push({ text: c, size: lineSize, weight: 400, color: '#3f4954', x: margin, y }); y += step; }
  return { margin, rule: { x: margin, y: Math.round(h * 0.22), w: Math.round(w * 0.12), h: Math.max(3, Math.round(h * 0.008)) }, lines };
}

/** draw the card on a canvas; true when it drew. The card is paper, a slim rule in Verse's green, and the person's lines. */
export function drawCard(canvas, d) {
  const g = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  if (!g) return false;
  const w = canvas.width, h = canvas.height, L = cardLayout(d, w, h);
  g.fillStyle = '#fbfaf6'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(18,22,27,0.12)'; g.lineWidth = Math.max(2, Math.round(w * 0.002)); g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, w - g.lineWidth, h - g.lineWidth);
  g.fillStyle = '#1f6f5c'; g.fillRect(L.rule.x, L.rule.y, L.rule.w, L.rule.h);
  for (const line of L.lines) {
    g.font = line.weight + ' ' + line.size + 'px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
    g.fillStyle = line.color; g.fillText(line.text, line.x, line.y);
  }
  return true;
}

/** the card on the stage: paper weight, air drag, bounce, spin and the tilt a fast card picks up. Numbers are tuned so a
 *  thrown card reads as paper (it drops fast, bounces low, slides a little) rather than a balloon or a brick. */
export const PHYS = Object.freeze({ gravity: 2400, bounce: 0.38, friction: 0.84, spinDrag: 0.9, air: 0.9995, rest: 8, tilt: 0.0006, tiltMax: 0.6 });

/** a card lying on the stage: centre x, y in px inside a box, size w × h, and the motion it carries. Pure. */
export function makeCard(cx, cy, w, h) {
  return { x: cx, y: cy, w, h, vx: 0, vy: 0, rot: 0, spin: 0, tiltX: 0, tiltY: 0, rest: false };
}

/** one step of the card's fall: gravity, the box's floor and walls, the bounce, the friction that stops it, and the tilt
 *  that follows its speed. Returns a new state, so a test can step it without a browser. Pure. */
export function stepCard(s, dt, boxW, boxH, phys = PHYS) {
  const d = Math.min(Math.max(Number(dt) || 0, 0), 0.05); // a tab that was asleep does not launch the card
  const hw = s.w / 2, hh = s.h / 2;
  let { x, y, vx, vy, rot, spin, tiltX, tiltY } = s;
  // the card is rotated, so it touches the floor with a corner, not its edge
  const ext = (r) => { const c = Math.abs(Math.cos(r)), sn = Math.abs(Math.sin(r)); return { ex: hw * c + hh * sn, ey: hw * sn + hh * c }; };
  const atFloor = y + ext(rot).ey >= boxH - 1 && Math.abs(vy) <= phys.rest;
  if (!atFloor) vy += phys.gravity * d; else vy = 0; // a card lying on the floor does not keep falling through it
  vx *= phys.air; vy *= phys.air;
  x += vx * d; y += vy * d; rot += spin * d;
  const { ex, ey } = ext(rot);
  let rest = false;
  if (y + ey >= boxH - 0.05) { // a resting card sits a hair inside the floor, so it still counts as touching it
    y = boxH - ey;
    const up = vy * phys.bounce; // what the floor would give back
    if (vy > phys.rest && up > phys.rest * 1.5) { vy = -up; vx *= phys.friction; spin = spin * 0.6 + vx * 0.0015; }
    else { vy = 0; vx *= phys.friction; spin *= phys.friction; rest = true; } // the bounce died: paper does not hop forever
  }
  if (y - ey <= 0) { y = ey; vy = vy < -phys.rest ? -vy * phys.bounce : 0; }
  if (x + ex >= boxW) { x = boxW - ex; vx = -Math.abs(vx) * phys.bounce; spin = -spin; }
  if (x - ex <= 0) { x = ex; vx = Math.abs(vx) * phys.bounce; spin = -spin; }
  // lying still just above the floor still counts as settled (the flat turn below changes the card's height a little)
  if (!rest && vy === 0 && Math.abs(vx) < 0.6 && Math.abs(spin) < 0.08 && y + ey >= boxH - 2) rest = true;
  if (rest) {
    if (Math.abs(vx) < 0.6) vx = 0;
    spin *= phys.spinDrag;
    if (Math.abs(spin) < 0.08) { spin = 0; const flat = Math.round(rot / Math.PI) * Math.PI; rot += (flat - rot) * Math.min(1, 9 * d); } // settles square to the stage
  }
  const k = Math.min(1, 10 * d), lim = phys.tiltMax;
  tiltX = tiltX + (-vy * phys.tilt - tiltX) * k;
  tiltY = tiltY + (vx * phys.tilt - tiltY) * k;
  tiltX = Math.max(-lim, Math.min(lim, tiltX)); tiltY = Math.max(-lim, Math.min(lim, tiltY));
  return { ...s, x, y, vx, vy, rot, spin, tiltX, tiltY, rest };
}

/** the card's CSS transform from its state: where it is, how it is turned, and the tilt that sells the third dimension. Pure. */
export function cardTransform(s) {
  return 'translate3d(' + (s.x - s.w / 2).toFixed(2) + 'px,' + (s.y - s.h / 2).toFixed(2) + 'px,0)'
    + ' rotateZ(' + s.rot.toFixed(4) + 'rad) rotateX(' + s.tiltX.toFixed(4) + 'rad) rotateY(' + s.tiltY.toFixed(4) + 'rad)';
}

const BTN_STYLE = 'font:inherit;font-size:13px;background:transparent;color:inherit;border:1px solid rgba(255,255,255,0.35);border-radius:8px;padding:6px 12px;margin:0 6px 6px 0;cursor:pointer';
const FIELD_STYLE = 'display:block;margin:0 0 8px;font-size:12px;opacity:.8';
const INPUT_STYLE = 'display:block;box-sizing:border-box;width:100%;max-width:100%;margin-top:3px;padding:6px 8px;border-radius:6px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.06);color:inherit;font:inherit';

/** the stage under the card: a 3D box the card falls in. Dragging it and letting go throws it; it bounces off the walls and
 *  the floor and settles. Nothing is drawn by a library: the transform is CSS and the motion is stepCard above. */
function mountStage(host, cardEl, state, paintFront) {
  const box = () => ({ w: host.clientWidth || 320, h: host.clientHeight || 260 });
  const size = () => { const b = box(); const w = Math.min(b.w * 0.5, 360), h = w * (2 / 3.5); return { w, h }; };
  let s = makeCard(0, 0, 0, 0), raf = 0, last = 0, drag = null;
  const stand = () => {
    const b = box(), z = size();
    s = makeCard(b.w / 2, Math.max(z.h / 2 + 8, b.h * 0.34), z.w, z.h);
    cardEl.style.width = z.w + 'px'; cardEl.style.height = z.h + 'px';
    paint();
  };
  const paint = () => { cardEl.style.transform = cardTransform(s); };
  const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; last = 0; };
  const frame = (t) => {
    const b = box(), dt = last ? (t - last) / 1000 : 1 / 60; last = t;
    s = stepCard(s, dt, b.w, b.h); paint();
    if (s.rest && !drag) { raf = 0; last = 0; return; } // a card at rest costs nothing
    raf = requestAnimationFrame(frame);
  };
  const go = () => { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } };
  const place = (ev) => {
    const r = host.getBoundingClientRect();
    const x = Math.max(s.w / 2, Math.min(box().w - s.w / 2, ev.clientX - r.left));
    const y = Math.max(s.h / 2, Math.min(box().h - s.h / 2, ev.clientY - r.top));
    const now = performance.now(), dt = drag.last ? Math.max(0.008, (now - drag.last) / 1000) : 0.016;
    if (drag.last) { s.vx = (x - s.x) / dt; s.vy = (y - s.y) / dt; }
    s.x = x; s.y = y; s.rest = false; drag.last = now; paint();
  };
  cardEl.addEventListener('pointerdown', (ev) => {
    ev.preventDefault(); cardEl.setPointerCapture?.(ev.pointerId);
    drag = { last: 0 }; stop(); cardEl.classList.add('bc3d-held');
  });
  cardEl.addEventListener('pointermove', (ev) => { if (drag) place(ev); });
  const release = () => {
    if (!drag) return;
    drag = null; cardEl.classList.remove('bc3d-held');
    const cap = 2600; s.vx = Math.max(-cap, Math.min(cap, s.vx)); s.vy = Math.max(-cap, Math.min(cap, s.vy));
    s.spin = s.vx * 0.0016; // a card thrown sideways turns as it goes
    go();
  };
  cardEl.addEventListener('pointerup', release);
  cardEl.addEventListener('pointercancel', release);
  const throwIt = () => {
    const b = box(); s.x = Math.max(s.w / 2, Math.min(b.w - s.w / 2, b.w * 0.22)); s.y = s.h / 2 + 4;
    s.vx = b.w * 0.9; s.vy = -b.h * 0.35; s.spin = 3.2; s.rest = false; go();
  };
  host.querySelector('.bc3d-throw')?.addEventListener('click', throwIt);
  host.querySelector('.bc3d-reset')?.addEventListener('click', () => { stop(); stand(); });
  host.addEventListener('bc3d-repaint', () => paintFront());
  const reduce = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) { stand(); return { stand, go, stop }; }
  stand(); go();
  return { stand, go, stop };
}

function run(text, api) {
  const d = cardAsk(text);
  if (!d) return 'none';
  const { showPage, esc } = api;
  const el = showPage((p) => {
    p.innerHTML = '<h2>Make a business card</h2>'
      + '<p>Type your details; the card is 3.5 × 2 in and downloads as a 300 dpi PNG. Nothing is uploaded.</p>'
      + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;align-items:start">'
      + '<canvas class="bc-canvas" width="' + CARD_W + '" height="' + CARD_H + '" aria-label="Business card preview" style="width:100%;height:auto;border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,.35)"></canvas>'
      + '<div>'
      + '<label style="' + FIELD_STYLE + '">Name<input class="bc-in" data-k="name" type="text" autocomplete="name" value="' + esc(d.name || '') + '" style="' + INPUT_STYLE + '"></label>'
      + '<label style="' + FIELD_STYLE + '">Title<input class="bc-in" data-k="role" type="text" autocomplete="organization-title" value="' + esc(d.role || '') + '" style="' + INPUT_STYLE + '"></label>'
      + '<label style="' + FIELD_STYLE + '">Company<input class="bc-in" data-k="company" type="text" autocomplete="organization" value="' + esc(d.company || '') + '" style="' + INPUT_STYLE + '"></label>'
      + '<label style="' + FIELD_STYLE + '">Email<input class="bc-in" data-k="email" type="email" autocomplete="email" value="' + esc(d.email || '') + '" style="' + INPUT_STYLE + '"></label>'
      + '<label style="' + FIELD_STYLE + '">Phone<input class="bc-in" data-k="phone" type="tel" autocomplete="tel" value="' + esc(d.phone || '') + '" style="' + INPUT_STYLE + '"></label>'
      + '<label style="' + FIELD_STYLE + '">Website<input class="bc-in" data-k="website" type="text" autocomplete="url" value="' + esc(d.website || '') + '" style="' + INPUT_STYLE + '"></label>'
      + '</div></div>'
      + '<p><button type="button" class="bc-dl" style="' + BTN_STYLE + '">Download PNG</button><button type="button" class="bc-clear" style="' + BTN_STYLE + '">Clear</button></p>'
      + '<style>'
      + '.bc3d{position:relative;height:320px;border-radius:10px;background:radial-gradient(120% 90% at 50% 0%,rgba(165,139,255,.14),rgba(7,6,13,.9));overflow:hidden;touch-action:none;perspective:900px}'
      + '.bc3d-card{position:absolute;left:0;top:0;transform-style:preserve-3d;will-change:transform;cursor:grab;transition:box-shadow .2s}'
      + '.bc3d-held{cursor:grabbing}'
      + '.bc3d-face{position:absolute;inset:0;backface-visibility:hidden;border-radius:6px;overflow:hidden;box-shadow:0 10px 26px rgba(0,0,0,.45)}'
      + '.bc3d-front{background:#fbfaf6}'
      + '.bc3d-front canvas{display:block;width:100%;height:100%}'
      + '.bc3d-back{transform:rotateY(180deg);background:#1f6f5c;color:#f4f7f5;display:flex;align-items:center;justify-content:center;font:600 13px/1.3 ui-sans-serif,system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase}'
      + '</style>'
      + '<div class="bc3d" role="img" aria-label="A business card you can drag and throw">'
      + '<div class="bc3d-card"><div class="bc3d-face bc3d-front"><canvas class="bc3d-canvas" width="700" height="400" aria-hidden="true"></canvas></div><div class="bc3d-face bc3d-back"><span class="bc3d-mark">Verse</span></div></div>'
      + '</div>'
      + '<p><button type="button" class="bc3d-throw" style="' + BTN_STYLE + '">Throw it</button><button type="button" class="bc3d-reset" style="' + BTN_STYLE + '">Stand it up</button></p>'
      + '<div class="src">Drawn in this browser · 3.5 × 2 in at 300 dpi · nothing is uploaded</div>';
  });
  if (!el) return 'business-card';
  const canvas = el.querySelector('.bc-canvas'), inputs = [...el.querySelectorAll('.bc-in')], dl = el.querySelector('.bc-dl');
  if (!canvas || !dl) return 'business-card';
  const stage = el.querySelector('.bc3d'), stageCardEl = el.querySelector('.bc3d-card'), stageCanvas = el.querySelector('.bc3d-canvas');
  const state = { ...d };
  const paintStage = () => { if (stageCanvas) drawCard(stageCanvas, state); const mark = el.querySelector('.bc3d-mark'); if (mark) mark.textContent = (state.company || state.name || 'Verse').slice(0, 22); };
  const paint = () => { drawCard(canvas, state); paintStage(); };
  const read = () => { for (const i of inputs) state[i.dataset.k] = i.value.trim(); if (state.name) dl.textContent = 'Download PNG'; paint(); };
  for (const i of inputs) i.addEventListener('input', read);
  const clear = el.querySelector('.bc-clear');
  if (clear) clear.addEventListener('click', () => { for (const i of inputs) { i.value = ''; state[i.dataset.k] = ''; } paint(); dl.textContent = 'Download PNG'; });
  dl.addEventListener('click', () => {
    read();
    if (!state.name) { dl.textContent = 'Add your name first'; return; }
    const name = state.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'business';
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name + '-business-card.png';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, 'image/png');
  });
  paint();
  if (stage && stageCardEl && stageCanvas && typeof requestAnimationFrame === 'function') mountStage(stage, stageCardEl, state, paintStage);
  return 'business-card';
}

export default {
  name: 'business-card',
  examples: ['make a business card', 'business card for Ana Ruiz', 'design my business card', 'create a contact card'],
  nearMisses: ['business card ideas', 'what is a business card', 'make a card for my mom', 'trading card values', 'business card holder'],
  cardAsk,
  parseDetails,
  cardLayout,
  drawCard,
  PHYS,
  makeCard,
  stepCard,
  cardTransform,
  match(lower, text) { return !!cardAsk(text || lower); },
  run
};

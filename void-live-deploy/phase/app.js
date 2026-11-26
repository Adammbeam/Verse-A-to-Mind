// /phase/: Phase, the see-through layer (lib/phase.js says what it is and what never leaves the device). One layer, pluggable modes:
// read and act, step in (compose and record), play as P2, and the Satchel. A mode is { id, mount(panel, ctx) }; add one to MODES.
import { keyMask, applyMask, place, clipType, clipName, CHARACTERS, unpackPage, numbersOf, satchelAdd, satchelGet, satchelPut } from '/lib/phase.js';

const $ = (s) => document.querySelector(s), under = $('#under'), view = $('#view'), g = view.getContext('2d'), out = $('#out'), status = $('#status');
const say = (t) => { status.textContent = t; };
const el = (tag, attrs = {}, text) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (text != null) e.textContent = text; return e; };
const btn = (label, on, attrs = {}) => { const b = el('button', attrs, label); b.addEventListener('click', on); return b; };

// what is underneath: a shared tab/screen, a video or picture you opened, or the words of a page the overlay brought here
const ctx = { page: unpackPage(location.hash), img: null, layers: [], cam: null, plate: null, rec: null };
if (ctx.page) history.replaceState(null, '', location.pathname + location.search); // the words stay in this tab only

async function share() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) return say('This browser cannot share a tab or screen.');
  try {
    const s = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    under.srcObject = s; await under.play().catch(() => {});
    document.body.classList.add('seeing'); say('Phase is over what you shared. Stop sharing any time from the browser bar.');
    s.getVideoTracks()[0].addEventListener('ended', () => { document.body.classList.remove('seeing'); say('Sharing stopped.'); });
  } catch (_) { say('Nothing was shared.'); }
}
$('#share').addEventListener('click', share);
$('#file-btn').addEventListener('click', () => $('#file').click());
$('#file').addEventListener('change', () => {
  const f = $('#file').files[0]; if (!f) return;
  const url = URL.createObjectURL(f);
  if (/^image\//.test(f.type)) { const i = new Image(); i.onload = () => { ctx.img = i; document.body.classList.add('seeing'); }; i.src = url; under.removeAttribute('src'); }
  else { ctx.img = null; under.srcObject = null; under.src = url; under.loop = true; under.play().catch(() => {}); document.body.classList.add('seeing'); }
  say('Opened on this device: ' + f.name);
});

// the compositor: what is underneath, then each placed layer (a character or you), drawn every frame
const motelet = (c, x, y, w, h) => {
  c.save(); c.translate(x, y); c.scale(w / 100, h / 160);
  c.fillStyle = '#b7a6ff'; c.beginPath(); c.roundRect(25, 60, 50, 80, 22); c.fill();
  c.beginPath(); c.arc(50, 38, 30, 0, 7); c.fill();
  c.fillStyle = '#15131c'; c.beginPath(); c.arc(40, 36, 5, 0, 7); c.arc(60, 36, 5, 0, 7); c.fill();
  c.fillRect(30, 138, 12, 20); c.fillRect(58, 138, 12, 20); c.restore();
};
const work = document.createElement('canvas'), wg = work.getContext('2d', { willReadFrequently: true });
function drawCam(layer) {
  const v = ctx.cam; if (!v || !v.videoWidth) return;
  work.width = 320; work.height = Math.round((320 * v.videoHeight) / v.videoWidth); wg.drawImage(v, 0, 0, work.width, work.height);
  if (ctx.plate && ctx.plate.width === work.width && ctx.plate.height === work.height) {
    const im = wg.getImageData(0, 0, work.width, work.height); applyMask(im.data, keyMask(im.data, ctx.plate.data, layer.key || 40)); wg.putImageData(im, 0, 0);
  }
  const p = place(layer, view.width, view.height, work.width, work.height); g.drawImage(work, p.x, p.y, p.w, p.h); layer.box = p;
}
function frame() {
  const src = ctx.img || (under.videoWidth ? under : null);
  const w = src ? (src.videoWidth || src.naturalWidth) : innerWidth, h = src ? (src.videoHeight || src.naturalHeight) : innerHeight;
  if (view.width !== w || view.height !== h) { view.width = w; view.height = h; }
  g.clearRect(0, 0, w, h); if (src) g.drawImage(src, 0, 0, w, h);
  for (const L of ctx.layers) {
    if (L.kind === 'me') { drawCam(L); continue; }
    const p = place(L, w, h, 100, 160); L.box = p;
    if (L.id === 'motelet') motelet(g, p.x, p.y, p.w, p.h);
    else { g.font = p.h * 0.8 + 'px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(L.glyph, p.x + p.w / 2, p.y + p.h / 2); }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// drag the top layer under the pointer; the wheel sizes it
let drag = null;
const at = (e) => { const r = view.getBoundingClientRect(), s = Math.min(r.width / view.width, r.height / view.height), ox = (r.width - view.width * s) / 2, oy = (r.height - view.height * s) / 2;
  return { x: (e.clientX - r.left - ox) / s, y: (e.clientY - r.top - oy) / s }; };
view.addEventListener('pointerdown', (e) => { const p = at(e); drag = [...ctx.layers].reverse().find((L) => L.box && p.x >= L.box.x && p.x <= L.box.x + L.box.w && p.y >= L.box.y && p.y <= L.box.y + L.box.h) || null; });
addEventListener('pointerup', () => { drag = null; });
view.addEventListener('pointermove', (e) => { if (!drag) return; const p = at(e); drag.x = p.x / view.width; drag.y = p.y / view.height; });
view.addEventListener('wheel', (e) => { const L = ctx.layers[ctx.layers.length - 1]; if (!L) return; e.preventDefault(); L.size = Math.min(1, Math.max(0.05, (L.size || 0.4) * (e.deltaY < 0 ? 1.08 : 0.93))); }, { passive: false });

const keep = (item) => { satchelPut(satchelAdd(satchelGet(), item)); };
async function snapshot() { const b = await new Promise((ok) => view.toBlob(ok, 'image/png')); return b; }
async function handImage(path) {
  const b = await snapshot(); if (!b) return say('Nothing to snap yet.');
  const { sendImage } = await import('/lib/image-handoff.js'); keep({ kind: 'frame', label: 'a frame, sent to ' + path });
  await sendImage(path, async () => b, { name: 'phase-frame.png', fromPage: '/phase/' });
}

const MODES = {
  read: { mount(p) {
    const words = ctx.page;
    if (words) out.textContent = (words.title ? words.title + '\n' : '') + words.text.slice(0, 1200);
    p.append(el('div', { class: 'sub' }, words ? 'The words of ' + (words.title || 'a page') + ', here on this device.' : 'Share something, or bring a page here with the Phase bookmarklet: '));
    if (!words) { const a = el('a', { href: "javascript:(function(){var s=document.createElement('script');s.src='https://a-to-mind.com/phase/overlay.js';document.body.appendChild(s)})()", 'data-phase-bookmarklet': '' }, 'Phase'); p.lastChild.append(a, ' (drag it to your bookmarks bar; on any page it lays Phase over that page).'); }
    const row = el('div', { class: 'row' });
    row.append(btn('Read the words in this frame', () => handImage('/translate/')), btn('Edit this frame', () => handImage('/image/')));
    if (words) row.append(
      btn('Numbers', () => { const n = numbersOf(words.text); out.textContent = n.length ? n.map((x) => (x.label ? x.label + ': ' : '') + x.value).join('\n') : 'No numbers in it.'; keep({ kind: 'numbers', label: 'numbers from ' + (words.title || 'a page'), data: out.textContent }); }),
      btn('Translate', () => { location.href = '/translate/?q=' + encodeURIComponent(words.text.slice(0, 2000)); }),
      btn('Summarize (sends it to Verse)', async () => { out.textContent = 'Asking Verse…';
        const r = await fetch('/api/answer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ask: 'summarize this page in a few lines', page: { title: words.title, url: words.url, text: words.text } }) }).then((x) => x.json()).catch(() => null);
        out.textContent = r && r.answer ? r.answer + '\n\n(this page was sent to a-to-mind.com for this answer, and not kept)' : (r && r.note) || 'Verse could not answer just now.'; }),
      btn('Keep in the Satchel', () => { keep({ kind: 'words', label: words.title || 'page words', data: words.text }); say('Kept in the Satchel.'); }));
    p.append(row);
  } },
  compose: { mount(p) {
    const row = el('div', { class: 'row' });
    for (const [id, glyph] of CHARACTERS) row.append(btn(id === 'motelet' ? 'Motelet' : glyph, () => { ctx.layers.push({ kind: 'character', id, glyph, x: 0.3 + Math.random() * 0.4, y: 0.6, size: 0.35 }); keep({ kind: 'character', label: id }); say('Placed. Drag it; the wheel sizes it.'); }, { 'data-phase-char': id }));
    row.append(btn('Phase me in (camera)', async () => {
      try { const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); const v = el('video', { muted: '', playsinline: '' }); v.muted = true; v.srcObject = s; await v.play(); ctx.cam = v;
        if (!ctx.layers.some((L) => L.kind === 'me')) ctx.layers.push({ kind: 'me', x: 0.75, y: 0.65, size: 0.5 }); say('You are in. Step out of the frame and press "Learn the empty room" to cut the room away.'); }
      catch (_) { say('The camera was not opened.'); } }, { 'data-phase-me': '' }),
    btn('Learn the empty room', () => { if (!ctx.cam) return say('Open the camera first.'); work.width = 320; work.height = Math.round((320 * ctx.cam.videoHeight) / ctx.cam.videoWidth); wg.drawImage(ctx.cam, 0, 0, work.width, work.height); ctx.plate = wg.getImageData(0, 0, work.width, work.height); say('Room learned. Step back in.'); }, { 'data-phase-learn': '' }),
    btn('Clear', () => { ctx.layers = []; }));
    const rec = el('div', { class: 'row' }), go = btn('Record', toggle, { 'data-phase-rec': '' }); rec.append(go);
    function toggle() {
      if (ctx.rec) { ctx.rec.stop(); return; }
      const type = clipType((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)); if (!type) return say('This browser cannot record a clip.');
      const chunks = [], r = new MediaRecorder(view.captureStream(30), { mimeType: type }); ctx.rec = r; go.textContent = 'Stop';
      r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      r.onstop = () => { ctx.rec = null; go.textContent = 'Record'; const blob = new Blob(chunks, { type }), name = clipName(new Date(), type);
        const a = el('a', { href: URL.createObjectURL(blob), download: name, 'data-phase-clip': String(blob.size) }, 'Save ' + name + ' (' + Math.max(1, Math.round(blob.size / 1024)) + ' KB)');
        out.textContent = ''; out.append(a, ' · then edit or convert it in ', el('a', { href: '/converter/' }, 'the converter'), ' or ', el('a', { href: '/video/' }, 'video'), '. Recorded here; nothing was uploaded.');
        keep({ kind: 'clip', label: name }); };
      r.start(250); say('Recording on this device…');
    }
    p.append(row, rec);
  } },
  play: { mount(p) {
    p.append(el('div', { class: 'sub' }, 'In Verse\'s own games Verse is player 2: you take seat 1 and Verse plays seat 2. Over a game you share, Phase can watch and step in as a character, but it cannot press keys in another app yet.'));
    const row = el('div', { class: 'row' }); row.append(el('a', { href: '/?q=' + encodeURIComponent('play a game') }, 'Play Verse as P2'), ' · ', el('a', { href: '/arcade/' }, 'Arcade')); p.append(row);
  } },
  satchel: { mount(p) {
    const list = satchelGet(); p.append(el('div', { class: 'sub' }, list.length ? 'What Phase picked up, kept in this browser only:' : 'The Satchel is empty. What Phase picks up (words, frames, clips, characters) is kept here, in this browser only.'));
    for (const it of list) { const r = el('div', { class: 'row', 'data-satchel-item': it.kind }); r.append(el('span', {}, it.kind + ': ' + it.label));
      if (it.kind === 'words' || it.kind === 'numbers') r.append(btn('Open', () => { out.textContent = it.data; })); p.append(r); }
    if (list.length) p.append(btn('Empty the Satchel', () => { satchelPut([]); show('satchel'); }));
  } },
};
function show(id) {
  for (const b of document.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === id));
  const p = $('#panel'); p.textContent = ''; out.textContent = ''; MODES[id].mount(p, ctx);
}
for (const b of document.querySelectorAll('[data-mode]')) b.addEventListener('click', () => show(b.dataset.mode));
show(new URLSearchParams(location.search).get('in') === '1' ? 'compose' : 'read');
if (ctx.page) show('read');

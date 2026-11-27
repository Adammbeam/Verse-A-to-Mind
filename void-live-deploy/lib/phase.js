// lib/phase.js: Phase, Verse's see-through mode (/phase/). Verse lays itself over what you share (a tab, a window, a screen, a video file)
// as dim glass, puts a character or you (your camera, with the room keyed out on this device) on top of it, records the result as a clip,
// and keeps what it picked up in the Satchel: the one inventory that goes with you from page to page (carried forward from the archived
// Player Two project, whose single cross-game inventory was the Satchel). Frames, camera and clips never leave the device unless you press
// something that says it sends. Nothing seen is logged. Pure helpers only; the page is phase/app.js. Tests: tools/phase.test.mjs.

const ASK = /^(?:please\s+)?(?:(?:turn\s+on|open|start|use|go\s+into|enter)\s+)?(?:phase(?:\s+(in|me\s+in|mode))?|see[\s-]?through(?:\s+mode)?|put\s+me\s+in\s+(?:the\s+)?(?:scene|video|shot)|satchel)$/i;

/** an ask for Phase: { in: true } when it asks to put you or a character into the scene, null when it is not Phase. Pure. */
export function phaseAsk(raw) {
  const t = String(raw == null ? '' : raw).trim().replace(/[.!?]+$/, '').replace(/\s+/g, ' ');
  const m = ASK.exec(t); if (!m) return null;
  return { in: /\bin\b|scene|video|shot/i.test(t) && !/^see/i.test(t) };
}

/** the link a Phase card opens. Pure. */
export const phaseLink = (a) => '/phase/' + (a && a.in ? '?in=1' : '');

/** which of you is foreground: alpha per pixel from the difference to a learned empty-room plate. `soft` widens the edge. Pure. */
export function keyMask(cur, plate, threshold = 40, soft = 24) {
  const n = Math.min(cur.length, plate.length) >> 2, out = new Uint8ClampedArray(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const d = Math.abs(cur[j] - plate[j]) + Math.abs(cur[j + 1] - plate[j + 1]) + Math.abs(cur[j + 2] - plate[j + 2]);
    out[i] = d <= threshold ? 0 : d >= threshold + soft ? 255 : Math.round(((d - threshold) / soft) * 255);
  }
  return out;
}
/** write the mask into the picture's alpha, in place. Pure on its arguments. */
export function applyMask(rgba, mask) { for (let i = 0, n = Math.min(mask.length, rgba.length >> 2); i < n; i++) rgba[i * 4 + 3] = mask[i]; return rgba; }

/** where a layer sits: x and y as 0..1 of the frame (its centre), size as 0..1 of the frame height, kept inside the frame. Pure. */
export function place(layer, frameW, frameH, srcW, srcH) {
  const size = Math.min(1, Math.max(0.05, Number(layer.size) || 0.4)), h = size * frameH, w = srcH ? (h * srcW) / srcH : h;
  const cx = Math.min(1, Math.max(0, Number(layer.x) || 0.5)) * frameW, cy = Math.min(1, Math.max(0, Number(layer.y) || 0.6)) * frameH;
  return { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w: Math.round(w), h: Math.round(h) };
}

/** the recorder type this browser can write, best first, or '' (none). Pure given `ok`. */
export function clipType(ok = () => false) {
  for (const t of ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']) if (ok(t)) return t;
  return '';
}
/** a clip's file name: phase-2026-11-25-1923.webm. Pure. */
export function clipName(d = new Date(), type = 'video/webm') {
  const p = (n) => String(n).padStart(2, '0');
  return 'phase-' + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + (/mp4/.test(type) ? '.mp4' : '.webm');
}

// The characters Phase can place: Verse's own (Motelet, the original figure from skills/figure.js, drawn flat here) and a few glyph friends.
export const CHARACTERS = Object.freeze([['motelet', 'Motelet'], ['robot', '🤖'], ['ghost', '👻'], ['alien', '👾'], ['cat', '🐱']]);

// The overlay on another page (phase/overlay.js) carries what it read to /phase/ in the address's #fragment, which a browser never sends
// to a server. At most 6,000 characters of text.
export const PAGE_MAX = 6000;
export function packPage(p) {
  const v = { t: String(p && p.title || '').slice(0, 200), u: String(p && p.url || '').slice(0, 500), x: String(p && p.text || '').replace(/\s+/g, ' ').trim().slice(0, PAGE_MAX) };
  return '#page=' + encodeURIComponent(JSON.stringify(v));
}
export function unpackPage(hash) {
  const m = /^#?page=(.*)$/.exec(String(hash || '')); if (!m) return null;
  try { const v = JSON.parse(decodeURIComponent(m[1])); if (!v || typeof v.x !== 'string' || !v.x.trim()) return null;
    return { title: String(v.t || '').slice(0, 200), url: String(v.u || '').slice(0, 500), text: v.x.slice(0, PAGE_MAX) }; } catch (_) { return null; }
}

/** the numbers in some text, with the words just before them, for a numbers card. Pure. */
export function numbersOf(text, max = 40) {
  const out = [], re = /([A-Za-z][A-Za-z ]{0,24}?)?\s*([-+]?[$€£]?\d[\d,]*(?:\.\d+)?%?)/g; let m;
  while ((m = re.exec(String(text || ''))) && out.length < max) { const v = m[2]; if (/^\d{1,2}$/.test(v) && !m[1]) continue; out.push({ label: (m[1] || '').trim(), value: v }); }
  return out;
}

// The Satchel: what Phase picked up (a page's words, a frame, a clip's name, a numbers card), kept in this browser only, newest first.
export const SATCHEL_KEY = 'verse_satchel', SATCHEL_MAX = 24;
export function satchelAdd(list, item, now = Date.now()) {
  const kind = ['words', 'frame', 'clip', 'numbers', 'character'].includes(item && item.kind) ? item.kind : 'words';
  const it = { kind, label: String(item && item.label || kind).slice(0, 80), data: String(item && item.data || '').slice(0, 4000), at: now };
  return [it, ...(Array.isArray(list) ? list : [])].slice(0, SATCHEL_MAX);
}
export function satchelGet(store = globalThis.localStorage) { try { const v = JSON.parse(store.getItem(SATCHEL_KEY) || '[]'); return Array.isArray(v) ? v.slice(0, SATCHEL_MAX) : []; } catch (_) { return []; } }
export function satchelPut(list, store = globalThis.localStorage) { try { store.setItem(SATCHEL_KEY, JSON.stringify(list.slice(0, SATCHEL_MAX))); return true; } catch (_) { return false; } }

/** [start, end) of each literal match, case-insensitive, in order, at most `max`. Pure.
 *  phase/overlay.js keeps the same function: a global RegExp skips every other text node. */
export function findSpans(text, query, max = 200) {
  const hay = String(text || ''), needle = String(query || '').trim();
  if (!needle) return [];
  const h = hay.toLowerCase(), n = needle.toLowerCase(), out = [];
  let i = 0;
  while (out.length < max) {
    const at = h.indexOf(n, i);
    if (at < 0) break;
    out.push([at, at + n.length]);
    i = at + Math.max(1, n.length);
  }
  return out;
}

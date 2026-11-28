/**
 * stage-code: portable VERSE-STAGE: code for moving cards across browsers without the SHARE relay.
 * Gate bypassed (BASE.md): env.SHARE (ShareRoom Durable Object) needs CLOUDFLARE_WORKERS_TOKEN and a manual binding
 * so /api/share/<room> answers 503 "not switched on yet", and POST /api/share needs a signed-in account + SALT.
 * Simpler path: reuse lib/stage-port.js (exportStage, parseStageImport) to pack and safely restore stage cards as one
 * copyable VERSE-STAGE:<base64url> code in this browser, with zero server room and zero sign-in.
 */
import { exportStage, parseStageImport } from './stage-port.js';
import { BASIC_KINDS } from './stage-find.js';

export const PREFIX = 'VERSE-STAGE:';
export const ALIAS_PREFIX = 'V01D-STAGE:';
export const MAX_CODE_CHARS = 32768;

const CODE_RE = /\b((?:VERSE|V01D)-STAGE:[A-Za-z0-9_-]{8,})\b/i;
const CLEAN = (s) => String(s || '').trim().toLowerCase().replace(/[’']/g, "'").replace(/[?!.]+$/, '').replace(/\s+/g, ' ');
const MAKE_RE = /^(?:please\s+)?(?:(?:make|create|get|copy|share|export|pack|encode|build|give\s+me)\s+(?:a\s+|my\s+|this\s+|the\s+)?)?(?:portable\s+)?(?:stage|verse|void)\s+(?:as\s+(?:a\s+)?)?code$|^share\s+(?:my\s+|this\s+|the\s+)?stage\s+without\s+(?:the\s+)?share\s+relay$/;
const OPEN_RE = /^(?:please\s+)?(?:open|import|load|decode|paste|restore)\s+(?:a\s+|this\s+|the\s+)?stage\s+code(?:\s+.+)?$/;

/** Extract an embedded VERSE-STAGE:/V01D-STAGE: token from text, or ''. Pure. */
export function codeIn(text) {
  const m = CODE_RE.exec(String(text || '').replace(/\s+/g, ' '));
  return m ? m[1] : '';
}

/** True when the ask is for creating or opening a portable stage code. Pure. */
export function stageCodeAsk(text) {
  const raw = String(text || '').trim();
  if (codeIn(raw)) return true;
  const t = CLEAN(raw);
  return MAKE_RE.test(t) || OPEN_RE.test(t);
}

function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64u) {
  if (!/^[A-Za-z0-9_-]+$/.test(b64u)) return null;
  const pad = b64u.length % 4 ? '='.repeat(4 - (b64u.length % 4)) : '';
  let bin;
  try { bin = atob(b64u.replace(/-/g, '+').replace(/_/g, '/') + pad); } catch (_) { return null; }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (_) { return null; }
}

/** Pack current stage things into { ok: true, code, count, bytes } or { ok: false, why, count }. Pure. */
export function encodeStageCode(things, now = Date.now()) {
  const parsed = JSON.parse(exportStage(things, now));
  const count = parsed.count || 0;
  if (!count) return { ok: false, count: 0, why: 'nothing on the stage yet — summon a card or sticky note first' };
  const compact = JSON.stringify({ app: parsed.app, version: parsed.version, exportedAt: parsed.exportedAt, count, things: parsed.things });
  const code = PREFIX + toBase64Url(compact);
  if (code.length > MAX_CODE_CHARS) {
    return { ok: false, count, bytes: code.length, why: 'that stage is ' + code.length + ' characters as a code (limit ' + MAX_CODE_CHARS + '); say "export my stage as json" for large stages' };
  }
  return { ok: true, code, count, bytes: code.length };
}

/** Decode and sanitize a VERSE-STAGE:/V01D-STAGE: code using parseStageImport. Pure. */
export function decodeStageCode(raw, kinds, taken = new Set()) {
  const cleaned = String(raw || '').replace(/\s+/g, '').trim();
  if (!cleaned) return { ok: false, why: 'paste a VERSE-STAGE: code first' };
  const upper = cleaned.toUpperCase();
  const prefix = upper.startsWith(PREFIX) ? PREFIX : upper.startsWith(ALIAS_PREFIX) ? ALIAS_PREFIX : '';
  if (!prefix) return { ok: false, why: 'a stage code starts with ' + PREFIX };
  if (cleaned.length > MAX_CODE_CHARS + PREFIX.length) return { ok: false, why: 'that stage code is too large; use "import a stage from json"' };
  const body = cleaned.slice(prefix.length);
  if (!body) return { ok: false, why: 'nothing after ' + prefix };
  const json = fromBase64Url(body);
  if (!json) return { ok: false, why: 'that code is not valid base64url UTF-8 text' };
  return parseStageImport(json, kinds, taken);
}

const el = (tag, css, text) => {
  const node = document.createElement(tag);
  if (css) node.style.cssText = css;
  if (text != null) node.textContent = text;
  return node;
};

function applyImport(codeText, api, statusEl) {
  const things = api.stage.things();
  const kinds = typeof api.stage.kinds === 'function' ? Object.keys(api.stage.kinds()) : BASIC_KINDS;
  const res = decodeStageCode(codeText, kinds, new Set(Object.keys(things)));
  if (!res.ok) {
    statusEl.textContent = 'Could not load stage code: ' + res.why + '.';
    return res;
  }
  if (typeof api.stage.snapshot === 'function') api.stage.snapshot();
  for (const th of res.things) things[th.id] = th;
  api.stage.save();
  api.stage.render();
  const msg = 'Loaded ' + res.things.length + ' thing' + (res.things.length === 1 ? '' : 's') + (res.skipped ? ' (' + res.skipped + ' skipped)' : '') + ' onto the stage.';
  statusEl.textContent = msg;
  if (api.say) api.say('loaded ' + res.things.length);
  return res;
}

/** Render the portable stage-code card on the stage (zero innerHTML, browser-only). */
export function runStageCode(text, api) {
  if (!stageCodeAsk(text)) return 'none';
  const embedded = codeIn(text);
  const packed = encodeStageCode(api.stage.things());
  const boxCss = 'width:100%;box-sizing:border-box;font:12px/1.4 ui-monospace,monospace;background:rgba(255,255,255,.06);color:inherit;border:1px solid rgba(255,255,255,.2);border-radius:8px;padding:8px';
  const btnCss = 'font:inherit;cursor:pointer;margin:6px 6px 0 0;border-radius:10px;border:1px solid rgba(255,255,255,.3);background:transparent;color:inherit;padding:4px 12px';

  api.showPage((root) => {
    root.textContent = '';
    root.append(
      el('h2', '', 'Stage code'),
      el('p', 'opacity:.85', 'The live relay (env.SHARE) needs a missing worker key and binding, so this packs your stage cards into one VERSE-STAGE: code you can copy or paste on any device.')
    );

    const outStatus = el('div', 'font-size:13px;margin:8px 0 4px', packed.ok ? packed.count + ' thing' + (packed.count === 1 ? '' : 's') + ' packed (' + packed.bytes + ' chars):' : packed.why + '.');
    root.append(outStatus);

    if (packed.ok) {
      const outTa = el('textarea', boxCss);
      outTa.className = 'sc-out';
      outTa.rows = 4;
      outTa.readOnly = true;
      outTa.value = packed.code;
      const copyBtn = el('button', btnCss, 'Copy stage code');
      copyBtn.type = 'button';
      copyBtn.className = 'sc-copy';
      copyBtn.addEventListener('click', async () => {
        let ok = false;
        try { await navigator.clipboard.writeText(packed.code); ok = true; } catch (_) { outTa.select(); try { ok = document.execCommand('copy'); } catch (_2) {} }
        copyBtn.textContent = ok ? 'Copied' : 'Select the code above';
      });
      root.append(outTa, copyBtn);
    }

    const inLabel = el('div', 'font-size:13px;margin:14px 0 4px', 'Open a code from another device:');
    const inTa = el('textarea', boxCss);
    inTa.className = 'sc-in';
    inTa.rows = 3;
    inTa.placeholder = 'Paste a VERSE-STAGE: code';
    if (embedded) inTa.value = embedded;
    const loadBtn = el('button', btnCss, 'Load onto stage');
    loadBtn.type = 'button';
    loadBtn.className = 'sc-load';
    const inStatus = el('div', 'font-size:13px;margin-top:6px', '');
    inStatus.className = 'sc-status';
    inStatus.setAttribute('role', 'status');
    inStatus.setAttribute('aria-live', 'polite');

    loadBtn.addEventListener('click', () => applyImport(inTa.value, api, inStatus));
    root.append(inLabel, inTa, loadBtn, inStatus);

    if (embedded) applyImport(embedded, api, inStatus);

    const src = el('div', '', 'Reuses lib/stage-port.js (simpler path around the unbound env.SHARE relay in BASE.md). Browser-only; nothing is uploaded.');
    src.className = 'src';
    root.append(src);
  });
  return 'share';
}

export function stageCodeSuite() {
  const sample = { a: { id: 'a', kind: 'sticky', x: 50, y: 60, text: 'hello' } };
  const enc = encodeStageCode(sample, Date.parse('2026-11-27T00:00:00Z'));
  const dec = enc.ok ? decodeStageCode(enc.code, ['sticky', 'kept'], new Set()) : { ok: false };
  const bad = decodeStageCode('not-a-code', ['sticky'], new Set());
  const ok = stageCodeAsk('make a stage code') && stageCodeAsk('open stage code')
    && !stageCodeAsk('export my stage as json') && !stageCodeAsk('share this card')
    && enc.ok && enc.code.startsWith(PREFIX)
    && dec.ok && dec.things.length === 1 && dec.things[0].text === 'hello'
    && !bad.ok;
  return { ok, got: ok ? '' : JSON.stringify({ encOk: enc.ok, decOk: dec.ok, badOk: bad.ok }) };
}

/**
 * eml-handoff skill — Turn any email ask or pasted client request into a ready-to-send .eml file and mailto link without server mail bindings or API keys.
 *
 * Gate bypassed (BASE.md, lib/email-send.js): server email sending needs the commented-out env.EMAIL
 * binding in wrangler.toml, EMAIL_LIVE=send, and confirm-line approval. Simpler path: build an RFC 5322 .eml
 * file and mailto link in the browser, reusing addressIn, mailBody, and ruleProposal from lib/proposal.js,
 * mailto from skills/providers.js, and the attested copy-receipt pattern from docs/SALVAGE.md.
 */
import { addressIn, mailBody, ruleProposal, toPlain } from '../lib/proposal.js';
import { mailto } from './providers.js';

export const DEFAULT_FROM = 'atom@a-to-mind.com';
export const MAILTO_SAFE_MAX = 1800;

const QUESTION_RE = /^(?:what|who|why|when|where|how)\b/i;
const OTHER_SKILL_RE = /\binto\s+an?\s+(?:\w+\s+)?proposal\b|\bemail-ready\s+text\b|\bprofessional\s+email\b/i;
const EML_MATCH_RE = /^(?:(?:make|build|create|draft|export|generate|write|download)\s+(?:an?\s+)?(?:eml(?:\s+(?:file|draft|message|handoff))?|rfc\s*5322\s+e-?mail|e-?mail\s+as\s+(?:an?\s+)?eml(?:\s+file)?)|(?:send|draft|export|open|write)\s+(?:an?\s+)?e-?mail\s+(?:without|bypass(?:ing)?|with\s+no)\s+(?:a\s+)?(?:server|api|e-?mail)?\s*(?:key|binding|gate|approval)|(?:bypass|skip|unblock)\s+(?:the\s+)?(?:env\.?email|e-?mail(?:\s+binding|\s+send)?)\s+gate|eml\s+(?:draft|file|handoff)|mailto\s+link)\b/i;

/** Strip CR, LF, and control characters so header injection is impossible. Pure. */
export function cleanHeader(value) {
  return String(value == null ? '' : value)
    .replace(/[\r\n\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Safe `.eml` file name derived from subject. Pure. */
export function emlFilename(subject) {
  const slug = cleanHeader(subject)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return (slug || 'message') + '.eml';
}

/**
 * Parse an ask for a direct .eml / mailto handoff.
 * Returns { to, subject, body, mode } or null. Pure.
 */
export function emlHandoffOf(text) {
  const raw = String(text || '').replace(/\r\n?/g, '\n').replace(/[ \t]*⏎[ \t]*/g, '\n').trim();
  if (!raw) return null;
  const firstLine = raw.split('\n')[0].trim().replace(/[?!.]+$/, '').replace(/\s+/g, ' ');
  if (QUESTION_RE.test(firstLine) || OTHER_SKILL_RE.test(firstLine)) return null;
  if (!EML_MATCH_RE.test(firstLine)) return null;

  const { to } = addressIn(raw);
  const subjMatch = /\bsubject\s*[:=]\s*"([^"\n]{1,150})"|\bsubject\s+([^:\n]{2,120})(?=$|\s*:|\n)/i.exec(raw);
  const colonIdx = raw.indexOf(':');
  const afterColon = colonIdx >= 0 ? raw.slice(colonIdx + 1).trim() : '';
  const multiLineBody = raw.includes('\n') ? raw.slice(raw.indexOf('\n') + 1).trim() : '';
  let body = afterColon || multiLineBody;
  let subject = subjMatch ? cleanHeader(subjMatch[1] || subjMatch[2]) : '';

  if (body && body.length >= 40 && /[\r\n]/.test(body) && /^(?:from|to|subject|hi|hello|we|our)\b/i.test(body)) {
    const cleaned = mailBody(body);
    const prop = ruleProposal({ request: cleaned || body });
    if (!subject) subject = prop.title.replace(/^Proposal:\s*/i, '');
    body = toPlain(prop, to).trim();
  } else if (!subject && body) {
    const words = cleanHeader(body).split(' ').filter(Boolean);
    subject = words.slice(0, 7).join(' ') + (words.length > 7 ? '...' : '');
  }
  if (!subject) subject = 'Direct mail handoff';
  if (!body && to) body = 'Hi,\n\nFollowing up directly.\n';

  return { to, subject, body };
}

/**
 * Build an RFC 5322 `.eml` message and a `mailto:` link. Pure.
 */
export function buildEml({ to = '', subject = '', body = '', from = DEFAULT_FROM, date = new Date() } = {}) {
  const safeFrom = cleanHeader(from) || DEFAULT_FROM;
  const safeTo = cleanHeader(to);
  const safeSubject = cleanHeader(subject) || 'Direct mail handoff';
  const safeDate = (date instanceof Date ? date : new Date(date)).toUTCString();
  const normBody = String(body == null ? '' : body).replace(/\r\n?/g, '\n').replace(/\n/g, '\r\n');

  const headers = [
    'From: ' + safeFrom,
    ...(safeTo ? ['To: ' + safeTo] : []),
    'Subject: ' + safeSubject,
    'Date: ' + safeDate,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
  ];
  const text = headers.join('\r\n') + '\r\n\r\n' + normBody + (normBody.endsWith('\r\n') ? '' : '\r\n');
  const mailtoHref = mailto({ to: safeTo, subject: safeSubject, body: String(body == null ? '' : body) });
  return {
    text,
    filename: emlFilename(safeSubject),
    bytes: new TextEncoder().encode(text).length,
    mailtoHref,
    mailtoTooLong: mailtoHref.length > MAILTO_SAFE_MAX,
  };
}

/** Deterministic SHA-256 hex digest (first 12 chars) for the copy receipt. */
export async function sha256Receipt(text) {
  const s = String(text == null ? '' : text);
  if (globalThis.crypto && globalThis.crypto.subtle) {
    const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 12);
  }
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function run(text, api) {
  const q = emlHandoffOf(text);
  if (!q) return 'none';
  const { showPage, esc } = api;
  const field = (cls, label, val, ph) => '<label style="display:block;margin:6px 0"><span class="g-sub" style="font-size:12px">'
    + esc(label) + '</span><input class="' + cls + '" aria-label="' + esc(label) + '" value="' + esc(val)
    + '" placeholder="' + esc(ph) + '" style="width:100%"></label>';

  showPage((el) => {
    el.className += ' eml-handoff-card';
    el.innerHTML = '<h2>Direct mail handoff (.eml &amp; mailto)</h2>'
      + '<p class="g-sub" style="margin:4px 0 8px">Bypasses the disabled <code>env.EMAIL</code> / <code>EMAIL_LIVE</code> dry-run gate (BASE.md) by sending through your own mail app.</p>'
      + field('eh-to', 'To', q.to, 'name@example.com')
      + field('eh-su', 'Subject', q.subject, 'Subject')
      + '<label style="display:block;margin:6px 0"><span class="g-sub" style="font-size:12px">Message</span>'
      + '<textarea class="eh-body" aria-label="Message" rows="5" style="width:100%">' + esc(q.body) + '</textarea></label>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">'
      + '<a class="g-btn eh-mailto" target="_blank" rel="noopener" style="text-decoration:none">Open in mail app ↗</a>'
      + '<button type="button" class="g-btn g-primary eh-dl">Download .eml</button>'
      + '<button type="button" class="g-btn eh-copy">Copy message</button>'
      + '</div>'
      + '<p class="eh-status g-sub" role="status" style="font-size:12px;margin-top:8px"></p>'
      + '<div class="src">Reuses lib/proposal.js + skills/providers.js + docs/SALVAGE.md copy receipt · works offline</div>';

    const toEl = el.querySelector('.eh-to');
    const suEl = el.querySelector('.eh-su');
    const boEl = el.querySelector('.eh-body');
    const mailtoEl = el.querySelector('.eh-mailto');
    const dlEl = el.querySelector('.eh-dl');
    const copyEl = el.querySelector('.eh-copy');
    const statusEl = el.querySelector('.eh-status');

    const current = () => buildEml({ to: toEl.value, subject: suEl.value, body: boEl.value });
    const sync = () => {
      const out = current();
      mailtoEl.href = out.mailtoHref;
      statusEl.textContent = out.mailtoTooLong
        ? out.filename + ' (' + out.bytes + ' B) · body is long for a mailto link; use Download .eml.'
        : out.filename + ' (' + out.bytes + ' B) ready · zero server keys required.';
    };

    for (const inp of [toEl, suEl, boEl]) {
      inp.addEventListener('input', sync);
      inp.addEventListener('keydown', (e) => e.stopPropagation());
    }
    dlEl.addEventListener('click', () => {
      const out = current();
      const url = URL.createObjectURL(new Blob([out.text], { type: 'message/rfc822' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = out.filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      statusEl.textContent = 'Downloaded ' + out.filename + ' (' + out.bytes + ' B). Open it in your mail app and press Send.';
    });
    copyEl.addEventListener('click', async () => {
      const out = current();
      const digest = await sha256Receipt(out.text);
      try {
        await navigator.clipboard.writeText(boEl.value);
        statusEl.textContent = 'Copied message · sha256:' + digest;
      } catch (_) {
        statusEl.textContent = 'Copy from the message box manually · sha256:' + digest;
      }
    });
    sync();
  });
  return 'eml-handoff';
}

export default {
  name: 'eml-handoff',
  examples: [
    'make an eml file for ada@example.com: ready for review',
    'send email without server key to ada@example.com',
    'export email as eml file',
    'bypass email binding gate',
    'eml draft for client handoff',
  ],
  nearMisses: [
    'what is an eml file',
    'email sam that I am running late',
    'write an email to jo@example.com',
    'turn this email into a proposal: we need our order flow fixed by June',
    'write a professional email',
    'email-ready text of my stage',
  ],
  match(lower, text) { return !!emlHandoffOf(text || lower); },
  run,
  suite() {
    const q = emlHandoffOf('make an eml file for ada@example.com: ready for review');
    const out = buildEml({ ...q, date: new Date('2026-11-27T00:00:00Z') });
    const ok = !!q && q.to === 'ada@example.com'
      && out.text.includes('MIME-Version: 1.0\r\n')
      && out.mailtoHref.startsWith('mailto:ada@example.com?')
      && !emlHandoffOf('what is an eml file')
      && !emlHandoffOf('write an email to jo@example.com');
    return { ok, got: ok ? 'eml-handoff ok' : 'eml-handoff failed' };
  },
};

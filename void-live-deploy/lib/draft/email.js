// A draft the visitor can copy. Pure. Nothing is sent, stored, or addressed as a mailbox.
// The page at /draft/ and POST /api/draft-email both use this. A model may rewrite the
// same facts; this shape is what comes back when the model is off.

export const TONES = Object.freeze(['plain', 'warm', 'firm', 'brief']);
const TONE_SET = new Set(TONES);

/** one line, no control characters, capped. Pure. */
export function clean(value, max) {
  return String(value || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, max);
}

function subjectOf(note) {
  let s = note.split(/[\n.!?]/)[0].trim();
  s = s.replace(/^(please|can you|could you|i need to|i want to|draft|write|email)\s+/i, '');
  if (s.length > 70) s = s.slice(0, 67).replace(/\s+\S*$/, '');
  if (!s) s = 'A note';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function greet(who, tone) {
  if (!who) return 'Hello,';
  if (tone === 'warm') return 'Hello ' + who + ',';
  if (tone === 'firm') return who + ',';
  return 'Dear ' + who + ',';
}

function closeOf(tone) {
  if (tone === 'warm') return 'Thank you,';
  if (tone === 'firm') return 'Regards,';
  return 'Thanks,';
}

/** Turn the visitor's note into a subject and a letter. Invents no dates, prices, or promises. Pure. */
export function draftEmail(input) {
  const who = clean(input && input.to, 80);
  const note = clean(input && input.about, 1500);
  const name = clean(input && input.from, 60);
  const tone = TONE_SET.has(input && input.tone) ? input.tone : 'plain';
  if (note.length < 8) return { ok: false, error: 'Say what the email should tell them.' };
  const paragraphs = note.split(/\n+/).map((p) => p.trim()).filter(Boolean).map((p) => { const s = /[.!?]$/.test(p) ? p : p + '.'; return s.charAt(0).toUpperCase() + s.slice(1); });
  const lines = [greet(who, tone), '', ...paragraphs, '', closeOf(tone)];
  if (name) lines.push(name);
  return { ok: true, subject: subjectOf(note), body: lines.join('\n'), tone, via: 'plain', sends: false };
}

/** The model is asked for JSON and nothing else. The note is material, not a new set of rules. Pure. */
export function modelMessages(input) {
  const local = draftEmail(input);
  const tone = local.ok ? local.tone : 'plain';
  const to = clean(input && input.to, 80) || 'the reader';
  const from = clean(input && input.from, 60) || 'the sender';
  const about = clean(input && input.about, 1500);
  return [
    { role: 'system', content: 'You draft one email. You never send it and you never say that you sent it. Use only facts written in the note. Do not invent dates, amounts, or promises. Reply with JSON only, in this shape: {"subject":"...","body":"..."}.' },
    { role: 'user', content: 'Tone: ' + tone + '\nTo: ' + to + '\nFrom: ' + from + '\nNote:\n' + about },
  ];
}

/** A model reply as { subject, body }, or null when it is not a usable draft. Pure. */
export function parseDraft(text) {
  const raw = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = raw.indexOf('{'), end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let data;
  try { data = JSON.parse(raw.slice(start, end + 1)); } catch (_) { return null; }
  const subject = clean(data && data.subject, 120);
  const body = String(data && data.body || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, 4000);
  if (subject.length < 3 || body.length < 12) return null;
  return { subject, body };
}

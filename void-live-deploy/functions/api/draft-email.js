// POST /api/draft-email { to, about, from?, tone? } -> { subject, body, tone, via, sends: false }
// GET -> { ok: true, sends: false, tones }
//
// WHAT A STRANGER COULD MAKE THIS DO. They can spend a model call on a short note. That is
// bounded: 6 drafts a minute per address, 1,500 characters, no mailbox, no storage, no log of
// the note. Workers AI answers first (lib/models.js path 'answer'). Groq answers only when
// that binding is missing or silent and GROQ_API_KEY is set. If neither answers, the letter
// is the plain draft from lib/draft/email.js. This route never sends mail.
import { draftEmail, modelMessages, parseDraft, TONES } from '../../lib/draft/email.js';
import { models } from '../../lib/models.js';
import { LLM_ENDPOINTS } from '../../lib/answer-free.js';
import { json } from '../../lib/http.js';

const CAP = 6;

function said(r) {
  const v = r && (r.response || (r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content) || (r.result && r.result.response));
  return v && typeof v === 'object' ? JSON.stringify(v) : String(v || '');
}

async function limited(request, env) {
  try {
    const raw = new TextEncoder().encode((request.headers.get('cf-connecting-ip') || '') + '|' + String((env && env.SALT) || ''));
    const buf = await crypto.subtle.digest('SHA-256', raw);
    const id = [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
    const key = new Request(new URL(request.url).origin + '/__void-draft-email/rl/' + id);
    const n = parseInt(await (await caches.default.match(key))?.text() || '0', 10);
    if (n >= CAP) return true;
    await caches.default.put(key, new Response(String(n + 1), { headers: { 'cache-control': 'max-age=60' } }));
  } catch (_) {}
  return false;
}

async function fromWorkers(env, messages) {
  if (!env || !env.AI || String(env.VOID_ANSWER_MODELS || '').trim().toLowerCase() === 'off') return null;
  let timer;
  try {
    const r = await Promise.race([
      env.AI.run(models('answer'), { messages, max_tokens: 700 }),
      new Promise((_, no) => { timer = setTimeout(() => no(new Error('slow')), 9000); }),
    ]);
    return parseDraft(said(r));
  } catch (_) { return null; } finally { clearTimeout(timer); }
}

async function fromGroq(env, messages, fetchFn) {
  const ep = LLM_ENDPOINTS['groq-free'];
  if (!env || !ep || !env[ep.key]) return null;
  try {
    const res = await fetchFn(ep.url, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + env[ep.key], 'content-type': 'application/json' },
      body: JSON.stringify({ model: ep.model, messages, max_tokens: 700 }),
      signal: AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return parseDraft(said(data));
  } catch (_) { return null; }
}

/** The letter: a model rewrite when one answers, otherwise the plain draft. Never sends. */
export async function draftReply(env, input, fetchFn = fetch) {
  const local = draftEmail(input || {});
  if (!local.ok) return { status: 400, body: { error: local.error, sends: false } };
  const messages = modelMessages(input || {});
  const workers = await fromWorkers(env, messages);
  if (workers) return { status: 200, body: { ...workers, tone: local.tone, via: 'workers', sends: false } };
  const groq = await fromGroq(env, messages, fetchFn);
  if (groq) return { status: 200, body: { ...groq, tone: local.tone, via: 'groq', sends: false } };
  return { status: 200, body: { subject: local.subject, body: local.body, tone: local.tone, via: 'plain', sends: false } };
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'GET') return json({ ok: true, sends: false, tones: TONES });
  if (request.method !== 'POST') return json({ error: 'Use POST.', sends: false }, 405);
  if (await limited(request, env)) return json({ error: 'Slow down and try again in a minute.', sends: false }, 429);
  let input = {};
  try { input = await request.json(); } catch (_) { return json({ error: 'Send JSON.', sends: false }, 400); }
  const out = await draftReply(env, input);
  return json(out.body, out.status);
}

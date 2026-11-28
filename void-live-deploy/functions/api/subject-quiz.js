// POST /api/subject-quiz  { subject, notes, difficulty } -> { questions, source }
// What a stranger could make this do: spend the site's free Workers AI chat, then Groq when that key is set.
// Eight calls a minute per hashed connection. The guard already caps the body at 16 KB. Nothing is stored.
// The page at /quiz/ is the only caller. Workers AI or Groq only; any other failure is a plain sentence.
import { jsonNoStore } from '../../lib/http.js';
import { models } from '../../lib/models.js';
import { DOWN, askOf, promptOf, questionsFrom, textOf } from '../../lib/subject-quiz.js';

const GROQ = { url: 'https://api.groq.com/openai/v1/chat/completions', model: 'openai/gpt-oss-120b' }; // same free model as lib/answer-free.js groq-free

async function who(request, env) {
  const raw = (request.headers.get('cf-connecting-ip') || '') + (env && env.SALT || '');
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** true when this connection already asked eight times in the last minute. A cache miss counts as allowed. */
async function tooFast(request, env) {
  try {
    const cache = caches.default;
    const key = new Request(new URL(request.url).origin + '/__subject-quiz/rl/' + await who(request, env));
    const n = parseInt(await (await cache.match(key))?.text() || '0', 10);
    if (n >= 8) return true;
    await cache.put(key, new Response(String(n + 1), { headers: { 'cache-control': 'max-age=60' } }));
  } catch (_) {}
  return false;
}

async function workersText(env, messages) {
  if (!env || !env.AI || typeof env.AI.run !== 'function') return '';
  try {
    const out = await env.AI.run(models('answer'), { messages, max_tokens: 900, temperature: 0.4, chat_template_kwargs: { enable_thinking: false } });
    return textOf(out);
  } catch (_) { return ''; }
}

async function groqText(env, messages) {
  if (!env || !env.GROQ_API_KEY) return '';
  try {
    const res = await fetch(GROQ.url, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + env.GROQ_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ model: GROQ.model, messages, max_tokens: 900, temperature: 0.4 }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return '';
    return textOf(await res.json());
  } catch (_) { return ''; }
}

/** the quiz response. env.AI is Workers AI; env.GROQ_API_KEY is the only other try. */
export async function handle(request, env) {
  if (request.method !== 'POST') return jsonNoStore({ error: 'Open the quiz page.' }, 405);
  let body; try { body = await request.json(); } catch (_) { body = null; }
  const ask = askOf(body);
  if (ask.error) return jsonNoStore({ error: ask.error }, 400);
  if (await tooFast(request, env)) return jsonNoStore({ error: 'Slow down. Wait a minute and try again.' }, 429);
  const messages = promptOf(ask);
  let source = 'workers-ai';
  let questions = questionsFrom(await workersText(env, messages));
  if (!questions.length) { source = 'groq'; questions = questionsFrom(await groqText(env, messages)); }
  if (!questions.length) return jsonNoStore({ error: DOWN }, 503);
  return jsonNoStore({ questions, source });
}

export function onRequestPost(ctx) { return handle(ctx.request, ctx.env); }

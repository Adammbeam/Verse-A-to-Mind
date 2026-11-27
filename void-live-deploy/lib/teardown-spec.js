// Teardown spec (VR2.1): a page map becomes a feature spec in Verse's own words.
// Workers AI answers first, then Groq only. Eight source words in a row are refused, then retried once.
// Tests: tools/teardown-spec.test.mjs.
import { FREE_MODEL } from './models.js';
import { answerFree } from './agent-providers.js';

export const COPY_RUN = 8;
export const SPEC_LIMITS = Object.freeze({ features: 12, steps: 8, states: 8, field: 120, mapString: 80 });
export const STRICT = 'Rewrite every feature in new words. Do not reuse any eight word run from the source. JSON only.';
const SYSTEM = 'You are Verse. From a page structure map, write a feature spec in your own words. '
  + 'Reply with JSON only: {"target":"","features":[{"name":"","flow":[""],"states":[""],"data":{"entity":["field"]}}],"api":{"ops_by_area":{}}}. '
  + 'Name what a person can do, the steps, the states and the data fields. Do not copy a phrase from a source page.';

export function wordsOf(text) {
  return String(text || '').toLowerCase().match(/[a-z0-9]+/g) || [];
}

/** true when specText contains n words in a row that also appear in sourceText. Pure. */
export function sharesRun(specText, sourceText, n = COPY_RUN) {
  const src = wordsOf(sourceText), spec = wordsOf(specText);
  if (src.length < n || spec.length < n) return false;
  const grams = new Set();
  for (let i = 0; i + n <= src.length; i++) grams.add(src.slice(i, i + n).join(' '));
  for (let i = 0; i + n <= spec.length; i++) if (grams.has(spec.slice(i, i + n).join(' '))) return true;
  return false;
}

/** the text a model reply is made of: a string, a Workers AI response, or a Groq message. Pure. */
export function textOf(v) {
  if (typeof v === 'string') return v;
  if (!v || typeof v !== 'object') return '';
  if (typeof v.response === 'string') return v.response;
  if (v.response && typeof v.response === 'object') return JSON.stringify(v.response);
  if (typeof v.text === 'string') return v.text;
  const choice = v.choices && v.choices[0] && v.choices[0].message;
  if (choice && typeof choice.content === 'string') return choice.content;
  if (v.result && typeof v.result.response === 'string') return v.result.response;
  return Array.isArray(v.features) ? JSON.stringify(v) : '';
}

function clipMap(v, depth = 0) {
  if (depth > 6) return null;
  if (typeof v === 'string') return v.length > SPEC_LIMITS.mapString ? v.slice(0, SPEC_LIMITS.mapString) : v;
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (Array.isArray(v)) return v.slice(0, 40).map((x) => clipMap(x, depth + 1));
  if (!v || typeof v !== 'object') return null;
  const o = {};
  for (const k of Object.keys(v).slice(0, 30)) o[k] = clipMap(v[k], depth + 1);
  return o;
}

function asList(v) {
  const raw = Array.isArray(v) ? v : (typeof v === 'string' && v.trim() ? [v] : []);
  return raw.map((x) => String(x).replace(/\s+/g, ' ').trim().slice(0, SPEC_LIMITS.field)).filter(Boolean).slice(0, SPEC_LIMITS.steps);
}

function asData(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { fields: asList(v) };
  const o = {};
  for (const k of Object.keys(v).slice(0, 8)) o[String(k).slice(0, 40)] = asList(v[k]).slice(0, SPEC_LIMITS.states);
  return o;
}

function clipApi(api) {
  const ops = api && api.ops_by_area && typeof api.ops_by_area === 'object' && !Array.isArray(api.ops_by_area) ? api.ops_by_area : {};
  const out = {};
  for (const k of Object.keys(ops).slice(0, 12)) out[String(k).slice(0, 40)] = Number.isFinite(ops[k]) ? ops[k] : String(ops[k] == null ? '' : ops[k]).slice(0, 40);
  return { ops_by_area: out };
}

function flatText(v, out = []) {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) for (const x of v) flatText(x, out);
  else if (v && typeof v === 'object') for (const k of Object.keys(v)) flatText(v[k], out);
  return out.join(' ');
}

/** parse a model reply into { target, features, api }, or null when it is not a spec. Pure. */
export function parseSpec(raw, map) {
  const s = String(raw || ''), i = s.indexOf('{'), j = s.lastIndexOf('}');
  if (i < 0 || j <= i) return null;
  let body;
  try { body = JSON.parse(s.slice(i, j + 1)); } catch (_) { return null; }
  if (!body || !Array.isArray(body.features)) return null;
  const features = [];
  for (const f of body.features) {
    if (!f || typeof f !== 'object') continue;
    const name = String(f.name || '').replace(/\s+/g, ' ').trim().slice(0, SPEC_LIMITS.field);
    if (!name) continue;
    features.push({ name, flow: asList(f.flow), states: asList(f.states).slice(0, SPEC_LIMITS.states), data: asData(f.data) });
    if (features.length >= SPEC_LIMITS.features) break;
  }
  return { target: String(body.target || (map && map.url) || '').slice(0, SPEC_LIMITS.field), features, api: clipApi(body.api) };
}

/** one free answer: the Workers AI binding first, then Groq only. `free` is injectable. */
export async function askFree(env, messages, free = answerFree) {
  const run = env && env.AI && typeof env.AI.run === 'function' ? env.AI.run.bind(env.AI) : null;
  if (run) {
    try {
      const text = textOf(await run(FREE_MODEL, { messages, max_tokens: 900 })).trim();
      if (text) return text;
    } catch (_) { /* the binding missed; Groq is next */ }
  }
  return textOf(await free(env || {}, messages, { only: 'groq' })).trim();
}

/** spec(map, sourceText, { ask, env }) -> { ok:true, target, features, api } or { ok:false, reason }. */
export async function spec(map, sourceText, opts = {}) {
  const ask = opts.ask || ((messages) => askFree(opts.env || {}, messages));
  const user = 'Page structure (counts and paths only):\n' + JSON.stringify(clipMap(map));
  let copied = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    const messages = [
      { role: 'system', content: attempt ? SYSTEM + ' ' + STRICT : SYSTEM },
      { role: 'user', content: attempt ? user + '\n\n' + STRICT : user },
    ];
    let raw = '';
    try { raw = textOf(await ask(messages)); } catch (_) { raw = ''; }
    const parsed = parseSpec(raw, map);
    if (sharesRun(raw, sourceText) || (parsed && sharesRun(flatText(parsed), sourceText))) { copied = true; continue; }
    if (!parsed) continue;
    return { ok: true, target: parsed.target, features: parsed.features, api: parsed.api };
  }
  return copied ? { ok: false, reason: 'copied' } : { ok: false, reason: 'unreadable' };
}

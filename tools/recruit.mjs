#!/usr/bin/env node
// The free-agent clock. One short piece per call, then check and stitch. node tools/recruit.mjs --once
// Prints status names only. Never prints a key, a token, or a join code.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { readySources, keepPatch, note, pasteOf } from '../void-live-deploy/lib/recruit.js';

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : ''; };

export async function ask(source, messages, env, fetchImpl = fetch) {
  const headers = { 'content-type': 'application/json' };
  let url = source.endpoint, body;
  if (source.id === 'pollinations') body = { messages, max_tokens: 120 };
  else {
    if (!env[source.key]) return { ok: false, status: 0, say: 'no key' };
    headers.authorization = 'Bearer ' + env[source.key];
    body = { model: source.model, messages, max_tokens: 4000 };
  }
  let r;
  try { r = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) }); }
  catch (e) { return { ok: false, status: 0, say: source.id + ' ' + ((e && e.name) || 'error') }; }
  const retry = Number(r.headers.get('retry-after')) || 0;
  if (r.status === 429 || r.status === 402) return { ok: false, status: r.status, limited: true, retryAfter: retry || (source.windowMs ? source.windowMs / 1000 : 0), say: source.id + ' ' + r.status };
  const raw = await r.text();
  if (!r.ok) return { ok: false, status: r.status, say: source.id + ' ' + r.status };
  let text = raw;
  try {
    const j = JSON.parse(raw);
    text = String((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || j.response || '');
  } catch (_) { text = raw; }
  if (!text.trim()) return { ok: false, status: r.status, say: source.id + ' empty', raw };
  return { ok: true, status: r.status, text, raw, say: source.id };
}

/** a test job is published only after its command exits 0. A page of model prose is never published. */
export async function once({ env = process.env, state = { sources: {} }, log = () => {}, fetchImpl = fetch, now = Date.now() } = {}) {
  // Every free agent that is ready, not just the first: one throttled clock run still calls all of them.
  const ready = readySources(env, state, now);
  if (!ready.length) { log('source none; every free agent is parked, dropped, or has no key'); return { state, html: '', replies: [], skipped: true, how: '' }; }
  const askLine = 'Reply with one line: yes, and the helper/ branch you will use.';
  const replies = await Promise.all(ready.map(async (source) => {
    const r = await ask(source, [{ role: 'system', content: pasteOf(source) }, { role: 'user', content: askLine }], env, fetchImpl);
    return { source: source.id, ok: !!r.ok, limited: !!r.limited, retryAfter: r.retryAfter || 0, status: r.status || 0, say: r.say || '', text: r.ok ? String(r.text || '').slice(0, 400) : '' };
  }));
  for (const r of replies) state = note(state, r.source, now, { limited: r.limited, retryAfter: r.retryAfter });
  const answered = replies.filter((r) => r.ok).length;
  log('called ' + ready.length + ' free agents (' + replies.map((r) => r.source + ' ' + (r.ok ? 'ok' : r.limited ? 'parked' : 'miss')).join(', ') + '); ' + answered + ' answered');
  return { state, html: '', replies, skipped: answered === 0, how: 'free agents' };
}

async function main() {
  if (!args.includes('--once')) { console.log('node tools/recruit.mjs --once'); return; }
  const statePath = flag('--state');
  let state = { sources: {} };
  if (statePath) { try { state = JSON.parse(readFileSync(statePath, 'utf8')); } catch (_) { state = { sources: {} }; } }
  const out = await once({ env: process.env, state, log: (line) => console.log(String(line).replace(/[A-Za-z0-9_\-]{24,}/g, '[masked]')) });
  const replies = flag('--replies');
  if (replies && out.replies) { mkdirSync(dirname(replies), { recursive: true }); writeFileSync(replies, JSON.stringify(out.replies, null, 2)); }
  if (statePath) writeFileSync(statePath, JSON.stringify(out.state));
  if (!keepPatch(out.job, out.html, out.testExit)) { console.log('nothing checked; nothing written'); return; }
  mkdirSync(dirname(out.job.file), { recursive: true });
  writeFileSync(out.job.file, out.html);
  console.log('wrote ' + out.job.file + ' via ' + out.how);
}

if (process.argv[1] && process.argv[1].endsWith('recruit.mjs')) main();

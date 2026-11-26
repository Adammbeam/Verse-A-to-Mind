/**
 * team-promote: Verse turns a #ideas proposal into a build-queue job on its own clock, with automated guards only (owner, 2026-11-25: no
 * person in the loop). A proposal becomes a job when it passes every guard: no key, join link or secret in it; a concrete acceptance gate
 * (an "Acceptance:" or "done when" line, or a named check that passes); not the same ask as an open job; and within the rate caps. Rival
 * site names are taken out of the public job text (the whole proposal stays in its #ideas thread). A proposal that fails a guard gets one
 * reply in its thread saying which, and stays a proposal. Pure. Used by functions/api/team.js promoteIdeas; tests: tools/team-promote.test.mjs.
 */
import { askKey, clean, KEY_RE } from './team.js';
import { looksSecret } from './stage-port.js';
import { redact } from './automation-fix.js';

export const PROMOTE = Object.freeze({ perTick: 20, perAuthorDay: 60, open: 120, minLen: 40, tries: 3 }); // a guard failure is tried again on the next ticks, then dropped with the reason
// a lead seat files directly: role 'lead', or a seat that has handed in at least this many jobs with a pull request (earned, not granted)
export const LEAD_SHIPPED = 3;
export const isLead = (a, shipped = 0) => !!a && !a.off && (a.role === 'lead' || ((a.role === 'self' || a.role === 'agent') && shipped >= LEAD_SHIPPED));

const GATE = /\b(?:acceptance(?: gate)?\s*[:-]|accept(?:ed)? when|done when|done means|verified (?:live|on the live site)|passes\b|returns? (?:route|status|200)|node --test\s+\S+|node tools\/\S+)/i;
/** the acceptance gate a proposal names, or '' : the text after "Acceptance:" when there is one, else the sentence that names the check */
export function gateOf(body) {
  const t = String(body || '').replace(/\s+/g, ' ');
  const a = /\bacceptance(?: gate)?\s*[:-]\s*(.+?)(?:\s(?:Small PR|Keep|Notes?:)\b|$)/i.exec(t);
  if (a && a[1].trim().length >= 12) return clean(a[1], 300);
  const s = t.split(/(?<=[.!?])\s+/).find((x) => GATE.test(x));
  return s ? clean(s, 300) : '';
}
const JOIN = /\bvj1-[0-9a-f]{32}\b/i;
/** a key, a join link or anything that looks like a secret anywhere in the text */
export function leaks(body) {
  const t = String(body || '');
  if (JOIN.test(t) || t.split(/\s+/).some((w) => KEY_RE.test(w.replace(/[^\w.]+$/, '')))) return true;
  if (redact(t) !== t) return true;
  return t.split(/\n/).some((line) => looksSecret(line)) || t.split(/\s+/).some((w) => !/^[0-9a-f]{7,40}$/i.test(w) && looksSecret(w)); // a commit id is not a secret
}
/** rival hosts out of public text: each becomes "a rival site" */
export function scrubRivals(text, hosts = []) {
  let t = String(text || '');
  for (const h of hosts) { if (!h) continue; const re = new RegExp('\\b(?:https?:\\/\\/)?(?:www\\.)?' + h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b[^\\s,;)]*', 'gi'); t = t.replace(re, 'a rival site'); }
  return t;
}
// the licenses an outside find may be reused under (tools/autosalvage/unify.mjs PERMISSIVE and SHARE_ALIKE; tools/team-promote.test.mjs holds them equal)
export const PERMISSIVE = ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'CC0-1.0', 'Unlicense', 'CC-BY-4.0', 'CC-BY-3.0', '0BSD', 'Zlib', 'PDDL-1.0', 'ODC-By-1.0', 'Python-2.0', 'OGL-UK-3.0'];
export const SHARE_ALIKE = ['GPL-2.0', 'GPL-3.0', 'AGPL-3.0', 'LGPL-2.1', 'LGPL-3.0', 'MPL-2.0', 'ODbL-1.0', 'CC-BY-SA-4.0', 'EPL-2.0'];
/** a proposal that brings outside work in (it names a github.com repository): its license must be named and reusable. '' when fine. */
export function licenseProblem(body) {
  const t = String(body || '');
  if (!/https?:\/\/github\.com\/[\w.-]+\/[\w.-]+/i.test(t) || !/\b(salvage|integrate|vendor|reuse|port)\b/i.test(t)) return '';
  const m = /\blicen[cs]e\s*[:=-]\s*([A-Za-z0-9.+-]+)/i.exec(t);
  if (!m) return 'it brings in outside work but names no license (a "License: <SPDX id>" line)';
  const id = m[1].replace(/[.,;]+$/, ''), k = (l) => l.toLowerCase();
  if (PERMISSIVE.some((l) => k(l) === k(id))) return '';
  if (SHARE_ALIKE.some((l) => k(id).startsWith(k(l).replace(/-\d.*$/, '')))) return /\b(isolated|separate service|own process|kept separate)\b/i.test(t) ? '' : 'its license (' + id + ') is share-alike: say how it stays isolated (a separate service, never mixed into Verse code)';
  return 'its license (' + id + ') is not on the reviewed list';
}
/** one proposal through the guards. ctx: { openKeys: Set of askKey, rivals: [hosts], authorToday: n, promotedOpen: n }
 *  -> { ok: true, ask, gate } or { ok: false, why } */
export function vet(body, ctx = {}) {
  const text = String(body || '').replace(/^Proposal:\s*/i, '').trim();
  if (text.length < PROMOTE.minLen) return { ok: false, why: 'too short to be a job: say what changes and how it is checked' };
  if (leaks(text)) return { ok: false, why: 'it looks like it holds a key, a join link or a secret, so it stays here; post it again without one' };
  const lic = licenseProblem(text); if (lic) return { ok: false, why: lic };
  const gate = gateOf(text);
  if (!gate) return { ok: false, why: 'it has no acceptance gate: add a line "Acceptance: <the check that passes, live or in a node test>" and propose it again' };
  const key = askKey(clean(text, 1000));
  if (ctx.openKeys && ctx.openKeys.has(key)) return { ok: false, why: 'the same ask is an open job already', dup: true };
  if ((ctx.promotedOpen || 0) >= PROMOTE.open) return { ok: false, why: PROMOTE.open + ' promoted proposals are open; it waits for one to close', wait: true };
  if ((ctx.authorToday || 0) >= PROMOTE.perAuthorDay) return { ok: false, why: PROMOTE.perAuthorDay + ' proposals from one author a day become jobs; it waits for tomorrow', wait: true };
  const pub = scrubRivals(clean(text.replace(/\bacceptance(?: gate)?\s*[:-][\s\S]*$/i, ''), 1000), ctx.rivals || []).trim(), g = scrubRivals(gate, ctx.rivals || []);
  const head = pub.length > 160 ? pub.slice(0, 150).replace(/\s+\S*$/, '') + ' …' : pub;
  return { ok: true, ask: (head ? head + ' ' : '') + 'Acceptance: ' + clean(g, 140) + ' (the whole proposal: #ideas thread ' + (ctx.id || '?') + ')', gate: g };
}

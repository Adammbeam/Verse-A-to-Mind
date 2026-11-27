// Four short steps on /missions/. Progress stays in this browser: which step is done, a day streak,
// and how often each tool was the one that finished a step. No sentence, no name, no account.
// The keys match lib/state.js. Tests: tools/missions.test.mjs.
import { STORES } from './state.js';

export const KEY = 'a2m.void.missions.v1';
export const LEAVE_KEY = 'a2m.void.missions.leave.v1';
const CALC_KEY = 'a2m.void.calculator.v1';
const ARCADE_BEST = 'a2m.void.arcade.best.v1';
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const BACK_MS = 500;
const BACK_MAX = 6 * 60 * 60 * 1000;

export const MISSIONS = Object.freeze([
  { id: 'ask', title: 'Ask Verse for a timer', step: 'Ask Verse for a five minute timer. Come back and this step ticks off.', href: '/?q=' + encodeURIComponent('set a timer for 5 minutes'), action: 'Ask Verse', tool: 'the ask bar', prefixes: [] },
  { id: 'play', title: 'Try a game', step: 'Play one round in the arcade. Come back and this step ticks off.', href: '/arcade/', action: 'Open the arcade', tool: 'the arcade', prefixes: ['/arcade/', '/games/'] },
  { id: 'sum', title: 'Run a calculator', step: 'Work out a sum on the calculator. Come back and this step ticks off.', href: '/calculator/', action: 'Open the calculator', tool: 'the calculator', prefixes: ['/calculator/'] },
  { id: 'headers', title: "Check a site's security", step: 'Read the live security headers. Come back and this step ticks off.', href: '/under-the-hood/#headers', action: 'Read the headers', tool: 'security headers', prefixes: ['/under-the-hood/'] },
].map(Object.freeze));

const IDS = MISSIONS.map((m) => m.id);
export const BADGES = Object.freeze(['', 'First step', 'Two down', 'On a roll', 'Track clear']);
export const utcDay = (now) => new Date(now).toISOString().slice(0, 10);
const prevDay = (d) => new Date(Date.parse(d + 'T00:00:00Z') - 864e5).toISOString().slice(0, 10);

export function empty() { return { seen: '', done: {}, tools: {}, touched: {}, days: [] }; }

function json(storage, key) {
  try { return JSON.parse(storage.getItem(key) || 'null'); } catch (_) { return null; }
}
function usedMap(value) {
  const out = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [k, v] of Object.entries(value)) if (/^[a-z0-9][a-z0-9-]{0,40}$/.test(k) && DAY.test(String(v))) out[k] = String(v);
  return out;
}
function filled(value) {
  if (Array.isArray(value)) return value.length > 0;
  return !!(value && typeof value === 'object' && Object.keys(value).length > 0);
}
function scored(value) {
  return !!(value && typeof value === 'object' && Object.values(value).some((n) => typeof n === 'number' && n > 0));
}

/** what this browser already did, as flags only. The ask text and the sums are never copied. */
export function signalsOf(storage) {
  const used = usedMap(json(storage, STORES.used.key));
  const loop = json(storage, STORES.loop.key);
  const calc = json(storage, CALC_KEY);
  return {
    ask: (Array.isArray(loop) && loop.length > 0) || Object.keys(used).length > 0,
    play: filled(json(storage, STORES.games.key)) || filled(json(storage, STORES.ladder.key)) || scored(json(storage, ARCADE_BEST)),
    sum: !!(calc && Array.isArray(calc.hist) && calc.hist.length > 0) || !!used.calc,
    headers: false,
  };
}

export function pathOf(referrer) {
  if (!referrer) return '';
  try {
    let p = new URL(referrer, 'https://a-to-mind.com').pathname || '/';
    if (p.length > 1 && !p.endsWith('/')) p += '/';
    return p;
  } catch (_) { return ''; }
}
export function leaveOf(text) {
  let j = null; try { j = JSON.parse(text || 'null'); } catch (_) {}
  if (!j || !IDS.includes(j.id) || !Number.isFinite(j.at)) return null;
  return { id: j.id, at: j.at };
}
/** the step a return visit just finished: the tool in the referrer, or the step they left for and came back to. */
export function returnedId(referrer, navType, leave, now) {
  const path = pathOf(referrer);
  const hit = MISSIONS.find((m) => m.prefixes.some((pre) => path === pre || path.startsWith(pre)));
  if (hit) return hit.id;
  if (leave && navType === 'back_forward' && now - leave.at >= BACK_MS && now - leave.at < BACK_MAX) return leave.id;
  return '';
}

export function parseProgress(text) {
  let j = null; try { j = JSON.parse(text || 'null'); } catch (_) {}
  const out = empty();
  if (!j || typeof j !== 'object' || Array.isArray(j)) return out;
  if (DAY.test(j.seen)) out.seen = j.seen;
  for (const id of IDS) {
    if (j.done && DAY.test(j.done[id])) out.done[id] = j.done[id];
    const n = j.tools && j.tools[id];
    if (Number.isInteger(n) && n > 0 && n <= 99) out.tools[id] = n;
    if (j.touched && DAY.test(j.touched[id])) out.touched[id] = j.touched[id];
  }
  if (Array.isArray(j.days)) for (const d of j.days) if (DAY.test(d) && !out.days.includes(d)) out.days.push(d);
  out.days.sort();
  if (out.days.length > 21) out.days = out.days.slice(-21);
  return out;
}
export function readProgress(storage) { try { return parseProgress(storage.getItem(KEY)); } catch (_) { return empty(); } }
export function writeProgress(storage, progress) {
  try { storage.setItem(KEY, JSON.stringify(parseProgress(JSON.stringify(progress)))); return true; } catch (_) { return false; }
}

function addDay(days, day) { return days.includes(day) ? days : [...days, day].sort().slice(-21); }

/** fold today's evidence into a new progress value. Does not write. */
export function openTrack(prev, evidence, now) {
  const day = utcDay(now);
  const base = prev && prev.done ? prev : empty();
  const on = { ...(evidence && evidence.signals) };
  if (evidence && evidence.returned && IDS.includes(evidence.returned)) on[evidence.returned] = true;
  const any = IDS.some((id) => on[id]);
  const busy = !!base.seen || IDS.some((id) => base.done[id]) || IDS.some((id) => base.tools[id]);
  const done = { ...base.done }, tools = { ...base.tools }, touched = { ...base.touched };
  for (const id of IDS) {
    if (!on[id]) continue;
    if (!done[id]) done[id] = day;
    if (touched[id] !== day) { tools[id] = Math.min(99, (tools[id] | 0) + 1); touched[id] = day; }
  }
  const days = IDS.some((id) => done[id] === day) ? addDay(base.days, day) : base.days.slice();
  return { first: !busy && !any, progress: { seen: base.seen || day, done, tools, touched, days } };
}

export function streakOf(days, today) {
  const set = new Set(days || []);
  let d = set.has(today) ? today : prevDay(today);
  if (!set.has(d)) return 0;
  let n = 0;
  while (set.has(d) && n < 21) { n++; d = prevDay(d); }
  return n;
}

export function viewOf(opened, now) {
  const progress = opened.progress;
  const steps = MISSIONS.map((m, i) => ({ id: m.id, n: i + 1, title: m.title, step: m.step, href: m.href, action: m.action, done: !!progress.done[m.id], next: false }));
  const nxt = steps.find((s) => !s.done);
  if (nxt) nxt.next = true;
  const count = steps.filter((s) => s.done).length;
  let best = '', n = 0, tied = 0;
  for (const m of MISSIONS) {
    const c = progress.tools[m.id] | 0;
    if (c > n) { n = c; best = m.tool; tied = 1; }
    else if (c === n && c > 0) tied += 1;
  }
  return {
    greet: opened.first ? 'Start with one step. Each one uses a tool Verse already has.' : 'Welcome back. Pick up where you left off.',
    badge: BADGES[count] || '',
    streak: streakOf(progress.days, utcDay(now)),
    most: tied === 1 ? 'You come back to ' + best + ' most.' : '',
    steps,
  };
}

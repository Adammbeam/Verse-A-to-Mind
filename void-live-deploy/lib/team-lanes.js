/**
 * team-lanes: each seat's lane, the stock the clock keeps, and the owner's crew panel. Pure: no network, no storage.
 * A lane is what a seat has actually closed: the kinds of the jobs it handed in with a pull request, and the areas those jobs touched
 * (lib/team-leverage.js scopeOf: files, pages). functions/api/team.js handOut prefers a job in the seat's lane among the few Verse would
 * hand out next anyway, after the owner's asks, so a lane steers the pick and never jumps the order. lib/team-crew-run.js crewTick keeps
 * the claimable jobs at stockTarget(seats) and scales how many wants it files a run with the shortfall. Tests: tools/team-lanes.test.mjs.
 */
import { kindOf, ownerAsk } from './team.js';
import { scopeOf } from './team-leverage.js';

export const PER_SEAT = 3, MIN_STOCK = 12, WINDOW = 8, FILE_MAX = 8;
export const ACTIVE_MS = 2 * 3600e3; // a seat that spoke or was handed work in this window counts toward the stock

/** the areas a job touches: a file's folder (two levels), a page. -> ['lib', 'skills/weather', 'page:/films/'] */
export function areasOf(j) {
  const out = new Set();
  for (const k of scopeOf(j)) {
    if (k.startsWith('file:')) { const parts = k.slice(5).split('/'); out.add(parts.length > 2 ? parts.slice(0, 2).join('/') : parts[0]); }
    else if (k.startsWith('page:')) out.add(k);
  }
  return [...out];
}
/** a seat's lane from the jobs it closed (newest first): { kinds: {k: n}, areas: {a: n}, top: [up to 4 words], n } */
export function laneOf(closed = []) {
  const kinds = {}, areas = {};
  for (const j of closed || []) {
    if (!j) continue;
    const k = kindOf(j.target); if (k) kinds[k] = (kinds[k] || 0) + 1;
    for (const a of areasOf(j)) areas[a] = (areas[a] || 0) + 1;
  }
  const best = (o, n) => Object.entries(o).sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)).slice(0, n).map((e) => e[0]);
  return { kinds, areas, top: [...best(kinds, 2), ...best(areas, 2)], n: (closed || []).filter(Boolean).length };
}
/** how well a job fits a lane: 2 for its kind, 1 for each area the seat has closed work in. 0 with no lane. */
export function fitOf(j, lane) {
  if (!lane || !lane.n) return 0;
  return (lane.kinds[kindOf(j.target)] ? 2 : 0) + areasOf(j).filter((a) => lane.areas[a]).length;
}
/** Verse's hand-out order with the seat's lane preferred: the owner's asks stay first in their order; among the next WINDOW jobs the best
 *  fit goes first (ties keep Verse's order); everything after the window is untouched. A seat with no closed work gets Verse's order. */
export function preferLane(list = [], lane, window = WINDOW) {
  if (!lane || !lane.n) return list.slice();
  const owner = list.filter((j) => ownerAsk(j)), rest = list.filter((j) => !ownerAsk(j));
  const head = rest.slice(0, window).map((j, i) => ({ j, f: fitOf(j, lane), i })).sort((a, b) => b.f - a.f || a.i - b.i).map((x) => x.j);
  return [...owner, ...head, ...rest.slice(window)];
}
/** the claimable jobs the clock keeps on hand: PER_SEAT a working seat, at least MIN_STOCK */
export const stockTarget = (seats) => Math.max(MIN_STOCK, PER_SEAT * Math.max(0, seats | 0));
/** how many wants a run may file and how many may stay open: the base caps, raised with the shortfall when the stock is low */
export function capsFor({ claimable = 0, seats = 0, baseFile = 2, baseOpen = 12 } = {}) {
  const target = stockTarget(seats), short = Math.max(0, target - claimable);
  return { target, short, low: short > 0, file: short ? Math.min(FILE_MAX, Math.max(baseFile, Math.ceil(short / 2))) : baseFile,
    open: Math.max(baseOpen, target) };
}
/** the owner's crew panel: seats with their lanes, throughput, the oldest claim and the stock. No job text, no visitor words. */
export function panelOf({ seats = [], done24 = 0, handed24 = 0, claimable = 0, stock = null, now = Date.now() } = {}) {
  const active = seats.filter((s) => now - Math.max(s.seen || 0, s.job_at || 0) < ACTIVE_MS);
  const claims = seats.filter((s) => s.job && s.job_at).map((s) => s.job_at);
  return {
    seats: seats.map((s) => ({ name: s.name, role: s.role || 'agent', lane: s.lane ? s.lane.top : [], closed: s.lane ? s.lane.n : 0, job: s.job || null,
      busyMin: s.job && s.job_at ? Math.max(0, Math.floor((now - s.job_at) / 6e4)) : null, active: active.includes(s) })),
    active: active.length, done24, handed24, oldestClaimMin: claims.length ? Math.max(0, Math.floor((now - Math.min(...claims)) / 6e4)) : 0,
    stock: { claimable, target: stockTarget(active.length), low: claimable < stockTarget(active.length), last: stock },
  };
}

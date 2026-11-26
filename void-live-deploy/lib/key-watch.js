// Catches a secret that was set and became blank or unbound (2026-11-25: eight production secrets went empty and stayed unnoticed
// for a day). Each clock tick (POST /api/automations/tick, every 5 minutes) records every watched name's state, set / empty /
// absent (lib/key-state.js), in D1, and says it in the team chat once, on the tick that sees a set name lose its value. Only the
// state word is stored or said: never a value, a length or a prefix.
import { keyStates, WATCHED_KEYS } from './key-state.js';

/** names that were 'set' and are not any more. Pure. */
export function lostKeys(before = {}, now = {}) {
  return Object.keys(now).filter((n) => before[n] === 'set' && now[n] !== 'set');
}

export function lostLine(lost, now, states) {
  return 'Secret check: ' + lost.map((n) => n + ' went from set to ' + states[n]).join('; ') + ' on the live deployment (' + new Date(now).toISOString() +
    '). Nothing was read out. Re-enter ' + (lost.length === 1 ? 'it' : 'them') + ' for the production environment of Pages project a-to-mind.';
}

/** one tick: compare with D1, store the new states, and say any loss. -> { states, lost } */
export async function watchKeys(env, now = Date.now(), say = null, names = WATCHED_KEYS) {
  if (!env || !env.DB) return { states: {}, lost: [] };
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS void_key_seen (name TEXT PRIMARY KEY, state TEXT NOT NULL, at INTEGER NOT NULL)').run();
  const { results } = await env.DB.prepare('SELECT name, state FROM void_key_seen').all();
  const before = Object.fromEntries((results || []).map((r) => [r.name, r.state]));
  const states = keyStates(env, names);
  const changed = Object.keys(states).filter((n) => before[n] !== states[n]);
  for (const n of changed) await env.DB.prepare('INSERT INTO void_key_seen (name, state, at) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET state = excluded.state, at = excluded.at').bind(n, states[n], now).run();
  const lost = lostKeys(before, states);
  if (lost.length && typeof say === 'function') await say(lostLine(lost, now, states));
  return { states, lost };
}

// The frontier, pruned against the build ledger (2026-11-25: "Absorb and connect every repo" sat in "Still open"
// weeks after it was built). The card kept it because the sentence describing it is the model's prose, and `markBuilt`
// only marks prose against the velocity feed, which is scoped to the last seven days. An ask built in October can never
// be marked done there, so the prose stays as written, forever.
//
// The fix belongs upstream of the model: do not hand it an ask the ledger already proves. Then the "Next targeted
// capability" line is honest by construction instead of honest by luck.
//
// The rule is the one already used everywhere else (lib/ask-same.js): two asks are one ask when their word sets overlap
// by 70%, and never when they name different sites. Nothing new is invented here; this only decides which asks to leave out.
//
// The ledger is large (void.growth.json is past 17,000 lines) and the frontier is short, so the ledger is indexed once
// into exact keys, and `sameAsk` runs only on the misses. Scanning the ledger per ask would be quadratic for no reason.
import { askKey, sameAsk, sameSites, stripCites } from './ask-same.js';

/** the `asked` lines a ledger proves, indexed for cheap exact lookup: { keys:Set<string>, asks:string[] }. Pure. */
export function builtIndex(ledger) {
  const keys = new Set(), asks = [];
  for (const row of (Array.isArray(ledger) ? ledger : [])) {
    const asked = stripCites(row && (row.asked || row.ask));
    if (!asked || asked.length < 4) continue;
    const k = askKey(asked);
    if (!k) continue;
    if (keys.has(k)) continue;
    keys.add(k); asks.push(asked);
  }
  return { keys, asks };
}

/**
 * The asks the ledger does not prove, in the order they were given. An ask is left out when a ledger line carries it,
 * exactly or in nearly the same words. `null` for a built index or a list means "nothing to compare", so the input comes
 * back unchanged: a broken read must not silently empty the frontier. Pure.
 */
export function unbuilt(asks, index) {
  const list = (Array.isArray(asks) ? asks : []).filter(Boolean);
  if (!index || !index.keys || !index.asks || !index.asks.length) return list;
  return list.filter((a) => {
    const text = typeof a === 'string' ? a : (a.ask || a.title); // self.json rows carry ask, frontier items (tools/frontier.mjs openItems) title
    const clean = stripCites(text);
    if (!clean) return false;
    if (index.keys.has(askKey(clean))) return false;
    // the word rule alone is not enough: two asks that name different sites are two asks (lib/ask-same.js sameSites),
    // which is the rule dupAsk and lib/voice.js already apply. Without it, building onlineconverter.com would hide
    // sycophanthex.com.
    return !index.asks.some((built) => sameSites(clean, built) && sameAsk(clean, built));
  });
}

/** the same thing for a whole frontier object, so a caller can hand it one shape: { frontier, asks, open } → pruned. Pure. */
export function unbuiltFrontier(frontier, index) {
  if (!frontier || typeof frontier !== 'object') return frontier;
  const out = { ...frontier };
  for (const k of ['frontier', 'asks', 'open', 'next']) {
    if (Array.isArray(out[k])) out[k] = unbuilt(out[k], index);
  }
  return out;
}

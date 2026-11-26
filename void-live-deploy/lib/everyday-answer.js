// everyday-answer: the small daily asks /api/answer used to send to the model, which cannot see a clock or roll a die
// ("what time is it" came back "I do not have access to a real-time clock"; "flip a coin" was a word the model picked).
// Answered here, before the cache and the model, from the server's own clock and crypto random:
//   - the time, the date and the weekday, in the zone the request came from (Cloudflare's request.cf.timezone), named in the answer;
//     with no zone known, America/New_York, and the answer says so
//   - a coin flip (skills/coin.js coinOf and flip), dice and a random number (skills/random.js parseAsk and roll)
//   - days until a holiday or a date ("how many days until christmas", "days until march 3", "days until thanksgiving")
// Never cached: every one of these changes from one ask to the next.
import { coinOf, flip } from '../skills/coin.js';
import { parseAsk, roll } from '../skills/random.js';
import { findDay, daysBetween, isoOf, labelOf, weekdayOf } from './date-words.js';

export const DEFAULT_TZ = 'America/New_York';
const clean = (ask) => String(ask || '').toLowerCase().trim().replace(/\s+/g, ' ').replace(/[?!.]+$/, '')
  .replace(/^(?:hey |hi |ok |okay |please |verse,? )+/, '').replace(/^(?:can|could) you (?:please )?/, '').replace(/^(?:tell me|show me|give me) /, '').replace(/,? please$/, '').trim();

const okZone = (tz) => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch (_) { return false; } };
/** the zone to answer in: the request's own when it is a real IANA zone, else the default. Pure. */
export const zoneOf = (tz) => (tz && typeof tz === 'string' && okZone(tz) ? tz : DEFAULT_TZ);

/** the parts of a moment in a zone: { iso: '2026-11-25', time: '6:58 PM', weekday, long: 'Wednesday, November 25, 2026' }. Pure. */
export function partsIn(now, tz) {
  const f = (o) => new Intl.DateTimeFormat('en-US', { timeZone: tz, ...o }).format(now);
  const [m, d, y] = f({ year: 'numeric', month: '2-digit', day: '2-digit' }).split('/');
  return { iso: y + '-' + m + '-' + d, time: f({ hour: 'numeric', minute: '2-digit' }), weekday: f({ weekday: 'long' }), long: f({ weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) };
}

/** which clock ask this is: 'time', 'date', 'day', or null. Pure. */
export function clockOf(ask) {
  const t = clean(ask);
  if (/^(?:what(?:'s|s| is)? (?:the )?(?:current |local )?time(?: now| right now)?|what time is it(?: now| right now)?|(?:the )?(?:current|local) time(?: now)?|(?:the )?time (?:now|right now)|what time it is)$/.test(t) && !/^what(?:'s|s| is)? time$/.test(t)) return 'time';
  if (/^(?:what(?:'s|s| is)? (?:the |today'?s )?(?:date|day and date|date today)(?: today)?|what(?:'s|s| is)? today'?s date|today'?s date|(?:the )?date today|current date|what date is it(?: today)?|what is today)$/.test(t)) return 'date';
  if (/^(?:what day(?: of the week)? is (?:it|today)(?: today)?|which day is (?:it|today)|what(?:'s|s| is) the day(?: today)?|day of the week|what weekday is it)$/.test(t)) return 'day';
  return null;
}

/** the clock answer's words. Pure. */
export function clockAnswer(kind, now, tz, known) {
  const p = partsIn(now, tz), where = known ? ' (' + tz + ', the zone your request came from)' : ' (' + tz + ': your zone was not known)';
  if (kind === 'time') return 'It is ' + p.time + ' on ' + p.long + where + '.';
  if (kind === 'day') return 'Today is ' + p.weekday + ', ' + p.long.replace(/^\w+, /, '') + where + '.';
  return 'Today is ' + p.long + where + '.';
}

// named days: fixed dates, plus the ones counted from the calendar (US Thanksgiving is the fourth Thursday of November)
const FIXED = { christmas: ['Christmas', 12, 25], 'christmas day': ['Christmas', 12, 25], xmas: ['Christmas', 12, 25], 'christmas eve': ['Christmas Eve', 12, 24], halloween: ['Halloween', 10, 31],
  'valentines day': ['Valentine’s Day', 2, 14], valentines: ['Valentine’s Day', 2, 14], 'new year': ['New Year’s Day', 1, 1], 'new years': ['New Year’s Day', 1, 1], 'new years day': ['New Year’s Day', 1, 1],
  'new years eve': ['New Year’s Eve', 12, 31], '4th of july': ['July 4', 7, 4], 'fourth of july': ['July 4', 7, 4], 'july 4th': ['July 4', 7, 4], 'independence day': ['July 4', 7, 4],
  'st patricks day': ['St. Patrick’s Day', 3, 17], 'saint patricks day': ['St. Patrick’s Day', 3, 17], 'groundhog day': ['Groundhog Day', 2, 2], 'earth day': ['Earth Day', 4, 22], 'veterans day': ['Veterans Day', 11, 11] };
const p2 = (n) => String(n).padStart(2, '0');
const nthWeekday = (y, month, weekday, n) => { const first = weekdayOf(y + '-' + p2(month) + '-01'); return y + '-' + p2(month) + '-' + p2(1 + ((weekday - first + 7) % 7) + 7 * (n - 1)); };
const COUNTED = { thanksgiving: ['Thanksgiving (US)', (y) => nthWeekday(y, 11, 4, 4)], 'mothers day': ['Mother’s Day (US)', (y) => nthWeekday(y, 5, 0, 2)], 'fathers day': ['Father’s Day (US)', (y) => nthWeekday(y, 6, 0, 3)] };

/** the next date (today included) a named day falls on, from today's ISO date: { label, iso } or null. Pure. */
export function namedDay(name, today) {
  const w = String(name || '').toLowerCase().replace(/['’]/g, '').replace(/^the /, '').trim();
  const y = +today.slice(0, 4);
  const at = FIXED[w] ? (yy) => yy + '-' + p2(FIXED[w][1]) + '-' + p2(FIXED[w][2]) : COUNTED[w] ? COUNTED[w][1] : null;
  if (!at) return null;
  const label = (FIXED[w] || COUNTED[w])[0];
  for (const yy of [y, y + 1]) { const iso = at(yy); if (daysBetween(today, iso) >= 0) return { label, iso }; }
  return null;
}

/** "how many days until christmas" → { label, iso, days } from today's ISO date, or null. Pure. */
export function untilOf(ask, today) {
  const t = clean(ask);
  const m = t.match(/^(?:how (?:many|long) (?:more )?(?:days )?(?:is it |are there |left )?|number of days |days left )?(?:days |sleeps )?(?:left )?(?:until|till|til|to|before) (.{2,40})$/);
  if (!m || !/^(?:how |number |days |sleeps )/.test(t)) return null;
  const what = m[1].replace(/^(?:it(?:'s| is) )/, '').trim();
  const named = namedDay(what, today);
  if (named) return { ...named, days: daysBetween(today, named.iso) };
  const [y, mo, d] = today.split('-').map(Number);
  const hit = findDay(what, new Date(y, mo - 1, d, 12), 'future');
  if (!hit || hit.rest.replace(/^(?:the |on )/, '').trim()) return null; // only a date and nothing else ("days until my trip on may 3" is the countdown card's)
  return { label: labelOf(hit.iso), iso: hit.iso, days: daysBetween(today, hit.iso) };
}

/** the whole reply for an everyday ask, or null when it is not one. now/tz/rand are injectable for tests. */
export function everydayAnswer(ask, { now = new Date(), tz, rand } = {}) {
  const zone = zoneOf(tz), known = zone === tz, at = now.toISOString();
  const out = (answer, skill) => ({ answer, sources: [], at, route: 'skill', skill, source: 'skill:' + skill, ...(skill === 'clock' || skill === 'countdown' ? { tz: zone } : {}) });
  const kind = clockOf(ask);
  if (kind) return out(clockAnswer(kind, now, zone, known), 'clock');
  const t = clean(ask);
  const coin = coinOf(t);
  if (coin) {
    const faces = Array.from({ length: coin.n }, () => (flip(coin.p, rand) ? 'Heads' : 'Tails'));
    const heads = faces.filter((f) => f === 'Heads').length;
    const weighted = coin.p !== 0.5 ? ' (weighted ' + Math.round(coin.p * 100) + '% heads)' : '';
    return out(coin.n === 1 ? faces[0] + '.' + weighted + (coin.for ? ' For ' + coin.for + '.' : '') : faces.join(', ') + ': ' + heads + ' heads, ' + (coin.n - heads) + ' tails.' + weighted, 'coin');
  }
  if (/^(?:roll|throw)(?: me)? (?:a |an |one |the |\d{1,2} )?(?:\d{0,2} ?d ?\d{1,3}|dice|die|six[- ]sided die)$|^\d{0,2}d\d{1,3}$/.test(t) || /^(?:pick |choose |give me |generate )?(?:a )?random (?:number|num)(?: (?:between|from) -?\d+ (?:and|to) -?\d+)?$|^(?:pick|choose) a number (?:between|from) -?\d+ (?:and|to) -?\d+$/.test(t)) {
    const { min, max, n, sides } = parseAsk(t);
    if (max - min > 1e12) return null;
    const draw = rand ? (a, b) => a + Math.floor(rand() * (b - a + 1)) : roll;
    const got = Array.from({ length: n }, () => draw(min, max));
    if (!sides) return out(got[0] + ' (a random whole number from ' + min + ' to ' + max + ').', 'random');
    return out((n === 1 ? 'You rolled ' + got[0] : 'You rolled ' + got.join(', ') + ', total ' + got.reduce((a, b) => a + b, 0)) + ' (' + n + 'd' + sides + ').', 'random');
  }
  const today = partsIn(now, zone).iso;
  const u = untilOf(ask, today);
  if (u) {
    const when = u.label + ' is ' + labelOf(u.iso);
    const lead = u.days === 0 ? 'Today is ' + u.label + ' (' + labelOf(u.iso) + ').' : u.days === 1 ? 'Tomorrow: ' + when + ', 1 day away.' : u.days + ' days until ' + u.label + (u.label === labelOf(u.iso) ? '' : ' (' + labelOf(u.iso) + ')') + '.';
    return out(lead + ' Counted from today, ' + labelOf(today) + ', in ' + zone + '.', 'countdown');
  }
  return null;
}

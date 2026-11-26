// world-answer: everyday asks about a named place or word that /api/answer used to send to the model, which has no live data
// ("weather in Lakeland FL" and "sunset in Lakeland FL" came back "nothing on the web"; "define serendipity" the same).
// Answered here, before the cache and the model, from the keyless sources Verse's own cards already use:
//   - weather now and today's high and low, sunrise and sunset: Open-Meteo's geocoder and forecast (lib/weather.js reads them)
//   - the time in a place: the geocoder's own time zone for it
//   - what a word means: Wiktionary's definitions (the define skill's wordOf picks the word)
// A "City ST" or "City, Country" place is found the way the local page finds it (lib/local-media.js placeTries/pickPlace),
// so a hint never lands on a wrong town. A source that does not answer is said plainly; nothing is invented. Never cached.
import { viewOf, words, both, forecastUrl, locOf } from './weather.js';
import { placeTries, pickPlace } from './local-media.js';
import { wordOf } from '../skills/define.js';

const UA = { headers: { accept: 'application/json', 'user-agent': 'Verse (https://a-to-mind.com)' } };
const clean = (ask) => String(ask || '').trim().replace(/\s+/g, ' ').replace(/[?!.]+$/, '')
  .replace(/^(?:hey |hi |ok |okay |please |verse,? )+/i, '').replace(/^(?:can|could) you (?:please )?/i, '').replace(/^(?:tell me|show me|give me) /i, '').replace(/,? please$/i, '').trim();
const WHEN = /\s+(?:today|tonight|now|right now|currently|at the moment)$/i;
const placeText = (s) => String(s || '').replace(WHEN, '').replace(/^the /i, '').trim();
const okPlace = (p) => p.length >= 2 && p.length <= 60 && !/\d{3,}|[<>{}=]/.test(p) && !/^(?:here|me|my area|my location|my city|the world|space|mars)$/i.test(p);

/** what kind of world ask this is: { kind: 'weather'|'sunrise'|'sunset'|'time', place } or { kind: 'define', word } or null. Pure. */
export function worldOf(ask) {
  const t = clean(ask);
  let m;
  if ((m = t.match(/^(?:what(?:'s|s| is)(?: the)? |how(?:'s|s| is)(?: the)? )?(?:weather|forecast|temperature|temp)(?: like)?(?: (?:today|now|right now))? (?:in|at|for) (.+)$/i)) && okPlace(placeText(m[1]))) return { kind: 'weather', place: placeText(m[1]) };
  if ((m = t.match(/^(?:what(?:'s|s| is) )?(?:the )?(?:weather|temperature) (?:like )?(?:in|at|for) (.+)$/i)) && okPlace(placeText(m[1]))) return { kind: 'weather', place: placeText(m[1]) };
  if ((m = t.match(/^(?:when(?:'s|s| is)|what time is) (?:the )?(sunrise|sunset)(?: today| tomorrow)? (?:in|at|for) (.+)$|^(sunrise|sunset)(?: time)?(?: today)? (?:in|at|for) (.+)$/i))) { const k = (m[1] || m[3]).toLowerCase(), p = placeText(m[2] || m[4]); if (okPlace(p)) return { kind: k, place: p }; }
  if ((m = t.match(/^when does the sun (rise|set)(?: today)? (?:in|at) (.+)$/i)) && okPlace(placeText(m[2]))) return { kind: 'sun' + m[1].toLowerCase(), place: placeText(m[2]) };
  if ((m = t.match(/^(?:what(?:'s|s| is) (?:the )?(?:current |local )?time (?:is it )?|what time is it |(?:the )?(?:current |local )?time )(?:right now |now )?in (.+)$/i)) && okPlace(placeText(m[1]))) return { kind: 'time', place: placeText(m[1]) };
  const w = wordOf(t);
  if (w) return { kind: 'define', word: w };
  return null;
}

/** the place a typed name is: the first geocoder hit its hint allows, as { name, lat, lon, us, tz }, or null; throws when the geocoder is down. */
export async function findPlace(name, f = fetch) {
  for (const { q, hint } of placeTries(name)) {
    const r = await f('https://geocoding-api.open-meteo.com/v1/search?count=10&language=en&format=json&name=' + encodeURIComponent(q), UA);
    if (!r.ok) throw new Error('geocoder ' + r.status);
    const j = await r.json();
    const g = pickPlace(j && j.results, hint);
    const loc = g && locOf(g);
    if (loc) return { ...loc, tz: g.timezone || '' };
  }
  return null;
}

const strip = (html) => String(html || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const FORECAST_SRC = (loc) => ({ title: 'Open-Meteo forecast', url: 'https://open-meteo.com/en/docs#latitude=' + loc.lat + '&longitude=' + loc.lon });
const page = (loc) => '/weather/?q=' + encodeURIComponent(loc.name);

/** the Wiktionary senses of a word as answer lines, or [] when it has none; throws when Wiktionary is down. */
export async function senses(word, f = fetch) {
  const r = await f('https://en.wiktionary.org/api/rest_v1/page/definition/' + encodeURIComponent(word.replace(/ /g, '_')) + '?redirect=true', UA);
  if (r.status === 404) return [];
  if (!r.ok) throw new Error('wiktionary ' + r.status);
  const j = await r.json();
  return ((j && j.en) || []).map((s) => ({ pos: s.partOfSpeech, defs: (s.definitions || []).map((d) => strip(d.definition).replace(/[.;:]+$/, '')).filter(Boolean).slice(0, 2) })).filter((s) => s.defs.length).slice(0, 3);
}

/** the whole reply for a world ask, or null when it is not one. fetch and now are injectable for tests. */
export async function worldAnswer(ask, { fetch: f = fetch, now = new Date() } = {}) {
  const w = worldOf(ask);
  if (!w) return null;
  const at = now.toISOString();
  const out = (answer, skill, sources = [], extra = {}) => ({ answer, sources, at, route: 'skill', skill, source: 'skill:' + skill, ...extra });
  if (w.kind === 'define') {
    const url = 'https://en.wiktionary.org/wiki/' + encodeURIComponent(w.word.replace(/ /g, '_'));
    let list;
    try { list = await senses(w.word, f); } catch (_) { return { ...out(null, 'define'), note: "the dictionary didn't answer just now" }; }
    if (!list.length) return null; // not an English entry: the answer engine's own lookup takes it
    return out(w.word + ': ' + list.map((s) => '(' + String(s.pos || '').toLowerCase() + ') ' + s.defs.join('; ') + '.').join(' '), 'define', [{ title: 'Wiktionary: ' + w.word, url }]);
  }
  const skill = w.kind === 'time' ? 'worldtime' : 'weather';
  let loc;
  try { loc = await findPlace(w.place, f); } catch (_) { return { ...out(null, skill), note: "the place finder didn't answer just now" }; }
  if (!loc) return { ...out('I could not find a place called ' + w.place + '. Try the town with its state or country, like "Lakeland, FL".', skill), noAnswer: true };
  if (w.kind === 'time') {
    if (!loc.tz) return null;
    const time = new Intl.DateTimeFormat('en-US', { timeZone: loc.tz, hour: 'numeric', minute: '2-digit', weekday: 'long', month: 'long', day: 'numeric' }).format(now);
    return out('In ' + loc.name + ' it is ' + time + ' (' + loc.tz + ').', skill, [], { tz: loc.tz });
  }
  let view;
  try {
    const r = await f(forecastUrl(loc.lat, loc.lon), UA);
    if (!r.ok) throw new Error('forecast ' + r.status);
    view = viewOf(await r.json(), loc);
  } catch (_) { return { ...out(null, skill), note: "the forecast didn't answer just now" }; }
  const src = [FORECAST_SRC(loc)], extra = { place: loc.name, page: page(loc) };
  if (w.kind === 'sunrise' || w.kind === 'sunset') {
    const which = w.kind === 'sunrise' ? view.sunrise : view.sunset;
    if (!which) return { ...out(null, skill), note: 'the forecast had no ' + w.kind + ' time' };
    return out('In ' + loc.name + ', ' + w.kind + ' today is at ' + which + ' local time' + (w.kind === 'sunrise' ? ' (sunset ' + view.sunset + ').' : ' (sunrise was ' + view.sunrise + ').'), skill, src, extra);
  }
  const n = view.now, d = view.days[0] || {};
  if (!Number.isFinite(n.temp)) return { ...out(null, skill), note: 'the forecast had no current reading' };
  const parts = [words(n.code) + ', ' + both(n.temp), 'feels like ' + both(n.feels)];
  if (Number.isFinite(n.humidity)) parts.push('humidity ' + Math.round(n.humidity) + '%');
  if (Number.isFinite(n.windKmh)) parts.push('wind ' + n.windMph + ' mph');
  const today = Number.isFinite(d.hi) ? ' Today: high ' + both(d.hi) + ', low ' + both(d.lo) + (Number.isFinite(d.rain) ? ', ' + d.rain + '% chance of rain' : '') + '.' : '';
  return out(loc.name + ' now: ' + parts.join(', ') + '.' + today + (view.sunset ? ' Sunset ' + view.sunset + '.' : ''), skill, src, extra);
}

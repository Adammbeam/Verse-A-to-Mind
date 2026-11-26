// /api/answer answers weather, sunrise and sunset, the time in a named place and what a word means from live keyless sources
// (Open-Meteo, Wiktionary) before the cache and the model (lib/world-answer.js); a source that is down is said, never invented
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { worldOf, worldAnswer, findPlace } from '../void-live-deploy/lib/world-answer.js';
import { onRequestPost } from '../void-live-deploy/functions/api/answer.js';

const NOW = new Date('2026-11-26T00:15:00Z');
const LAKELAND = [{ name: 'Lakeland', latitude: 34.06, longitude: -83.07, country_code: 'US', country: 'United States', admin1: 'Georgia', timezone: 'America/New_York' },
  { name: 'Lakeland', latitude: 28.03947, longitude: -81.9498, country_code: 'US', country: 'United States', admin1: 'Florida', timezone: 'America/New_York' }];
const FORECAST = { current: { time: '2026-11-25T19:15', temperature_2m: 18.6, apparent_temperature: 19.2, relative_humidity_2m: 94, weather_code: 3, wind_speed_10m: 14.5, is_day: 0 },
  hourly: { time: ['2026-11-25T19:00', '2026-11-25T20:00'], temperature_2m: [18.6, 18.2], precipitation_probability: [80, 90], precipitation: [0.2, 0.4], weather_code: [3, 61] },
  daily: { time: ['2026-11-25'], temperature_2m_max: [20.1], temperature_2m_min: [17.2], precipitation_probability_max: [99], precipitation_sum: [6], weather_code: [61], sunrise: ['2026-11-25T06:57'], sunset: ['2026-11-25T17:32'] } };
const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
const world = (calls = []) => async (u) => { const s = String(u); calls.push(s);
  if (s.startsWith('https://geocoding-api.open-meteo.com/')) return json({ results: /name=Lakeland(&|$)/.test(s) ? LAKELAND : /name=Tokyo/.test(s) ? [{ name: 'Tokyo', latitude: 35.69, longitude: 139.69, country_code: 'JP', country: 'Japan', admin1: 'Tokyo', timezone: 'Asia/Tokyo' }] : undefined });
  if (s.startsWith('https://api.open-meteo.com/')) return json(FORECAST);
  if (s.startsWith('https://en.wiktionary.org/')) return /serendipity/.test(s) ? json({ en: [{ partOfSpeech: 'Noun', definitions: [{ definition: 'A <a href="#">fortunate</a> discovery by accident.' }] }] }) : json({}, 404);
  return json({}, 404); };

test('the asks it takes, and the ones it leaves to the rest of the engine', () => {
  assert.deepEqual(worldOf('weather in Lakeland FL'), { kind: 'weather', place: 'Lakeland FL' });
  assert.deepEqual(worldOf("What's the weather like in Paris, France today?"), { kind: 'weather', place: 'Paris, France' });
  assert.deepEqual(worldOf('sunset in Lakeland FL'), { kind: 'sunset', place: 'Lakeland FL' });
  assert.deepEqual(worldOf('when does the sun rise in Tokyo'), { kind: 'sunrise', place: 'Tokyo' });
  assert.deepEqual(worldOf('what time is it in Tokyo'), { kind: 'time', place: 'Tokyo' });
  assert.deepEqual(worldOf('define serendipity'), { kind: 'define', word: 'serendipity' });
  for (const a of ['weather', 'what is the weather like', 'weather here', 'what time is it', 'who is the president', 'what does http 429 mean', 'meaning of life', 'weather in <script>']) assert.equal(worldOf(a), null, a);
});

test('a "City ST" place is the town in that state, never the first town of that name', async () => {
  const loc = await findPlace('Lakeland FL', world());
  assert.equal(loc.name, 'Lakeland, Florida, United States'); assert.equal(loc.lat, 28.03947); assert.equal(loc.tz, 'America/New_York');
});

test('weather, sunset and the time in a place are read from the forecast and the geocoder, with the source', async () => {
  const w = await worldAnswer('weather in Lakeland FL', { fetch: world(), now: NOW });
  assert.equal(w.answer, 'Lakeland, Florida, United States now: Overcast, 65 °F / 19 °C, feels like 67 °F / 19 °C, humidity 94%, wind 9 mph. Today: high 68 °F / 20 °C, low 63 °F / 17 °C, 99% chance of rain. Sunset 5:32 pm.');
  assert.equal(w.skill, 'weather'); assert.equal(w.page, '/weather/?q=Lakeland%2C%20Florida%2C%20United%20States'); assert.match(w.sources[0].url, /^https:\/\/open-meteo\.com\//);
  assert.equal((await worldAnswer('sunset in Lakeland FL', { fetch: world(), now: NOW })).answer, 'In Lakeland, Florida, United States, sunset today is at 5:32 pm local time (sunrise was 6:57 am).');
  const t = await worldAnswer('what time is it in Tokyo', { fetch: world(), now: NOW });
  assert.equal(t.answer, 'In Tokyo, Japan it is Thursday, November 26 at 9:15 AM (Asia/Tokyo).'); assert.equal(t.tz, 'Asia/Tokyo');
});

test('a word is defined from Wiktionary; an unknown place is said; a dead source is said, not invented', async () => {
  const d = await worldAnswer('define serendipity', { fetch: world(), now: NOW });
  assert.equal(d.answer, 'serendipity: (noun) A fortunate discovery by accident.'); assert.equal(d.sources[0].url, 'https://en.wiktionary.org/wiki/serendipity');
  assert.equal(await worldAnswer('define zzqxv', { fetch: world(), now: NOW }), null); // no entry: the engine's own lookup takes it
  const none = await worldAnswer('weather in Qwxzzzy', { fetch: world(), now: NOW });
  assert.equal(none.noAnswer, true); assert.match(none.answer, /could not find a place called Qwxzzzy/);
  const down = async () => { throw new Error('down'); };
  for (const a of ['weather in Lakeland FL', 'define serendipity']) { const r = await worldAnswer(a, { fetch: down, now: NOW }); assert.equal(r.answer, null, a); assert.match(r.note, /didn't answer/, a); }
});

test('/api/answer takes them end to end before the cache and the model', async () => {
  const realFetch = globalThis.fetch, calls = [];
  globalThis.fetch = world(calls);
  try {
    const post = async (ask) => (await onRequestPost({ request: new Request('https://a-to-mind.com/api/answer', { method: 'POST', body: JSON.stringify({ ask }) }), env: {}, waitUntil: () => {} })).json();
    const w = await post('weather in Lakeland FL');
    assert.equal(w.skill, 'weather'); assert.match(w.answer, /^Lakeland, Florida, United States now: Overcast/);
    const d = await post('what does serendipity mean');
    assert.equal(d.skill, 'define'); assert.match(d.answer, /fortunate discovery/);
    assert.ok(calls.some((u) => u.startsWith('https://api.open-meteo.com/v1/forecast?latitude=28.03947')));
  } finally { globalThis.fetch = realFetch; }
});

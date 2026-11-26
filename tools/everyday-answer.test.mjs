// /api/answer answers the time, the date, a coin, dice, a random number and days until a day from the server's own clock and
// crypto random, in the zone the request came from (lib/everyday-answer.js), before the cache and the model
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { everydayAnswer, clockOf, untilOf, namedDay, zoneOf, DEFAULT_TZ } from '../void-live-deploy/lib/everyday-answer.js';
import { onRequestPost } from '../void-live-deploy/functions/api/answer.js';

const NOW = new Date('2026-11-25T23:58:00Z'); // 6:58 PM in New York, 5:58 PM in Chicago, 8:58 AM the next day in Tokyo

test('the time, the date and the weekday are told in the request zone, and the zone is named', () => {
  assert.equal(everydayAnswer('what time is it', { now: NOW, tz: 'America/Chicago' }).answer, 'It is 5:58 PM on Wednesday, November 25, 2026 (America/Chicago, the zone your request came from).');
  assert.equal(everydayAnswer("What's today's date?", { now: NOW, tz: 'Asia/Tokyo' }).answer, 'Today is Thursday, November 26, 2026 (Asia/Tokyo, the zone your request came from).');
  assert.match(everydayAnswer('what day is it', { now: NOW, tz: 'America/New_York' }).answer, /^Today is Wednesday, November 25, 2026/);
  const unknown = everydayAnswer('whats the time', { now: NOW, tz: 'Not/AZone' });
  assert.equal(unknown.answer, 'It is 6:58 PM on Wednesday, November 25, 2026 (America/New_York: your zone was not known).');
  assert.equal(unknown.skill, 'clock'); assert.equal(unknown.tz, DEFAULT_TZ); assert.equal(zoneOf(undefined), DEFAULT_TZ);
});

test('asks about time itself, the president or a clock card are not clock asks', () => {
  for (const a of ['what is time', 'time', 'time zones', 'who invented the clock', 'make a clock', 'what time is it in tokyo', 'what is a day', 'date ideas']) assert.equal(clockOf(a), null, a);
  for (const a of ['what time is it', 'What is the current time?', 'time now', 'what is today', 'current date', 'what day of the week is it']) assert.ok(clockOf(a), a);
});

test('a coin is flipped and dice and numbers are drawn from the random source, within their ranges', () => {
  assert.equal(everydayAnswer('flip a coin', { now: NOW, rand: () => 0.1 }).answer, 'Heads.');
  assert.equal(everydayAnswer('heads or tails', { now: NOW, rand: () => 0.9 }).answer, 'Tails.');
  assert.equal(everydayAnswer('flip 3 coins', { now: NOW, rand: () => 0.2 }).answer, 'Heads, Heads, Heads: 3 heads, 0 tails.');
  assert.equal(everydayAnswer('roll a die', { now: NOW, rand: () => 0.999 }).answer, 'You rolled 6 (1d6).');
  assert.equal(everydayAnswer('roll 2d6', { now: NOW, rand: () => 0 }).answer, 'You rolled 1, 1, total 2 (2d6).');
  assert.equal(everydayAnswer('random number between 1 and 10', { now: NOW, rand: () => 0.5 }).answer, '6 (a random whole number from 1 to 10).');
  for (let i = 0; i < 200; i++) { const n = parseInt(everydayAnswer('roll a d20', { now: NOW }).answer.replace('You rolled ', ''), 10); assert.ok(n >= 1 && n <= 20, String(n)); }
  for (const a of ['what is a coin', 'roll the credits', 'random facts', 'who invented dice']) assert.equal(everydayAnswer(a, { now: NOW }), null, a);
});

test('days until a holiday or a date count from today in the request zone, today and next year included', () => {
  assert.deepEqual(untilOf('how many days until christmas', '2026-11-25'), { label: 'Christmas', iso: '2026-12-25', days: 30 });
  assert.equal(untilOf('days until thanksgiving', '2026-11-25').iso, '2026-11-26'); // the fourth Thursday of November 2026
  assert.equal(namedDay('thanksgiving', '2027-01-01').iso, '2027-11-25');
  assert.equal(untilOf('how long until halloween', '2026-11-25').iso, '2027-10-31');
  assert.equal(untilOf('days until christmas', '2026-12-25').days, 0);
  assert.deepEqual(untilOf('how many days until march 3', '2026-11-25'), { label: 'Mar 3, 2027', iso: '2027-03-03', days: 98 });
  assert.equal(untilOf('how many days until my trip', '2026-11-25'), null);
  assert.equal(untilOf('until christmas', '2026-11-25'), null);
  const r = everydayAnswer('how many days until christmas', { now: NOW, tz: 'America/New_York' });
  assert.equal(r.answer, '30 days until Christmas (Dec 25, 2026). Counted from today, Nov 25, 2026, in America/New_York.');
  assert.equal(r.skill, 'countdown');
  assert.match(everydayAnswer('days until christmas', { now: new Date('2026-12-25T15:00:00Z'), tz: 'America/New_York' }).answer, /^Today is Christmas/);
});

test('/api/answer answers them end to end with the request zone, before any cache, model or database', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('no network for an everyday ask'); };
  try {
    const post = async (ask, tz) => { const request = new Request('https://a-to-mind.com/api/answer', { method: 'POST', body: JSON.stringify({ ask }) }); if (tz) Object.defineProperty(request, 'cf', { value: { timezone: tz } }); return (await onRequestPost({ request, env: {}, waitUntil: () => {} })).json(); };
    const t = await post('what time is it', 'Asia/Tokyo');
    assert.equal(t.skill, 'clock'); assert.equal(t.tz, 'Asia/Tokyo'); assert.match(t.answer, /^It is \d{1,2}:\d\d [AP]M on \w+day, \w+ \d{1,2}, \d{4} \(Asia\/Tokyo, the zone your request came from\)\.$/);
    const c = await post('flip a coin');
    assert.equal(c.skill, 'coin'); assert.match(c.answer, /^(?:Heads|Tails)\.$/);
    const d = await post('how many days until christmas', 'America/New_York');
    assert.equal(d.skill, 'countdown'); assert.match(d.answer, /days? until Christmas|^Today is Christmas|^Tomorrow: Christmas/);
  } finally { globalThis.fetch = realFetch; }
});

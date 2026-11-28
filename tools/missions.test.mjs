// /missions/: four steps, ticks, a badge and a streak, kept only in this browser (lib/missions.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BADGES, KEY, MISSIONS, empty, leaveOf, openTrack, parseProgress, pathOf, returnedId, signalsOf, streakOf, utcDay, viewOf, writeProgress } from '../void-live-deploy/lib/missions.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'void-live-deploy');
const NOW = Date.parse('2026-11-27T15:00:00Z');
const day = utcDay(NOW);

function mem(map = {}) {
  const box = new Map(Object.entries(map));
  return { getItem: (k) => (box.has(k) ? box.get(k) : null), setItem: (k, v) => box.set(k, String(v)), dump: () => box };
}

test('a broken store is an empty track, and a stored sentence is dropped', () => {
  assert.deepEqual(parseProgress('nope'), empty());
  assert.deepEqual(parseProgress('{"done":{"ask":"yesterday","nope":"2026-11-27"},"tools":{"sum":100,"play":2},"seen":"x"}'), { seen: '', done: {}, tools: { play: 2 }, touched: {}, days: [] });
  const sentence = 'meet under the oak tree on oak street';
  const storage = mem({ 'a2m.void.loop.v1': JSON.stringify([{ ask: sentence }]) });
  const opened = openTrack(empty(), { signals: signalsOf(storage), returned: '' }, NOW);
  const saved = JSON.stringify(opened.progress);
  assert.equal(saved.includes(sentence), false);
  assert.equal(saved.includes('oak'), false);
  assert.equal(opened.progress.done.ask, day);
});

test('a calculator sum ticks that step and the sum itself is not kept', () => {
  const storage = mem({ 'a2m.void.calculator.v1': JSON.stringify({ hist: [{ e: '17% of 240', r: '40.8' }] }) });
  const opened = openTrack(empty(), { signals: signalsOf(storage), returned: '' }, NOW);
  assert.equal(opened.progress.done.sum, day);
  assert.equal(JSON.stringify(opened.progress).includes('240'), false);
  assert.equal(opened.first, false);
});

test('a first visit with nothing kept starts clean, and a later visit says welcome back', () => {
  const first = openTrack(empty(), { signals: { ask: false, play: false, sum: false, headers: false }, returned: '' }, NOW);
  assert.equal(first.first, true);
  assert.equal(viewOf(first, NOW).greet, 'Start with one step. Each one uses a tool Verse already has.');
  const back = openTrack(first.progress, { signals: { ask: false, play: false, sum: false, headers: false }, returned: '' }, NOW + 864e5);
  const view = viewOf(back, NOW + 864e5);
  assert.equal(back.first, false);
  assert.equal(view.greet, 'Welcome back. Pick up where you left off.');
  assert.equal(view.badge, '');
  assert.equal(view.streak, 0);
});

test('finishing steps earns the badge, the streak and the tool used most', () => {
  let progress = empty();
  const ids = ['ask', 'play', 'sum', 'headers'];
  for (let i = 0; i < ids.length; i++) {
    const at = NOW + i * 864e5;
    progress = openTrack(progress, { signals: {}, returned: ids[i] }, at).progress;
  }
  progress = openTrack(progress, { signals: {}, returned: 'sum' }, NOW + 4 * 864e5).progress;
  const view = viewOf({ progress, first: false }, NOW + 4 * 864e5);
  assert.equal(view.badge, 'Track clear');
  assert.equal(BADGES[4], 'Track clear');
  assert.equal(view.streak, 4);
  assert.equal(view.steps.filter((s) => s.done).length, 4);
  assert.equal(view.most, 'You come back to the calculator most.');
  assert.equal(streakOf(['2026-11-26'], '2026-11-27'), 1);
  assert.equal(streakOf(['2026-11-20'], '2026-11-27'), 0);
});

test('coming back from a tool ticks that step, and a stale back does not', () => {
  assert.equal(pathOf('https://a-to-mind.com/under-the-hood/#headers'), '/under-the-hood/');
  assert.equal(returnedId('https://a-to-mind.com/calculator/?q=1', 'navigate', null, NOW), 'sum');
  assert.equal(returnedId('https://a-to-mind.com/games/snake/', 'navigate', null, NOW), 'play');
  assert.equal(returnedId('https://a-to-mind.com/', 'back_forward', leaveOf('{"id":"ask","at":' + (NOW - 2000) + '}'), NOW), 'ask');
  assert.equal(returnedId('', 'back_forward', { id: 'sum', at: NOW - 100 }, NOW), '');
  assert.equal(returnedId('', 'navigate', { id: 'sum', at: NOW - 2000 }, NOW), '');
  assert.equal(leaveOf('{"id":"nope","at":1}'), null);
});

test('the page links only to tools that exist, and the home stage is not the page', () => {
  const html = readFileSync(join(site, 'missions/index.html'), 'utf8');
  assert.match(html, /id="verse-nav"/);
  assert.match(html, /verse-shell\.js/);
  assert.match(html, /rel="canonical" href="https:\/\/a-to-mind\.com\/missions\/"/);
  assert.doesNotMatch(html, /id="stage"/);
  assert.equal(KEY, 'a2m.void.missions.v1');
  for (const m of MISSIONS) {
    assert.ok(html.includes(m.href), m.href);
    const path = m.href.split('?')[0].split('#')[0];
    if (path === '/') continue;
    assert.ok(existsSync(join(site, path.replace(/^\//, ''), 'index.html')), path);
  }
  const storage = mem();
  const opened = openTrack(empty(), { signals: signalsOf(storage), returned: 'headers' }, NOW);
  assert.equal(writeProgress(storage, opened.progress), true);
  assert.equal(storage.dump().get(KEY).includes('headers'), true);
  assert.equal(storage.dump().get(KEY).includes('http'), false);
});

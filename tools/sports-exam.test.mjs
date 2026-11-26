import test from 'node:test';
import assert from 'node:assert/strict';
import { teamScoreAsk, leagueForTeam } from '../void-live-deploy/lib/scores.js';
import { judge } from '../void-live-deploy/lib/exam.js';
import scores from '../void-live-deploy/skills/scores.js';
import sportsBrowse from '../void-live-deploy/skills/sports-browse.js';
import sport from '../void-live-deploy/skills/sport.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const strip = (html) => String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const side = (name, abbr, score, winner) => ({ id: '1', name, short: name.split(' ').pop(), abbr, score, winner });

async function runSkill(sk, text, fetchImpl) {
  const el = { innerHTML: '' };
  const keep = globalThis.fetch;
  if (fetchImpl) globalThis.fetch = fetchImpl;
  try {
    const note = await sk.run(text, { showPage: (f) => { f(el); return el; }, esc, _pageStill: () => true });
    return { note: 'skill:' + note, html: el.innerHTML, text: strip(el.innerHTML) };
  } finally {
    globalThis.fetch = keep;
  }
}

test('Spanish/French/German team score asks parse cleanly', () => {
  assert.deepEqual(teamScoreAsk('resultado del real madrid'), { team: 'real madrid', day: '' });
  assert.deepEqual(teamScoreAsk('cómo quedó el barcelona ayer'), { team: 'barcelona', day: 'yesterday' });
  assert.deepEqual(teamScoreAsk('score du psg'), { team: 'psg', day: '' });
  assert.deepEqual(teamScoreAsk('ergebnis von bayern'), { team: 'bayern', day: '' });
  assert.equal(leagueForTeam('yankees'), 'mlb');
  assert.equal(leagueForTeam('chiefs'), 'nfl');
  assert.equal(leagueForTeam('packers'), 'nfl');
  assert.equal(leagueForTeam('real madrid'), 'laliga');
});

test('off-season / off-day team asks (yankees, chiefs, packers, real madrid) pass sports exam board check', async () => {
  const chiefsLast = { kind: 'game', state: 'final', status: 'Final', start: '2026-11-22T18:00Z', home: side('Kansas City Chiefs', 'KC', '24', true), away: side('Las Vegas Raiders', 'LV', '17', false) };
  const packersNext = { kind: 'game', state: 'pre', status: 'Sun 1:00 PM', start: '2026-11-29T18:00Z', home: side('Green Bay Packers', 'GB', '', false), away: side('Chicago Bears', 'CHI', '', false) };
  const madridLast = { kind: 'game', state: 'final', status: 'FT', start: '2026-11-22T20:00Z', home: side('Real Madrid', 'RMA', '3', true), away: side('Sevilla', 'SEV', '1', false) };

  const mockFetch = async (u) => {
    const q = new URL(String(u), 'https://a-to-mind.com').searchParams;
    const lg = q.get('league'), span = q.get('span'), view = q.get('view');
    if (view === 'standings' && lg === 'mlb') {
      return { ok: true, json: async () => ({ ok: true, source: 'ESPN', groups: [{ name: 'AL East', cols: ['W', 'L', 'PCT'], rows: [{ name: 'New York Yankees', cells: ['94', '68', '.580'] }] }] }) };
    }
    if (span === '7' && lg === 'nfl') {
      return { ok: true, json: async () => ({ ok: true, source: 'ESPN', games: [chiefsLast, packersNext] }) };
    }
    if (span === '7' && lg === 'laliga') {
      return { ok: true, json: async () => ({ ok: true, source: 'ESPN', games: [madridLast] }) };
    }
    return { ok: true, json: async () => ({ ok: true, source: 'ESPN', games: [] }) };
  };

  for (const [ask, team] of [['yankees score', 'yankees'], ['how did the chiefs do', 'chiefs'], ['packers score', 'packers'], ['resultado del real madrid', 'madrid']]) {
    assert.ok(scores.match(ask, ask), 'scores.match handles: ' + ask);
    const out = await runSkill(scores, ask, mockFetch);
    const j = judge('sports', { text: out.text, note: out.note, ms: 500, overflow: false }, { team });
    assert.deepEqual(j.failed, [], ask + ' failed: ' + JSON.stringify(j.failed) + ' | ' + out.text);
    assert.equal(j.score, 100);
  }
});

test('bare "scores" matches sports-browse and passes ambiguous + board checks', async () => {
  assert.ok(sportsBrowse.match('scores', 'scores'));
  const out = await runSkill(sportsBrowse, 'scores');
  const j = judge('sports', { text: out.text, note: out.note, ms: 100, overflow: false }, { ambiguous: true });
  assert.deepEqual(j.failed, [], 'bare scores failed: ' + JSON.stringify(j.failed) + ' | ' + out.text);
  assert.equal(j.score, 100);
});

test('"nba team celtics" includes live scores/standings link and passes board check', async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({ teams: [{ idTeam: '134860', strTeam: 'Boston Celtics', strLeague: 'NBA', strSport: 'Basketball', strStadium: 'TD Garden', strCountry: 'USA', intFormedYear: '1946' }] }),
  });
  const out = await runSkill(sport, 'nba team celtics', mockFetch);
  const j = judge('sports', { text: out.text, note: out.note, ms: 300, overflow: false }, { team: 'celtics', league: 'nba' });
  assert.deepEqual(j.failed, [], 'nba team celtics failed: ' + JSON.stringify(j.failed) + ' | ' + out.text);
  assert.equal(j.score, 100);
});

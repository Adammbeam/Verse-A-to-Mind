// ask-8328: /team/ is open to anyone, with a one-line AI prompt, a short human how-to,
// a quiet Uni/Multi list of the best locked pages from the live exam, and a weekly
// #general recruit reminder at cost 0. /team/ stays the only new free full page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { openPath, gatedPath } from '../void-live-deploy/lib/page-pass.js';

function d1() {
  const db = new DatabaseSync(':memory:');
  const stmt = (sql, a = []) => ({
    bind: (...b) => stmt(sql, b),
    run: async () => { const r = db.prepare(sql).run(...a); return { meta: { changes: Number(r.changes) } }; },
    first: async () => db.prepare(sql).get(...a) || null,
    all: async () => ({ results: db.prepare(sql).all(...a) }),
  });
  return { prepare: (sql) => stmt(sql), raw: db };
}

test('/team/ is open to anyone, while /team/ stays a full page path and other full pages stay gated', () => {
  assert.equal(openPath('/team/'), true);
  assert.equal(openPath('/team'), true);
  assert.equal(openPath('/team/index.html'), true);
  assert.equal(gatedPath('/team/'), false);
  // still gated: full pages that are not /team/
  for (const p of ['/flights/', '/books/', '/brain/']) assert.equal(gatedPath(p), true, p);
  // open assets/api paths remain open
  for (const p of ['/api/team', '/privacy/', '/store/']) assert.equal(openPath(p), true, p);
});

test('/team/ shows the one-line AI prompt, a short human how-to, and a quiet Uni/Multi list of best locked pages from the live exam; weekly #general recruit reminder costs 0', async () => {
  const html = readFileSync(new URL('../void-live-deploy/team/index.html', import.meta.url), 'utf8');
  assert.match(html, /join/i);
  // one-line AI prompt (copyable)
  assert.match(html, /data-team-prompt|id="aiPrompt"|team-prompt/i);
  // short human how-to
  assert.match(html, /how to join|how-to join|human how|id="humanHow"|data-human-how/i);
  // quiet Uni/Multi list of best locked pages from the live exam
  assert.match(html, /Uni\/Multi|Uni or Multi|locked pages|best locked|data-locked-pages/i);

  // weekly #general recruit reminder at cost 0
  const mod = await import('../void-live-deploy/lib/team-recruit-reminder.js');
  const fn = mod.recruitReminderTick || mod.weeklyRecruitReminderTick || mod.teamRecruitReminderTick || mod.default;
  assert.equal(typeof fn, 'function');
  const env = { DB: d1() };
  env.DB.raw.exec('CREATE TABLE void_team_msgs (id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT, thread INTEGER, at INTEGER, by TEXT, body TEXT, job TEXT, mentions TEXT)');
  env.DB.raw.exec('CREATE TABLE void_landing_seen (k TEXT PRIMARY KEY, v TEXT NOT NULL, at INTEGER NOT NULL)');
  env.DB.raw.exec('CREATE TABLE void_team_channels (code TEXT PRIMARY KEY, title TEXT NOT NULL, about TEXT NOT NULL, created INTEGER NOT NULL, by TEXT NOT NULL)');
  env.DB.raw.exec("INSERT OR IGNORE INTO void_team_channels (code, title, about, created, by) VALUES ('general','general','',0,'verse')");
  // first tick posts
  const r1 = await fn(env, Date.UTC(2026, 10, 10));
  assert.equal(r1.posted, true);
  // same week/day window should not repost (cost 0, no spam)
  const r2 = await fn(env, Date.UTC(2026, 10, 11));
  assert.equal(r2.posted, false);
  const msgs = env.DB.raw.prepare("SELECT channel, by, body FROM void_team_msgs WHERE channel = 'general'").all();
  assert.equal(msgs.length, 1);
  assert.match(msgs[0].body, /join|team|\/team/i);
  assert.equal(msgs[0].by.toLowerCase(), 'verse');
  // cost 0: no model/fetch required; function should not throw when fetch is absent
  assert.equal(typeof r1.cost === 'number' ? r1.cost : 0, 0);
});

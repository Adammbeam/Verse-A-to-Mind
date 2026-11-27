// Tests for lib/team-handoff-notes.js: lease-timeout handoff notes.
// Run: node --test tools/team-handoff-notes.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  MAX_HANDOFF,
  formatHandoffNote,
  attachHandoff,
  readHandoff,
  lastAgentNote,
  carryHandoffOnTimeout,
} from '../void-live-deploy/lib/team-handoff-notes.js';

function makeEnv() {
  const raw = new DatabaseSync(':memory:');
  raw.exec(
    'CREATE TABLE void_team_msgs (' +
    'id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
    'channel TEXT NOT NULL, ' +
    'thread INTEGER NOT NULL DEFAULT 0, ' +
    'at INTEGER NOT NULL, ' +
    'by TEXT NOT NULL, ' +
    'body TEXT NOT NULL, ' +
    'job TEXT)'
  );
  const stmt = (sql, params = []) => ({
    bind: (...b) => stmt(sql, b),
    run: async () => {
      const r = raw.prepare(sql).run(...params);
      return { meta: { changes: Number(r.changes) } };
    },
    first: async () => raw.prepare(sql).get(...params) || null,
    all: async () => ({ results: raw.prepare(sql).all(...params) }),
  });
  return { env: { DB: { prepare: (sql) => stmt(sql) } }, raw };
}

test('formatHandoffNote redacts team keys and join links via T.hideSecrets and caps length', () => {
  const fakeKey = 'vt1.' + 'a1b2c3d4e5f6' + '.' + '0123456789abcdef0123456789abcdef'; // secret-scan: ok
  const fakeJoin = 'https://a-to-mind.com/team/join/vj1-' + 'fedcba9876543210fedcba9876543210'; // secret-scan: ok

  const formatted = formatHandoffNote('Ada', 'Wired parser\nused ' + fakeKey + ' and ' + fakeJoin);
  assert.ok(formatted.startsWith('Last progress from @Ada: '));
  assert.ok(!formatted.includes(fakeKey), 'team key must be redacted');
  assert.ok(!formatted.includes(fakeJoin), 'join link must be redacted');
  assert.match(formatted, /\[key hidden\]/);
  assert.match(formatted, /\[join link hidden\]/);
  assert.ok(!/[\r\n]/.test(formatted), 'must be single-line');

  assert.equal(formatHandoffNote('Ada', '   \n\t  '), '');
  assert.equal(formatHandoffNote('Ada', ''), '');
  assert.equal(formatHandoffNote('Ada', null), '');

  const longNote = formatHandoffNote('Ada', 'step '.repeat(120));
  assert.ok(longNote.length <= MAX_HANDOFF, 'must not exceed MAX_HANDOFF');
});

test('attachHandoff and readHandoff round-trip cleanly, replace stale handoff, and cap at 300 chars', () => {
  const first = formatHandoffNote('Ada', 'finished schema and unit tests');
  const attached = attachHandoff('tries 1 · lease timed out', first);
  assert.equal(attached, 'tries 1 · lease timed out · handoff: ' + first);
  assert.equal(readHandoff(attached), first);

  const second = formatHandoffNote('Bob', 'rebased branch and fixed lint');
  const replaced = attachHandoff(attached, second);
  assert.equal(replaced, 'tries 1 · lease timed out · handoff: ' + second);
  assert.equal(readHandoff(replaced), second);
  assert.ok(!replaced.includes('@Ada'), 'stale handoff must be replaced');

  const fromEmpty = attachHandoff('', first);
  assert.equal(fromEmpty, 'handoff: ' + first);
  assert.equal(readHandoff(fromEmpty), first);
  assert.equal(readHandoff('tries 1 · no handoff yet'), '');
  assert.equal(attachHandoff('tries 1 · kept', ''), 'tries 1 · kept');

  const hugeBase = 'tries 2 · ' + 'context '.repeat(40);
  const longHandoff = formatHandoffNote('Cara', 'verified edge case '.repeat(20));
  const capped = attachHandoff(hugeBase, longHandoff);
  assert.ok(capped.length <= 300, 'void_queue.note must not exceed 300 chars');
  assert.ok(readHandoff(capped).startsWith('Last progress from @Cara: '), 'handoff preserved under cap');
});

test('carryHandoffOnTimeout pulls newest progress reply from job thread and attaches to queue note', async () => {
  const { env, raw } = makeEnv();
  const ins = raw.prepare(
    'INSERT INTO void_team_msgs (channel, thread, at, by, body, job) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const root = ins.run('work', 0, 1000, 'verse', 'Job #8 assigned to Ada', 'job-8');
  const tid = Number(root.lastInsertRowid);

  // Earlier progress from Ada, a reply from another agent, and Ada's newest progress with a key
  const fakeKey = 'vt1.' + '112233445566' + '.' + 'abcdef0123456789abcdef0123456789'; // secret-scan: ok
  ins.run('work', tid, 2000, 'agent-ada', 'Started reading queue code', 'job-8');
  ins.run('work', tid, 3000, 'agent-other', 'Unrelated reply in same thread', 'job-8');
  ins.run('work', tid, 4000, 'agent-ada', 'Implemented parser, failing on edge case ' + fakeKey, 'job-8');
  // Message in a different thread from Ada must be ignored
  ins.run('work', tid + 99, 5000, 'agent-ada', 'Wrong thread note', 'job-99');

  const latest = await lastAgentNote(env, 'agent-ada', tid);
  assert.equal(latest, 'Implemented parser, failing on edge case [key hidden]');

  const agent = { id: 'agent-ada', name: 'Ada', thread: tid };
  const result = await carryHandoffOnTimeout(env, agent, 'tries 1 · timed out · handoff: stale note');

  assert.equal(result.handoff, 'Last progress from @Ada: Implemented parser, failing on edge case [key hidden]');
  assert.equal(result.note, 'tries 1 · timed out · handoff: ' + result.handoff);
  assert.equal(readHandoff(result.note), result.handoff);
  assert.ok(result.note.length <= 300);

  // Agent with no messages in thread leaves queue note intact and handoff empty
  const empty = await carryHandoffOnTimeout(env, { id: 'agent-ghost', name: 'Ghost', thread: tid }, 'tries 1');
  assert.equal(empty.handoff, '');
  assert.equal(empty.note, 'tries 1');
});

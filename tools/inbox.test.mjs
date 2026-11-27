// Per-seat inbox (void-live-deploy/lib/inbox.js): reasons, unread, done and mute.
// Run: node --test tools/inbox.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { REASONS, INBOX, add, read, done, mute, list } from '../void-live-deploy/lib/inbox.js';

const MINUTE = 60 * 1000;
const item = (over = {}) => ({ seat: 'ada', thread: 'room', reason: 'mention', ...over });

function snap(rows) {
  return JSON.parse(JSON.stringify(rows));
}

test('REASONS is the frozen set of inbox reasons, and INBOX freezes the window and the cap', () => {
  assert.deepEqual([...REASONS], ['mention', 'handed', 'review_asked', 'check_failed', 'state_change', 'comment']);
  assert.equal(Object.isFrozen(REASONS), true);
  assert.equal(Object.isFrozen(INBOX), true);
  assert.equal(INBOX.window_ms, 10 * MINUTE);
  assert.equal(INBOX.cap, 100);
  assert.equal(INBOX.reasons, REASONS);
  assert.throws(() => { REASONS.push('subscribed'); }, TypeError);
});

test('the same seat, thread and reason within 10 minutes is one item, and after that it is two', () => {
  const first = add([], item(), 0);
  const inside = add(first, item(), 10 * MINUTE);
  const after = add(first, item(), 10 * MINUTE + 1);
  assert.equal(inside.length, 1);
  assert.equal(inside[0].at, 0);
  assert.equal(first.length, 1, 'the earlier array is left as it was');
  assert.equal(after.length, 2);
  assert.deepEqual(after.map((row) => row.at), [0, 10 * MINUTE + 1]);
  const otherReason = add(first, item({ reason: 'comment' }), MINUTE);
  const otherSeat = add(first, item({ seat: 'bea' }), MINUTE);
  const otherThread = add(first, item({ thread: 'hall' }), MINUTE);
  assert.equal(otherReason.length, 2);
  assert.equal(otherSeat.length, 2);
  assert.equal(otherThread.length, 2);
});

test('a done row still counts for the window, and a missing clock is refused', () => {
  const closed = add([], item({ done: true }), 0);
  assert.equal(add(closed, item(), 5 * MINUTE).length, 1);
  const kept = [];
  assert.throws(() => add(kept, item(), undefined), /Pass now as a number of milliseconds/);
  assert.deepEqual(kept, []);
  const fromStamp = add([], { ...item(), at: 40 }, undefined);
  assert.equal(fromStamp[0].at, 40);
});

test('an unknown reason is refused and the array is left alone', () => {
  const rows = add([], item(), 0);
  const before = snap(rows);
  assert.throws(() => add(rows, item({ reason: 'subscribed' }), MINUTE), /Unknown inbox reason/);
  assert.throws(() => add(rows, item({ reason: '' }), MINUTE), /Unknown inbox reason/);
  assert.deepEqual(rows, before);
});

test('read, done and mute are pure: the input array and its objects stay as they were', () => {
  const rows = [
    { seat: 'ada', thread: 'room', reason: 'comment', at: 1, read: false, done: false, note: 'keep' },
    { seat: 'bea', thread: 'room', reason: 'comment', at: 2, read: false, done: false },
  ];
  const before = snap(rows);
  const seen = read(rows, 'room', 'ada');
  const closed = done(rows, 'room');
  const quiet = ['hall'];
  const muted = mute(quiet, 'room');
  assert.deepEqual(rows, before);
  assert.deepEqual(quiet, ['hall']);
  assert.notEqual(seen, rows);
  assert.notEqual(closed, rows);
  assert.notEqual(muted, quiet);
  assert.equal(seen[0].read, true);
  assert.equal(seen[0].done, false);
  assert.equal(rows[0].read, false);
  assert.equal(seen[1], rows[1], 'another seat on the thread is the same object');
  assert.equal(closed[0].done, true);
  assert.equal(closed[1].done, true);
  assert.equal(rows[0].done, false);
  assert.equal(seen[0].note, undefined, 'a returned row keeps only the inbox fields');
  assert.equal(rows[0].note, 'keep');
  assert.deepEqual(muted, ['hall', 'room']);
  assert.deepEqual(mute(muted, 'room'), ['hall', 'room']);
});

test('list skips a muted thread, and unread is newest first with a cap of 100', () => {
  let rows = [];
  for (let i = 0; i < 160; i++) {
    rows = add(rows, item({ thread: 't' + i, reason: 'comment', read: i % 5 === 0 }), i);
  }
  rows = add(rows, item({ seat: 'bea', thread: 'late', reason: 'handed' }), 500);
  const muted = mute(mute([], 't159'), 't158');
  const unread = list(rows, 'ada', { unread: true, muted });
  assert.equal(unread.length, 100);
  assert.equal(unread[0].thread, 't157');
  assert.equal(unread[0].read, false);
  assert.ok(unread.every((row) => row.seat === 'ada' && row.read === false));
  assert.ok(unread.every((row, n) => n === 0 || unread[n - 1].at >= row.at));
  assert.ok(!unread.some((row) => row.thread === 't159' || row.thread === 't158' || row.thread === 't1'));
  assert.equal(unread[99].at < unread[0].at, true);
  const all = list(rows, 'ada', { muted });
  assert.equal(all.length, 100);
  assert.equal(all[0].thread, 't157');
  assert.ok(all.some((row) => row.read === true));
  assert.deepEqual(Object.keys(all[0]).sort(), ['at', 'done', 'read', 'reason', 'seat', 'thread']);
  const open = list(rows, 'ada', {});
  assert.equal(open[0].thread, 't159');
  assert.equal(list(rows, 'bea', {}).map((row) => row.thread).join(), 'late');
  assert.deepEqual(rows.map((row) => row.thread).slice(0, 2), ['t0', 't1'], 'listing does not reorder the store');
});

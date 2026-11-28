// Per-seat inbox: a reason, an unread flag, a done flag, and a muted thread.
// Pure. No network, no database, and no clock except the `now` argument.
//
// FOLLOW-UP (wiring, blocked by PR #114):
// functions/api/team.js, team/agent.mjs and the team UI already serve a
// different mail list. Do not edit them here. When those files are free, the
// seat route should keep this array and call add, read, done, mute and list.
//
// add(items, item, now) -> a new array. The same seat, thread and reason
// inside INBOX.window_ms stays one item.
// read(items, thread, seat?) -> a new array, matching rows marked read.
// done(items, thread, seat?) -> a new array, matching rows marked done.
// mute(muted, thread) -> a new array of thread ids.
// list(items, seat, { unread, muted }) -> newest first, at most INBOX.cap.
// A muted thread is left out. unread:true keeps only rows with read false.

export const REASONS = Object.freeze([
  'mention',
  'handed',
  'review_asked',
  'check_failed',
  'state_change',
  'comment',
]);

export const INBOX = Object.freeze({
  window_ms: 10 * 60 * 1000,
  cap: 100,
  reasons: REASONS,
});

const REASON_SET = new Set(REASONS);

function plainId(value, label) {
  if (typeof value !== 'string') throw new Error(label + ' must be plain text.');
  const name = value.trim();
  if (!name || name.length > 160) throw new Error(label + ' must be a short name.');
  return name;
}

function clockOf(now, item) {
  if (Number.isFinite(now)) return now;
  if (item && Number.isFinite(item.at)) return item.at;
  throw new Error('Pass now as a number of milliseconds.');
}

function shape(row, read, done) {
  return {
    seat: row.seat,
    thread: row.thread,
    reason: row.reason,
    at: row.at,
    read: read === undefined ? row.read === true : read === true,
    done: done === undefined ? row.done === true : done === true,
  };
}

function asList(items) {
  return Array.isArray(items) ? items : [];
}

/** Append one item, or return a copy when the same seat, thread and reason is already inside the window. */
export function add(items, item, now) {
  const list = asList(items);
  if (!item || typeof item !== 'object') throw new Error('An inbox item needs a seat, a thread and a reason.');
  const reason = typeof item.reason === 'string' ? item.reason : '';
  if (!REASON_SET.has(reason)) throw new Error('Unknown inbox reason.');
  const seat = plainId(item.seat, 'A seat');
  const thread = plainId(item.thread, 'A thread');
  const at = clockOf(now, item);
  const hit = list.some((row) => row
    && row.seat === seat
    && row.thread === thread
    && row.reason === reason
    && Number.isFinite(row.at)
    && Math.abs(at - row.at) <= INBOX.window_ms);
  if (hit) return list.slice();
  const next = list.slice();
  next.push({ seat, thread, reason, at, read: item.read === true, done: item.done === true });
  return next;
}

function mark(items, thread, field, seat) {
  const id = plainId(thread, 'A thread');
  const who = seat == null || seat === '' ? null : plainId(seat, 'A seat');
  return asList(items).map((row) => {
    if (!row || row.thread !== id) return row;
    if (who && row.seat !== who) return row;
    if (row[field] === true) return row;
    const next = shape(row);
    next[field] = true;
    return next;
  });
}

/** Mark one thread read. Pass a seat to leave other seats on that thread unread. */
export function read(items, thread, seat) {
  return mark(items, thread, 'read', seat);
}

/** Mark one thread done. Pass a seat to leave other seats on that thread open. */
export function done(items, thread, seat) {
  return mark(items, thread, 'done', seat);
}

/** Remember a muted thread. The input array is not changed. */
export function mute(muted, thread) {
  const id = plainId(thread, 'A thread');
  const list = asList(muted);
  if (list.includes(id)) return list.slice();
  return list.concat(id);
}

function byNewest(a, b) {
  const delta = (Number.isFinite(b.at) ? b.at : 0) - (Number.isFinite(a.at) ? a.at : 0);
  if (delta) return delta;
  if (a.thread < b.thread) return -1;
  if (a.thread > b.thread) return 1;
  if (a.reason < b.reason) return -1;
  if (a.reason > b.reason) return 1;
  return 0;
}

/** One seat's rows, newest first. Muted threads drop out. unread:true keeps read === false. */
export function list(items, seat, opts) {
  const who = plainId(seat, 'A seat');
  const options = opts && typeof opts === 'object' ? opts : {};
  const unreadOnly = options.unread === true;
  const muted = new Set(Array.isArray(options.muted) ? options.muted : []);
  const rows = asList(items).filter((row) => {
    if (!row || row.seat !== who) return false;
    if (muted.has(row.thread)) return false;
    if (unreadOnly && row.read === true) return false;
    return true;
  });
  rows.sort(byNewest);
  return rows.slice(0, INBOX.cap).map((row) => shape(row));
}

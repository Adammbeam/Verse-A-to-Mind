// Proposals: a change submitted as a patch, checked by a runner, and shipped without a pull request.
//
// Not to be confused with skills/forge.js, which makes 3D things. This is the shipping queue.
//
// The reason it exists: on 2026-11-24 the GitHub account was flagged and Actions was switched off, so a patch could be written but
// nothing could run to prove it. A forge proposal is the same idea as a pull request with the parts that broke removed: the diff is
// stored here (D1), the checks run on a machine that has git (tools/local-ship.mjs), and the deploy is `wrangler pages deploy`.
//
// This file is the pure half: what a proposal is, what a diff says about itself, and which state changes are allowed. The route is
// functions/api/proposals.js and the runner is tools/local-ship.mjs.

/** A diff over this size is not a proposal, it is a branch. Keep the Worker's request body honest. */
export const MAX_DIFF = 200_000;

const STATES = ['open', 'checking', 'shipped', 'refused', 'reverted'];

/** Count what a unified diff touches. Pure. Tolerates a diff that is empty or malformed: it returns zeros, never throws. */
export function diffStat(diff) {
  const text = String(diff || '');
  const files = new Set();
  let added = 0, removed = 0;
  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) { const m = line.match(/ b\/(.+)$/); if (m) files.add(m[1]); continue; }
    if (line.startsWith('+++ ') || line.startsWith('--- ')) { const m = line.match(/^[+-]{3} [ab]\/(.+)$/); if (m) files.add(m[1]); continue; }
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) added++;
    else if (line.startsWith('-')) removed++;
  }
  return { files: files.size, added, removed };
}

/** A short, stable id from the time and the title, so two proposals a second apart cannot collide. Pure. */
export function idOf(now, title) {
  const slug = String(title || 'change').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'change';
  const stamp = String(now || '').replace(/[^0-9]/g, '').slice(0, 14) || '0';
  return stamp + '-' + slug;
}

/**
 * Turn a submitted body into a row, or throw with the reason. Pure.
 * A proposal needs a branch, a title and a diff. It does not need a test summary, but an empty one is recorded as such, because
 * "nobody said what they ran" is information the runner and the owner both want.
 */
export function newProposal(body, { now = new Date().toISOString() } = {}) {
  const b = body || {};
  const diff = typeof b.diff === 'string' ? b.diff : '';
  const branch = String(b.branch || '').trim();
  const title = String(b.title || '').trim();
  if (!diff.trim()) throw new Error('a proposal needs a diff');
  if (diff.length > MAX_DIFF) throw new Error('the diff is too large: ' + diff.length + ' bytes, the limit is ' + MAX_DIFF);
  if (!/^diff --git |^--- /.test(diff.trim())) throw new Error('the diff is not a unified diff (git diff or git format-patch)');
  if (!branch) throw new Error('a proposal needs the branch it would land on');
  if (!title) throw new Error('a proposal needs a title');
  const stat = diffStat(diff);
  return {
    id: String(b.id || idOf(now, title)),
    created_at: now,
    author: String(b.author || '').slice(0, 80),
    branch: branch.slice(0, 120),
    title: title.slice(0, 160),
    diff,
    tests: String(b.tests || '').slice(0, 2000),
    files: stat.files,
    added: stat.added,
    removed: stat.removed,
    state: 'open',
    verdict: '',
    decided_at: null,
  };
}

/** Which decisions are legal from a state. A shipped proposal can only be reverted, and a reverted one is closed. Pure. */
export function canDecide(state, action) {
  if (!STATES.includes(state)) return false;
  if (action === 'check') return state === 'open';
  if (action === 'ship') return state === 'open' || state === 'checking';
  if (action === 'refuse') return state === 'open' || state === 'checking';
  if (action === 'revert') return state === 'shipped';
  return false;
}

/** The state after a decision, or the same state when the decision is not legal. Pure. */
export function nextState(state, action) {
  if (!canDecide(state, action)) return state;
  return { check: 'checking', ship: 'shipped', refuse: 'refused', revert: 'reverted' }[action];
}

/**
 * Compare two secrets without leaking where they first differ. Pure.
 * A token compare that returns early on the first wrong byte tells an attacker how much of a guess was right; this one always walks
 * the same number of steps. Length is still visible, which is fine: it is not the secret.
 */
export function sameSecret(a, b) {
  const x = String(a || ''), y = String(b || '');
  if (!x || !y || x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

/** One line a stage card or a terminal can show. Pure. */
export function describe(p) {
  if (!p) return '';
  const who = p.author ? ' by ' + p.author : '';
  const stat = p.files + ' file' + (p.files === 1 ? '' : 's') + ', +' + p.added + ' −' + p.removed;
  return '#' + p.id + ' ' + p.title + who + ' → ' + p.branch + ' · ' + stat + ' · ' + p.state + (p.verdict ? ' · ' + p.verdict : '');
}

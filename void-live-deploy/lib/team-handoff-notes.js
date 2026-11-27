/**
 * team-handoff-notes: carry an agent's last progress note across a job lease timeout.
 *
 * When a busy agent times out and its job returns to the queue, the next agent should
 * see where the previous agent stopped instead of starting blind. Pure formatting and
 * parsing helpers keep void_queue.note within its 300-character cap and redact team keys
 * and join links via T.hideSecrets. Tests: tools/team-handoff-notes.test.mjs.
 */
import * as T from './team.js';

export const MAX_HANDOFF = 240;
const MAX_NOTE = 300;
const HANDOFF_TAIL = /(?:^|\s*·\s*)handoff:[\s\S]*$/i;
const HANDOFF_READ = /(?:^|\s*·\s*)handoff:\s*([\s\S]*)$/i;
const MIN_HANDOFF_SLOT = 80;

/**
 * Format a clean, secret-redacted single-line progress note (max MAX_HANDOFF chars)
 * prefixed with `Last progress from @<agentName>: ...`. Returns '' if lastBody is empty.
 */
export function formatHandoffNote(agentName, lastBody) {
  const redacted = T.hideSecrets(String(lastBody == null ? '' : lastBody));
  const bodyCheck = T.clean(redacted, MAX_HANDOFF);
  if (!bodyCheck) return '';

  const name = T.clean(String(agentName == null ? '' : agentName).replace(/^@+/, ''), 32);
  const prefix = name ? 'Last progress from @' + name + ': ' : 'Last progress: ';
  const budget = Math.max(0, MAX_HANDOFF - prefix.length);
  const snippet = T.clean(redacted, budget);
  if (!snippet) return '';
  return (prefix + snippet).slice(0, MAX_HANDOFF);
}

/**
 * Append ` · handoff: <note>` to a void_queue.note string, replacing any previous
 * `handoff:` segment and capping the combined result at 300 characters.
 */
export function attachHandoff(queueNote, handoffLine) {
  const rawQueue = String(queueNote == null ? '' : queueNote);
  const line = T.clean(T.hideSecrets(String(handoffLine == null ? '' : handoffLine)), MAX_HANDOFF);
  if (!line) return T.clean(rawQueue, MAX_NOTE);

  const stripped = rawQueue.replace(HANDOFF_TAIL, '');
  let base = T.clean(stripped, MAX_NOTE);
  if (!base) return ('handoff: ' + line).slice(0, MAX_NOTE);

  const sep = ' · handoff: ';
  if (base.length + sep.length + line.length <= MAX_NOTE) {
    return base + sep + line;
  }

  const reserve = Math.min(line.length, MIN_HANDOFF_SLOT);
  const maxBase = Math.max(0, MAX_NOTE - sep.length - reserve);
  if (base.length > maxBase) {
    base = base.slice(0, maxBase).trimEnd();
  }
  if (!base) return ('handoff: ' + line).slice(0, MAX_NOTE);

  const avail = Math.max(0, MAX_NOTE - base.length - sep.length);
  const clipped = line.slice(0, avail).trimEnd();
  return (base + sep + clipped).slice(0, MAX_NOTE);
}

/**
 * Extract the handoff note string from a void_queue.note, or '' if none is present.
 */
export function readHandoff(queueNote) {
  const m = HANDOFF_READ.exec(String(queueNote == null ? '' : queueNote));
  if (!m) return '';
  return T.clean(T.hideSecrets(m[1]), MAX_HANDOFF);
}

/**
 * Query the newest message posted by `agentId` in `threadId` (either a reply in the
 * thread or the root post itself) and return its cleaned, secret-redacted body or ''.
 */
export async function lastAgentNote(env, agentId, threadId) {
  const tid = Number(threadId);
  if (!env || !env.DB || !agentId || !Number.isFinite(tid) || tid <= 0) return '';

  const row = await env.DB.prepare(
    'SELECT body FROM void_team_msgs WHERE by = ? AND (thread = ? OR id = ?) ORDER BY id DESC LIMIT 1'
  ).bind(String(agentId), tid, tid).first();

  if (!row || !row.body) return '';
  return T.clean(T.hideSecrets(row.body), MAX_HANDOFF);
}

/**
 * Pull an agent's newest progress reply from its job thread on lease timeout,
 * format it as a handoff line, and attach it to the queue note.
 */
export async function carryHandoffOnTimeout(env, agent, queueNote) {
  if (!agent) return { handoff: '', note: T.clean(queueNote || '', MAX_NOTE) };
  const lastBody = await lastAgentNote(env, agent.id, agent.thread);
  const handoff = formatHandoffNote(agent.name || agent.id, lastBody);
  const note = attachHandoff(queueNote, handoff);
  return { handoff, note };
}

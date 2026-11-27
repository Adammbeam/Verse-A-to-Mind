/**
 * team-claim-board: single-claim guard and planning board view for Verse's team queue.
 * Enforces one active claim per job (refusing a second claim with the current holder's name)
 * and splits queued vs claimed jobs for the planning board without duplicates.
 * Tests: tools/team-claim-board.test.mjs.
 */
import * as T from './team.js';

const NOTE_HOLDER_RE = /^(?:claimed|review)\s+by\s+team:([A-Za-z0-9][A-Za-z0-9._-]{0,23})\b/i;

function msOf(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const t = Date.parse(v || '');
  return Number.isFinite(t) ? t : 0;
}

/** Current holder of a job: active agent holding jobRow.id, or parsed from jobRow.note, or null. Pure. */
export function holderOf(jobRow, activeAgents = []) {
  if (!jobRow) return null;
  const id = String(jobRow.id || '').trim();
  if (id && Array.isArray(activeAgents)) {
    const seat = activeAgents.find((a) => a && !a.off && a.job === id && a.name);
    if (seat) return T.clean(seat.name, 24) || null;
  }
  const m = NOTE_HOLDER_RE.exec(String(jobRow.note || '').trim());
  return m ? m[1] : null;
}

/** Plain-words refusal naming who currently holds the job. Pure. */
export function claimConflictSay(jobId, holderName) {
  const id = T.clean(jobId, 80) || 'this job';
  const who = T.clean(holderName, 24) || 'another seat';
  return `Job ${id} is already claimed by @${who}. Pick another job on the board.`;
}

/**
 * Planning board view: separates open queued jobs from active claimed jobs (one holder per job,
 * never duplicating a job across both lists) and produces a plain-words summary. Pure.
 */
export function planningBoard({ jobs = [], agents = [], now = Date.now(), scores = null } = {}) {
  const list = Array.isArray(jobs) ? jobs : [];
  const active = (Array.isArray(agents) ? agents : []).filter((a) => a && !a.off && a.job && a.name);
  const byId = new Map();
  for (const j of list) if (j && j.id) byId.set(j.id, j);

  const claimedMap = new Map();
  const putClaimed = (id, holder, since, jobRow) => {
    if (!id || !holder || claimedMap.has(id)) return;
    const row = jobRow ? T.boardRow(jobRow, now) : null;
    const start = since > 0 ? since : msOf(jobRow && (jobRow.updated || jobRow.at));
    claimedMap.set(id, {
      id,
      title: row ? row.title : T.clean(id, 80),
      holder: T.clean(holder, 24),
      since: start,
      waitingMin: start > 0 ? Math.max(0, Math.floor((now - start) / 60e3)) : 0,
      kind: row ? row.kind : 'feature',
    });
  };

  for (const a of active) {
    putClaimed(a.job, a.name, msOf(a.job_at), byId.get(a.job) || null);
  }
  for (const j of list) {
    if (!j || !j.id || claimedMap.has(j.id)) continue;
    if (j.state !== 'building') continue;
    const holder = holderOf(j, active);
    if (holder) putClaimed(j.id, holder, msOf(j.updated || j.at), j);
  }

  const claimed = [...claimedMap.values()].sort((a, b) => a.since - b.since || a.id.localeCompare(b.id));
  const unclaimedJobs = list.filter((j) => j && j.id && !claimedMap.has(j.id));
  const open = T.board(unclaimedJobs, now, 40, scores);

  const holders = [...new Set(claimed.map((c) => c.holder))];
  const summary = `${open.length} open · ${claimed.length} claimed${holders.length ? ` (${holders.join(', ')})` : ''}`;
  return { open, claimed, summary };
}

/**
 * D1 guard: checks whether jobId is already claimed by another active seat in void_team_agents
 * or marked building in void_queue. Returns { ok: false, holder, say } on conflict, else { ok: true }.
 */
export async function checkClaimConflict(env, jobId, requesterName) {
  const id = String(jobId || '').trim();
  if (!env || !env.DB || !id) return { ok: true };
  const req = String(requesterName || '').trim().toLowerCase();

  const seat = await env.DB
    .prepare('SELECT name FROM void_team_agents WHERE off = 0 AND job = ? LIMIT 1')
    .bind(id)
    .first();
  if (seat && seat.name) {
    const holder = T.clean(seat.name, 24);
    if (holder && holder.toLowerCase() !== req) {
      return { ok: false, holder, say: claimConflictSay(id, holder) };
    }
    return { ok: true };
  }

  const qRow = await env.DB
    .prepare("SELECT id, state, note FROM void_queue WHERE id = ? AND state = 'building' LIMIT 1")
    .bind(id)
    .first();
  if (qRow) {
    const holder = holderOf(qRow, []);
    if (holder && holder.toLowerCase() !== req) {
      return { ok: false, holder, say: claimConflictSay(id, holder) };
    }
  }
  return { ok: true };
}

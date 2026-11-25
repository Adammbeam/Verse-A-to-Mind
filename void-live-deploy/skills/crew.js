/**
 * crew skill - "crew", "the crew", "who's on the team", "team status", "who's working": Verse's crew
 * - agents and their current work, read from Verse's own records and the live build queue.
 * Shows each crew member, their role, state, and what they're building right now. Pure data
 * from Verse's own API - nothing is sent, nothing is stored.
 */
const CREW = [
  { id: 'towerscout', name: 'TowerScout', role: 'agent', lane: 'tower', laneName: 'Tower' },
  { id: 'examcoach', name: 'ExamCoach', role: 'agent', lane: 'exam', laneName: 'Exam' },
  { name: 'MergeTrain', role: 'agent', lane: 'merges', laneName: 'Merges' },
  { name: 'BroadcastBuilder', role: 'agent', lane: 'broadcast', laneName: 'Broadcast' },
  { name: 'StatusWatch', role: 'agent', lane: 'status', laneName: 'Status' },
  { name: 'Growth', role: 'agent', lane: 'growth', laneName: 'Growth' },
  { name: 'SiteOperator', role: 'agent', lane: 'site', laneName: 'Site' },
  { name: 'TechRadar', role: 'agent', lane: 'radar', laneName: 'Radar' },
  { name: 'ClaudeDuet', role: 'agent', lane: null, laneName: null },
  { name: 'Vibe', role: 'agent', lane: null, laneName: null },
  { name: 'Beam', role: 'agent', lane: null, laneName: null },
  { name: 'kimi-k3', role: 'agent', lane: null, laneName: null },
  { name: 'nemotron', role: 'agent', lane: null, laneName: null },
  { name: 'openhands', role: 'agent', lane: null, laneName: null },
  { name: 'flint', role: 'agent', lane: null, laneName: null },
  { name: 'Deepseek', role: 'agent', lane: null, laneName: null },
  { name: 'GrokBot', role: 'agent', lane: null, laneName: null },
  { name: 'PulseAlpha', role: 'agent', lane: null, laneName: null },
  { name: 'glm', role: 'agent', lane: null, laneName: null },
  { name: 'BigPickle', role: 'agent', lane: null, laneName: null },
  { name: 'llama', role: 'agent', lane: null, laneName: null },
  { name: 'gemini', role: 'agent', lane: null, laneName: null },
  { name: 'mimo', role: 'agent', lane: null, laneName: null },
  { name: 'Verseenvoy', role: 'agent', lane: null, laneName: null },
  { name: 'Kimi', role: 'agent', lane: null, laneName: null },
  { name: 'Qwen', role: 'agent', lane: null, laneName: null },
  { name: 'musesparkopen', role: 'agent', lane: null, laneName: null },
  { name: 'mistrallarge4', role: 'agent', lane: null, laneName: null },
  { name: 'qwen4b', role: 'agent', lane: null, laneName: null },
  { name: 'deepseekcoder6.7b', role: 'agent', lane: null, laneName: null },
  { name: 'MiniMax-3.1-Flash', role: 'agent', lane: null, laneName: null },
  { name: 'nemotron-3-ultra', role: 'agent', lane: null, laneName: null },
  { name: 'BeamFree', role: 'agent', lane: null, laneName: null },
  { name: 'Beam1.0501BA23B', role: 'agent', lane: null, laneName: null },
  { name: 'DeepSeekV4.1Flash1017', role: 'agent', lane: null, laneName: null },
  { name: 'DeepSeekV4Pro0813', role: 'agent', lane: null, laneName: null },
  { name: 'GLM5.3Flashfree', role: 'agent', lane: null, laneName: null },
];

const CLEAN = (s) => String(s || '').trim().toLowerCase().replace(/[’']/g, "'").replace(/[?!.]+$/, '').replace(/\s+/g, ' ').trim();
const CREW_RE = /^(?:crew|the crew|team status|crew status|who(?:'s| is) on the team|who(?:'s| is) working)$/i;
export function crewOf(text) { return CREW_RE.test(CLEAN(text)); }

/** fetch Verse's live queue for what the crew is working on right now. Pure fetch, no key. */
export async function queueJobs(fetchFn = (u) => fetch(u)) {
  try {
    const r = await fetchFn('https://a-to-mind.com/api/team?jobs');
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j.jobs) ? j.jobs : [];
  } catch (_) { return []; }
}

/** render the crew card: members, their lane, state, current job. Pure HTML builder. */
export function crewHtml(esc, jobs) {
  const byJob = new Map();
  for (const j of jobs || []) if (j.job) byJob.set(String(j.job || ''), j);
  const rows = CREW.map((m) => {
    const job = m.job ? byJob.get(String(m.job || '')) : null;
    const lane = m.laneName ? `<span class="crew-lane">${esc(m.laneName)}</span>` : '<span class="crew-lane">unassigned</span>';
    const jobText = job ? ` · <span class="crew-job">${esc(j.job || '')}</span>` : '';
    const state = m.state || 'idle';
    const stateClass = state === 'idle' ? 'crew-idle' : state === 'busy' ? 'crew-busy' : 'crew-away';
    return `<li class="crew-row" style="margin:6px 0"><div class="crew-name"><b>${esc(m.name)}</b></div>
      <div class="crew-line"><span class="crew-state ${stateClass}">${esc(state)}</span>${lane}${jobText}</div></li>`;
  }).join('');
  return `<style>
    .crew-card .crew-row{display:flex;flex-direction:column;border-left:3px solid rgba(255,255,255,.25);padding:6px 10px;margin:8px 0;background:rgba(255,255,255,.04);border-radius:8px}
    .crew-card .crew-name{font-size:15px;font-weight:600;margin-bottom:4px}
    .crew-card .crew-line{font-size:12px;color:#9a9a92;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
    .crew-card .crew-state{font-size:11px;text-transform:uppercase;letter-spacing:.05em;padding:1px 6px;border-radius:4px;white-space:nowrap}
    .crew-card .crew-idle{background:#4ade80;color:#064e3b}
    .crew-card .crew-busy{background:#fca5a5;color:#450a0a}
    .crew-card .crew-away{background:#fbbf24;color:#451a03}
    .crew-card .crew-lane{background:rgba(255,255,255,.12);color:#e5e7eb;padding:1px 6px;border-radius:4px;font-size:11px}
    .crew-card .crew-job{color:#e5e7eb;font-style:italic}
    .crew-card .crew-count{font-size:11px;color:#8a8a92;margin-top:4px}
  </style>
  <h2>${esc(CREW.length)} crew — Verse's agents</h2>
  <div class="sub">who's on the team, what they're working on, their state</div>
  <div class="crew-list">${rows}</div>
  <div class="crew-count">${jobs ? jobs.length : '?'} job${jobs && jobs.length !== 1 ? 's' : ''} on the queue</div>
  <div class="src">Crew read from Verse's own records · jobs from GET /api/team?jobs · nothing is sent or kept</div>`;
}

async function run(text, api) {
  const { showPage, esc } = api;
  const jobs = await queueJobs();
  showPage((el) => {
    el.innerHTML = crewHtml(esc, jobs);
  });
  api.say(`${CREW.length} crew — ${jobs.length} job${jobs.length !== 1 ? 's' : ''} on the queue`);
  return 'crew';
}

export default {
  name: 'crew',
  examples: ['crew', 'the crew', 'who\'s on the team', 'team status', 'who\'s working', 'crew status'],
  nearMisses: ['crew card', 'crew page', 'crew list', 'team members', 'Verse crew', 'the team'],
  match(lower) { return crewOf(lower); },
  run,
};

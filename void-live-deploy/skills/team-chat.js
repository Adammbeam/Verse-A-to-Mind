/**
 * team-chat skill: the workspace as a card. Builders, owner asks, and finished work a visitor can open.
 * Clock-crew checks stay off this card. Contract: { name, examples, nearMisses, match, run }.
 */
const WHEN = /^(?:(?:the |a |my |open (?:the |my )?|show (?:me )?(?:the |my )?)?(?:team ?chat|team workspace|agents? (?:chat|workspace)|slack alternative)|(?:my|the) agents|chat (?:for|with) (?:my |the )?agents)$/i;

/** the card's pieces from the open workspace read. Pure.
 *  Busiest is the seat with the most finished jobs, never a guess; a seat that has finished nothing is not named. Recent shipments are only
 *  things that are on the site now, linked on the live repo; an invited seat that never joined is not a builder yet. */
export const LIVE_REPO = 'https://github.com/Adammbeam/Verse-A-to-Mind/';
export function teamLines(w) {
  const members = Array.isArray(w && w.members) ? w.members : [];
  const order = { busy: 0, idle: 1, away: 2 };
  const builders = members.filter((m) => m && !m.crew && m.state !== 'invited').slice().sort((a, b) => (order[a.state] ?? 3) - (order[b.state] ?? 3) || (Number(b.done) || 0) - (Number(a.done) || 0)).slice(0, 8);
  const asks = (Array.isArray(w && w.asks) ? w.asks : []).slice(0, 6);
  const feed = (Array.isArray(w && w.feed) ? w.feed : []).filter((f) => f && f.live === true).slice(0, 6)
    .map((f) => ({ ...f, href: String(f.href || '').startsWith(LIVE_REPO) || String(f.href || '').startsWith('/') ? f.href : '/team/' }));
  const busy = builders.filter((m) => m.state === 'busy');
  const top = members.filter((m) => m && !m.crew && Number(m.done) > 0).sort((a, b) => Number(b.done) - Number(a.done))[0];
  return { builders, asks, feed, waiting: Number(w && w.waiting) || 0, busy: busy.length, busiest: top ? top.name : '', busiestDone: top ? Number(top.done) : 0 };
}
/** one plain sentence for a builder. Pure. */
export function builderLine(m) {
  const doing = m.now && m.now !== 'Nothing in hand' ? m.now : '';
  if (m.state === 'busy') return m.name + ' is working on ' + (doing || 'a job') + '.';
  if (m.state === 'idle') return m.name + ' is free and waiting for a job.';
  return m.name + ' is away.';
}
/** the stats sentence. Pure. */
export function statsLine(t) {
  const jobs = t.waiting === 1 ? '1 job is waiting' : t.waiting + ' jobs are waiting';
  const ship = t.feed.length ? (t.feed.length === 1 ? '1 recent change is live' : t.feed.length + ' recent changes are live') : 'nothing new is live yet';
  const who = t.busiest ? t.busiest + ' has finished the most jobs (' + t.busiestDone + ')' : 'nobody has finished a job lately';
  return jobs + ', ' + ship + ', and ' + who + '.';
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function run(text, api) {
  const { showPage } = api;
  showPage((el) => {
    el.dataset.page = '/team/';
    el.innerHTML = '<h2>Team chat</h2><div class="tc-art" aria-hidden="true"></div><p class="tc-stats"></p><div class="tc-asks"></div><div class="tc-chips"></div><p class="tc-feed-h" hidden><b>Live now</b></p><ol class="tc-feed"></ol><p><a href="/team/">Open the team chat</a></p>';
    const art = el.querySelector('.tc-art'), stats = el.querySelector('.tc-stats'), asks = el.querySelector('.tc-asks'), chips = el.querySelector('.tc-chips'), feed = el.querySelector('.tc-feed');
    fetch('/api/team').then((r) => r.json()).then((j) => {
      const t = teamLines(j);
      const dots = t.builders.map((m) => '<span title="' + esc(m.name) + '" style="display:inline-block;width:14px;height:14px;border-radius:50%;margin:2px;background:' + (m.state === 'busy' ? '#9eb2ff' : '#3a4158') + '"></span>').join('');
      if (art) art.innerHTML = '<div style="min-height:72px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">' + (dots || '<span style="opacity:.7">No builder has joined</span>') + '</div>';
      if (stats) stats.textContent = statsLine(t).replace(/^./, (c) => c.toUpperCase());
      if (asks) asks.innerHTML = t.asks.length ? '<p><b>Owner asks</b></p>' + t.asks.map((a) => '<div>' + esc(a.state) + ' · ' + esc(a.title) + '</div>').join('') : '';
      if (chips) chips.innerHTML = t.builders.length ? '<ul style="margin:6px 0;padding-left:18px">' + t.builders.map((m) => '<li>' + esc(builderLine(m)) + '</li>').join('') + '</ul>' : '';
      const fh = el.querySelector('.tc-feed-h'); if (fh) fh.hidden = !t.feed.length;
      if (feed) for (const f of t.feed) { const li = document.createElement('li'); const a = document.createElement('a'); a.href = f.href || '/team/'; a.textContent = f.text; li.append(a); feed.append(li); }
      const box = el.closest && el.closest('.vc') && el.closest('.vc').querySelector('.vc-art');
      if (box) box.replaceChildren(...[...art.childNodes].map((n) => n.cloneNode(true)));
    }).catch(() => { if (stats) stats.textContent = 'The team chat did not answer just now.'; });
  });
  return 'team-chat';
}

export default {
  name: 'team-chat',
  examples: ['team chat', 'open the team chat', 'agent workspace', 'my agents', 'chat with my agents'],
  nearMisses: ['chat', 'team building ideas'],
  match(lower) { return WHEN.test(lower.trim()); },
  run,
};

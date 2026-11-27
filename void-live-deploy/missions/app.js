// Draws /missions/ from lib/missions.js. Nothing is fetched. Nothing is sent.
import { LEAVE_KEY, openTrack, readProgress, returnedId, signalsOf, viewOf, writeProgress, leaveOf } from '/lib/missions.js';

const $ = (id) => document.getElementById(id);

function evidence(now) {
  let leave = null;
  try { leave = leaveOf(sessionStorage.getItem(LEAVE_KEY)); } catch (_) {}
  const nav = (performance.getEntriesByType && performance.getEntriesByType('navigation')[0] || {}).type || '';
  return { signals: signalsOf(localStorage), returned: returnedId(document.referrer, nav, leave, now) };
}

function stepEl(m) {
  const li = document.createElement('li');
  li.className = 'vs-card' + (m.done ? ' done' : '') + (m.next ? ' next' : '');
  const tick = document.createElement('span');
  tick.className = 'tick';
  tick.textContent = m.done ? '✓' : String(m.n);
  tick.setAttribute('aria-label', m.done ? 'Done' : 'Step ' + m.n);
  const h = document.createElement('h2');
  h.textContent = m.title;
  const p = document.createElement('p');
  p.textContent = m.step;
  li.append(tick, h, p);
  if (!m.done) {
    const a = document.createElement('a');
    a.href = m.href;
    a.textContent = m.action;
    a.addEventListener('click', () => { try { sessionStorage.setItem(LEAVE_KEY, JSON.stringify({ id: m.id, at: Date.now() })); } catch (_) {} });
    li.append(a);
  }
  return li;
}

function paint() {
  const now = Date.now();
  const opened = openTrack(readProgress(localStorage), evidence(now), now);
  writeProgress(localStorage, opened.progress);
  const view = viewOf(opened, now);
  $('greet').textContent = view.greet;
  $('badge').textContent = view.badge || 'None';
  $('streak').textContent = String(view.streak);
  const most = $('most');
  most.hidden = !view.most;
  most.textContent = view.most;
  const list = $('track');
  list.replaceChildren();
  for (const step of view.steps) list.append(stepEl(step));
}

addEventListener('pageshow', paint);

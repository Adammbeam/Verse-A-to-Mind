import { mountRelated } from '/lib/toolkit.js';

const $ = (id) => document.getElementById(id);
const WORD = { found: 'Found', missing: 'Not found', unchecked: "Couldn't check" };
const ORDER = { found: 0, missing: 1, unchecked: 2 };

function safeProfile(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.username || u.password) return '';
    if (u.port && u.port !== '443') return '';
    return u.href;
  } catch (_) { return ''; }
}

function paint(sites) {
  const list = [...(sites || [])].sort((a, b) => (ORDER[a.result] ?? 9) - (ORDER[b.result] ?? 9));
  const ul = $('sites');
  ul.replaceChildren(...list.map((site) => {
    const li = document.createElement('li');
    li.dataset.result = WORD[site.result] ? site.result : 'unchecked';
    const href = safeProfile(site.url);
    const name = document.createElement(href ? 'a' : 'span');
    name.textContent = site.name || 'Site';
    if (href) { name.href = href; name.rel = 'noopener noreferrer'; name.target = '_blank'; }
    const st = document.createElement('span');
    st.className = 'st';
    st.textContent = WORD[site.result] || WORD.unchecked;
    li.append(name, st);
    return li;
  }));
}

function tally(data) {
  const found = data.found || 0, missing = data.missing || 0, unchecked = data.unchecked || 0;
  return 'Found on ' + found + (found === 1 ? ' site. ' : ' sites. ')
    + 'Not found on ' + missing + ". Couldn't check " + unchecked + '.';
}

async function run(name) {
  const say = $('say'), go = $('go');
  say.textContent = 'Asking the list…';
  go.disabled = true;
  $('sites').replaceChildren();
  try {
    const res = await fetch('/api/username?name=' + encodeURIComponent(name), { headers: { accept: 'application/json' } });
    const data = await res.json();
    if (!res.ok || !data.ok) { say.textContent = data.say || 'That name could not be checked.'; return; }
    const next = location.pathname + '?name=' + encodeURIComponent(data.name || name);
    try { history.replaceState(null, '', next); } catch (_) { /* the result is on the page either way */ }
    say.textContent = tally(data);
    paint(data.sites);
  } catch (_) {
    say.textContent = 'Verse could not finish the check. Try again in a moment.';
  } finally {
    go.disabled = false;
  }
}

$('find').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('name').value.trim();
  if (!name) { $('say').textContent = 'Type a public name first.'; return; }
  run(name);
});

const preset = new URLSearchParams(location.search).get('name');
if (preset) { $('name').value = preset; run(preset.trim()); }

mountRelated(document.getElementById('related'), '/username/');

// The scorecard on /security/check/. The words come from the server. Nothing is written into the page as HTML.
import { ITEMS } from '/lib/security-check.js';

const STATE = { pass: 'In place', warn: 'Weak', fail: 'Missing' };

function add(parent, tag, text) {
  const el = document.createElement(tag);
  el.textContent = text;
  parent.append(el);
  return el;
}

function glossary() {
  const root = document.getElementById('glossary');
  if (!root) return;
  for (const item of ITEMS) {
    const wrap = document.createElement('section');
    add(wrap, 'h3', item.name);
    add(wrap, 'p', item.means);
    const fix = add(wrap, 'p', 'How to fix it: ' + item.fix);
    fix.className = 'note';
    root.append(wrap);
  }
}

function render(card) {
  const out = document.getElementById('out');
  const summary = document.getElementById('summary');
  const list = document.getElementById('items');
  out.hidden = false;
  summary.textContent = card.host + ': ' + card.summary;
  list.replaceChildren();
  for (const item of card.items || []) {
    const li = document.createElement('li');
    li.dataset.state = item.state || 'fail';
    add(li, 'h3', item.name + ': ' + (STATE[item.state] || 'Missing'));
    if (item.detail) add(li, 'p', item.detail);
    if (item.means) add(li, 'p', item.means);
    if (item.state !== 'pass' && item.fix) {
      const fix = add(li, 'p', 'How to fix it: ' + item.fix);
      fix.className = 'note';
    }
    list.append(li);
  }
}

async function run(host) {
  const status = document.getElementById('status');
  const button = document.getElementById('go');
  status.textContent = 'Checking ' + host + '…';
  button.disabled = true;
  try {
    const res = await fetch('/api/security-check?host=' + encodeURIComponent(host), { headers: { accept: 'application/json' } });
    const data = await res.json();
    if (!data || !data.ok || !data.card) {
      status.textContent = (data && data.why) || 'The check did not answer.';
      document.getElementById('out').hidden = true;
      return;
    }
    status.textContent = '';
    render(data.card);
  } catch (_) {
    status.textContent = 'The check did not answer just now.';
    document.getElementById('out').hidden = true;
  } finally {
    button.disabled = false;
  }
}

glossary();
document.getElementById('form').addEventListener('submit', (e) => {
  e.preventDefault();
  const host = document.getElementById('host').value.trim();
  if (!host) return;
  const url = new URL(location.href);
  url.searchParams.set('host', host);
  try { history.replaceState(null, '', url.pathname + url.search); } catch (_) {}
  run(host);
});

const preset = new URLSearchParams(location.search).get('host');
if (preset) {
  document.getElementById('host').value = preset;
  run(preset.trim());
}

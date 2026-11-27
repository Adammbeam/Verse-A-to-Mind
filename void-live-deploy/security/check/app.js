// The scorecard on /security/check/. Words come from the server. Nothing is written into the page as HTML.
const STATE = { pass: 'In place', warn: 'Weak', fail: 'Missing' };
const add = (parent, tag, text, cls) => { const el = document.createElement(tag); el.textContent = text; if (cls) el.className = cls; parent.append(el); return el; };
function render(card) {
  const out = document.getElementById('out'), list = document.getElementById('items');
  out.hidden = false;
  document.getElementById('summary').textContent = card.host + ': ' + card.summary;
  list.replaceChildren();
  for (const item of card.items || []) {
    const li = document.createElement('li');
    li.dataset.state = item.state || 'fail';
    add(li, 'h3', item.name + ': ' + (STATE[item.state] || 'Missing'));
    if (item.detail) add(li, 'p', item.detail);
    if (item.means) add(li, 'p', item.means);
    if (item.state !== 'pass' && item.fix) add(li, 'p', 'How to fix it: ' + item.fix, 'note');
    list.append(li);
  }
}
async function run(host) {
  const status = document.getElementById('status'), button = document.getElementById('go');
  status.textContent = 'Checking ' + host + '…';
  button.disabled = true;
  try {
    const res = await fetch('/api/security-check?host=' + encodeURIComponent(host), { headers: { accept: 'application/json' } });
    const data = await res.json();
    if (!data || !data.ok || !data.card) { status.textContent = (data && data.why) || 'The check did not answer.'; document.getElementById('out').hidden = true; return; }
    status.textContent = '';
    render(data.card);
  } catch (_) { status.textContent = 'The check did not answer just now.'; document.getElementById('out').hidden = true; }
  finally { button.disabled = false; }
}
document.getElementById('form').addEventListener('submit', (e) => {
  e.preventDefault();
  const host = document.getElementById('host').value.trim();
  if (!host) return;
  const url = new URL(location.href); url.searchParams.set('host', host);
  try { history.replaceState(null, '', url.pathname + url.search); } catch (_) {}
  run(host);
});
const preset = new URLSearchParams(location.search).get('host');
if (preset) { document.getElementById('host').value = preset; run(preset.trim()); }

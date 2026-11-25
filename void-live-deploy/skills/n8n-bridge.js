/**
 * n8n-bridge skill - fire a command at a local n8n webhook and report back.
 * Contract: { name, examples, nearMisses, match(lower, text), run(text, api) }
 * "automate: restart server", "n8n: scrape prices", "automate: move files".
 */
const ENDPOINT = 'http://127.0.0.1:5678/webhook/verse-action';

function extract(text) {
  const m = String(text || '').trim().match(/^(?:automate|n8n)\s*:\s*(.+)$/i);
  return m ? m[1].trim() : '';
}

export function n8nOf(text) {
  return /^(?:automate|n8n)\s*:/i.test(String(text || '').trim()) ? { action: extract(text) } : null;
}

async function run(text, api) {
  const { showPage, esc } = api;
  const action = extract(text);
  const el = showPage((p) => { p.innerHTML = '<h2>n8n bridge</h2><div class="sub">sending…</div>'; });
  try {
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, source: 'verse', timestamp: Date.now() })
    });
    if (!r.ok) throw new Error('n8n answered ' + r.status);
    let j = null; try { j = await r.json(); } catch (_) { j = null; }
    if (!api._pageStill(el)) return 'n8n-bridge';
    el.innerHTML = '<h2>n8n bridge</h2>'
      + '<div class="sub">sent · ' + esc(action) + '</div>'
      + (j ? '<pre>' + esc(JSON.stringify(j, null, 2)) + '</pre>' : '<p>Automation queued.</p>');
    api.say('n8n · sent ' + (action || 'command'));
    return 'n8n-bridge';
  } catch (_) {
    if (!api._pageStill(el)) return 'none';
    el.innerHTML = '<h2>n8n bridge</h2><p>Automation engine offline. Start n8n to execute.</p>';
    return 'none';
  }
}

export default {
  name: 'n8n-bridge',
  examples: ['automate: restart server', 'n8n: scrape prices', 'automate: move files', 'n8n: backup db'],
  nearMisses: ['automate my life', 'n8n tutorial', 'automation', 'webhook', 'how to use n8n'],
  match(lower, text) { return n8nOf(text) !== null; },
  run
};

export function flowAsk(text) {
  const raw = String(text || '').trim();
  const t = raw.toLowerCase().replace(/[?!.]+$/, '').replace(/\s+/g, ' ');
  if (!t || t.length > 220) return null;
  if (/^(?:who|what|why|how|when|where|define|explain)\b/.test(t)) return null;
  if (/\b(?:map|diagram|draw)\s+(?:out\s+)?(?:my|the)\s+tasks?\b/.test(t)) return null;
  if (!/\bflow\s*chart\b/.test(t)) return null;

  const afterColon = raw.match(/flow\s*chart\s*(?:for|of|:|-)?\s*(.+)$/i);
  const body = afterColon ? afterColon[1].trim() : '';
  if (body && /(?:->|=>|→|-->)/.test(body)) return { spec: body };
  if (body && body.length > 2 && !/^(?:please|for me|builder|maker|tool)$/.test(body.toLowerCase())) {
    const label = body.replace(/^(?:a|an|the)\s+/i, '').slice(0, 32);
    return { spec: `${label} Start -> Check -> Approve -> Done` };
  }
  return { spec: 'Start -> Draft -> Review -> Ship' };
}

export function parseFlow(spec) {
  const edges = [];
  const nodes = [];
  const seen = new Set();
  const addNode = (n) => {
    const label = n.trim().slice(0, 28);
    if (!label) return '';
    if (!seen.has(label)) { seen.add(label); nodes.push(label); }
    return label;
  };

  for (const line of String(spec || '').split(/[,;\n]/)) {
    const parts = line.split(/\s*(?:->|=>|→|-->)\s*/).map((s) => s.trim()).filter(Boolean);
    for (let i = 0; i < parts.length; i++) addNode(parts[i]);
    for (let i = 0; i + 1 < parts.length; i++) {
      const a = addNode(parts[i]), b = addNode(parts[i + 1]);
      if (a && b && a !== b) edges.push([a, b]);
    }
  }
  return { nodes, edges };
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function renderSvg({ nodes, edges }) {
  if (!nodes.length) return '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="60"></svg>';
  const cols = Math.min(2, Math.max(1, nodes.length > 4 ? 2 : 1));
  const bw = 156, bh = 36, gx = 36, gy = 26, pad = 16;
  const pos = new Map();
  nodes.forEach((n, i) => {
    const col = cols === 1 ? 0 : i % 2;
    const row = cols === 1 ? i : Math.floor(i / 2);
    pos.set(n, { x: pad + col * (bw + gx), y: pad + row * (bh + gy) });
  });
  const W = pad * 2 + cols * bw + (cols - 1) * gx;
  const rows = Math.ceil(nodes.length / cols);
  const H = pad * 2 + rows * bh + Math.max(0, rows - 1) * gy;

  const lines = edges.map(([a, b]) => {
    const p1 = pos.get(a), p2 = pos.get(b);
    if (!p1 || !p2) return '';
    const x1 = p1.x + bw / 2, y1 = p1.y + bh / 2;
    const x2 = p2.x + bw / 2, y2 = p2.y + bh / 2;
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#7aa2ff" stroke-width="2" marker-end="url(#fc-arrow)"/>`;
  }).join('');

  const boxes = nodes.map((n) => {
    const p = pos.get(n);
    const isDecision = /\?$/.test(n);
    const fill = isDecision ? '#2c2548' : '#1b2238';
    const stroke = isDecision ? '#b388ff' : '#7aa2ff';
    return `<g><rect x="${p.x}" y="${p.y}" width="${bw}" height="${bh}" rx="${isDecision ? 16 : 8}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`
      + `<text x="${p.x + bw / 2}" y="${p.y + bh / 2 + 4}" text-anchor="middle" fill="#eef2ff" font-family="system-ui,sans-serif" font-size="12">${esc(n)}</text></g>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="max-width:100%;height:auto;display:block">`
    + `<defs><marker id="fc-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1 L 10 5 L 0 9 z" fill="#7aa2ff"/></marker></defs>`
    + lines + boxes + `</svg>`;
}

function run(text, api) {
  const q = flowAsk(text);
  if (!q) return 'none';

  const el = api.showPage((p) => {
    p.innerHTML = '<h2>Flowchart</h2>' // void-review: ok
      + '<div style="margin:8px 0"><input id="fc-in" type="text" value="' + esc(q.spec) + '" aria-label="Flowchart steps" style="width:100%;box-sizing:border-box;padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:inherit;font:13px ui-monospace,monospace"></div>'
      + '<div id="fc-svg" style="padding:8px;border-radius:10px;background:rgba(255,255,255,.04);overflow:auto"></div>'
      + '<div style="margin-top:8px"><button id="fc-dl" type="button" style="padding:5px 12px;border-radius:999px;border:1px solid rgba(255,255,255,.24);background:transparent;color:inherit;cursor:pointer;font-size:13px">Download SVG</button></div>'
      + '<div class="src">Live SVG flowchart · separate steps with -> and branches with commas</div>';
  });

  const inp = el && el.querySelector && el.querySelector('#fc-in');
  const box = el && el.querySelector && el.querySelector('#fc-svg');
  const dl = el && el.querySelector && el.querySelector('#fc-dl');
  if (!inp || !box) return 'flowchart';

  let latestSvg = '';
  const paint = () => {
    latestSvg = renderSvg(parseFlow(inp.value));
    box.innerHTML = latestSvg; // void-review: ok, renderSvg escapes every node label via esc()
  };

  inp.addEventListener('input', paint);
  if (dl) {
    dl.addEventListener('click', () => {
      try {
        const blob = new Blob([latestSvg], { type: 'image/svg+xml' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'flowchart.svg';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      } catch (err) {
        console.warn('flowchart SVG download failed:', err);
      }
    });
  }

  paint();
  return 'flowchart';
}

export default {
  name: 'flowchart',
  examples: ['make a flowchart', 'flowchart: Start -> Review -> Ship', 'draw a flowchart for onboarding'],
  nearMisses: ['what is a flowchart', 'map my tasks a -> b, b -> c', 'flow canvas'],
  match(lower, text) { return !!flowAsk(text || lower); },
  run,
};

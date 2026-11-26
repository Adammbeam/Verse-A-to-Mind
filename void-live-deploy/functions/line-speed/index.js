// a-to-mind.com/line-speed/ (team-2886): measure download, upload, latency and jitter against Verse's own edge.
// Supports both live client-side probes (?probe=ping|down|up) and plain HTML form submission with scripts off (POST /line-speed/).
// Nothing is stored; every probe answers with Cache-Control: no-store.

export const MIN_BYTES = 16384;
export const DEFAULT_BYTES = 262144;
export const MAX_BYTES = 4 * 1024 * 1024;

export function clampBytes(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return DEFAULT_BYTES;
  return Math.max(MIN_BYTES, Math.min(MAX_BYTES, Math.round(v)));
}

/** Megabits per second from byte count and elapsed milliseconds. Pure. */
export function formatMbps(bytes, ms) {
  if (!(bytes > 0) || !(ms > 0)) return 0;
  return Math.round(((bytes * 8) / (ms / 1000) / 1e6) * 100) / 100;
}

/** Median of a numeric array. Pure. */
export function median(nums) {
  const arr = (nums || []).filter((n) => Number.isFinite(n)).slice().sort((a, b) => a - b);
  if (!arr.length) return 0;
  const mid = Math.floor(arr.length / 2);
  return Math.round((arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2) * 10) / 10;
}

/** Mean absolute difference between consecutive samples (jitter in ms). Pure. */
export function jitter(nums) {
  const arr = (nums || []).filter((n) => Number.isFinite(n));
  if (arr.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < arr.length; i++) sum += Math.abs(arr[i] - arr[i - 1]);
  return Math.round((sum / (arr.length - 1)) * 10) / 10;
}

/** Plain-English summary of line speed and latency. Pure. */
export function gradeLine(downMbps, pingMs) {
  if (downMbps >= 100 && pingMs <= 40) return 'Very fast — ready for 4K streaming, large downloads and low-latency calls.';
  if (downMbps >= 25 && pingMs <= 80) return 'Fast — comfortable for HD/4K video, video calls and browsing.';
  if (downMbps >= 5) return 'Usable — fine for browsing, audio and standard video.';
  return 'Slow — expect buffering on video or large downloads.';
}

const esc = (x) => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const NO_STORE = { 'cache-control': 'no-store, private' };

function cfMeta(request) {
  const cf = (request && request.cf) || {};
  return {
    colo: String(cf.colo || 'edge'),
    httpProtocol: String(cf.httpProtocol || 'HTTP'),
    tlsVersion: String(cf.tlsVersion || ''),
    asOrganization: String(cf.asOrganization || ''),
    country: String(cf.country || ''),
  };
}

/** Full dark-stage HTML answer for scripts-off form submission. Pure. */
export function renderResultHtml({ bytes, serverMs, colo, httpProtocol, tlsVersion, asOrganization, country }) {
  const kb = Math.round(bytes / 1024);
  const netLine = [asOrganization, country].filter(Boolean).join(' · ');
  return `<!doctype html>
<html lang="en" class="vs-tool"><link rel="stylesheet" href="/verse.css" media="screen">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Line speed check result · Verse</title>
<style>
  :root { color-scheme: dark; --bg: #0b0a10; --ink: #ecebf5; --soft: #a3a0b3; --line: #2c2938; --accent: #a58bff; --good: #5fd08e; }
  html, body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.5 system-ui, -apple-system, sans-serif; }
  main { max-width: 760px; margin: 0 auto; padding: 24px 16px 48px; }
  .card { border: 1px solid var(--line); border-radius: 14px; padding: 18px; background: #12101a; margin: 16px 0; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 12px 0; }
  .stat { border: 1px solid var(--line); border-radius: 10px; padding: 12px; background: #0e0d15; }
  .stat .k { font-size: 12px; color: var(--soft); text-transform: uppercase; letter-spacing: .04em; }
  .stat .v { font-size: 22px; font-weight: 600; margin-top: 4px; color: var(--good); }
  button, a.btn { display: inline-block; background: var(--accent); color: #0b0a10; border: 0; border-radius: 10px; padding: 10px 16px; font: 600 15px/1.2 inherit; cursor: pointer; text-decoration: none; }
  nav#related { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--line); font-size: 14px; }
  nav#related a { color: var(--accent); text-decoration: none; }
</style>
</head>
<body>
<main>
  <h1>Line speed check</h1>
  <p style="color:var(--soft)">Server-side check complete (works with scripts off).</p>
  <section class="card" aria-live="polite">
    <div class="grid">
      <div class="stat"><div class="k">Edge server</div><div class="v">${esc(colo)}</div></div>
      <div class="stat"><div class="k">Protocol</div><div class="v">${esc(httpProtocol)}</div></div>
      <div class="stat"><div class="k">Server probe</div><div class="v">${esc(serverMs)} ms</div></div>
      <div class="stat"><div class="k">Payload ready</div><div class="v">${esc(kb)} KB</div></div>
    </div>
    ${netLine ? '<p style="color:var(--soft)">Network: ' + esc(netLine) + (tlsVersion ? ' · ' + esc(tlsVersion) : '') + '</p>' : ''}
    <p>Your line reached Verse&rsquo;s <strong>${esc(colo)}</strong> edge over <strong>${esc(httpProtocol)}</strong>. To measure raw download throughput without scripts, save the timed probe file below, or turn scripts on for live Mbps, upload, latency and jitter.</p>
    <p><a class="btn" href="/line-speed/?probe=down&amp;bytes=${esc(bytes)}">Download ${esc(kb)} KB test payload</a></p>
  </section>
  <form method="post" action="/line-speed/">
    <input type="hidden" name="bytes" value="${esc(bytes)}">
    <button type="submit">Run check again</button>
    <a href="/line-speed/" style="margin-left:12px;color:var(--accent)">Back to Line speed</a>
  </form>
  <nav id="related" aria-label="Use with">
    <span style="color:var(--soft)">Use with</span>
    <a href="/ip/">Your IP</a>
    <a href="/time/">World clock</a>
    <a href="/stopwatch/">Stopwatch</a>
    <a href="/converter/">Unit converter</a>
    <a href="/tools/">All tools</a>
    <a href="/">Ask Verse anything</a>
  </nav>
</main>
<script type="module" src="/verse-shell.js"></script>
</body>
</html>`;
}

export async function onRequestGet({ request, next }) {
  const url = new URL(request.url);
  const probe = url.searchParams.get('probe');
  if (probe === 'ping') {
    return Response.json({ ok: true, at: Date.now(), ...cfMeta(request) }, { headers: NO_STORE });
  }
  if (probe === 'down') {
    const bytes = clampBytes(url.searchParams.get('bytes'));
    const buf = new Uint8Array(bytes);
    // Deterministic non-compressible-ish byte pattern so proxies don't trivially collapse it
    for (let i = 0; i < bytes; i++) buf[i] = (i * 31 + 17) & 255;
    return new Response(buf, {
      status: 200,
      headers: {
        'content-type': 'application/octet-stream',
        'content-length': String(bytes),
        'content-disposition': 'attachment; filename="verse-line-speed.bin"',
        ...NO_STORE,
      },
    });
  }
  return next();
}

export async function onRequestPost({ request }) {
  const url = new URL(request.url);
  const probe = url.searchParams.get('probe');
  const meta = cfMeta(request);
  const t0 = Date.now();
  if (probe === 'up') {
    const ab = await request.arrayBuffer();
    const ms = Math.max(1, Date.now() - t0);
    return Response.json({ ok: true, bytes: ab.byteLength, ms, ...meta }, { headers: NO_STORE });
  }
  let bytes = DEFAULT_BYTES;
  try {
    const ct = String(request.headers.get('content-type') || '');
    if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
      const fd = await request.formData();
      bytes = clampBytes(fd.get('bytes'));
    }
  } catch (_) {}
  const serverMs = Math.max(1, Date.now() - t0);
  return new Response(renderResultHtml({ bytes, serverMs, ...meta }), {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', ...NO_STORE },
  });
}

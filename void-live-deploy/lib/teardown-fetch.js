/**
 * Verse Teardown fetcher. https only. Local, private and metadata hosts,
 * credentials and ports other than 80 and 443 are refused. robots.txt is
 * honoured. At most 20 same-origin pages, one a second, 500 KB, 8 seconds.
 * env.BROWSER (Browser Rendering) when bound, otherwise fetch.
 * Tests: tools/teardown-fetch.test.mjs.
 */
export const TEARDOWN_FETCH = Object.freeze({
  USER_AGENT: 'VerseTeardown/1 (+https://a-to-mind.com/credits/)',
  MAX_PAGES: 20, MAX_BYTES: 500 * 1024, TIMEOUT_MS: 8000, GAP_MS: 1000,
});
const BLOCKED = new Set(['localhost', 'localhost.localdomain', 'metadata', 'metadata.google.internal', 'metadata.google.com']);

function ipv4Private(host) {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return null;
  const p = host.split('.').map((x) => (/^0\d/.test(x) ? -1 : Number(x)));
  if (p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

/** True for localhost, private ranges, link-local, metadata and internal names. */
export function privateHost(host) {
  const h = String(host || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!h || BLOCKED.has(h) || /\.(?:localhost|local|internal)$/.test(h) || /^\d+$/.test(h)) return true;
  if (h.includes(':')) {
    if (h === '::' || h === '::1' || /^(?:fe80:|fc|fd)/.test(h)) return true;
    const mapped = /::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(h);
    return mapped ? ipv4Private(mapped[1]) !== false : false;
  }
  return ipv4Private(h) === true;
}

/** Plain reason to refuse a URL, or '' when it may be fetched. */
export function refusePublicUrl(input) {
  let u;
  try { u = new URL(String(input)); } catch { return 'The URL is not a valid address.'; }
  if (u.protocol !== 'https:') return 'Only https is fetched.';
  if (u.username || u.password) return 'That URL carries a username or password.';
  if (u.port && u.port !== '443' && u.port !== '80') return 'Only ports 80 and 443 are fetched.';
  if (privateHost(u.hostname)) return 'That host is local, private, or internal.';
  return '';
}

function ruleMatch(rule, path) {
  if (!rule || rule.length > 200) return false;
  const end = rule.endsWith('$'), body = end ? rule.slice(0, -1) : rule;
  const re = new RegExp('^' + body.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + (end ? '$' : ''));
  return re.test(path);
}

/** Whether robots.txt allows path for this agent. Longest matching rule wins. */
export function robotsAllows(text, path, agent = 'VerseTeardown') {
  const groups = [];
  let cur = null;
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(raw.replace(/#.*$/, '').trim());
    if (!m) continue;
    const key = m[1].toLowerCase(), val = m[2].trim();
    if (key === 'user-agent') {
      if (!cur || cur.started) { cur = { agents: [], rules: [], started: false }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
    } else if ((key === 'allow' || key === 'disallow') && cur) {
      cur.started = true;
      if (val) cur.rules.push({ allow: key === 'allow', path: val });
    }
  }
  const name = String(agent || '').toLowerCase();
  const hit = groups.filter((g) => g.agents.includes(name));
  const rules = (hit.length ? hit : groups.filter((g) => g.agents.includes('*'))).flatMap((g) => g.rules);
  const target = path.startsWith('/') ? path : '/' + path;
  let best = null;
  for (const rule of rules) {
    if (!ruleMatch(rule.path, target)) continue;
    if (!best || rule.path.length > best.path.length || (rule.path.length === best.path.length && rule.allow && !best.allow)) best = rule;
  }
  return !best || best.allow;
}

const cleanPath = (pathname) => {
  const p = pathname && pathname.startsWith('/') ? pathname : '/' + (pathname || '');
  return p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p;
};

async function defaultLookup(host) {
  const dns = await import('node:dns');
  return (await dns.promises.lookup(host, { all: true, verbatim: true })).map((r) => r.address);
}

async function namesPrivate(host, cache, lookup) {
  if (privateHost(host)) return true;
  if (cache.has(host)) return cache.get(host);
  let bad = false;
  try {
    const rows = await lookup(host);
    bad = (Array.isArray(rows) ? rows : [rows]).some((a) => privateHost(typeof a === 'string' ? a : a && a.address));
  } catch { bad = false; }
  cache.set(host, bad);
  return bad;
}

async function textOf(res, max) {
  const text = res && typeof res.text === 'function' ? String(await res.text()) : String((res && res.body) || '');
  return text.length > max ? text.slice(0, max) : text;
}

const hopFail = (e) => (e && (e.name === 'TimeoutError' || e.name === 'AbortError') ? 'The request timed out.' : 'The page could not be fetched.');

async function readUrl(url, ctx) {
  await ctx.pace();
  let current = url;
  for (let hop = 0; hop < 2; hop++) {
    const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(TEARDOWN_FETCH.TIMEOUT_MS) : undefined;
    const res = await ctx.fetchFn(current, {
      method: 'GET', redirect: 'manual', signal,
      headers: { 'User-Agent': TEARDOWN_FETCH.USER_AGENT, Accept: 'text/html, */*;q=0.1' },
    });
    const status = res.status || 200;
    const headers = res.headers;
    const loc = headers && (typeof headers.get === 'function' ? headers.get('location') : (headers.location || headers.Location));
    if (!(status >= 300 && status < 400 && hop === 0)) return { status, body: await textOf(res, TEARDOWN_FETCH.MAX_BYTES) };
    if (!loc) return { status, body: '' };
    let next;
    try { next = new URL(loc, current); } catch { return { error: 'The redirect is not a valid address.' }; }
    const why = refusePublicUrl(next.href);
    if (why) return { error: why };
    if (next.origin !== new URL(current).origin) return { error: 'The redirect left this site.' };
    if (await namesPrivate(next.hostname, ctx.cache, ctx.lookup)) return { error: 'That host is local, private, or internal.' };
    current = next.href;
    await ctx.pace();
  }
  return { error: 'Too many redirects.' };
}

async function launchOf(binding) {
  if (binding && typeof binding.launch === 'function') return binding.launch();
  // Optional package: loaded only when a raw Browser Rendering binding has no launcher of its own.
  let mod = null;
  try { mod = await import('@cloudflare/puppeteer'); } catch { mod = null; }
  const pup = mod && (mod.default || mod);
  if (!pup || typeof pup.launch !== 'function') throw new Error('no launcher');
  return pup.launch(binding);
}

async function renderPage(browser, url) {
  const page = await browser.newPage();
  try {
    if (typeof page.setUserAgent === 'function') await page.setUserAgent(TEARDOWN_FETCH.USER_AGENT);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TEARDOWN_FETCH.TIMEOUT_MS });
    const html = String(await page.content() || '');
    return html.length > TEARDOWN_FETCH.MAX_BYTES ? html.slice(0, TEARDOWN_FETCH.MAX_BYTES) : html;
  } finally { if (page && page.close) await page.close(); }
}

function linksOf(html, pageUrl) {
  const origin = new URL(pageUrl).origin, out = [];
  const re = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  for (const m of String(html || '').matchAll(re)) {
    const href = (m[1] ?? m[2] ?? m[3] ?? '').trim();
    if (!href || /^(?:javascript|data|mailto|tel):/i.test(href)) continue;
    let u;
    try { u = new URL(href, pageUrl); } catch { continue; }
    if (u.origin !== origin || refusePublicUrl(u.href)) continue;
    const path = cleanPath(u.pathname);
    if (!out.includes(path)) out.push(path);
  }
  return out;
}

const denied = (reason) => ({ ok: false, reason, agent: TEARDOWN_FETCH.USER_AGENT, pages: [], skipped: [] });

/** Crawl one public origin. opts: fetchFn, sleep, lookup, env.BROWSER. */
export async function fetchPublic(startUrl, opts = {}) {
  const why = refusePublicUrl(startUrl);
  if (why) return denied(why);
  const lookup = opts.lookup || defaultLookup, cache = new Map(), start = new URL(startUrl);
  if (await namesPrivate(start.hostname, cache, lookup)) return denied('That host is local, private, or internal.');
  const fetchFn = opts.fetchFn || globalThis.fetch;
  const sleep = opts.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const browserBinding = opts.env && opts.env.BROWSER;
  let sent = 0;
  const pace = async () => { if (sent) await sleep(TEARDOWN_FETCH.GAP_MS); sent += 1; };
  const ctx = { fetchFn, pace, cache, lookup };
  let robots = '';
  try { robots = (await readUrl(start.origin + '/robots.txt', ctx)).body || ''; } catch { robots = ''; }
  const queue = [cleanPath(start.pathname)], seen = new Set(), pages = [], skipped = [];
  let browser = null;
  try {
    while (queue.length) {
      const path = queue.shift();
      if (seen.has(path)) continue;
      seen.add(path);
      if (!robotsAllows(robots, path)) { skipped.push({ path, reason: 'robots' }); continue; }
      if (pages.length >= TEARDOWN_FETCH.MAX_PAGES) { skipped.push({ path, reason: 'page cap' }); continue; }
      const pageUrl = start.origin + path;
      const bad = refusePublicUrl(pageUrl);
      if (bad) { skipped.push({ path, reason: bad }); continue; }
      let html = '', status = 200;
      try {
        if (browserBinding) {
          await pace();
          if (!browser) browser = await launchOf(browserBinding);
          html = await renderPage(browser, pageUrl);
        } else {
          const got = await readUrl(pageUrl, ctx);
          if (got.error) { skipped.push({ path, reason: got.error }); continue; }
          html = got.body; status = got.status;
        }
      } catch (e) { skipped.push({ path, reason: hopFail(e) }); continue; }
      pages.push({ url: pageUrl, path, status, html });
      for (const link of linksOf(html, pageUrl)) if (!seen.has(link) && !queue.includes(link)) queue.push(link);
    }
  } finally { if (browser && browser.close) await browser.close(); }
  return { ok: true, agent: TEARDOWN_FETCH.USER_AGENT, pages, skipped };
}

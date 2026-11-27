// Username finder: a fixed list of public profile addresses. The name is the only thing a visitor supplies.
// Every address is built from a template here. A name cannot change the host, the scheme, or the port.
// Pure except checkName(), which asks the caller’s fetch and nothing else. Tests: tools/username.test.mjs.

export const TIMEOUT_MS = 4000;
export const BODY_CAP = 48000;
export const UA = 'Verse/1.0 (+https://a-to-mind.com/username/)';
// letters, digits, and the marks public names actually use. One character is enough. No slash, space, or second scheme.
export const NAME = /^(?=.{1,39}$)[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;
// GitHub names are letters, digits and single hyphens. A dot or underscore is a different site’s shape, so it is not asked.
const GITHUB_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

/** the public name, or '' when it is not one. Pure. */
export function cleanName(raw) {
  const name = String(raw == null ? '' : raw).trim();
  if (!NAME.test(name) || name.includes('..')) return '';
  return name;
}

/**
 * One row of the allowlist. `page` is the link a person opens. `check` is what Verse fetches when that
 * address is not a clean 404 (a small public API). `fit` skips the fetch when the name cannot exist there.
 * `missingText` is a fixed phrase that page uses for a name it does not have (the status stays 200).
 */
export const SITES = Object.freeze([
  { id: 'github', name: 'GitHub', page: 'https://github.com/{name}', fit: GITHUB_NAME },
  { id: 'gitlab', name: 'GitLab', page: 'https://gitlab.com/{name}' },
  { id: 'codeberg', name: 'Codeberg', page: 'https://codeberg.org/{name}' },
  { id: 'bitbucket', name: 'Bitbucket', page: 'https://bitbucket.org/{name}/' },
  { id: 'npm', name: 'npm', page: 'https://www.npmjs.com/~{name}' },
  { id: 'pypi', name: 'PyPI', page: 'https://pypi.org/user/{name}/' },
  { id: 'rubygems', name: 'RubyGems', page: 'https://rubygems.org/profiles/{name}' },
  { id: 'crates', name: 'crates.io', page: 'https://crates.io/users/{name}' },
  { id: 'docker', name: 'Docker Hub', page: 'https://hub.docker.com/u/{name}', check: 'https://hub.docker.com/v2/users/{name}/' },
  { id: 'huggingface', name: 'Hugging Face', page: 'https://huggingface.co/{name}' },
  { id: 'devto', name: 'DEV', page: 'https://dev.to/{name}' },
  { id: 'keybase', name: 'Keybase', page: 'https://keybase.io/{name}' },
  { id: 'lichess', name: 'Lichess', page: 'https://lichess.org/@/{name}', check: 'https://lichess.org/api/user/{name}' },
  { id: 'chess', name: 'Chess.com', page: 'https://www.chess.com/member/{name}', check: 'https://api.chess.com/pub/player/{name}' },
  { id: 'scratch', name: 'Scratch', page: 'https://scratch.mit.edu/users/{name}', check: 'https://api.scratch.mit.edu/users/{name}' },
  { id: 'hn', name: 'Hacker News', page: 'https://news.ycombinator.com/user?id={name}', missingText: 'No such user.' },
  { id: 'lobsters', name: 'Lobsters', page: 'https://lobste.rs/u/{name}' },
  { id: 'osm', name: 'OpenStreetMap', page: 'https://www.openstreetmap.org/user/{name}' },
  { id: 'wikipedia', name: 'Wikipedia', page: 'https://en.wikipedia.org/wiki/User:{name}', missingText: 'Wikipedia does not have a user page' },
  { id: 'reddit', name: 'Reddit', page: 'https://old.reddit.com/user/{name}' },
  { id: 'launchpad', name: 'Launchpad', page: 'https://launchpad.net/~{name}', check: 'https://api.launchpad.net/1.0/~{name}' },
  { id: 'bluesky', name: 'Bluesky', page: 'https://bsky.app/profile/{name}.bsky.social', check: 'https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor={name}.bsky.social', miss: [400, 404] },
].map(Object.freeze));

/** fill {name} and keep the template’s host. '' when the name is not a public name, or the host would move. Pure. */
export function fill(template, name) {
  const clean = cleanName(name);
  const src = String(template || '');
  if (!clean || !src.includes('{name}')) return '';
  const href = src.split('{name}').join(encodeURIComponent(clean));
  let made, expect;
  try {
    made = new URL(href);
    expect = new URL(src.split('{name}').join('name'));
  } catch (_) { return ''; }
  if (made.protocol !== 'https:' || made.username || made.password || made.hostname !== expect.hostname) return '';
  if (made.port && made.port !== '443') return '';
  return made.href;
}

/** the link shown for a site, or ''. Pure. */
export const pageUrl = (site, name) => fill(site && site.page, name);
/** the address Verse fetches, or ''. Pure. */
export const checkTarget = (site, name) => fill((site && (site.check || site.page)) || '', name);

/** every host a template names, so a test can prove a fetch never left the list. Pure. */
export function hostsOf(sites = SITES) {
  const out = new Set();
  for (const site of sites) {
    for (const template of [site.page, site.check]) {
      if (!template) continue;
      try { out.add(new URL(template.split('{name}').join('name')).hostname); } catch (_) { /* a bad template adds nothing */ }
    }
  }
  return out;
}

/** where a redirect may go: the same https host, no userinfo, no other port. '' otherwise. Pure. */
export function sameHost(from, location) {
  if (!from || !location) return '';
  let base, next;
  try {
    base = new URL(from);
    next = new URL(location, base);
  } catch (_) { return ''; }
  if (next.protocol !== 'https:' || next.username || next.password || next.hostname !== base.hostname) return '';
  if (next.port && next.port !== '443') return '';
  if (next.href === base.href) return '';
  return next.href;
}

/** found, missing, or unchecked from a status and an optional page snippet. Pure. */
export function judge(site, status, body) {
  const code = Number(status) || 0;
  const text = String(body || '');
  if (site && site.missingText && text.includes(site.missingText)) return 'missing';
  const miss = (site && site.miss) || [404];
  if (miss.includes(code)) return 'missing';
  if (code >= 200 && code < 300) {
    if (site && site.missingText && !text) return 'unchecked';
    return 'found';
  }
  return 'unchecked';
}

const row = (site, url, result) => ({ id: site.id, name: site.name, url, result });

async function drop(res) {
  try { if (res && res.body && res.body.cancel) await res.body.cancel(); } catch (_) { /* already closed */ }
}

/** one GET, no automatic redirect. status 0 when the network fails. */
export async function probe(url, fetchFn) {
  let res;
  try {
    res = await fetchFn(url, {
      method: 'GET',
      redirect: 'manual',
      headers: { accept: 'text/html,application/json;q=0.9,*/*;q=0.8', 'user-agent': UA },
      signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(TIMEOUT_MS) : undefined,
    });
  } catch (_) {
    return { status: 0, location: '', res: null };
  }
  const status = Number(res && res.status) || 0;
  let location = '';
  try { location = (res && res.headers && res.headers.get && res.headers.get('location')) || ''; } catch (_) { location = ''; }
  return { status, location, res };
}

async function bodyOf(res) {
  if (!res || !res.text) return '';
  try { return String(await res.text()).slice(0, BODY_CAP); } catch (_) { return ''; }
}

/** one site: found, missing, or unchecked, and the public link. One same-host redirect at most. */
export async function checkOne(site, name, fetchFn) {
  const page = pageUrl(site, name);
  const target = checkTarget(site, name);
  if (!page || !target) return row(site, page || '', 'unchecked');
  if (site.fit && !site.fit.test(name)) return row(site, page, 'unchecked');
  let hop = await probe(target, fetchFn);
  let asked = target;
  if (hop.status >= 300 && hop.status < 400) {
    await drop(hop.res);
    const next = sameHost(asked, hop.location);
    if (!next) return row(site, page, 'unchecked');
    asked = next;
    hop = await probe(asked, fetchFn);
  }
  let body = '';
  if (site.missingText && hop.status >= 200 && hop.status < 300) body = await bodyOf(hop.res);
  else await drop(hop.res);
  return row(site, page, judge(site, hop.status, body));
}

/** every allowlisted site, in list order. fetchFn sees only addresses fill() built. */
export async function checkName(name, fetchFn) {
  const clean = cleanName(name);
  if (!clean || typeof fetchFn !== 'function') return [];
  return Promise.all(SITES.map((site) => checkOne(site, clean, fetchFn)));
}

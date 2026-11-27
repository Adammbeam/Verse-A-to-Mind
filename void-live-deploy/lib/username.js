// A public name checked against a fixed list of profile addresses. The name cannot change the host.
// Pure except checkName(), which uses the caller's fetch. Tests: tools/username.test.mjs.
export const TIMEOUT_MS = 4000;
const UA = 'Verse/1.0 (+https://a-to-mind.com/username/)';
export const NAME = /^(?=.{1,39}$)[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;
const GH = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const row = (id, name, page, check = '', miss = '', missingText = '', fit = null) => Object.freeze({ id, name, page, check, miss: miss ? miss.split(',').map(Number) : null, missingText, fit });
export const SITES = Object.freeze([
  row('github', 'GitHub', 'https://github.com/{name}', '', '', '', GH),
  row('gitlab', 'GitLab', 'https://gitlab.com/{name}'),
  row('codeberg', 'Codeberg', 'https://codeberg.org/{name}'),
  row('bitbucket', 'Bitbucket', 'https://bitbucket.org/{name}/'),
  row('npm', 'npm', 'https://www.npmjs.com/~{name}'),
  row('pypi', 'PyPI', 'https://pypi.org/user/{name}/'),
  row('rubygems', 'RubyGems', 'https://rubygems.org/profiles/{name}'),
  row('crates', 'crates.io', 'https://crates.io/users/{name}'),
  row('docker', 'Docker Hub', 'https://hub.docker.com/u/{name}', 'https://hub.docker.com/v2/users/{name}/'),
  row('huggingface', 'Hugging Face', 'https://huggingface.co/{name}'),
  row('devto', 'DEV', 'https://dev.to/{name}'),
  row('keybase', 'Keybase', 'https://keybase.io/{name}'),
  row('lichess', 'Lichess', 'https://lichess.org/@/{name}', 'https://lichess.org/api/user/{name}'),
  row('chess', 'Chess.com', 'https://www.chess.com/member/{name}', 'https://api.chess.com/pub/player/{name}'),
  row('scratch', 'Scratch', 'https://scratch.mit.edu/users/{name}', 'https://api.scratch.mit.edu/users/{name}'),
  row('hn', 'Hacker News', 'https://news.ycombinator.com/user?id={name}', '', '', 'No such user.'),
  row('lobsters', 'Lobsters', 'https://lobste.rs/u/{name}'),
  row('osm', 'OpenStreetMap', 'https://www.openstreetmap.org/user/{name}'),
  row('wikipedia', 'Wikipedia', 'https://en.wikipedia.org/wiki/User:{name}', '', '', 'Wikipedia does not have a user page'),
  row('reddit', 'Reddit', 'https://old.reddit.com/user/{name}'),
  row('launchpad', 'Launchpad', 'https://launchpad.net/~{name}', 'https://api.launchpad.net/1.0/~{name}'),
  row('bluesky', 'Bluesky', 'https://bsky.app/profile/{name}.bsky.social', 'https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor={name}.bsky.social', '400,404'),
]);

export function cleanName(raw) {
  const name = String(raw == null ? '' : raw).trim();
  return NAME.test(name) && !name.includes('..') ? name : '';
}
/** fill {name} and keep the template host. '' if the name is not public or the host would move. Pure. */
export function fill(template, name) {
  const clean = cleanName(name), src = String(template || '');
  if (!clean || !src.includes('{name}')) return '';
  let made, expect;
  try { made = new URL(src.split('{name}').join(encodeURIComponent(clean))); expect = new URL(src.split('{name}').join('name')); }
  catch (_) { return ''; }
  if (made.protocol !== 'https:' || made.username || made.password || made.hostname !== expect.hostname || (made.port && made.port !== '443')) return '';
  return made.href;
}
export const pageUrl = (site, name) => fill(site && site.page, name);
export const checkTarget = (site, name) => fill((site && (site.check || site.page)) || '', name);
export function hostsOf(sites = SITES) {
  const out = new Set();
  for (const site of sites) for (const template of [site.page, site.check]) {
    if (!template) continue;
    try { out.add(new URL(template.split('{name}').join('name')).hostname); } catch (_) { /* skip */ }
  }
  return out;
}
/** a redirect may stay only on the same https host. Pure. */
export function sameHost(from, location) {
  if (!from || !location) return '';
  try {
    const base = new URL(from), next = new URL(location, base);
    if (next.protocol !== 'https:' || next.username || next.password || next.hostname !== base.hostname || (next.port && next.port !== '443') || next.href === base.href) return '';
    return next.href;
  } catch (_) { return ''; }
}
export function judge(site, status, body) {
  const code = Number(status) || 0, text = String(body || '');
  if (site && site.missingText && text.includes(site.missingText)) return 'missing';
  if ((site && site.miss || [404]).includes(code)) return 'missing';
  if (code >= 200 && code < 300) return site && site.missingText && !text ? 'unchecked' : 'found';
  return 'unchecked';
}
async function drop(res) { try { if (res && res.body && res.body.cancel) await res.body.cancel(); } catch (_) { /* closed */ } }
async function probe(url, fetchFn) {
  try {
    const res = await fetchFn(url, { method: 'GET', redirect: 'manual', headers: { accept: 'text/html,application/json;q=0.9,*/*;q=0.8', 'user-agent': UA }, signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(TIMEOUT_MS) : undefined });
    const status = Number(res && res.status) || 0;
    let location = '';
    try { location = res.headers.get('location') || ''; } catch (_) { location = ''; }
    return { status, location, res };
  } catch (_) { return { status: 0, location: '', res: null }; }
}
export async function checkOne(site, name, fetchFn) {
  const page = pageUrl(site, name), target = checkTarget(site, name);
  const out = (result) => ({ id: site.id, name: site.name, url: page || '', result });
  if (!page || !target || (site.fit && !site.fit.test(name))) return out('unchecked');
  let hop = await probe(target, fetchFn);
  if (hop.status >= 300 && hop.status < 400) {
    await drop(hop.res);
    const next = sameHost(target, hop.location);
    if (!next) return out('unchecked');
    hop = await probe(next, fetchFn);
  }
  let body = '';
  if (site.missingText && hop.status >= 200 && hop.status < 300) { try { body = String(await hop.res.text()).slice(0, 48000); } catch (_) { body = ''; } }
  else await drop(hop.res);
  return out(judge(site, hop.status, body));
}
export async function checkName(name, fetchFn) {
  const clean = cleanName(name);
  return clean && typeof fetchFn === 'function' ? Promise.all(SITES.map((site) => checkOne(site, clean, fetchFn))) : [];
}

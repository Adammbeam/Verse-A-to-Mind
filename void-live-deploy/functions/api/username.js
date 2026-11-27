// GET /api/username?name=<public name>
// Verse asks a fixed list of public profile addresses (lib/username.js) and says found, missing, or unchecked.
//
// WHAT A STRANGER COULD MAKE THIS DO, AND WHY IT IS BOUNDED. This is an open GET. The most a caller can do is:
//   - send one public name of at most 39 letters, digits, dots, underscores or hyphens (anything else is refused, and
//     a url= parameter is ignored: the caller picks no host, path or header);
//   - make Verse fetch only the allowlist, each with a 4 second limit and at most one redirect, and only when that
//     redirect stays on the same https host;
//   - do that 6 times a minute from one address (rateLimited, its own bucket).
// Nothing is written down: no name, no address, no result. The reply is no-store.
import { rateLimited } from './answer.js';
import { jsonNoStore } from '../../lib/http.js';
import { cleanName, checkName } from '../../lib/username.js';

export const RL_MAX = 6;
const BAD = 'Use a public name: letters, digits, dots, underscores or hyphens, up to 39 characters, with no spaces.';
const LIMITED = 'That is a lot of names in a minute. Wait a moment and ask again.';

export async function onRequestGet({ request, env, fetchFn = fetch }) {
  const name = cleanName(new URL(request.url).searchParams.get('name') || '');
  if (!name) return jsonNoStore({ ok: false, say: BAD }, 400);
  if (await rateLimited(request, env || {}, 'username', RL_MAX)) return jsonNoStore({ ok: false, say: LIMITED }, 429);
  const sites = await checkName(name, fetchFn);
  let found = 0, missing = 0, unchecked = 0;
  for (const site of sites) {
    if (site.result === 'found') found += 1;
    else if (site.result === 'missing') missing += 1;
    else unchecked += 1;
  }
  return jsonNoStore({ ok: true, name, found, missing, unchecked, sites });
}

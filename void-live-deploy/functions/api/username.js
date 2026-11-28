// GET /api/username?name=<public name>. Fetches only lib/username.js. A url= parameter is ignored.
// A stranger can ask six names a minute from one address. Each fetch times out in 4s and follows one same-host redirect.
// Nothing is stored. The reply is no-store.
import { rateLimited } from './answer.js';
import { jsonNoStore } from '../../lib/http.js';
import { cleanName, checkName } from '../../lib/username.js';
export const RL_MAX = 6;
export async function onRequestGet({ request, env, fetchFn = fetch }) {
  const name = cleanName(new URL(request.url).searchParams.get('name') || '');
  if (!name) return jsonNoStore({ ok: false, say: 'Use a public name: letters, digits, dots, underscores or hyphens, up to 39 characters, with no spaces.' }, 400);
  if (await rateLimited(request, env || {}, 'username', RL_MAX)) return jsonNoStore({ ok: false, say: 'That is a lot of names in a minute. Wait a moment and ask again.' }, 429);
  const sites = await checkName(name, fetchFn);
  const n = (result) => sites.filter((s) => s.result === result).length;
  return jsonNoStore({ ok: true, name, found: n('found'), missing: n('missing'), unchecked: n('unchecked'), sites });
}

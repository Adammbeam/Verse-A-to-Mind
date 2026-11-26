// GET /build.json: this deploy's id, for an open tab's "a newer Verse is ready" line (lib/stale-tab.js) and the answer cache key
// (lib/answer-edge.js). With no deploy step writing the file, it is a hash of the shell files this deploy serves (lib/build-id.js).
import { assetBuildId } from '../lib/build-id.js';

export async function onRequestGet({ env, request }) {
  const id = await assetBuildId(env, new URL(request.url).origin);
  if (!id) return Response.json({ id: null, note: 'the shell files could not be read' }, { status: 503, headers: { 'cache-control': 'no-store' } });
  return Response.json({ id, from: 'shell files' }, { headers: { 'cache-control': 'no-store' } });
}

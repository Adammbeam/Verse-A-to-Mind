// This deploy's id when no deploy step wrote /build.json (2026-11-25: Cloudflare Pages now builds main from git with no build command, and
// the parked deploy workflow was what wrote the commit there, so /build.json was a 404: an open tab never heard of a new version and the
// answer engine's edge cache was off, its key having no build id). The id is a hash of the shell's own files as this deploy serves them:
// any change to the page, its styles, its shell script, the service worker or the skill list is a new id. A deploy that changed only a
// Function keeps the id, which is the same as before for a tab (its page code did not change). Never throws.
export const SHELL_FILES = ['/', '/skills/index.json', '/verse-shell.js', '/verse.css', '/sw.js'];

async function hex(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
/** the id (40 hex) from each shell file's ETag, else its body; '' when none could be read. Pure apart from fetchAsset. */
export async function idFromAssets(fetchAsset, files = SHELL_FILES) {
  const parts = await Promise.all(files.map(async (p) => {
    try { const r = await fetchAsset(p); if (!r || !r.ok) return ''; const tag = r.headers && r.headers.get('etag'); return p + '=' + (tag ? tag.replace(/^W\//, '') : 'b:' + (await hex(await r.text()))); } catch (_) { return ''; }
  }));
  return parts.some(Boolean) ? (await hex(parts.join('\n'))).slice(0, 40) : '';
}
/** the same, read through the Pages asset binding. */
export function assetBuildId(env, origin) {
  if (!env || !env.ASSETS || typeof env.ASSETS.fetch !== 'function') return Promise.resolve('');
  return idFromAssets((p) => env.ASSETS.fetch(new Request(origin + p)));
}

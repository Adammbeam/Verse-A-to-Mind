// Which shard a browser-suite section belongs to (tools/test_void.mjs --shard i/n; verify.yml runs the suite as n jobs at once).
// A section is placed by a hash of its heading, not by the order the headings are met in, so every section lands in exactly one
// shard whatever `--only` or the 3D gate's short-circuits do to the order, and the same heading always lands in the same shard.
// When n >= 4, the large shared-page CORE section gets its own dedicated shard (shard n) so it never collides with 60+ other
// sections and 3D checks and pushes one shard past the 1,680 s suite budget (mw2k6aqf).
// Pure; tested in tools/shard.test.mjs.

export const CORE_LABEL = 'core: the shared page, the asks typed one after another';

/** FNV-1a over the heading, 32-bit, unsigned. */
export function hashLabel(label) {
  let h = 0x811c9dc5;
  for (const ch of String(label)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/** "i/n" -> { i, n } (1-based i, 1 <= i <= n <= 64), or null for anything else (no sharding). */
export function parseShard(s) {
  const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(String(s || ''));
  if (!m) return null;
  const i = +m[1], n = +m[2];
  if (!(n >= 1 && n <= 64 && i >= 1 && i <= n)) return null;
  return { i, n };
}

/** True when this heading runs in shard i of n. No shard = every heading runs. */
export function inShard(label, shard) {
  if (!shard) return true;
  if (shard.n >= 4) {
    if (label === CORE_LABEL) return shard.i === shard.n;
    return hashLabel(label) % (shard.n - 1) === shard.i - 1;
  }
  return hashLabel(label) % shard.n === shard.i - 1;
}

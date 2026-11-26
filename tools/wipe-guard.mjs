// Stop a commit, push, pull request or Git Data API write from replacing the tree the way 9a726fe did
// (one growth-inbox edit, 10,665 files gone). A change that deletes more than MAX_DELETE_FILES files,
// or more than MAX_DELETE_FRACTION of the tree, is refused unless VOID_ALLOW_WIPE=1 is set.
// Git Data API trees must include base_tree; without it GitHub treats the listed files as the whole repo.
export const MAX_DELETE_FILES = 50;
export const MAX_DELETE_FRACTION = 0.05;
export const ALLOW_ENV = 'VOID_ALLOW_WIPE';

export function allowWipe(env = process.env) {
  const v = env && env[ALLOW_ENV];
  return v === '1' || v === 'true' || v === 'yes';
}

/** why this deletion is refused, or null when it may proceed. Pure. */
export function wipeRefusal({ deleted = 0, treeSize = 0, allow = false, maxFiles = MAX_DELETE_FILES, maxFraction = MAX_DELETE_FRACTION } = {}) {
  if (allow) return null;
  const n = Number(deleted) || 0;
  if (n <= 0) return null;
  const overCount = n > maxFiles;
  const overFrac = treeSize > 0 && n / treeSize > maxFraction;
  if (!overCount && !overFrac) return null;
  const pct = treeSize > 0 ? (Math.round((n / treeSize) * 1000) / 10) : null;
  return 'this would delete ' + n + ' file' + (n === 1 ? '' : 's')
    + (treeSize ? ' (' + pct + '% of the ' + treeSize + '-file tree)' : '')
    + ', more than ' + maxFiles + ' files or ' + Math.round(maxFraction * 100) + '% of the tree. Set ' + ALLOW_ENV + '=1 only when that deletion is the work.';
}

/** deleted paths from `git diff --name-status` or `--diff-filter=D --name-only` output. Pure. */
export function deletedNames(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const status = /^D(?:\s+|\t)(.+)$/.exec(t);
    if (status) { out.push(status[1].trim()); continue; }
    if (!/\s/.test(t) && !/^[AMCRU]/.test(t)) out.push(t);
  }
  return out;
}

/**
 * A Git Data API tree write. Without base_tree, omitted paths are deleted (a 9a726fe-shaped tree).
 * With base_tree, only entries whose sha is null are deletions. Pure. Returns { payload, error }.
 */
export function treePayload({ baseTree, entries = [], basePaths = [], allow = false } = {}) {
  const list = Array.isArray(entries) ? entries : [];
  if (!baseTree) {
    const kept = new Set(list.map((e) => e && e.path).filter(Boolean));
    const deleted = (basePaths || []).filter((p) => !kept.has(p)).length;
    const error = wipeRefusal({ deleted: deleted || (basePaths.length ? basePaths.length - kept.size : 0), treeSize: basePaths.length, allow })
      || 'Git Data API tree is missing base_tree; that replaces the whole repo with the listed files';
    return { payload: null, error };
  }
  const deleted = list.filter((e) => e && (e.sha == null || e.sha === '')).length;
  const error = wipeRefusal({ deleted, treeSize: basePaths.length, allow });
  if (error) return { payload: null, error };
  return { payload: { base_tree: baseTree, tree: list }, error: null };
}

/** Contents API update: an existing file must be sent with its current sha. Pure. */
export function contentsPut({ exists, sha } = {}) {
  if (exists && !sha) return 'Contents API update is missing the file sha; pass the current sha so only that file changes';
  return null;
}

/** skill order files in `files` whose names are not in the served index. Pure. */
export function skillIndexGaps({ files = [], indexNames = [] } = {}) {
  const have = new Set(indexNames || []);
  const gaps = [];
  for (const f of files || []) {
    const m = /^void-live-deploy\/skills\/order\/(\d+)-([a-z0-9][a-z0-9-]*)$/.exec(f);
    if (m && !have.has(m[2])) gaps.push(m[2]);
  }
  return gaps;
}

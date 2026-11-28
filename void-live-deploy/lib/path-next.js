// One next step on a subpage, from path memory plus a catalog `{ path, slug, words }`.
// Prefer a catalog tool the visitor started and did not finish. Otherwise a related
// subpage: same slug, else shared words, else the next catalog row. Never `/`.
// Deterministic. No clock and no model call. Identity text is ignored.
import { looksLikeIdentity, pathOf, slugOf } from './path-memory.js';

export const PATH_NEXT = Object.freeze({
  done: Object.freeze(['done', 'finished', 'complete', 'completed', 'closed']),
});

const STOP = new Set(['the', 'and', 'for', 'you', 'your', 'this', 'that', 'with', 'are', 'was']);
const canon = (p) => (p && p !== '/' ? String(p).replace(/\/+$/, '') : '');

function pagesOf(catalog) {
  if (!Array.isArray(catalog)) return [];
  const out = [];
  const seen = new Set();
  for (const item of catalog) {
    if (!item || typeof item !== 'object') continue;
    const path = pathOf(item.path);
    const key = canon(path);
    if (!path || seen.has(key)) continue;
    seen.add(key);
    out.push({ path, slug: slugOf(item.slug), words: typeof item.words === 'string' ? item.words : '' });
  }
  return out;
}

function rowsOf(memory) {
  const list = Array.isArray(memory) ? memory
    : memory && Array.isArray(memory.rows) ? memory.rows
      : memory && typeof memory === 'object' ? [memory] : [];
  const out = [];
  for (const r of list) {
    if (!r || typeof r !== 'object') continue;
    const path = pathOf(r.path);
    const slug = slugOf(r.slug);
    if (!path && !slug) continue;
    let step = typeof r.step === 'string' ? r.step.replace(/\s+/g, ' ').trim() : '';
    if (looksLikeIdentity(step)) step = '';
    out.push({ path, slug, step });
  }
  return out;
}

function unfinished(rows) {
  for (let i = rows.length - 1; i >= 0; i--) {
    const step = rows[i].step.toLowerCase().replace(/[.!]+$/, '');
    if (PATH_NEXT.done.includes(step)) continue;
    return rows[i];
  }
  return null;
}

function tokens(text) {
  return String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w));
}

function related(row, pages, avoid) {
  const bag = new Set(tokens((row && row.slug) + ' ' + (row && row.step)));
  let best = null;
  let score = 0;
  for (const p of pages) {
    if (avoid && canon(p.path) === avoid) continue;
    const n = tokens(p.slug + ' ' + p.words).filter((t) => bag.has(t)).length;
    if (n > score) { best = p; score = n; }
  }
  if (best) return best;
  return pages.find((p) => canon(p.path) !== avoid) || null;
}

function match(row, pages) {
  const want = canon(row.path);
  if (want) {
    const byPath = pages.find((p) => canon(p.path) === want);
    if (byPath) return byPath;
  }
  return row.slug ? pages.find((p) => p.slug === row.slug) || null : null;
}

function pack(page, step, reason) {
  if (!page || !page.path || page.path === '/') {
    return { path: null, step: 'No subpage is listed yet.', reason: 'The catalog has no subpage to open.' };
  }
  return { path: page.path, step, reason };
}

const NONE = Object.freeze({ path: null, step: 'No subpage is listed yet.', reason: 'The catalog has no subpage to open.' });

/** `{ path, step, reason }` for one catalog subpage. `path` is null when the catalog has none. */
export function next(memory, catalog) {
  const pages = pagesOf(catalog);
  if (!pages.length) return { ...NONE };
  const rows = rowsOf(memory);
  const open = unfinished(rows);
  if (open) {
    const hit = match(open, pages);
    if (hit) return pack(hit, 'Finish ' + (hit.slug || 'the tool') + ' on ' + hit.path + '.', 'You started ' + hit.path + ' and the last step is still open.');
    const rel = related(open, pages, '') || pages[0];
    return pack(rel, 'Open ' + rel.path + ' next.', 'The started page is not listed, so this is the closest subpage.');
  }
  if (!rows.length) return pack(pages[0], 'Start on ' + pages[0].path + '.', 'Nothing is remembered yet, so this is the first subpage.');
  const last = rows[rows.length - 1];
  const rel = related(last, pages, canon(last.path)) || pages[0];
  return pack(rel, 'Open ' + rel.path + ' next.', 'That visit is finished, so this is a related subpage.');
}

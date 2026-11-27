// Browser-only memory of a subpage visit. Keeps path, tool slug and last step.
// Name, email, phone, address, date of birth, government id and every other
// field are dropped (FL HB 3). Nothing in this file calls the network.
// `now` is injected milliseconds. Rows older than 30 days fall off on read.
// The store is a plain object `{ rows }` the caller keeps in this browser.
export const PATH_MEMORY = Object.freeze({
  ttlMs: 30 * 24 * 60 * 60 * 1000,
  maxRows: 24,
  maxStep: 140,
  maxPath: 120,
  keep: Object.freeze(['path', 'slug', 'step']),
  drop: Object.freeze(['name', 'email', 'phone', 'address', 'dob', 'dateOfBirth', 'birthday', 'birth', 'ssn', 'governmentId', 'govId', 'passport']),
});

const HOME = new Set(['/', '/index.html', '/void.html']);
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE = /(?:\+?\d[\s.-]?){10,}/;
const GOV = /\b\d{3}-\d{2}-\d{4}\b/;

/** true when text carries an email, a phone number or a government-id shape. */
export function looksLikeIdentity(value) {
  const s = String(value || '');
  return EMAIL.test(s) || PHONE.test(s) || GOV.test(s);
}

/** a subpage path, or '' for the home page, a query, or anything that is not a path. */
export function pathOf(value) {
  if (typeof value !== 'string') return '';
  const cut = value.trim().split(/[?#]/)[0];
  if (!cut.startsWith('/') || cut.startsWith('//') || cut.includes('//') || cut.length > PATH_MEMORY.maxPath) return '';
  if (HOME.has(cut) || looksLikeIdentity(cut) || cut.split('/').some((p) => p === '.' || p === '..')) return '';
  return /^\/[a-z0-9][a-z0-9_./~-]*$/i.test(cut) ? cut : '';
}

/** a tool slug, or ''. */
export function slugOf(value) {
  if (typeof value !== 'string') return '';
  const s = value.trim().toLowerCase();
  return /^[a-z][a-z0-9-]{0,31}$/.test(s) ? s : '';
}

function stepOf(value) {
  if (typeof value !== 'string') return '';
  const s = value.replace(/\s+/g, ' ').trim();
  if (!s || looksLikeIdentity(s)) return '';
  return s.length > PATH_MEMORY.maxStep ? s.slice(0, PATH_MEMORY.maxStep).trim() : s;
}

function copy(row) {
  const out = { at: row.at };
  if (row.path) out.path = row.path;
  if (row.slug) out.slug = row.slug;
  if (row.step) out.step = row.step;
  return out;
}

function kept(event, now) {
  if (!event || typeof event !== 'object') return null;
  const path = pathOf(event.path);
  const slug = slugOf(event.slug ?? event.tool ?? event.toolSlug);
  const step = stepOf(event.step ?? event.lastStep ?? event.last);
  if (!path && !slug) return null;
  return copy({ at: now, path, slug, step });
}

function fresh(store, now) {
  const raw = Array.isArray(store.rows) ? store.rows : [];
  const live = Number.isFinite(now);
  return raw
    .filter((r) => r && typeof r === 'object' && Number.isFinite(r.at) && (!live || now - r.at <= PATH_MEMORY.ttlMs))
    .map((r) => kept(r, r.at))
    .filter(Boolean);
}

/** store the visit. Returns the kept row, or null when nothing safe was left. Does not change `event`. */
export function remember(store, event, now) {
  if (!store || typeof store !== 'object' || Array.isArray(store) || !Number.isFinite(now)) return null;
  const row = kept(event, now);
  if (!row) return null;
  const rows = fresh(store, now);
  rows.push(row);
  store.rows = rows.slice(-PATH_MEMORY.maxRows);
  return copy(row);
}

/** visits still inside 30 days, with only path, slug, step and at. */
export function read(store, now) {
  if (!store || typeof store !== 'object' || Array.isArray(store)) return [];
  const rows = fresh(store, now);
  store.rows = rows;
  return rows.map(copy);
}

/** wipe the remembered rows. */
export function clear(store) {
  if (!store || typeof store !== 'object' || Array.isArray(store)) return false;
  store.rows = [];
  return true;
}

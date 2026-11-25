/**
 * sql.js 1.17.0 (MIT, sql-js/sql.js): an in-browser SQLite engine, lazy-loaded from a pinned jsDelivr copy.
 * Fetched as text/bytes (allowed by connect-src) and started from a blob, because script-src does not allow the CDN.
 * Queries and files stay on this device.
 */
import { parseCsv } from './note-tools.js';

export const SQLJS_VERSION = '1.17.0';
export const SQLJS_JS = 'https://cdn.jsdelivr.net/npm/sql.js@' + SQLJS_VERSION + '/dist/sql-wasm.js';
export const SQLJS_WASM = 'https://cdn.jsdelivr.net/npm/sql.js@' + SQLJS_VERSION + '/dist/sql-wasm.wasm';

const TIDY = (s) => String(s || '').trim().toLowerCase().replace(/[?!.]+$/, '');
const SQLITE_MAGIC = 'SQLite format 3';

/** a safe SQL identifier from a heading or file name. Pure. */
export function ident(name, used = new Set()) {
  let s = String(name || '').trim().replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'col';
  if (/^[0-9]/.test(s)) s = 'c_' + s;
  let out = s, n = 2;
  while (used.has(out.toLowerCase())) out = s + '_' + n++;
  used.add(out.toLowerCase());
  return out;
}
export const quoteIdent = (id) => '"' + String(id).replace(/"/g, '""') + '"';

/** true when the bytes start with the SQLite header. Pure. */
export function isSqlite(bytes) {
  if (!bytes || bytes.length < 16) return false;
  const head = typeof bytes === 'string' ? bytes.slice(0, 15) : String.fromCharCode(...bytes.slice(0, 15));
  return head === SQLITE_MAGIC;
}

/** "query this csv", "query this sqlite", or `sql: …` with a statement, else null. Pure. */
export function queryIntent(text) {
  const raw = String(text || '').trim(), t = TIDY(raw);
  if (/^(?:please\s+)?(?:query|search)\s+(?:this|the|my)\s+(?:csv|table|spreadsheet|sqlite(?:\s+(?:file|db|database))?|database)$/.test(t)) return { op: 'open' };
  if (/^(?:please\s+)?(?:query\s+this\s+csv|query\s+this\s+sqlite(?:\s+file)?)$/.test(t)) return { op: 'open' };
  if (/^(?:please\s+)?(?:run|execute)\s+(?:an?\s+)?(?:sql\s+)?query\s+on\s+(?:this|the|my)\s+(?:csv|table|file|sqlite(?:\s+file)?)$/.test(t)) return { op: 'open' };
  if (/^(?:please\s+)?(?:open|load)\s+(?:a\s+|this\s+)?(?:csv|sqlite)\s+(?:file\s+)?(?:and\s+query\s+(?:it|this))?$/.test(t)) return { op: 'open' };
  if (/^(?:please\s+)?(?:sql|sqlite)\s*(?:query|console|editor)?$/.test(t)) return { op: 'open' };
  const m = /^(?:please\s+)?(?:sql|query)\s*:\s*(\S[\s\S]*)$/i.exec(raw);
  if (m) return { op: 'sql', sql: m[1].trim() };
  return null;
}

/** a csv-table or list already on the stage, preferring the picked one. Pure. */
export function tableFromStage(things, pickedId = null) {
  const rowsOf = (t) => {
    if (!t) return null;
    if (t.kind === 'csv-table' && Array.isArray(t.rows) && t.rows.length) return { title: t.title || 'data', rows: t.rows };
    if (t.kind === 'list' && Array.isArray(t.items) && t.items.length) {
      return { title: t.title || 'list', rows: [['item'], ...t.items.map((i) => [typeof i === 'string' ? i : (i && i.text) || ''])] };
    }
    return null;
  };
  return rowsOf(pickedId && things && things[pickedId]) || Object.values(things || {}).map(rowsOf).find(Boolean) || null;
}

/** CREATE TABLE + INSERT from a heading row and body rows. Returns { table, columns, rows }. */
export function loadRows(db, table, rows) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('The table is empty.');
  const used = new Set(), cols = rows[0].map((c, i) => ident(c || 'col_' + (i + 1), used));
  const t = ident(table || 'data', new Set());
  db.run('CREATE TABLE ' + quoteIdent(t) + ' (' + cols.map(quoteIdent).join(', ') + ')');
  const stmt = db.prepare('INSERT INTO ' + quoteIdent(t) + ' VALUES (' + cols.map(() => '?').join(', ') + ')');
  try {
    for (const row of rows.slice(1)) {
      stmt.bind(cols.map((_, i) => (row[i] == null ? '' : row[i])));
      stmt.step();
      stmt.reset();
    }
  } finally { stmt.free(); }
  return { table: t, columns: cols, rows: Math.max(0, rows.length - 1) };
}

export function csvToRows(text) {
  return parseCsv(text, { rows: 4000, cols: 40, cell: 400 });
}

export function runQuery(db, sql) {
  const t = String(sql || '').trim();
  if (!t) return [];
  return db.exec(t).map((r) => ({ columns: r.columns, values: r.values }));
}

/** start sql.js from the already-fetched script text and wasm bytes (used by tests and by loadSql). */
export async function engineFrom(js, wasm) {
  // In Node, emscripten asks for fs/crypto. The wasm bytes are already in hand, so those reads are stubs.
  const req = (name) => {
    if (name === 'node:crypto' || name === 'crypto') return { randomFillSync(b) { globalThis.crypto.getRandomValues(b); return b; } };
    if (name === 'node:fs' || name === 'fs') return { readFileSync() { throw new Error('sql.js should use the wasm bytes it was given'); } };
    throw new Error('sql.js asked for ' + name);
  };
  const init = new Function('require', 'module', 'exports', 'define', '__dirname', '__filename', String(js) + '\n;return initSqlJs;')(req, undefined, undefined, undefined, '/', 'sql-wasm.js');
  if (typeof init !== 'function') throw new Error('sql.js did not load');
  return init({ wasmBinary: wasm instanceof Uint8Array ? wasm : new Uint8Array(wasm) });
}

let cached = null;
export async function loadSql(opts = {}) {
  if (opts.SQL) return opts.SQL;
  if (cached) return cached;
  const get = opts.fetch || globalThis.fetch;
  if (opts.js != null && opts.wasm != null) return (cached = engineFrom(opts.js, opts.wasm));
  if (typeof get !== 'function') throw new Error('sql.js did not load');
  const [jsRes, wasmRes] = await Promise.all([get(SQLJS_JS), get(SQLJS_WASM)]);
  if (!jsRes || !jsRes.ok || !wasmRes || !wasmRes.ok) throw new Error('sql.js did not load; check the connection once and queries will work on this device afterwards.');
  const js = await jsRes.text(), wasm = new Uint8Array(await wasmRes.arrayBuffer());
  if (typeof document !== 'undefined') {
    const url = URL.createObjectURL(new Blob([js], { type: 'text/javascript' }));
    try {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = url; s.onload = res; s.onerror = () => rej(new Error('sql.js did not load'));
        document.head.append(s);
      });
    } finally { URL.revokeObjectURL(url); }
    const init = globalThis.initSqlJs;
    if (typeof init !== 'function') throw new Error('sql.js did not load');
    return (cached = init({ wasmBinary: wasm }));
  }
  return (cached = engineFrom(js, wasm));
}

/** open a SQLite file, or a CSV as table `data`. */
export async function openBytes(SQL, bytes, { name = 'file', text = '' } = {}) {
  const n = String(name || '').toLowerCase();
  if (isSqlite(bytes) || /\.(db|sqlite|sqlite3)$/.test(n)) return { db: new SQL.Database(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)), source: 'sqlite', table: null };
  const rows = csvToRows(text || new TextDecoder().decode(bytes));
  if (!rows.length) throw new Error('That file has no rows.');
  const db = new SQL.Database();
  const info = loadRows(db, 'data', rows);
  return { db, source: 'csv', ...info };
}

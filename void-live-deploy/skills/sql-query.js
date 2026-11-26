/**
 * sql-query skill — drop a CSV or SQLite file, or take a table already on the stage, and query it on this device with sql.js.
 * "query this csv", "query this sqlite", "sql: select * from data".
 */
import { queryIntent, tableFromStage, loadRows, loadSql, openBytes, runQuery, quoteIdent } from '../lib/sql-query.js';

function tableHtml(esc, result) {
  if (!result || !result.columns) return '<p>The query returned no rows.</p>';
  const head = '<tr>' + result.columns.map((c) => '<th>' + esc(c) + '</th>').join('') + '</tr>';
  const body = (result.values || []).slice(0, 200).map((r) => '<tr>' + result.columns.map((_, i) => '<td>' + esc(r[i] == null ? '' : r[i]) + '</td>').join('') + '</tr>').join('');
  return '<table class="csv-grid" style="border-collapse:collapse;font-size:13px">' + head + body + '</table>'
    + (result.values && result.values.length > 200 ? '<p>' + esc(result.values.length) + ' rows; showing the first 200.</p>' : '');
}

async function run(text, api) {
  const hit = queryIntent(text);
  if (!hit) return 'none';
  const { showPage, esc } = api;
  const el = showPage((p) => { p.innerHTML = '<h2>Query</h2><p>Loading sql.js…</p>'; });
  let db = null, defaultTable = 'data';
  const things = (api.stage && typeof api.stage.things === 'function') ? api.stage.things() : {};
  const pickedId = api.stage && typeof api.stage.selected === 'function' ? api.stage.selected() : null;
  const staged = tableFromStage(things, pickedId);
  try {
    const SQL = await loadSql();
    if (staged) {
      db = new SQL.Database();
      const info = loadRows(db, 'data', staged.rows);
      defaultTable = info.table;
    }
    const paint = (msg, results) => {
      const src = db ? (staged ? 'Using the table already on the stage ("' + (staged.title || 'data') + '"). ' : '') + 'Queries run on this device with sql.js 1.17.0 (MIT). Nothing is uploaded.' : 'Drop a CSV or SQLite file, or put a table on the stage first.';
      el.innerHTML = '<h2>Query this table</h2>'
        + (msg ? '<p>' + esc(msg) + '</p>' : '')
        + '<p><input type="file" accept=".csv,.tsv,.db,.sqlite,.sqlite3,text/csv,application/vnd.sqlite3" aria-label="CSV or SQLite file"></p>'
        + '<p><textarea rows="4" style="width:min(94vw,40em);font:inherit" aria-label="SQL">' + esc(hit.sql || ('SELECT * FROM ' + quoteIdent(defaultTable) + ' LIMIT 50')) + '</textarea></p>'
        + '<p><button type="button" data-run="1">Run query</button></p>'
        + '<div data-out="1">' + (results && results[0] ? tableHtml(esc, results[0]) : '') + '</div>'
        + '<div class="src">' + esc(src) + '</div>';
      const file = el.querySelector('input[type=file]'), area = el.querySelector('textarea'), btn = el.querySelector('[data-run]'), out = el.querySelector('[data-out]');
      const go = () => {
        if (!db) { out.innerHTML = '<p>Drop a CSV or SQLite file first, or ask this with a table on the stage.</p>'; return; }
        try {
          const res = runQuery(db, area.value);
          out.innerHTML = res[0] ? tableHtml(esc, res[0]) : '<p>The query returned no rows.</p>';
        } catch (e) { out.innerHTML = '<p>' + esc((e && e.message) || 'The query did not run.') + '</p>'; }
      };
      btn.addEventListener('click', go);
      area.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); go(); } });
      file.addEventListener('change', async () => {
        const f = file.files && file.files[0];
        if (!f) return;
        try {
          const buf = new Uint8Array(await f.arrayBuffer());
          const opened = await openBytes(SQL, buf, { name: f.name, text: /\.(csv|tsv)$/i.test(f.name) ? new TextDecoder().decode(buf) : '' });
          if (db) db.close();
          db = opened.db;
          defaultTable = opened.table || (runQuery(db, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' LIMIT 1")[0] || { values: [] }).values[0]?.[0] || 'data';
          area.value = 'SELECT * FROM ' + quoteIdent(defaultTable) + ' LIMIT 50';
          paint('Opened ' + f.name + (opened.source === 'csv' ? ' as table ' + defaultTable + ' (' + opened.rows + ' rows).' : '.'), []);
        } catch (e) { paint((e && e.message) || 'That file could not be opened.', []); }
      });
    };
    let first = [];
    if (db && hit.op === 'sql') first = runQuery(db, hit.sql);
    else if (db) first = runQuery(db, 'SELECT * FROM ' + quoteIdent(defaultTable) + ' LIMIT 50');
    paint(staged ? 'Loaded "' + (staged.title || 'data') + '" as table ' + defaultTable + '.' : '', first);
  } catch (e) {
    el.innerHTML = '<h2>Query</h2><p>' + esc((e && e.message) || 'sql.js did not load.') + '</p>';
  }
  return 'sql-query';
}

export default {
  name: 'sql-query',
  examples: ['query this csv', 'query this sqlite', 'query this table', 'run a query on this csv', 'sql', 'sql: SELECT * FROM data'],
  nearMisses: ['csv table: name,age', 'paste csv: a,b', 'what is a csv file', 'what is sql', 'merge two csv files', 'save the stage as a pdf', 'make a table from wood'],
  queryIntent,
  tableFromStage,
  match(lower, text) { return !!queryIntent(text || lower); },
  run,
};

// sql-query: real sql.js 1.17.0 from the pinned CDN, loaded with the same helper the skill uses. No mocked query results.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import sk from '../void-live-deploy/skills/sql-query.js';
import { queryIntent, tableFromStage, loadRows, loadSql, openBytes, runQuery, csvToRows, isSqlite, ident, SQLJS_VERSION } from '../void-live-deploy/lib/sql-query.js';

const m = (t) => sk.match(t.toLowerCase(), t);
let SQL;

test('examples in, near misses out', () => {
  for (const e of sk.examples) assert.ok(m(e), e);
  for (const n of sk.nearMisses) assert.ok(!m(n), n);
  assert.equal(queryIntent('query this csv').op, 'open');
  assert.equal(queryIntent('sql: SELECT n FROM data WHERE n > 10').sql, 'SELECT n FROM data WHERE n > 10');
  assert.equal(queryIntent('what is sql'), null);
});

test('tableFromStage prefers the picked csv-table and can read a list', () => {
  const things = {
    a: { id: 'a', kind: 'notepad', title: 'x', text: 'no' },
    b: { id: 'b', kind: 'csv-table', title: 'Scores', rows: [['name', 'n'], ['Ada', '12'], ['Bo', '4']] },
    c: { id: 'c', kind: 'list', title: 'Tasks', items: ['pack', { text: 'ship', done: true }] },
  };
  assert.equal(tableFromStage(things, 'b').title, 'Scores');
  assert.deepEqual(tableFromStage(things, 'c').rows[1], ['pack']);
  assert.equal(tableFromStage(things).title, 'Scores');
});

test('ident turns headings into unique SQL names', () => {
  const used = new Set();
  assert.equal(ident('Year (est.)', used), 'Year_est');
  assert.equal(ident('Year (est.)', used), 'Year_est_2');
  assert.equal(ident('2tone', new Set()), 'c_2tone');
});

test('load sql.js 1.17.0 from the pinned CDN and query a real CSV', async () => {
  SQL = await loadSql();
  assert.ok(SQL && SQL.Database, 'sql.js should expose Database');
  const csv = 'reef,dhw\nDry Tortugas,13.70\nCarysfort,0\n';
  const { db, table, rows } = await openBytes(SQL, new TextEncoder().encode(csv), { name: 'reefs.csv', text: csv });
  assert.equal(table, 'data');
  assert.equal(rows, 2);
  const out = runQuery(db, 'SELECT reef, CAST(dhw AS REAL) AS dhw FROM data WHERE CAST(dhw AS REAL) > 1 ORDER BY dhw DESC');
  assert.deepEqual(out[0].columns, ['reef', 'dhw']);
  assert.deepEqual(out[0].values, [['Dry Tortugas', 13.7]]);
  db.close();
});

test('a SQLite file opened here still has the rows that were written into it', async () => {
  SQL = SQL || await loadSql();
  const src = new SQL.Database();
  loadRows(src, 'data', [['name', 'n'], ['Ada', '12'], ['Bo', '4']]);
  const bytes = src.export();
  src.close();
  assert.equal(isSqlite(bytes), true);
  const { db, source } = await openBytes(SQL, bytes, { name: 'scores.sqlite' });
  assert.equal(source, 'sqlite');
  const out = runQuery(db, "SELECT name, CAST(n AS INTEGER) AS n FROM data WHERE CAST(n AS INTEGER) >= 10");
  assert.deepEqual(out[0].values, [['Ada', 12]]);
  db.close();
});

test('csv-table rows already on the stage are the rows the query sees', async () => {
  SQL = SQL || await loadSql();
  const staged = tableFromStage({ b: { id: 'b', kind: 'csv-table', title: 'Scores', rows: [['name', 'n'], ['Ada', '12']] } }, 'b');
  const db = new SQL.Database();
  loadRows(db, 'data', staged.rows);
  assert.deepEqual(runQuery(db, 'SELECT name FROM data')[0].values, [['Ada']]);
  db.close();
});

test('csvToRows uses the same parser as csv-table', () => {
  assert.deepEqual(csvToRows('a,b\n1,2'), [['a', 'b'], ['1', '2']]);
  assert.equal(SQLJS_VERSION, '1.17.0');
});

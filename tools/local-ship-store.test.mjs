// Acceptance test for idea-8315: tools/local-ship.mjs --to-store turns a fixture proposal into a cr/proposal-<id> ref in a local code store.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { onRequest } from '../void-live-deploy/functions/code/[[path]].js';
import { push, status, clone } from './codestore.mjs';
import { crRefOf, toStore } from './local-ship.mjs';

const OWNER = 'test-owner-key'; // secret-scan: ok
function d1() {
  const db = new DatabaseSync(':memory:');
  const stmt = (sql, a = []) => ({
    bind: (...b) => stmt(sql, b),
    run: async () => { const r = db.prepare(sql).run(...a); return { meta: { changes: Number(r.changes) } }; },
    first: async () => db.prepare(sql).get(...a) || null,
    all: async () => ({ results: db.prepare(sql).all(...a) }),
  });
  return { prepare: (sql) => stmt(sql) };
}
function r2() {
  const m = new Map();
  return { m, head: async (k) => (m.has(k) ? { size: m.get(k).length } : null), get: async (k) => (m.has(k) ? { size: m.get(k).length, body: m.get(k) } : null), put: async (k, v) => { m.set(k, Buffer.from(v)); } };
}
const offline = async () => new Response('', { status: 503 });

async function serve(e) {
  const srv = createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const url = new URL(req.url, 'http://x'), parts = url.pathname.replace(/^\/code\//, '').split('/').filter(Boolean);
    const request = new Request('http://x' + req.url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
    const r = await onRequest({ request, env: e, params: { path: parts }, fetchFn: offline });
    res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  return { srv, url: 'http://127.0.0.1:' + srv.address().port + '/code/verse.git' };
}
const g = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();

test('crRefOf builds a bounded cr/proposal-<id> ref name', () => {
  assert.equal(crRefOf('fix-42'), 'cr/proposal-fix-42');
  assert.match(crRefOf('team/weird id! ' + 'x'.repeat(60)), /^cr\/proposal-[a-zA-Z0-9._-]{1,31}$/);
});

test('toStore turns a fixture proposal into a cr/proposal-<id> ref in a local code store (idea-8315)', async () => {
  const env = { DB: d1(), CODE: r2(), READ_TOKEN: OWNER, SALT: 's' };
  const { srv, url } = await serve(env);
  const keepUrl = process.env.CODE_URL;
  process.env.CODE_URL = url;
  const seed = mkdtempSync(join(tmpdir(), 'ls-seed-'));
  const verify = mkdtempSync(join(tmpdir(), 'ls-verify-'));
  try {
    g(seed, 'init', '-q', '-b', 'main');
    g(seed, 'config', 'user.email', 't@t');
    g(seed, 'config', 'user.name', 't');
    writeFileSync(join(seed, 'note.txt'), 'before\n');
    g(seed, 'add', '.');
    g(seed, 'commit', '-qm', 'seed');
    await push({ key: OWNER, ref: 'main', to: 'main', cwd: seed });

    // Build a real unified diff fixture
    writeFileSync(join(seed, 'note.txt'), 'before\nafter\n');
    const diff = execFileSync('git', ['diff'], { cwd: seed, encoding: 'utf8' });

    const res = await toStore({ id: 'fix-42', title: 'Add after line', diff }, { key: OWNER });
    assert.equal(res.ok, true, res.why);
    assert.equal(res.cr, 'cr/proposal-fix-42');
    assert.match(res.why, /cr\/proposal-fix-42/);

    const st = await status(OWNER);
    const ref = (st.refs || []).find((x) => x.name === 'refs/heads/cr/proposal-fix-42');
    assert.ok(ref, 'local store holds refs/heads/cr/proposal-fix-42');
    assert.equal(ref.sha, res.sha);

    // Clone back and verify the change request branch has the exact patched file
    const cloneDir = join(verify, 'r');
    await clone(OWNER, cloneDir);
    g(cloneDir, 'checkout', '-q', 'origin/cr/proposal-fix-42');
    assert.equal(readFileSync(join(cloneDir, 'note.txt'), 'utf8').replace(/\r\n/g, '\n'), 'before\nafter\n');

    // A non-applying patch returns ok:false and creates no ref
    const bad = await toStore({ id: 'bad-99', title: 'Broken', diff: '--- a/nope.txt\n+++ b/nope.txt\n@@ -1 +1 @@\n-x\n+y\n' }, { key: OWNER });
    assert.equal(bad.ok, false);
    assert.match(bad.why, /does not apply/);
    const st2 = await status(OWNER);
    assert.equal((st2.refs || []).find((x) => x.name === 'refs/heads/cr/proposal-bad-99'), undefined);
  } finally {
    if (keepUrl === undefined) delete process.env.CODE_URL; else process.env.CODE_URL = keepUrl;
    srv.close();
    rmSync(seed, { recursive: true, force: true });
    rmSync(verify, { recursive: true, force: true });
  }
});

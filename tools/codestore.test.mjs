// Verse's code store (lib/codestore.js, functions/code/[[path]].js, tools/codestore.mjs): with a FAKE R2 and D1, a real git repository is
// pushed into the store, cloned back over git's own HTTP client, pushed again with only the new commits, and the clone fetches them.
// A stranger gets 404 for everything; a bad pack and a stale ref update are refused; a team agent may only mirror GitHub's main.
// Run: node --test tools/codestore.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as C from '../void-live-deploy/lib/codestore.js';
import { onRequest } from '../void-live-deploy/functions/code/[[path]].js';
import { push, clone } from './codestore.mjs';

const OWNER = 'test-owner-key'; // secret-scan: ok
function d1() {
  const db = new DatabaseSync(':memory:');
  const stmt = (sql, a = []) => ({ bind: (...b) => stmt(sql, b), run: async () => { const r = db.prepare(sql).run(...a); return { meta: { changes: Number(r.changes) } }; }, first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }) });
  return { prepare: (sql) => stmt(sql) };
}
function r2() {
  const m = new Map();
  return { m, head: async (k) => (m.has(k) ? { size: m.get(k).length } : null), get: async (k) => (m.has(k) ? { size: m.get(k).length, body: m.get(k) } : null), put: async (k, v) => { m.set(k, Buffer.from(v)); } };
}
const env = () => ({ DB: d1(), CODE: r2(), READ_TOKEN: OWNER, SALT: 's' });
const offline = async () => new Response('', { status: 503 });

// a local server that hands every request to the Pages function, as Cloudflare would
async function serve(e, fetchFn = offline) {
  const srv = createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const url = new URL(req.url, 'http://x'), parts = url.pathname.replace(/^\/code\//, '').split('/').filter(Boolean);
    const request = new Request('http://x' + req.url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
    const r = await onRequest({ request, env: e, params: { path: parts }, fetchFn });
    res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  return { srv, url: 'http://127.0.0.1:' + srv.address().port + '/code/verse.git' };
}
const g = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();
function repo() {
  const d = mkdtempSync(join(tmpdir(), 'cs-src-'));
  g(d, 'init', '-q', '-b', 'main'); g(d, 'config', 'user.email', 't@t'); g(d, 'config', 'user.name', 't');
  writeFileSync(join(d, 'a.txt'), 'one\n'); g(d, 'add', '.'); g(d, 'commit', '-qm', 'one');
  return d;
}

test('pure rules: pack names, headers, ref updates, the files git reads', () => {
  assert.deepEqual(C.packFile('pack-' + 'a'.repeat(40) + '.idx'), { name: 'pack-' + 'a'.repeat(40), kind: 'idx' });
  assert.equal(C.packFile('../pack-x.pack'), null);
  assert.ok(C.headOk('pack', Buffer.from('PACK\0\0\0\x02rest'))); assert.ok(!C.headOk('pack', Buffer.from('# v2 git bundle')));
  assert.ok(C.headOk('idx', Buffer.from([0xff, 0x74, 0x4f, 0x63, 0, 0, 0, 2, 9])));
  assert.equal(C.refUpdate({ new: 'zz' }).ok, false);
  assert.equal(C.refUpdate({ new: 'b'.repeat(40), packs: ['pack-' + 'c'.repeat(40)] }).old, C.ZERO);
  assert.equal(C.infoRefs([{ name: 'refs/heads/main', sha: 'b'.repeat(40) }]), 'b'.repeat(40) + '\trefs/heads/main\n');
  assert.equal(C.mainOf('001e# service=git-upload-pack\n0000' + '0155' + 'd'.repeat(40) + ' HEAD\0caps\n003f' + 'e'.repeat(40) + ' refs/heads/main\n'), 'e'.repeat(40));
  assert.equal(C.syncOf(null, 'x'), 'empty'); assert.equal(C.syncOf('x', 'x'), 'same'); assert.equal(C.syncOf('x', null), 'unknown');
});

test('a stranger gets 404 for every file and every write', async () => {
  const e = env();
  for (const [m, p] of [['GET', 'verse.git/info/refs'], ['GET', 'verse.git/status'], ['POST', 'verse.git/refs'], ['PUT', 'verse.git/objects/pack/pack-' + 'a'.repeat(40) + '.pack']]) {
    const r = await onRequest({ request: new Request('http://x/code/' + p, { method: m, body: m === 'GET' ? undefined : 'x' }), env: e, params: { path: p.split('/') }, fetchFn: offline });
    assert.equal(r.status, 404, m + ' ' + p);
  }
});

test('push, clone over git\'s own HTTP client, push only the new commits, fetch them; a stale or bad push is refused', async () => {
  const e = env(), { srv, url } = await serve(e), src = repo(), out = mkdtempSync(join(tmpdir(), 'cs-out-'));
  const prev = process.env.CODE_URL; process.env.CODE_URL = url;
  try {
    const first = await push({ key: OWNER, cwd: src });
    assert.equal(first.ok, true); assert.equal(first.packs.length, 1);
    assert.equal((await push({ key: OWNER, cwd: src })).already, true, 'the same tip twice stores nothing');
    const sha = await clone(OWNER, join(out, 'c'));
    assert.equal(sha, g(src, 'rev-parse', 'HEAD'), 'the clone is the same commit, every object hash-checked by git');
    g(join(out, 'c'), 'fsck', '--full');
    writeFileSync(join(src, 'b.txt'), 'two\n'); g(src, 'add', '.'); g(src, 'commit', '-qm', 'two');
    const second = await push({ key: OWNER, cwd: src });
    assert.equal(second.packs.length, 1); assert.equal(e.CODE.m.size, 4, 'two packs, each with its index');
    await promisify(execFile)('git', ['pull', '-q'], { cwd: join(out, 'c'), env: { ...process.env, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'http.extraHeader', GIT_CONFIG_VALUE_0: 'Authorization: Bearer ' + OWNER } });
    assert.equal(g(join(out, 'c'), 'rev-parse', 'HEAD'), second.sha, 'a pull brings the new commit');
    const auth = { authorization: 'Bearer ' + OWNER };
    const stale = await fetch(url + '/refs', { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ old: first.sha, new: first.sha, packs: [] }) });
    assert.equal(stale.status, 409, 'a ref update from an old value loses nothing');
    const bad = Buffer.from('# v2 git bundle\nnot a pack');
    const put = await fetch(url + '/objects/pack/pack-' + 'f'.repeat(40) + '.pack', { method: 'PUT', headers: { ...auth, 'content-length': String(bad.length) }, body: bad });
    assert.equal(put.status, 400, 'only a real pack is stored');
    const st = await (await fetch(url + '/status', { headers: auth })).json();
    assert.equal(st.main, second.sha); assert.equal(st.packs, 2); assert.equal(st.sync, 'unknown'); assert.ok(st.log.length >= 3, 'every write is logged');
  } finally { process.env.CODE_URL = prev; srv.close(); rmSync(src, { recursive: true, force: true }); rmSync(out, { recursive: true, force: true }); }
});

test('the clock files one mirror job when the store is behind GitHub main, and nothing when GitHub is unreadable or there is no store', async () => {
  const { codestoreTick } = await import('../void-live-deploy/lib/codestore-tick.js');
  const e = env(), gh = 'a'.repeat(40);
  e.DB.prepare('CREATE TABLE void_queue (id TEXT PRIMARY KEY, ask TEXT, target TEXT, state TEXT, note TEXT, at TEXT, updated TEXT)').run();
  const refs = async () => new Response('003f' + gh + ' refs/heads/main\n');
  assert.equal(await codestoreTick(e, 1, refs), 'job filed');
  assert.equal(await codestoreTick(e, 2, refs), 'job open', 'one mirror job at a time');
  assert.equal(await codestoreTick(e, 3, offline), 'unknown', 'GitHub unreadable: nothing filed');
  assert.equal(await codestoreTick({ DB: e.DB }, 4, refs), 'no store');
});

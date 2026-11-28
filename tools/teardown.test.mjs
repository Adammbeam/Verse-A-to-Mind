import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run, refuseTarget, UA } from './teardown.mjs';
const CLI = fileURLToPath(new URL('./teardown.mjs', import.meta.url));
const HTML = '<!doctype html><html><head><title>Example guide</title></head><body><nav><a href="/docs">Docs</a><a href="/api/widgets">Widgets</a></nav><h2>Start here please</h2><form action="/signup" method="post"><input type="email" required></form><button>Go</button><p>KEEP_OUT_PARAGRAPH is source wording the saved pack must not keep.</p></body></html>';
const ask = async () => JSON.stringify({ features: [{ name: 'zigzag quarry', flow: ['open the page'], states: ['idle'], data: { item: ['id'] } }] });
function pageFetch() {
  const seen = [];
  const fetchFn = async (url, init) => {
    seen.push({ url: String(url), init });
    if (String(url).includes('robots.txt')) return new Response('User-agent: *\nAllow: /\n', { status: 200 });
    return new Response(HTML, { status: 200, headers: { 'content-type': 'text/html' } });
  };
  fetchFn.seen = seen;
  return fetchFn;
}
test('a public page writes the four files and a three line summary', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'teardown-'));
  const fetchFn = pageFetch();
  const lines = [];
  let asked = 0;
  try {
    const code = await run(['https://example.test'], { cwd: dir, fetchFn, ask: async (...args) => { asked += 1; return ask(...args); }, out: (line) => lines.push(line), err: (line) => lines.push(line) });
    assert.equal(code, 0);
    assert.deepEqual(lines, ['Teardown example-test', 'Features 1, gaps 1, jobs 1', 'Wrote teardown/example-test/map.json spec.md gaps.md jobs.md']);
    const pack = ['map.json', 'spec.md', 'gaps.md', 'jobs.md'].map((name) => readFileSync(join(dir, 'teardown', 'example-test', name), 'utf8'));
    for (const text of pack) assert.equal(text.includes('KEEP_OUT_PARAGRAPH'), false);
    assert.match(pack[0], /\/api\/widgets/);
    assert.match(pack[1], /zigzag quarry/);
    assert.match(pack[2], /gap/);
    assert.match(pack[3], /Goal:/);
    assert.match(pack[3], /Files:/);
    assert.match(pack[3], /Change:/);
    assert.match(pack[3], /Test:/);
    assert.match(pack[3], /Done proof:/);
    assert.match(pack[3], /Depends on:/);
    assert.equal(asked, 1);
    const headers = fetchFn.seen.find((item) => item.url.includes('example.test')).init.headers;
    assert.equal(headers['user-agent'] || headers['User-Agent'] || (headers.get && headers.get('user-agent')), UA);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('--post calls the crew room and a dry run does not', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'teardown-'));
  const calls = [];
  const spawn = (cmd, args, opts) => { calls.push({ cmd, args, opts }); return { status: 0 }; };
  try {
    assert.equal(await run(['https://example.test'], { cwd: dir, fetchFn: pageFetch(), ask, spawn, out() {} }), 0);
    assert.equal(calls.length, 0);
    assert.equal(await run(['https://example.test', '--post'], { cwd: dir, fetchFn: pageFetch(), ask, spawn, out() {} }), 0);
    assert.deepEqual(calls[0].args.slice(0, 3), ['team/agent.mjs', 'post', 'general']);
    assert.match(calls[0].args[3], /example-test/);
    assert.match(calls[0].opts.cwd, /void-live-deploy$/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('a refused address exits non-zero and the reason does not repeat secrets or the environment', () => {
  assert.equal(refuseTarget('https://example.test/docs'), '');
  for (const target of ['https://localhost/a', 'https://10.0.0.1/', 'https://169.254.169.254/latest', 'https://user:xxxxxx@public.test/a', 'https://example.test:8080/a']) {
    const why = refuseTarget(target);
    assert.ok(why, target);
    assert.equal(why.includes('xxxxxx') || why.includes('10.0.0.1'), false);
  }
  const probe = 'probe-value-zz';
  const child = spawnSync(process.execPath, [CLI, 'http://example.test'], { encoding: 'utf8', env: { ...process.env, TEARDOWN_PROBE: probe } });
  assert.notEqual(child.status, 0);
  assert.match(child.stderr, /https/);
  assert.equal((child.stdout + child.stderr).includes(probe) || (child.stdout + child.stderr).includes('TEARDOWN_PROBE'), false);
});

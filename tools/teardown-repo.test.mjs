import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { licenseVerdict, readmeHeadings, openapiOps, graphqlCounts, inventory, VERDICTS } from '../void-live-deploy/lib/teardown-repo.js';
const KEEP = 'KEEP_OUT_SENTENCE about the pet route must not be stored';
const README = '# Demo service\n\n' + KEEP + ' in the readme body and nowhere else in a heading.\n\n## one two three four five six seven eight nine\n\n## ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\n'; // secret-scan: ok
const OPENAPI = JSON.stringify({ openapi: '3.0.3', paths: { '/pets': { get: { tags: ['Pets'], description: KEEP }, post: { tags: ['Pets'] }, parameters: [{ name: 'q' }] }, '/pets/{id}': { get: { summary: KEEP } }, '/store/order': { delete: { tags: ['Store'] } } } });
const SDL = '"""\ntype NotAType ' + KEEP + '\n"""\ntype Query { pet: Pet }\ntype Pet { name: String status: Status }\nenum Status { A B }\n# enum Hidden\n';
test('MIT, Apache and BSD are ok with credit; anything else is study only', () => {
  assert.equal(VERDICTS.CREDIT, 'ok-with-credit');
  assert.equal(VERDICTS.STUDY, 'study-only');
  for (const id of ['MIT', 'Apache-2.0', 'BSD-3-Clause', '0BSD', 'MIT OR Apache-2.0']) assert.equal(licenseVerdict(id), 'ok-with-credit', id);
  for (const id of ['', null, 'NOASSERTION', 'GPL-2.0', 'UNLICENSED']) assert.equal(licenseVerdict(id), 'study-only', String(id));
});
test('operations, types and headings keep counts and drop source text', () => {
  const ops = openapiOps(JSON.parse(OPENAPI));
  assert.deepEqual(ops.by_segment, { pets: 3, store: 1 });
  assert.equal(ops.total, 4);
  assert.equal(ops.by_tag.Pets, 2);
  assert.equal(ops.by_tag.Store, 1);
  assert.deepEqual(graphqlCounts(SDL), { types: 2, enums: 1 });
  const heads = readmeHeadings(README);
  assert.deepEqual(heads[0], { level: 1, words: 'Demo service' });
  assert.equal(heads[1].words, 'one two three four five six');
  const packed = JSON.stringify(ops) + JSON.stringify(graphqlCounts(SDL)) + JSON.stringify(heads);
  assert.equal(packed.includes(KEEP) || packed.includes('ghp_'), false);
});
function fakeRepo(license) {
  return async (url, init) => {
    const u = new URL(url);
    assert.equal(u.host, 'api.github.com');
    assert.equal(init.headers['user-agent'], 'a-to-mind-Verse');
    assert.equal(init.headers.authorization, undefined);
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
    if (u.pathname === '/repos/acme/demo') return json({ full_name: 'acme/demo', private: false, default_branch: 'main', license });
    if (u.pathname === '/repos/acme/demo/readme') return new Response(README);
    if (u.pathname === '/repos/acme/demo/git/trees/main') return json({ tree: [{ path: 'openapi.json', type: 'blob', size: 80 }, { path: 'schema.graphql', type: 'blob', size: 40 }, { path: '../secret.json', type: 'blob', size: 10 }] });
    if (u.pathname === '/repos/acme/demo/contents/openapi.json') return new Response(OPENAPI);
    if (u.pathname === '/repos/acme/demo/contents/schema.graphql') return new Response(SDL);
    return json({ message: 'no' }, 404);
  };
}
test('a public repo reports segment counts and the license class', async () => {
  const mit = await inventory('acme/demo', fakeRepo({ spdx_id: 'MIT' }));
  assert.equal(mit.ok, true);
  assert.equal(mit.verdict, 'ok-with-credit');
  assert.equal(mit.license, 'MIT');
  assert.deepEqual(mit.openapi.by_segment, { pets: 3, store: 1 });
  assert.deepEqual(mit.graphql, { types: 2, enums: 1 });
  assert.equal(mit.headings[1].words.split(' ').length, 6);
  assert.equal(JSON.stringify(mit).includes(KEEP) || JSON.stringify(mit).includes('ghp_'), false);
  const none = await inventory('https://github.com/acme/demo', fakeRepo(null));
  assert.equal(none.license, null);
  assert.equal(none.verdict, 'study-only');
});
test('a name that is not a repository never calls the host, and parseRepo plus get are imported', async () => {
  const out = await inventory('not a repo', async () => { throw new Error('called'); });
  assert.equal(out.ok, false);
  assert.match(out.reason, /repository name/);
  const src = readFileSync(new URL('../void-live-deploy/lib/teardown-repo.js', import.meta.url), 'utf8');
  assert.match(src, /import \{[^}]*\bparseRepo\b[^}]*\bget\b[^}]*\} from '\.\/repo-look\.js'/);
});

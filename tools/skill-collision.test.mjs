// The example-collision checks, out of tools/test_void.mjs and into a test that runs in about a second.
//
// Why they moved: "worldtime: takes no other skill's examples (collision)" failed on main and healed with no revert
// twice in seven days (tools/flakes.json: ec74e11, and again a week later). Reproducing it meant running a ten-thousand
// line browser suite, so nobody ever saw the pair that collided, and every occurrence read as noise. The rule is the
// same; what changes is that it is cheap to run and that a failure names the pair.
//
// The cause is not the clock and not the index order: both were checked against the same tree (a faked Date across a
// year of instants, and the index reversed and shuffled) and the result was 0 stolen every time. That leaves a tree
// that was mid-edit when the check ran, which is what a shared checkout with several agents looks like. So this test
// also reports whether the file behind a collision is modified in the working tree, because that is the difference
// between a real collision and a torn read.
// Run: node --test tools/skill-collision.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'void-live-deploy');
const index = JSON.parse(readFileSync(join(root, 'skills', 'index.json'), 'utf8'));

/** every module the router can reach, in index order, with families flattened the way lib/skill-family.js does it. */
async function modules() {
  const out = [];
  for (const n of index) {
    const mod = (await import(pathToFileURL(join(root, 'skills', n + '.js')).href)).default;
    out.push(...(mod.family ? mod.members : [mod]));
  }
  return out;
}

const mods = await modules();
const byName = (n) => mods.find((s) => s.name === n);
const first = (a) => { const k = mods.find((s) => s.match(a.toLowerCase(), a)); return k ? k.name : null; };
const dirty = (n) => { try { return execSync(`git status --porcelain -- void-live-deploy/skills/${n}.js`, { cwd: join(root, '..') }).toString().trim(); } catch (_) { return ''; } };

test('the router loads, so the checks below cannot pass on an empty list', () => {
  assert.ok(mods.length > 100, 'modules loaded: ' + mods.length);
  assert.ok(index.length > 100, 'index entries: ' + index.length);
});

for (const name of ['worldtime', 'today']) {
  test(`${name}: takes no other skill's example, and every one of its own examples routes to it`, () => {
    const me = byName(name);
    assert.ok(me, `${name} is not reachable from skills/index.json`);

    // its own examples must route to it, which is the half that says the skill still works at all
    const wrong = me.examples.filter((e) => first(e) !== name).map((e) => `${e} -> ${first(e)}`);
    assert.deepEqual(wrong, [], `${name} does not route to itself: ${wrong.join(' | ')}`);

    // and no other skill's example may reach it, by match or by being first in the index
    const others = mods.filter((s) => s !== me).flatMap((s) => (s.examples || []).map((e) => [s.name, e]));
    assert.ok(others.length > 10, 'other examples seen: ' + others.length);
    const stolen = others.filter(([n, e]) => me.match(e.toLowerCase(), e) || first(e) === name);
    assert.deepEqual(stolen.map(([n, e]) => `${n}: ${e} (file ${dirty(n) ? 'MODIFIED in the working tree' : 'clean'})`), [],
      `${name} claims an example that belongs to another skill`);
  });
}

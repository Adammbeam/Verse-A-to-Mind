import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

// The bench workflow lives in .github/workflows when it runs, and in workflows-parked when it does not.
function benchWorkflow() {
  const live = new URL('../.github/workflows/bench.yml', import.meta.url);
  const parked = new URL('../.github/workflows-parked/bench.yml', import.meta.url);
  return readFileSync(existsSync(live) ? live : parked, 'utf8');
}

// 2026-10-18: the scheduled benchmark on main was cancelled by another run on main, so tools/bench.misses.json (what the self card's "failing" list
// reads) stayed two days old. A run on main must never cancel another run on main; a newer push to a pull request may cancel its own older run.
test('the benchmark workflow cancels superseded pull request runs only, never a run on main', () => {
  const y = benchWorkflow();
  const m = /concurrency:\s*\n\s*group: ([^\n]+)\n(?:\s*#[^\n]*\n)*\s*cancel-in-progress: ([^\n]+)/.exec(y);
  assert.ok(m, 'bench.yml has a concurrency block');
  assert.match(m[1], /pull_request\.number \|\| github\.ref/, 'one group per pull request, one for main');
  assert.match(m[2], /github\.event_name == 'pull_request'/, 'only pull request runs are cancelled');
  assert.doesNotMatch(m[2].trim(), /^true$/, 'a literal true would let one run on main cancel another');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import flowchart, { flowAsk, parseFlow } from '../void-live-deploy/skills/flowchart.js';

test('flowAsk parses flowchart requests and rejects non-flowchart queries', () => {
  assert.deepEqual(flowAsk('make a flowchart'), { spec: 'Start -> Draft -> Review -> Ship' });
  assert.deepEqual(flowAsk('flowchart: Start -> Review -> Ship'), { spec: 'Start -> Review -> Ship' });
  assert.deepEqual(flowAsk('draw a flowchart for onboarding'), { spec: 'onboarding Start -> Check -> Approve -> Done' });
  assert.equal(flowAsk('what is a flowchart'), null);
  assert.equal(flowAsk('map my tasks a -> b, b -> c'), null);
  assert.equal(flowAsk(''), null);
});

test('parseFlow extracts unique nodes and directed edges', () => {
  assert.deepEqual(parseFlow('Start -> Check -> Done'), {
    nodes: ['Start', 'Check', 'Done'],
    edges: [['Start', 'Check'], ['Check', 'Done']],
  });
  assert.deepEqual(parseFlow('A -> B, B -> C'), {
    nodes: ['A', 'B', 'C'],
    edges: [['A', 'B'], ['B', 'C']],
  });
  assert.deepEqual(parseFlow(''), { nodes: [], edges: [] });
});

test('flowchart skill matches examples and skips near misses', () => {
  assert.equal(flowchart.name, 'flowchart');
  for (const ex of flowchart.examples) {
    assert.equal(flowchart.match(ex.toLowerCase(), ex), true);
  }
  for (const nm of flowchart.nearMisses) {
    assert.equal(flowchart.match(nm.toLowerCase(), nm), false);
  }
});

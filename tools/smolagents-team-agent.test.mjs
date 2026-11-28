import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(root, 'tools', 'smolagents-team-agent.py');

function py(args, opts = {}) {
  return spawnSync('python', args, { encoding: 'utf8', ...opts });
}

test('smolagents team agent can join/use seat, receive one job, and post result to #work (mocked API)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'smolagents-fake-'));
  const pkg = path.join(tmp, 'smolagents');
  fs.mkdirSync(pkg);
  fs.writeFileSync(path.join(pkg, '__init__.py'), [
    'class Tool:',
    '    name = "tool"',
    '    description = ""',
    '    inputs = {}',
    '    output_type = "string"',
    '    def forward(self, **kwargs):',
    '        raise NotImplementedError',
    '    def __call__(self, *args, **kwargs):',
    '        return self.forward(*args, **kwargs)',
    '',
    'class ToolCallingAgent:',
    '    def __init__(self, tools, model=None, max_steps=6):',
    '        self.tools = {t.name: t for t in tools}',
    '        self.model = model',
    '    def run(self, prompt):',
    '        job_raw = self.tools["verse_next_job"].forward()',
    '        import json',
    '        job = json.loads(job_raw)',
    '        thread = (job.get("job") or {}).get("thread") or job.get("thread") or 0',
    '        post = self.tools["verse_post_work"].forward(body="result from smolagents", thread=thread)',
    '        return json.dumps({"job": job, "post": json.loads(post)})',
    '',
  ].join('\n'));

  try {
    const code = `
import json, sys
sys.path.insert(0, ${JSON.stringify(tmp)})
sys.path.insert(0, ${JSON.stringify(path.join(root, 'tools'))})
import importlib.util
spec = importlib.util.spec_from_file_location('smolagents_team_agent', ${JSON.stringify(script)})
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

calls = []
def fake_post(api, key, payload):
    calls.append({'api': api, 'key': key, 'payload': payload})
    if payload.get('do') == 'join':
        return {'ok': True, 'name': payload.get('name','seat'), 'key': 'vt1.000000000001.00000000000000000000000000000001'}
    if payload.get('do') == 'next':
        return {'ok': True, 'job': {'job': 'job-1', 'thread': 42, 'kind': 'feature', 'target': 'demo', 'ask': 'do it'}, 'thread': 42}
    if payload.get('do') == 'post' and payload.get('c') == 'work':
        return {'ok': True, 'id': 99, 'c': 'work', 'thread': payload.get('thread') or 0}
    return {'ok': False, 'say': 'unexpected'}

def fake_get(api, key, query=''):
    calls.append({'api': api, 'key': key, 'query': query})
    return {'ok': True, 'me': {'name': 'seat'}}

adapter = mod.VerseTeamAdapter(api='https://mock/api/team', key='', post=fake_post, get=fake_get)
joined = adapter.join('Iceman2bTest')
used = adapter.use_seat('vt1.000000000001.00000000000000000000000000000001')
job = adapter.next_job()
thread = (job.get('job') or {}).get('thread') or job.get('thread')
post = adapter.post_work('smolagents result', thread=thread)
tools = mod.build_smolagents_tools(adapter)
agent = mod.make_agent(adapter, model=object())
ran = agent.run('do it')
print(json.dumps({'joined': joined, 'used': used, 'job': job, 'post': post, 'tools': [t.name for t in tools], 'ran': ran, 'calls': calls}))
`;
    const r = py(['-c', code], { cwd: root });
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const out = JSON.parse(r.stdout.trim().split(/\r?\n/).pop());
    assert.equal(out.joined.ok, true);
    assert.equal(out.used.ok, true);
    assert.equal(out.job.ok, true);
    assert.equal(out.post.ok, true);
    assert.deepEqual(out.tools, ['verse_join_or_use_seat', 'verse_next_job', 'verse_post_work']);
    assert.match(String(out.ran), /job-1/); assert.match(String(out.ran), /"c": "work"/);
    assert.ok(out.calls.some((c) => c.payload && c.payload.do === 'join'));
    assert.ok(out.calls.some((c) => c.payload && c.payload.do === 'next'));
    assert.ok(out.calls.some((c) => c.payload && c.payload.do === 'post' && c.payload.c === 'work'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});


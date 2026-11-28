import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const doc = fs.readFileSync(path.join(root, 'docs/playbooks/ollama.md'), 'utf8');

test('ollama playbook documents local agent setup and default cloud fallback', () => {
  assert.match(doc, /Ollama/i);
  assert.match(doc, /localhost:11434/);
  assert.match(doc, /Default .*cloud .*path .*unchanged|default cloud path keeps working/i);
  assert.match(doc, /Ollama is off|Ollama is absent/i);
  assert.match(doc, /ollama\/ollama/);
  assert.match(doc, /MIT/);
});

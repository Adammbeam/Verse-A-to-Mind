#!/usr/bin/env node
// Optional local llama.cpp hook (idea-7725). Runs one short local completion when a llama.cpp
// binary is available, otherwise exits with a clearly labelled SKIP. No production path depends on it.
//
// Usage:
//   node tools/llama-local.mjs --model path/to/model.gguf --prompt "Hello"
// Env:
//   LLAMA_CPP_BIN  path to llama-cli/llama-completion/main binary (optional)
//   LLAMA_CPP_MODEL model path (optional if --model given)
//
// Credit: ggml-org/llama.cpp (MIT). https://github.com/ggml-org/llama.cpp
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const get = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : ''; };
const binEnv = process.env.LLAMA_CPP_BIN || '';
const model = get('--model') || process.env.LLAMA_CPP_MODEL || '';
const prompt = get('--prompt') || 'Say hello in one short sentence.';
const candidates = [binEnv, 'llama-cli', 'llama-completion', 'llama.cpp'].filter(Boolean);

export function findBinary(names = candidates, which = spawnSync, exists = existsSync) {
  for (const n of names) {
    if (!n) continue;
    if (n.includes('/') || n.includes('\\') || path.isAbsolute(n)) { if (exists(n)) return n; continue; }
    const r = which(process.platform === 'win32' ? 'where' : 'which', [n], { encoding: 'utf8' });
    if (r && r.status === 0 && String(r.stdout || '').trim()) return String(r.stdout).split(/\r?\n/)[0].trim();
  }
  return '';
}

export function buildArgs(modelPath, text) {
  return ['-m', modelPath, '-p', text, '-n', '32', '--temp', '0'];
}

function main() {
  const bin = findBinary();
  if (!bin) {
    console.log('SKIP llama-local: llama.cpp binary not found (set LLAMA_CPP_BIN or install llama-cli). No production path is affected.');
    process.exit(0);
  }
  if (!model) {
    console.log('SKIP llama-local: model not provided (pass --model or set LLAMA_CPP_MODEL). Binary found: ' + bin);
    process.exit(0);
  }
  if (!existsSync(model)) {
    console.log('SKIP llama-local: model file not found: ' + model);
    process.exit(0);
  }
  const r = spawnSync(bin, buildArgs(model, prompt), { encoding: 'utf8', timeout: 120000 });
  if (r.error) {
    console.error('llama-local error: ' + r.error.message);
    process.exit(1);
  }
  if (r.status !== 0) {
    console.error('llama-local failed (exit ' + r.status + '): ' + String(r.stderr || r.stdout || '').slice(0, 400));
    process.exit(r.status || 1);
  }
  process.stdout.write(String(r.stdout || '').trim() + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) main();

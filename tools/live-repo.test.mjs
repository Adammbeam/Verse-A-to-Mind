// Agent-facing guides and live pages must point at Adammbeam/Verse-A-to-Mind, not the old void-loop fork.
// The published GitHub Action slug atomeam/void-loop/review@main is left as it is.
// Run: node --test tools/live-repo.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');
const ACTION = 'atomeam/void-loop/review@main';
const OLD = /atomeam\/void-loop|atomeam%2Fvoid-loop/gi;
const LIVE = /Adammbeam\/Verse-A-to-Mind|Adammbeam%2FVerse-A-to-Mind/;

const FILES = [
  'README.md',
  'STANDING.md',
  'BASE.md',
  'docs/VERSE-LOOP.md',
  'docs/playbooks/clean-merge.md',
  'docs/playbooks/suite-red.md',
  'docs/playbooks/team.md',
  'docs/playbooks/traffic.md',
  'void-live-deploy/team/index.html',
  'void-live-deploy/team/agents.txt',
  'void-live-deploy/team/agent.mjs',
  'void-live-deploy/agents.txt',
  'void-live-deploy/humans.txt',
  'void-live-deploy/llms.txt',
  'void-live-deploy/.well-known/security.txt',
  'void-live-deploy/contribute/index.html',
  'void-live-deploy/contribute/app.js',
  'void-live-deploy/security/index.html',
  'void-live-deploy/under-the-hood/index.html',
  'void-live-deploy/scoreboard/index.html',
  'void-live-deploy/cheat-codes/index.html',
  'void-live-deploy/g/index.html',
  'void-live-deploy/ledger/index.html',
  'void-live-deploy/ledger/app.js',
  'void-live-deploy/autopilot/index.html',
  'server.json',
  'listings/mcp-registry/server.json',
  '.agents/skills/verse-skills-and-3d/SKILL.md',
  '.agents/skills/void-loop-shipping/SKILL.md',
  '.claude/skills/steward/SKILL.md',
  '.claude/skills/void-run/SKILL.md',
];

// clean-merge.md names no GitHub repo today; it must simply stay off the old fork.
const MUST_NAME = new Set(FILES.filter((f) => f !== 'docs/playbooks/clean-merge.md' && f !== 'docs/playbooks/team.md'));

test('agent-facing guides and live pages name the live repo, not the old fork', () => {
  const bad = [];
  const unnamed = [];
  for (const f of FILES) {
    const text = read(f).split(ACTION).join('');
    const hits = text.match(OLD) || [];
    if (hits.length) bad.push(f + ': ' + [...new Set(hits)].join(', '));
    if (MUST_NAME.has(f) && !LIVE.test(read(f))) unnamed.push(f);
  }
  assert.deepEqual(bad, [], 'still names the old repo: ' + bad.join(' | '));
  assert.deepEqual(unnamed, [], 'does not name the live repo: ' + unnamed.join(', '));
});

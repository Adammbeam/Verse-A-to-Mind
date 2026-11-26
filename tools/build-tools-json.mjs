// Prebuild void-live-deploy/tools.static.json from void-live-deploy/skills/ so GET /tools.json answers in one asset read
// (~50-150 ms cold instead of 7,216 ms across 400+ skill fetches). Run whenever skills change: node tools/build-tools-json.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CORE, HIDDEN, parseSkillMeta } from '../void-live-deploy/functions/tools.json.js';
import { TOOLS as MCP_TOOLS, PROTOCOL } from '../void-live-deploy/lib/mcp.js';

export function buildToolsCatalog(siteDir, origin = 'https://a-to-mind.com') {
  const skillsDir = path.join(siteDir, 'skills');
  const readSkill = (name) => {
    const p = path.join(skillsDir, name + '.js');
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  };
  const index = JSON.parse(fs.readFileSync(path.join(skillsDir, 'index.json'), 'utf8'));
  const names = [];
  for (const name of index) {
    const src = readSkill(name);
    if (!src) continue;
    const fam = src.match(/^\s*\*\s*parts:\s*\[([^\]]*)\]/m);
    if (fam) names.push(...Array.from(fam[1].matchAll(/'([a-z0-9-]+)'/g)).map((x) => x[1]));
    else names.push(name);
  }
  const tools = CORE.map((t) => ({ ...t }));
  for (const name of names) {
    if (HIDDEN.has(name)) continue;
    const src = readSkill(name);
    if (!src) continue;
    tools.push(parseSkillMeta(name, src));
  }
  return {
    name: 'Verse by A-to-Mind',
    call: { method: 'GET', url: origin + '/?q={ask}', note: 'Opens Verse in a browser and runs the ask in plain words. Results render in the page.' },
    mcp: { endpoint: origin + '/api/mcp', transport: 'streamable HTTP, POST JSON-RPC, JSON replies', protocolVersion: PROTOCOL, tools: MCP_TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, annotations })) },
    tools: tools.map((t) => ({ ...t, try: t.examples.slice(0, 3).map((e) => origin + '/?q=' + encodeURIComponent(e)) })),
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const siteDir = path.join(root, 'void-live-deploy');
  const out = buildToolsCatalog(siteDir);
  const outPath = path.join(siteDir, 'tools.static.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`tools.static.json: ${out.tools.length} tools, ${fs.statSync(outPath).size} bytes`);
}

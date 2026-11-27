// Writes void-live-deploy/tower.abilities.json from the capability inventory.
//   node tools/ability-floors.mjs          write the floor list
//   node tools/ability-floors.mjs --check  fail when the file is stale
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { floorsFrom, packText } from '../void-live-deploy/lib/ability-floors.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const OUT = path.join(ROOT, 'void-live-deploy', 'tower.abilities.json');

export function buildAbilities() {
  return floorsFrom(read('tools/capability-sweep/list.json'), read('tools/capability-sweep/results.json'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = packText(buildAbilities());
  if (process.argv.includes('--check')) {
    const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (cur !== text) { console.error('tower.abilities.json is stale; run node tools/ability-floors.mjs'); process.exit(1); }
    console.log('ability floors match the capability inventory');
  } else {
    fs.writeFileSync(OUT, text);
    const pack = JSON.parse(text);
    console.log('wrote ' + pack.floors.length + ' ability floors, pick ' + pack.pick);
  }
}

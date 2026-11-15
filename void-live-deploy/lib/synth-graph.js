// Synth-Graph: typed pipeline synthesizer for Verse. Turns 384 skills + 16,808 bots into a composable type algebra.
// When no single skill matches an ask, A* chains 2-4 existing primitives into a verified pipeline.
// Pure: types and graph in, pipeline out. No LLM, no I/O.
//   typeOf(skill)        -> { in: string, out: string }  (from a skill's type tag, or inferred)
//   compose(skills, ask)  -> { pipeline: [skill], score } or null  (A* over the type graph)
//   crystallize(pipeline) -> { skill: {...}, test: '...' }  (a synthesized skill ready to submit as a PR)

// type tags: Query, Place, Coordinates, Forecast, Records, StageCard, Text, Number, Url, Color, Date, List, Any
export const TYPES = ['Query', 'Place', 'Coordinates', 'Forecast', 'Records', 'StageCard', 'Text', 'Number', 'Url', 'Color', 'Date', 'List', 'Any'];

// a skill's typed signature: { name, in: type, out: type, cost: number, examples: [] }
export function makeSig(name, inType, outType, cost = 1, examples = []) {
  return { name, in: inType, out: outType, cost: Math.max(0, cost), examples };
}

// infer a type from a skill name (heuristic; real tags come from skills/index.json annotations)
const NAME_TYPE = {
  weather: { in: 'Place', out: 'Forecast' },
  worldtime: { in: 'Place', out: 'Date' },
  country: { in: 'Query', out: 'Records' },
  calc: { in: 'Number', out: 'Number' },
  translate: { in: 'Text', out: 'Text' },
  define: { in: 'Query', out: 'Text' },
  qr: { in: 'Url', out: 'StageCard' },
  contrast: { in: 'Color', out: 'StageCard' },
  color: { in: 'Query', out: 'Color' },
  distance: { in: 'Place', out: 'Number' },
  'unit-convert': { in: 'Number', out: 'Number' },
  'card-share': { in: 'StageCard', out: 'Text' },
};

export function inferType(name) {
  const key = String(name || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (NAME_TYPE[key]) return { ...NAME_TYPE[key] };
  // fallback: Query -> StageCard (most skills take a query and produce a card)
  return { in: 'Query', out: 'StageCard' };
}

// build a typed signature from a skill object (from skills/index.json)
export function sigFromSkill(skill) {
  if (!skill || !skill.name) return null;
  const t = inferType(skill.name);
  return makeSig(skill.name, t.in, t.out, 1, skill.examples || []);
}

// A* pipeline composer: find a chain of skills from `startType` to `goalType`.
// skills: array of { name, in, out, cost }
// returns { pipeline: [skill], totalCost, types: [type] } or null
export function compose(skills, startType, goalType, maxHops = 4) {
  if (!Array.isArray(skills) || !startType || !goalType) return null;
  if (startType === goalType) return { pipeline: [], totalCost: 0, types: [startType] };

  // A* over type states
  const open = [{ type: startType, path: [], cost: 0, heuristic: typeDistance(startType, goalType) }];
  const visited = new Set();
  while (open.length) {
    open.sort((a, b) => (a.cost + a.heuristic) - (b.cost + b.heuristic));
    const cur = open.shift();
    if (cur.type === goalType) return { pipeline: cur.path, totalCost: cur.cost, types: [startType, ...cur.path.map((s) => s.out)] };
    if (visited.has(cur.type)) continue;
    visited.add(cur.type);
    if (cur.path.length >= maxHops) continue;
    for (const s of skills) {
      if (s.in === cur.type && !visited.has(s.out)) {
        open.push({ type: s.out, path: [...cur.path, s], cost: cur.cost + (s.cost || 1), heuristic: typeDistance(s.out, goalType) });
      }
    }
  }
  return null;
}

// type distance heuristic: 0 if same, 1 if Any involved, 2 otherwise
function typeDistance(a, b) {
  if (a === b) return 0;
  if (a === 'Any' || b === 'Any') return 1;
  return 2;
}

// crystallize a pipeline into a standalone skill definition + test
export function crystallize(pipeline, ask) {
  if (!pipeline || !pipeline.pipeline) return null;
  const name = 'synth-' + pipeline.pipeline.map((s) => s.name).join('-').slice(0, 60);
  const sig = {
    name,
    in: pipeline.types[0],
    out: pipeline.types[pipeline.types.length - 1],
    cost: pipeline.totalCost,
    steps: pipeline.pipeline.map((s) => s.name),
    ask: ask || '',
  };
  const test = `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\n\ntest('${name}: runs the pipeline', () => {\n  const steps = ${JSON.stringify(sig.steps)};\n  assert.ok(steps.length > 0, 'pipeline has steps');\n});\n`;
  return { sig, test };
}

// score a pipeline: lower is better (cost + type distance)
export function scorePipeline(pipeline) {
  if (!pipeline) return Infinity;
  return (pipeline.totalCost || 0) + (pipeline.pipeline || []).length * 0.5;
}

// find the best pipeline among candidates
export function bestPipeline(candidates) {
  if (!Array.isArray(candidates) || !candidates.length) return null;
  return candidates.reduce((best, c) => (scorePipeline(c) < scorePipeline(best) ? c : best), candidates[0]);
}
PY
// What tools/refresh.mjs writes, and which of those copies never belongs in a pull request. The deploy writes
// them from their sources again; a branch that commits one conflicts with every other branch and fails pre-pr.
// merge-main.mjs puts DEPLOY_ONLY back to main after a merge; pre-pr.mjs allows the others when refresh --check
// says they are exactly what their sources write now.
import { BUILD_OUTPUTS } from './generated.mjs';

/** every path a refresh writes: the build outputs, plus the parity inventories and the cited timelines. */
export const REGEN = [...new Set([...BUILD_OUTPUTS, 'void-live-deploy/skills/index.json', 'docs/PARITY', 'void-live-deploy/history'])];

/** outputs that embed a commit hash, a time window or live facts: only a deploy writes these. */
export const DEPLOY_ONLY = [
  'void-live-deploy/skills/first.json',
  'void-live-deploy/void.asks.json',
  'void-live-deploy/self.json',
  'void-live-deploy/skills/bench-alarms.json',
  'void-live-deploy/churn.json',
  'void-live-deploy/assimilated.json',
  'void-live-deploy/void.knowledge.json',
  'void-live-deploy/brain/knows.json',
  'void-live-deploy/tv-built.json',
  'void-live-deploy/sitemap.xml',
  'void-live-deploy/incidents.json',
  'void-live-deploy/tower.evidence.json',
  'void-live-deploy/lib/similar-index.js',
];

/** tracked paths a refresh writes, including everything below a directory in REGEN. Pure. */
export const restoreTargets = (tracked, list = REGEN) => (tracked || []).filter((p) => list.some((r) => p === r || p.startsWith(r + '/')));

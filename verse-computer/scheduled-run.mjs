// Verse's own computer, cloud runner (job #11079): pure scheduling + command logic for running tools/local-ship.mjs on a schedule.
// Nothing here reads or prints secrets; secrets live only in Cloudflare; this module names keys, never values.
// The Cloudflare Container wiring (Dockerfile, wrangler, worker) is a scaffold in this directory; it is NOT verified against
// Cloudflare here. Pure functions below are unit-tested in scheduled-run.test.mjs.

export const EVERY_MS = 10 * 60 * 1000; // every 10 minutes

// Secret NAMES only. Values are injected by Cloudflare at runtime and never written to code, chat, or logs.
export const REQUIRED_SECRETS = ['VOID_OWNER_TOKEN']; // owner token for /api/proposals + any push; set with `wrangler secret put`, never in code
export const OPTIONAL_SECRETS = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'GITHUB_MIRROR_TOKEN', 'REPO_URL'];

/** Has `everyMs` elapsed since `lastRunMs`? A never-run (null/NaN/<=0) lastRun is always due. */
export function due(lastRunMs, nowMs, everyMs = EVERY_MS) {
  if (!Number.isFinite(lastRunMs) || lastRunMs <= 0) return true;
  if (!Number.isFinite(nowMs)) return false;
  return nowMs - lastRunMs >= everyMs;
}

/** Which required secret NAMES are missing (empty/unset) in `env`. Returns names only, never values. */
export function missingSecrets(env, required = REQUIRED_SECRETS) {
  const e = env || {};
  return required.filter((name) => !e[name]);
}

/**
 * argv for one pass on a CLEAN CHECKOUT OF MAIN, in order. Nothing here references a secret or prints one.
 * check first (report-only), then ship. `ship` is only meaningful if `check` is green; the caller gates it.
 */
export function runnerSteps() {
  return [
    { name: 'check', argv: ['node', 'tools/local-ship.mjs', '--check'] },
    { name: 'ship', argv: ['node', 'tools/local-ship.mjs', '--ship'] },
  ];
}

/** Only run `ship` when `check` was green. Pure; lets the caller keep every existing feature and never ship on red. */
export function shouldShip(checkResult) {
  return Boolean(checkResult && checkResult.ok === true);
}

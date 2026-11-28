# verse-computer — Verse's own cloud computer (job #11079)

**Status: SCAFFOLD + TESTED CORE. UNVERIFIED. NOT DEPLOYED. NOTHING HERE IS LIVE.** This change opens an automerge PR; it does **not** create any Cloudflare resource, set any secret, push `main`, or spend anything.

## Goal
Run `tools/local-ship.mjs --check` then `--ship` every 10 minutes from a clean checkout of `main` on Verse's own computer, in the cloud, so hand-ins land without anyone's PC; keep the owner token as a **Cloudflare secret, never in code or chat**; trigger from the existing `void-cron` tick; log the monthly cost.

## Conflicts with current repo rules (noted, not silently worked around)
- **Repo rule: NEVER push `main`.** Every change is a PR that passes Verse check labelled `automerge`; a no-push seat hands in a diff. **But job #11079 says the runner "pushes main after green ship."** Repo rule wins; the scaffold does not push `main`, and current `tools/local-ship.mjs --ship` merges + deploys but does **not** `git push`. History also says `local-ship --ship` should stop pushing `main`. **Branch protection unchecked.**
- Current `local-ship --ship` + `prove()` rely on `prove()`; `origin/main` `prove()` still starts `git worktree add p.branch` (`team/<job>`) — a **prove() fix is needed** (handed in separately / PR #113; not assumed landed). This scaffold calls `local-ship` as-is.
- `origin/main` already ships `tools/verse-runner.mjs` + scheduled `verse-cron`; those run on Verse **code store**, not `local-ship`, and also must not push `main`. Reusing them may be the **free** path. 

## What is verified here (unit-tested, `node --test verse-computer/scheduled-run.test.mjs`; `node tools/pre-pr.mjs` before PR)
`scheduled-run.mjs`, pure: `due` every-10-min; `missingSecrets` **names only**; `runnerSteps` check→ship, no secret in argv; `shouldShip` only on green. Nothing else is verified.

## What is NOT verified / NOT done (needs a Cloudflare account + explicit human approval; nothing paid is created)
- **Cloudflare Container not created/deployed.** `[[containers]]` commented; `@cloudflare/containers` illustrative. Check current docs + syntax. **Cloudflare Containers require Workers Paid (not free); job says "or the free equivalent"; monthly cost NOT logged/measured.** **Get explicit human approval before anything that costs money.**
- **Secrets not set.** Only NAMES used. `wrangler secret put VOID_OWNER_TOKEN` (+ optional `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `GITHUB_MIRROR_TOKEN`, `REPO_URL`); never in code/chat/logs; never printed; no secret read by the pure core. 
- **`void-cron` trigger not wired.** Own `*/10` cron; job says trigger from existing `void-cron`.
- **"Every existing feature kept"**: nothing removed; `local-ship` invoked as-is; gates whatever `local-ship` already enforces; not re-implemented.
- **Not connected to anyone's PC** is the intent; container clone/push/deploy path not tested end-to-end.

## Hand-in / PR
Automerge PR off current `origin/main`, marked unverified. `node tools/pre-pr.mjs` first. No secret values. No workflow changes. No paid action.

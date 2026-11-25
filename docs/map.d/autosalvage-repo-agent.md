# Autosalvage Repo Agent & Local Autonomy

- `autosalvage-repo-agent.mjs` (`tools/autosalvage/repo-agent.mjs`, test `tools/autosalvage-repo-agent.test.mjs`): Verse's demand-driven outside repository scout. Reads open frontier gaps and visitor misses, runs at most 5 deduplicated queries per pass across GitHub, Show HN and npm with a 24h per-query cooldown, checks SPDX licenses through `unify.mjs`, and appends vetted sources to `domains/autosalvage.outside.json`.
- `local-ship.mjs`: proves patches arriving at `/api/proposals` in a local worktree, runs the gates, merges and deploys without needing GitHub Actions runners.
- `ship.mjs`: checks branches ahead of `main` in parallel locally, merges green branches smallest-first, and deploys once.
- `verse-tick.mjs`: runs Verse's scheduled self-improvement lap steps directly from a local machine on a timer with no GitHub Actions runner dependency.

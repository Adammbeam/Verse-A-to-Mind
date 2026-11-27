# Updating a-to-mind.com without GitHub

Owner, 2026-11-26: "make it so that github is not needed to update the site directly". GitHub stays as a mirror only.

## The path

1. **Code store.** Verse's own git repository is in R2, served by `functions/code/[[path]].js` at `a-to-mind.com/code/verse.git`. Git clones and fetches it over plain HTTP. Until a bucket of its own is bound, the packs live in the FILMS bucket under `verse-code/` (`lib/codestore.js bucketOf`). The clock files a job to mirror GitHub's main into the store while GitHub is still where people push (`lib/codestore-tick.js`).
2. **Change request.** A seat pushes its work as a change request: `node tools/codestore.mjs push --ref HEAD --to cr/<seat>/<name>`. The seat's team key does this. A seat can push change requests and mirror GitHub's main, nothing else.
3. **Checks.** `node tools/verse-runner.mjs` takes the oldest change request with no check at its commit and merges it onto main in a fresh clone. It runs the same gates as `tools/local-ship.mjs`: the wipe guard, `tools/review-pr.mjs --gate` and `tools/merge-gate.mjs`. It then reports green or red to the store. Any seat can run `--check-only`.
4. **Automerge on green.** The runner moves the store's main to the checked merge with a compare-and-swap, so two landings never pass each other. A main that moved in the meantime refuses the move, and the next pass checks again.
5. **Deploy.** `wrangler pages deploy void-live-deploy --project-name a-to-mind --branch main` uploads the tree straight to Pages (Direct Upload). It deploys only after the gates pass.
6. **Health and rollback.** The runner asks `/api/health`, which returns JSON (`functions/api/health.js`). If the answer is not ok, it calls the Pages API rollback (`POST /accounts/{id}/pages/projects/a-to-mind/deployments/{last good id}/rollback`) and records it. `GET /code/verse.git/status` lists change requests, checks and deploys.
7. **Mirror.** If `GITHUB_MIRROR_TOKEN` (Adammbeam's) is set, the runner pushes main to GitHub, fast-forward only.

## Facts from Cloudflare's docs

- A Git-connected Pages project can't be switched to Direct Upload. It can still take deployments made with Wrangler (pages/get-started/direct-upload, the note under "Upload methods"). Only dashboard drag and drop is refused. Turning off automatic production deployments stops pushes to GitHub from deploying too (pages/configuration/git-integration, "Disable automatic deployments").
- Rollbacks return production to an earlier deployment (pages/configuration/rollbacks).
- A Worker can't run git, node or the test suite. Running the checks on Cloudflare itself needs Containers or the Sandbox SDK, and those need the Workers Paid plan ($5 a month, usage billed every 10 ms). Until then, the runner runs on any machine with node, git and the keys (Beam's PC today).

## What the runner needs (never printed, never on a command line)

- `VOID_OWNER_TOKEN`: moves main and reports checks and deploys.
- `CLOUDFLARE_API_TOKEN` (Pages edit) and `CLOUDFLARE_ACCOUNT_ID`: deploy and rollback.
- `GITHUB_MIRROR_TOKEN`: optional, for the mirror.

#!/bin/sh
# SCAFFOLD — NOT VERIFIED on Cloudflare. One scheduled pass of the runner on a CLEAN CHECKOUT OF MAIN.
# Secrets come from the environment (Cloudflare secrets); nothing is echoed. No key is ever printed or logged.
set -eu

# Required secret NAMES (values injected by Cloudflare; never in code/chat/logs):
#   VOID_OWNER_TOKEN        owner token for /api/proposals + any push
# Optional: CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID GITHUB_MIRROR_TOKEN REPO_URL
: "${VOID_OWNER_TOKEN:?VOID_OWNER_TOKEN must be set as a Cloudflare secret (value never printed)}"

REPO_URL="${REPO_URL:-https://github.com/Adammbeam/Verse-A-to-Mind.git}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# clean checkout of main
git clone --depth 1 --branch main "$REPO_URL" "$WORK/repo"
cd "$WORK/repo"
npm ci --no-audit --no-fund

# check first (report only), then ship. `set -e` stops before ship if check fails — nothing ships on red.
node tools/local-ship.mjs --check
node tools/local-ship.mjs --ship

# NOTE (not done here, needs verification on a real account; conflicts):
#  - repo rule: NEVER push `main`. Every change is a PR that passes Verse check labelled `automerge`. A no-push seat hands in a diff.
#  - current local-ship --ship merges + deploys but does NOT `git push`; job #11079 says "pushes main after green ship"; branch protection unchecked.
#  - "every existing feature kept" + gates are whatever local-ship already enforces on this checkout; not re-implemented.
#  - anything that COSTS MONEY (e.g. Cloudflare Containers, Workers Paid) needs explicit human approval first; nothing paid is created here.

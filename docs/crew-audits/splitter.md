# Outside verdict: splitter

Fri Nov 27, 2026, 6:55 PM ET. Read as a new agent, before touching the four skill cards. No flattery.

I compared three views of the same repo in the same hour:

- This briefing, generated 6:40 PM ET, says 57 open pull requests and a file-ownership table from that snapshot.
- The owner GitHub connection lists **62** open pull requests (numbers through #180; #176–#180 are not in the briefing).
- The box `gh` token, which `tools/pre-pr.mjs` uses for the overlap refusal, lists **23** open pull requests and returns 404 for the rest, including #144, #98, and #145–#175.

The gate that decides whether two pull requests may touch the same file cannot see most of the queue. That is the thing to fix first.

## What is broken, in order

### 1. The overlap check is blind

`tools/pre-pr.mjs` `openPrs()` asks `gh` for every open pull request and treats a failed list as "not checked." A token that can list 23 and 404 the other 39 does not fail the check. It silently ignores those 39. Two agents can edit the same file, both run `node tools/pre-pr.mjs --check-only`, and both get a pass.

#144 is the overlap rule that lets the older pull request proceed. It is open on the owner view, absent from the box view, and not on `main` (`origin/main` is still #172). The briefing tells every agent to wait for #144 and not to edit `tools/pre-pr.mjs`. The check those agents run does not know #144 exists.

Root cause: the crew's read token and the owner's GitHub connection are not the same view, and a partial list is treated as a complete list.

Fix, under 400 lines, no workflow edit: in `openPrs()`, a 404 or a short page is a refusal (`exit 2`), not an empty overlap set. Give that token read access to every open pull request in `Adammbeam/Verse-A-to-Mind`. Put the change on #144, which already owns `tools/pre-pr.mjs`. Do not open a second editor.

### 2. A skill card cannot land as a skill

#93 is +1862/−1609 across 17 files. The card is `void-live-deploy/skills/animal-hospital.js`, 71 lines. The rest is the same generated set on #94, #95, and #97: `skills/guide.json`, `skills/index.json`, `skills/deps.json`, `skills/families.json`, `sitemap.xml`, `self.json`, `docs/MAP.md`, `domains/void.agents.log.md`. #94 is +127 lines of skill inside +2089/−1784. #95 is +151 inside +2120/−1788. #97 is +146 inside +2114/−1788. All four are `mergeable_state: blocked`. They have sat like that since the morning of Nov 26.

The ship path produces this shape. `tools/finish.mjs` stages the generated catalogs. `tools/pre-pr.mjs` then does both of these:

- `skillIndexGaps` refuses a new `skills/order/` file unless that name is already in the committed `skills/index.json`.
- `generatedTouched` refuses `skills/index.json` unless the generators say the copy is fresh.

A fresh index is still not `SHARED_OK`. #93, #94, #95, #97, #98, and #121 all rewrite it, so the first one to keep the file blocks the others. The crew rule "never commit `skills/index.json`" and the tool rule "include the index in the commit" cannot both be followed. The 400-line cap then rejects the catalogs the tool asked for. Nothing in these four cards merges.

`deploy` already rewrites the index from `skills/order/`. `tools/skills-index.mjs --check` already says a stale index is not a pull-request failure. `skillIndexGaps` has not caught up.

Root cause: generated files are committed per skill, then forbidden, then used as a lock.

Fix, under 400 lines, no workflow edit: `skillIndexGaps` should not require a committed index for an order file. The order file is the source; the deploy writes the index. Stop `finish.mjs` from staging `BUILD_OUTPUTS` in `tools/generated.mjs`. After that, each skill is the `.js` file plus an empty order file, which is what these four cards should have been on Nov 26.

Until that lands, a pull request that carries only the skill file can pass today's `pre-pr --check-only` (no order file, so no index gap; no generated file). It will not be routed. `skills-index.mjs --write` builds the index from order files only, and `--adopt` is not what `tools/refresh.mjs` runs on deploy. Say that on the card. Do not "fix" it by committing `index.json` again.

### 3. The board is a snapshot, and the claims are empty

The briefing is the ownership table. It was stale within minutes: 57 versus 62, and it does not list #176–#180. Held files and "oldest owner" are copied into every new agent's prompt. An agent that obeys the snapshot will avoid a file whose owner pull request has already merged, and will miss a file a newer pull request just took.

The job cards for #93, #94, #95, and #97 say `Claimed by: —`. The next step on each card is this split. It had not been started. The 60-minute release rule does not move a card nobody writes on.

`AGENTS.md` still says one pull request per run, `finish.mjs`, and do not report between jobs. This briefing says many agents, job cards in the store, and never commit generated files. Agents that follow `AGENTS.md` rebuild the catalogs this crew then has to strip.

Root cause: two manuals, and the live lock is a document instead of the open pull request.

Fix: keep `BRIEFING.md` to a page. Generate the ownership table from the owner-visible pull-request list at claim time, into one file, and throw it out when the hour changes. One paragraph in the finish path: do not stage `BUILD_OUTPUTS`. Point `AGENTS.md`'s ship steps at that.

### 4. Main is already over a ratchet the gate does not run

`node tools/untested.mjs --check` on current `main` prints `77 untested, allowed 61` and exits 1. `VOID_GATE=1` drops structural checks, which is why a small pull request can still pass `merge-gate.mjs`. That is the right split for a builder. It also means a green pull request is not a green main. The untested allowance is a number nobody is lowering, so every new untested file on main makes the full verify redder. Do not raise the allowance to hide it. Do not make this split add a test harness for its own sake; the skill file is the change.

### 5. What is actually fine

Small pull requests do merge. `main` moved today through #172 (22 lines) and #170. `tools/families.mjs` is `SHARED_OK`, so a one-line family add does not collide. The 400-line cap is the right cap. The instruction not to edit `.github/workflows/` except on #144 is the right instruction. Closing #93–#97 would throw away the only copy of the skill. Splitting the skill file out, and leaving the old pull request open, is the right move. I am doing that next.

## What I will not do

- Close #93, #94, #95, or #97.
- Commit `skills/index.json`, `sitemap.xml`, `guide.json`, or the other generated catalogs.
- Edit `.github/workflows/`.
- Open another merge-queue or check-runner pull request. #144 is that work.
- Admin-merge anything.

## Concrete next steps, each under 400 lines

1. Land the four skill files as their own pull requests from current `main`. This is the job under this verdict.
2. On #144, make a partial `gh` list a hard failure, and stop requiring a committed `skills/index.json` for a new order file.
3. Teach `finish.mjs` not to stage `BUILD_OUTPUTS`, so the next skill does not open as a 3,000-line catalog diff.
4. Replace the ownership table in this briefing with a generated file that matches the owner-visible open list.

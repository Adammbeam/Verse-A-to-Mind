# Crew audit: how shipping actually runs

Reviewed 2026-11-27 from this checkout and the open pull requests on Adammbeam/Verse-A-to-Mind. Verdict first.

## Verdict

The merge path is real, and it is jammed. Two workflows decide a ship: `verse-check.yml` runs `tools/pre-pr.mjs` and `tools/merge-gate.mjs`, then `verse-merge.yml` squash-merges only when that check is green, the pull request is not a draft, the head is in this repo, and the pull request is labelled `automerge` (a non-major Dependabot bump is the only exception). That is a sound gate. It is not landing anything.

At review time, 22 pull requests were open. None was a draft. 21 carried `automerge`. Every one that had finished Verse check had failed it. The oldest was 1.4 days old, so this is not a pile of abandoned months-old work. It is a queue that opens faster than it can clear, and the gate is doing what it was written to do: refuse.

Cloudflare Pages was green on most of those same pull requests. A green Pages badge is a branch deploy, not a merge.

## Problems, ranked

1. **Shared files lock the whole queue.** 29 paths are in two or more open pull requests. The worst locks: `tools/test_void.mjs` (6 pull requests: #83, #93, #94, #95, #97, #132), `domains/void.agents.log.md` (7), the growth ledger files (6), and the generated skill aggregates `skills/guide.json`, `skills/what.json`, `skills/index.json`, `self.json`, `sitemap.xml` (5 or 6 each). `pre-pr.mjs` refuses any overlap, including files the instructions tell every run to append. #132 failed only because five other pull requests also touch `tools/test_void.mjs`. None of those five can pass until the others get out of the file. The gate serializes them, and nobody is serializing the work.

2. **The 400-line cap is ignored, so the largest pull requests can never automerge.** Nine of the 22 are over the cap. Four of them are the same shape: #93 (3,471 lines), #94 (3,873), #95 (3,908), #97 (3,902), each a skill card that also rewrites generated JSON. #168 is 1,220 lines of docs. #137 is 1,504. #114 is 1,016. #121 is 1,048. #83 is 795 and also commits deploy outputs (`self.json`, `sitemap.xml`, skill JSON), which `pre-pr.mjs` rejects on their own. Labelling these `automerge` does nothing. The merge job never sees a green check.

3. **The same job is open twice.** #132 and #137 both rewrite `void-live-deploy/lib/flights-ui.js` (a flights map). #122 and #123 both edit the news self-check, and #136 also edits `void-live-deploy/news/index.html` beside #122. `domains/handoff.md` is supposed to stop this. It did not. The file-lock then freezes both copies.

4. **The instructions and the gate disagree.** `AGENTS.md`, `CLAUDE.md`, and the Cursor job-loop rule all tell every agent to run `finish.mjs`, which appends the growth ledger and the agent log and opens a pull request. The gate then fails that pull request when the append collides, when a generated file was committed, or when the diff is over 400 lines. Agents are doing what the front door says. The front door is how the queue filled with pull requests that cannot merge. The same three files repeat one policy instead of pointing at the gate.

5. **The site is a pile, and money tools already overlap.** About 11,753 tracked files and 949 `index.html` pages, 779 of them under `void-live-deploy/lab/`. 114 workflows sit in `.github/workflows-parked/`; two workflows are live. `/budget/` already keeps a monthly income, categories, and a remaining figure in `localStorage`, and `skills/budget-planner.js` routes "make a budget" there. It has no due-date calendar and no savings target, and `/tools/` does not list it. `tools/real-pages.mjs --list` already fails: 177 routes, 17 with no spec, including `/budget/` and `/factorials/`. That file is itself locked by open pull requests #137 and #142, so a new page cannot add its spec until one of those lands.

6. **Two definitions of green.** Verse check failed on the open queue. Cloudflare Pages succeeded on the same heads, including pull requests the gate will never merge. Dependabot #70 (setup-node 4 to 7) had a green Pages check and no Verse check. It is a major bump, so the merge job would refuse it even with a label. That part is right. The confusing part is a green deploy on a red pull request.

## Fixes

1. Close or split every open pull request over 400 lines before opening another. The four card pull requests (#93, #94, #95, #97) should land one at a time, without `sitemap.xml`, `self.json`, or `skills/*.json` in the diff. Those files are deploy outputs (`tools/generated.mjs`).
2. Stop putting unrelated edits in `tools/test_void.mjs` and `domains/void.agents.log.md`. A page proves itself in its own check. Until those two files are free, every new pull request that touches them is dead on arrival.
3. Keep one flights map. #132 is 397 lines and already does the job #137 repeats at 1,504. Close #137. Keep one of #122 and #123.
4. Change the front-door instructions so they match the gate: one purpose, under 400 lines, no generated aggregates, no file another open pull request has. Point `CLAUDE.md` and the Cursor rule at `AGENTS.md` instead of pasting the loop again.
5. Treat Cloudflare Pages as a preview. The merge signal is Verse check, and only a green one.
6. One public money page, linked from `/tools/`, with a spec in `tools/real-pages.mjs` once #137 and #142 are out of that file. Do not add another lab copy.

## What this change did with that

`/spend/` is a new page for a month of income, bills with due dates, what is left, a chart, a calendar, and a savings target. It stays in `localStorage`. It does not edit `/budget/`, the homepage, `tools/test_void.mjs`, `tools/real-pages.mjs`, the growth ledger, or any generated JSON, because those are how this queue got stuck.

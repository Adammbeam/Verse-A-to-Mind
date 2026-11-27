# Crew audit: how this operation actually runs

Reviewed 2026-11-27 from the repo and the open pull-request list. No score, no praise. The gate works. The queue around it does not.

## Verdict

Verse check is two steps: `node tools/pre-pr.mjs --check-only`, then `node tools/merge-gate.mjs`. Verse merge squash-merges a same-repo, non-draft pull request only when that check is green and the pull request is labelled `automerge` (a Dependabot pull request is included only when the version bump stays on the same major). That part is small and clear.

The rest of the operation is a pile. Twenty-two pull requests were open. Twenty-one are red on the merge check, so they will never merge, and nothing closes them. Agents keep opening the next one against the same generated files. The written front door still describes a different machine: hourly workflows, a full suite on main, and a revert when that suite goes red. `.github/workflows/` contains two files, `verse-check.yml` and `verse-merge.yml`. A red main does not revert anything, because nothing on main runs the suite after the merge.

## Problems, in order

1. **Generated files are committed, then every later pull request waits on a pull request that cannot land.** Pull request 97 (electrical-panel card, 2,114 additions) failed Verse check because it commits deploy outputs and because 95, 94, 93 and 83 already change the same set: `skills/index.json`, `families.json`, `guide.json`, `what.json`, `deps.json`, `sitemap.xml`, `self.json`, `brain/knows.json`, `tools/test_void.mjs`. The check says wait for those to land. They fail for the same reason. Nobody is first. The same knot is on the growth ledger (`void.growth.json`, `growth.atom`, `growth.proof.json` in six open pull requests) and on two flight-map pull requests (132 and 137), which both edit `lib/flights-ui.js`.

2. **The 400-line rule is printed and then ignored by the people opening pull requests.** 97, 95, 94 and 93 are each about two thousand lines. 137 is 1,465. 168 is 1,220. Pre-pr is doing its job by refusing them. The crew is not doing its job by splitting them. A refused pull request stays open, still labelled `automerge`, still occupying the files.

3. **The instructions an agent reads are not the repository it is in.** `AGENTS.md` still sends a run through `verify.yml`, `automerge.yml`, `deploy.yml`, a growth ledger line, and a revert when the suite on main goes red. None of those workflows are in the tree. An agent that follows the front door will look for commands and checks that are gone, and will believe a bad merge is undone. It is not. Cloudflare Pages also reports success on pull requests whose Verse check failed, so a preview exists for work the gate has already refused. The written rule says a pull request gets no preview deploy.

4. **Handoff does not say who is here.** `domains/handoff.md` "Working on" still lists jobs from October and mid-November. It does not name the twenty-two open pull requests. Adding a line there pulls `handoff-scan`, which the shipping notes already call red on a bare checkout. The board that was meant to stop two agents doing one job is both stale and expensive to touch.

5. **"Quiz me" is already four different things, and the nav does not reach a new page.** `skills/quiz.js` quizzes an explainer card, `skills/trivia.js` takes a bare "quiz me" on an empty stage, `skills/math-quiz.js` is times tables, `skills/study-cards.js` quizzes a pasted list. None of them is "type a subject or notes, pick a difficulty, one multiple-choice question at a time, then the misses." A fifth stage skill would collide with those asks. The shell paints its bar only on the exact `NAV` paths in `lib/verse-shell.js`. `sw.js` dresses a shorter set and leaves out Tools, Arcade, Podcast and the dashboard. A tool page that only links `verse-shell.js` gets no bar.

6. **Dependabot is outside the loop.** Pull request 70 bumps `actions/setup-node` from 4 to 7, has no `automerge` label, and never received a Verse check (Pages is the only check on it). The merge workflow would skip a major bump even with the label. It can sit forever with no one looking.

## Fixes

1. Close 93, 94, 95, 97 and 83, or strip the generated files out of each, and land one of them only. Do not open another skill-index pull request until that set is gone. Same for 132 and 137: one map, the other closed.
2. Treat a pre-pr refusal as the end of that pull request. Close it in the same run that sees "also changes" or "written at deploy". A label of `automerge` on a pull request the check has already refused is noise.
3. Rewrite the front door so it names the two workflows and the two commands. Delete the claims about a suite on main and an automatic revert until those jobs exist again. If a revert-on-red is still wanted, it has to be a workflow, not a paragraph.
4. Expire handoff lines older than a day. Point "Working on" at open pull-request numbers, not at branches from October.
5. Keep subject quizzes on `/quiz/`, and leave the stage skills on their own asks. Draw the same bar on every tool page; make `sw.js` use the `NAV` list instead of a second copy.
6. Run Verse check on Dependabot pull requests, and close a major bump that nobody is going to merge.

This pull request does not do those fixes. It records them, and it adds `/quiz/` without touching the generated files the stuck pull requests already own.

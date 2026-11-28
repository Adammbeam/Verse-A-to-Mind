# Crew audit, 2026-11-27

Outside read of how Verse ships, done before building the draft-email page. No score, no praise. Checked this checkout of `Adammbeam/Verse-A-to-Mind` at `origin/main` `3ebfc645`, the open pull requests, and the two workflows that still run.

## Verdict

The crew is producing pull requests faster than it can merge them, and the merge rule is now a deadlock. Agents still follow a map of machines that were parked. The visitor job this review was attached to (draft an email) was still missing while two other email efforts pointed elsewhere: a template form on `/resume/`, and a skill whose title is about getting around the send gate.

## What is actually running

`1f2e74a7f` moved the GitHub Actions workflows to `workflows-parked` (114 files). Live workflows are only `.github/workflows/verse-check.yml` and `.github/workflows/verse-merge.yml`. Cloudflare Pages deploys the site and posts its own check. `tools/automerge.mjs` still defaults its repository to `atomeam/void-loop`. `AGENTS.md` and `docs/playbooks/automerge.md` still describe `verify.yml`, `deploy.yml`, `void-review`, a full browser suite on main, and a coder that merges after a red check. Those files are not the gate that runs.

`verse-check` refuses a pull request that is behind main, over 400 changed lines, or touching a file another open pull request also changes, then runs `merge-gate`. `verse-merge` squash-merges only when that check succeeds, the pull request is not a draft, and it carries `automerge`. A red check does not merge. A green Pages preview does not merge.

## Problems, ranked

1. **The overlap rule has deadlocked the queue.** At review time, 22 pull requests were open. Sampled Verse checks were red. `#143` fails because `#142` also changes `void-live-deploy/_redirects`. `#137` fails because it is 1,504 lines and because `#132` also changes `void-live-deploy/lib/flights-ui.js`. `#121` failed at 20:04 UTC on generated files and on `growth.atom` plus `skills/index.json`, `families.json`, `guide.json`, and `what.json`, shared with `#120`, `#114`, `#112`, `#97`, `#95`, `#94`, `#93`, and `#83`. At 20:27 UTC `#124` added the growth files to the shared-ok list. The four skill files are still not shared, so that cluster still cannot go green: each refusal says to wait for another red pull request.

2. **The same job is open twice.** `#132` and `#137` are both a flights map. They edit `flights-ui.js` and vendor two different copies of the map library (`maplibre-gl-5.6.0` and `maplibre-gl-js-6.20.0`). `#122` and `#123` both change the news self-check. `domains/handoff.md` did not stop this. Its Working on list still carries jobs dated 3 November through 20 November as if they were active on 27 November. Just finished starts at line 130. A board that never moves is not a lock.

3. **The written process and the running process disagree.** Agents are told to loop, run `finish.mjs`, label `automerge`, and expect a suite on main to revert a bad commit. The suite workflow is parked. The label does not merge a failed Verse check. `#168` is labelled automerge and failed in about two minutes: 1,220 changed lines, mostly one new document listing things Verse cannot do. Pages was green on that same head. People can mistake a preview for a merge. `#70` (setup-node 4 to 7) has no `automerge` label, so `verse-merge` will not take it; the major-bump rule in that workflow would refuse it anyway. It sits with no owner line.

4. **Email work is split, and one of the splits is a send bypass.** The capability list (`tools/capability-sweep/list.json`, id `email-draft`) had `page: null`. `/resume/` has a Professional Email tab: the visitor fills subject, greeting, and body from presets. `void-live-deploy/lib/email-send.js` can send after an owner yes, and it stays a dry run until `EMAIL_LIVE` is `send`. `#121` is titled as adding a skill to bypass a disabled `env.EMAIL` gate, and it is stuck in the registry deadlock in problem 1. A drafter and a sender are different tools. Shipping a way around the send gate does not draft a letter, and it must not be wired to the page that drafts one.

5. **Shared files are the collision surface.** `tools/checks.mjs` and `tools/real-pages.mjs` are already in open pull requests (`#168`, `#137`, `#142`). A new page that also edits them cannot pass `pre-pr`. Generated skill registries are committed by hand and then block every other skill pull request. `docs/MAP.md` and the playbooks still send the next agent at the parked workflows.

## Fixes

1. Mark the generated registries as files every pull request may share (`skills/index.json`, `families.json`, `guide.json`, `what.json`, the growth proof), the way `growth.atom` is already listed in `tools/pre-pr.mjs`. Until that lands, stop opening skill pull requests that commit those files. Close or stack the duplicates the same day: one flights map, one news self-check.
2. When Verse check fails on overlap, say which pull request is the one that should land, and close the other. "Wait" is not a fix while both are red.
3. Rewrite the ship section of `AGENTS.md` and `docs/playbooks/automerge.md` to the two live workflows. Point `tools/automerge.mjs`'s default repository at `Adammbeam/Verse-A-to-Mind`. Leave the parked workflows parked until someone turns one back on on purpose.
4. Reject a pull request over 400 lines before it is opened (`#168`). The check already does this; agents are still pushing past it and leaving the red pull request up.
5. Move Working on lines older than a day to a stale list, by a script, so the next agent can trust the board.
6. One email tool that writes a letter and does not send. Leave `email-send.js` and `#121` alone. Do not add a send button, a `mailto:` link, or a call into the send executor.

## What this change does

`/draft/` is that letter tool. The visitor names who it is to and what it should say, picks a tone, and copies the subject and the letter. Workers AI is asked first, Groq only if that does not answer, and a plain draft from the note if neither does. The route returns `sends: false` and stores nothing. Tower files from the unmerged ability-floor work are not edited here, because that pull request was not on main and a later read of number 175 returned 404.

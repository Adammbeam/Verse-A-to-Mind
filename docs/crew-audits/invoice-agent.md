# Crew audit, 2026-11-27

Verdict: the crew can open pull requests faster than it can land them. The live merge path ignores most of the green checks it just ran, fifty-seven automerge pull requests are already open, and the documents agents are told to follow still describe a machine that has been parked. A new invoice page will not fix that. Shipping it on top of the pile makes the pile worse unless the merge skip is fixed first.

Numbers read from the repository and from GitHub on 2026-11-27, not from the docs.

## Problems, ranked

1. **The merger skips the check.** `.github/workflows/` has two files: `verse-check.yml` and `verse-merge.yml`. The other 114 workflows sit in `.github/workflows-parked/`, including `automerge.yml`, `verify.yml`, `deploy.yml`, `void-review.yml` and `suite-gate.yml`. Of the last 50 Verse merge runs, 42 were skipped and 8 succeeded. Of the last 40 Verse check runs, 21 were `push` and 19 were `pull_request`. `verse-merge.yml` merges only when the check's event was `pull_request`. A green check that started on `push` does not merge the pull request. Main's combined status was `pending` with an empty status list. All three merge methods are allowed, and merged branches are not deleted.

2. **Open pull requests are the queue, and they block each other.** 57 pull requests were open. 56 carried `automerge`. One did not (Dependabot). None were drafts. The oldest had been open about 1.4 days, and every one had been updated inside that window, so this is not a stale-backlog story. `tools/pre-pr.mjs` refuses a pull request that touches a file another open pull request also changes. With 57 open, the shared files (the tools catalog, `tools/real-pages.mjs`, `lib/toolkit.js`, the handoff) are frozen for whoever arrives second. Pull request 144 exists only to let an older overlapping pull request pass the check. That is the crew negotiating with itself.

3. **The instructions describe a different operation.** `AGENTS.md`, `tools/automerge.mjs` and `docs/MAP.md` still tell an agent to label `automerge`, wait for Verse's review, wait for the full browser suite on the pull request, and expect `deploy.yml` to ship main. Those workflows are parked. An agent that follows the front door waits for gates that do not run, then opens another pull request. `tools/automerge.mjs` still defaults its repository to `atomeam/void-loop`.

4. **The boards do not say who is working.** `domains/handoff.md` "Working on" still lists claims from 2026-10-15 through 2026-11-20. Nothing in that section is a live claim. `domains/void.frontier.md` is a long archive with a build order buried in it. The same job-loop paragraph is copied into `AGENTS.md`, `CLAUDE.md` and a Cursor rule. Two authors (`atomeam` 35 open, `Adammbeam` 21 open) are opening in parallel against that fog.

5. **The same idea is rebuilt as a new file.** "Make an invoice" in `tools/capability-sweep/list.json` had `page: null`. The sweep result says the ask returns a text answer, not a tool. A dozen delivery-pack skills use "invoice reminders" as sample copy and do not total a bill, and `/vat/` only does a tax sum. The crew's habit is a new pack skill per phrase. That does not give a visitor an invoice.

## Fixes

1. Change `verse-merge.yml` so a successful Verse check merges the open pull request whose head is that SHA, including when the check event was `push`. Delete `on: push` from any branch copy of `verse-check.yml`. Until that lands, a green check is not a merge.
2. Stop opening pull requests while 57 are open. Land or close the ones whose check is already green, then let `pre-pr.mjs` mean something. Cap concurrent automerge pull requests at a number small enough that two agents are unlikely to need `lib/toolkit.js` at once.
3. Make `AGENTS.md` name the two live workflows and say the parked directory is not the path. Point `tools/automerge.mjs` at this repository or stop telling agents to run it.
4. Move every "Working on" line older than a day to a finished or dropped list in the same edit that starts a new claim. One board.
5. Build a missing ability as one page a stranger can use. Do not add another pack skill. This pull request does that for the invoice: `/invoice/`, totals in the browser, print or save as PDF, no server store. The capability row now points at that page. The sweep result stays a fail until a real sweep is run. Do not edit the result file to look finished.

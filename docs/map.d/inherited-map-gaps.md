The `sudoku` skill plays a generated 9-by-9 puzzle in the arcade card; the `client-work-drop` skill packages the tasks that drop when Verse owns a business's systems, monitors, tests and handoffs.

`verse-check.yml` runs Verse's check on each pull request; `verse-merge.yml` merges once that check is green.

`bench-live.mjs` scores the honesty benchmark against the live answer engine; `build-tools-json.mjs` prebuilds the public tools snapshot; `codestore.mjs` pushes commits and change requests to Verse's git store over HTTP; `verse-runner.mjs` runs the oldest change request from that store through the gates; `wipe-guard.mjs` stops a commit or push that would replace most of the tree.

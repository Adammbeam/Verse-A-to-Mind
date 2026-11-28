# Consolidation map

**Starts when:** two pages, helpers or skills do one job under different names.

**Commands:**
1. `node tools/consolidate-map.mjs --write` writes `docs/consolidation-map.md`.
2. `node --test tools/consolidate-map.test.mjs tools/one-page.test.mjs`

**Worked when:** each group names the page to keep, what a copy still has that the kept page lacks, and a redirect that is a path on this site. The colour picker group keeps `/color/`. `/color/colour-picker-tool/?c=ff5733` opens `/color/?c=ff5733`.

**Rules:** nothing is deleted. An old address redirects. An old name stays as an alias. A path does not name another site. Leave a file an open pull request already holds.

**Mistakes:** a file under `modes/` is that mode of the kept page (`/color/modes/gradient.html` opens `/color/?mode=gradient`). Sending it to the bare page drops the mode.

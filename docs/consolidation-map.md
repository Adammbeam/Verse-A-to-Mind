# Consolidation map

Built by `node tools/consolidate-map.mjs --write`. Nothing is deleted. An old address redirects to the kept page, and the old name stays as an alias. A redirect is a path on this site. The kept page is the job's standard path, or else the current layout (shared shell, `vs-tool`, `verse.css`) and the shortest path. Impact is the search weight, with a bonus for extra copies and for a shared headline.

## Ranked groups

1. **Color picker** (impact 261, same headline). Kept `/color/`. `/color/colour-picker-tool/` → `/color/` (headings already on the kept page); `/color/modes/gradient.html` → `/color/?mode=gradient` (has css gradient generator; colour stops)
2. **Calculator** (impact 240). Kept `/calculator/`. `/calculator/modes/formulas.html` → `/calculator/?mode=formulas` (has calculators; percent of a number); `/factorials/` → `/calculator/` (has factorials); `/hosting/` → `/calculator/` (has traffic queue amp uptime calculator; queue and wait time); `/vat/` → `/calculator/` (has калькулятор ндс и налогов; история)
3. **Flights** (impact 235). Kept `/flights/`. `/flights/airports/` → `/flights/` (has airport codes); `/flights/co2/` → `/flights/` (has flight co2 calculator); `/flights/distance/` → `/flights/` (has flight distance calculator); `/flights/map/` → `/flights/` (has great circle map); `/flights/routes/` → `/flights/` (has where can i fly); `/flights/time/` → `/flights/` (has flight time calculator); `/flights/trip/` → `/flights/` (has flight itinerary and layovers)
4. **Random** (impact 152). Kept `/random/`. `/random/modes/coin.html` → `/random/?mode=coin` (has flip a coin heads or tails; flip a coin); `/random/modes/people.html` → `/random/?mode=people` (has random user generator; countries); `/random/modes/wheel.html` → `/random/?mode=wheel` (has spin the wheel)
5. **Photo editor** (impact 143). Kept `/photos/`. `/photos/modes/ai.html` → `/photos/?mode=ai` (has photo details checker see and remove exif metadata; before you share); `/photos/modes/resize.html` → `/photos/?mode=resize` (has passport id amp exam photo sizer)
6. **Word counter** (impact 124). Kept `/word-count/`. `/text-diff/` → `/word-count/` (has text compare; the name)
7. **Music tools** (impact 119). Kept `/music/`. `/chords/` → `/music/` (has chords and scales; chord finder); `/piano/` → `/music/` (has piano; record and replay); `/tuner/` → `/music/` (has tuner; strings and reference tones)
8. **Password generator** (impact 119). Kept `/password/`. `/password/modes/strength.html` → `/password/?mode=strength` (has how secure is my password)

5 more groups: `node tools/consolidate-map.mjs`.

## Pages still on an old layout

`/404.html` (no shared stylesheet), `/arcade/harness.html` (no shared stylesheet), `/budget/` (no shared stylesheet), `/fanfic/` (no shared stylesheet), `/free/` (no shared stylesheet), `/fringe/anomalous-event-timeline-4.html` (no shared stylesheet), `/fringe/anomalous-event-timeline.html` (no shared stylesheet), `/fringe/attention-7.html` (no shared stylesheet), and 37 more.

## Helpers

JSON replies not using `lib/http.js`: `functions/api/a2a.js`, `functions/api/buy.js`, `functions/api/mcp.js`, `functions/api/page-pass.js`, `functions/api/proposals.js`, `functions/api/searches.js` and 8 more. Table promises still `let ready = null`: `lib/searches.js`.

## Skills that still overlap

55 pairs are not in one family yet (105 members already are). First: about-skill~wants, anneal-ambition~weather, aurora-tonight~calendar, calendar~constellation, calendar~date-calc, calendar~deadlines, calendar~eclipse, calendar~fuel.

## Copies that must stay in step

`void.html`, `void-live-deploy/index.html`, `void-live-deploy/void.html` differ. The copies check requires all three. Do not fold them into one file.

## Held by open pull requests

Leave these alone: team.js, agent.mjs, agents.txt, team-rank.js, team/index.html, team/app.js, tick.js, local-ship.mjs, news/starboard, salvage.json, void.html, lib/guard.js, tools/pre-pr.mjs, store files, _redirects (add a labelled block only), index.html, markets/stocks, calculator files from PR #153.

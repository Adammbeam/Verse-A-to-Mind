# Verse Scoreboard

Current values are from a headless local page. `/api/answer` is stubbed and other hosts do not resolve, so an ask never reaches Workers AI or Groq.

Measured: 2026-11-28T16:14:31.326Z. Delta probed on 60 case-file asks. An article fallback or a generic answer does not count.
Skill-example sweep, secondary: 92.3% (443/480).

| Metric | Current | Goal |
| --- | --- | --- |
| Appearance Test pass rate | 56.7% (34/60) | 95%+ |
| Artifact Delta pass rate | 56.7% (34/60) | 95%+ |
| Natural Ask Routing accuracy | 40% (20/50) | 90%+ |
| Composition quality | ? | ? |
| Five Ask Benchmark | ? | 8-10/10 each |

## How each metric is measured

**Appearance Test.** The headline is the case file (levels 1, 4, and 8), not the per-skill examples. Pass when the page loop note names an artifact. Fail when the note is `article fallback`, the generic paraphrase `answer`, or blank. The skill-example sweep is the secondary line.

**Artifact Delta.** A reply that only explains the ask, or says it back, is not a new artifact. An `article fallback` card or a generic `answer` card does not count. Pass when the stage gains a structured artifact (a tool, tracker, map, chart, timer, board, or system): stage things (`id` and `kind`) or card headings changed, and the loop note names that artifact. Measured by `--probe` on the case-file asks.

**Natural Ask Routing.** Level 8 of the PWTSR case file: the ask resolved to the wanted skill (a bare note such as `timer` counts, `time` does not count as `timer`) and the result was usable. Goal 90%+. The first measured rate is 20/50.

**Composition quality.** A follow-up such as "group them" or "turn it into a report" leaves one object that still contains the parts. No composition suite has been scored, so the cell stays `?`.

**Five Ask Benchmark.** Read from `docs/appearance-benchmark.md` when that file exists (each `n/10` in it). The file is not in the repo yet, so the cell is `?`. Goal 8-10/10 on each ask.

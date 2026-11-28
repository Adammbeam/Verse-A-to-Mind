# Verse Scoreboard

Current values are from a headless local page. `/api/answer` is stubbed and other hosts do not resolve, so an ask never reaches Workers AI or Groq.

Measured: 2026-11-28T16:07:22.022Z. Appearance on the full report is 92.3% (443/480). On the case file, with no per-skill example, it is 56.7% (34/60). Delta probed on 60 case-file asks.

| Metric | Current | Goal |
| --- | --- | --- |
| Appearance Test pass rate | 92.3% (443/480) | 95%+ |
| Artifact Delta pass rate | 100% (60/60) | 95%+ |
| Natural Ask Routing accuracy | 40% (20/50) | 90%+ |
| Composition quality | ? | ? |
| Five Ask Benchmark | ? | 8-10/10 each |

## How each metric is measured

**Appearance Test.** Pass when the page loop note names an artifact. Fail when the note is `article fallback`, the generic paraphrase `answer`, or blank. A paraphrase restates the ask instead of leaving a tool. Measured on the asks in the report passed to `--from`, expected-fail rows left out.

**Artifact Delta.** Pass when stage structure after the answer is not the structure before it. Structure is the stage things (`id` and `kind` in `a2m.void.state.v1`) plus the open card headings (`.vpage`). A whisper with no new thing and no new card fails. Measured by `--probe` on a fresh page per ask.

**Natural Ask Routing.** Level 8 of the PWTSR case file: the ask resolved to the wanted skill (a bare note such as `timer` counts, `time` does not count as `timer`) and the result was usable. Goal 90%+. The first measured rate is 20/50.

**Composition quality.** A follow-up such as "group them" or "turn it into a report" leaves one object that still contains the parts. No composition suite has been scored, so the cell stays `?`.

**Five Ask Benchmark.** Read from `docs/appearance-benchmark.md` when that file exists (each `n/10` in it). The file is not in the repo yet, so the cell is `?`. Goal 8-10/10 on each ask.

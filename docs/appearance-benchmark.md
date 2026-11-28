## Verse Product Laws

1. Appearance Test: If Verse only rephrases the ask, the response fails.
2. Artifact Delta Test: A successful response leaves the stage with more useful structure than before.
3. Natural Ask Principle: Users should not need to know skill names. Problems should route to systems.

## Verse Benchmark Law
A successful response creates something useful.
A failed response explains, paraphrases, or restates the user's request without creating useful structure on the stage.

The five asks are phrased as problems, not solutions. A new benchmark ask must be too: pain in, system out.

On main, none of the five match a skill, so the page takes the article fallback. The onboarding ask's saved model card is the Before cell. The other four have no stored model paragraph; their Before cell is that same miss.

| Ask | Before | After | Score | Appears? | Delta? |
| --- | --- | --- | --- | --- | --- |
| I need a client onboarding system that runs itself. | I would say that you need a system that can automatically onboard clients without human intervention. | Client onboarding: welcome steps, intake and stall automations, onboarding monitors, a labelled time-saved estimate, a kickoff next step | 10 | ✅ | ✅ |
| Turn weekly client reports into something I never have to think about. | No skill. Article fallback, no process, automations, monitors or estimate. | Weekly client reports: report steps, scheduled report and status digest, report monitors, a labelled estimate, a delivery-pack next step | 10 | ✅ | ✅ |
| I keep forgetting invoices. | No skill. Article fallback, no process, automations, monitors or estimate. | Invoice reminders: unpaid-to-paid steps, reminder and overdue automations, invoice monitors, a labelled estimate, a monitor-pack next step | 10 | ✅ | ✅ |
| Build me a way to track project delivery. | No skill. Article fallback, no process, automations, monitors or estimate. | Project delivery tracker: milestone steps, status card and late-milestone alert, delivery monitors, a labelled estimate, a dashboard next step | 10 | ✅ | ✅ |
| Our support process is chaos. | No skill. Article fallback, no process, automations, monitors or estimate. | Support process: ticket steps, routing and unanswered-age automations, support monitors, a labelled estimate, a process-map next step | 10 | ✅ | ✅ |

Pass means an average of 7 or more and no zero. Each row above is 10.

## Scores

Appearance: something useful appeared, not a paraphrase. Artifact Delta: new lists or steps on the stage. Routing: system-design, the composer that reuses the existing packs. Composition: process, automations, monitoring, the estimate and the next step are in one card. Distinctness: the five step-and-automation lists are not the same card.

| Ask | Appearance | Artifact Delta | Routing | Composition | Distinctness |
| --- | --- | --- | --- | --- | --- |
| I need a client onboarding system that runs itself. | 10 | 10 | 10 | 10 | 10 |
| Turn weekly client reports into something I never have to think about. | 10 | 10 | 10 | 10 | 10 |
| I keep forgetting invoices. | 10 | 10 | 10 | 10 | 10 |
| Build me a way to track project delivery. | 10 | 10 | 10 | 10 | 10 |
| Our support process is chaos. | 10 | 10 | 10 | 10 | 10 |

The hours are the time-saved pack's typical estimate, labelled as an estimate, with that pack's assumption. Nothing is measured and nothing is invented as a live number.

The check is `node --test tools/appearance-benchmark.test.mjs` (`tools/checks.d/appearance-benchmark.chk`). A reply that is only the ask again fails The Appearance Test. A reply that adds no list or steps fails The Artifact Delta Test.

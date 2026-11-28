## Verse Product Laws

1. Appearance Test: If Verse only rephrases the ask, the response fails.
2. Artifact Delta Test: A successful response leaves the stage with more useful structure than before.
3. Natural Ask Principle: Users should not need to know skill names. Problems should route to systems.
4. Composition Principle: When multiple artifacts are relevant, Verse creates a connected system rather than isolated cards.

## Verse Benchmark Law
A successful response creates something useful.
A failed response explains, paraphrases, or restates the user's request without creating useful structure on the stage.

The five asks are phrased as problems, not solutions. A new benchmark ask must be too: pain in, system out.

On main, none of the five match a skill, so the page takes the article fallback. The onboarding ask's saved model card is the Before cell. The other four have no stored model paragraph; their Before cell is that same miss.

| Ask | Before | After | Score | Appears? | Delta? |
| --- | --- | --- | --- | --- | --- |
| I need a client onboarding system that runs itself. | I would say that you need a system that can automatically onboard clients without human intervention. | Client onboarding: Capture the new client, Send the welcome sequence, Collect what only the client knows, Watch for a stalled step, Hand off a running welcome, Intake capture, Welcome sequence, Stall nudge | 10 | ✅ | ✅ |
| Turn weekly client reports into something I never have to think about. | No skill. Article fallback, no process, automations, monitors or estimate. | Weekly client reports: Gather the week’s facts, Draft the client report, Send it on the same weekday, File the copy, Scheduled report, Status digest, onboarding steps completed vs stalled, welcome sequence delivery | 10 | ✅ | ✅ |
| I keep forgetting invoices. | No skill. Article fallback, no process, automations, monitors or estimate. | Invoice reminders: List what is unpaid, Send the first reminder, Send a second if it is still open, Mark it paid or escalate, Reminder sequence, Overdue nudge, reminders sent vs paid, overdue count that has not been acte | 10 | ✅ | ✅ |
| Build me a way to track project delivery. | No skill. Article fallback, no process, automations, monitors or estimate. | Project delivery tracker: Name the project, List the milestones, Post the delivery status, Flag a late milestone, Delivery status card, Late-milestone alert, the core flow still runs, any step that waited past its window | 10 | ✅ | ✅ |
| Our support process is chaos. | No skill. Article fallback, no process, automations, monitors or estimate. | Support process: Catch the ticket, Sort the queue, Reply or escalate, Close it with a note, Ticket routing, Unanswered-age alert, incoming volume and unanswered age, confirm-line queue depth | 10 | ✅ | ✅ |

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



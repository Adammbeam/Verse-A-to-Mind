# Appearance benchmark, first run

Summary: main shows an unrelated encyclopedia page (average 2, no artifacts). The composed cards score 10 on structure and are linked, then fail Variety because every ask uses the same five artifact types (overlap 1.00, red). Rewordings: 0/15. Benchmark: FAIL. Next fix: route the problem, not the exact sentence, and give each problem its own artifact types.

## Overlap matrix

Green under 30% (distinct). Yellow 30–50% (watch). Red over 50% (collapsed, Variety fails).

| | Onboarding | Reports | Invoices | Delivery | Support |
| --- | --- | --- | --- | --- | --- |
| Onboarding | — | RED 1.00 | RED 1.00 | RED 1.00 | RED 1.00 |
| Reports | RED 1.00 | — | RED 1.00 | RED 1.00 | RED 1.00 |
| Invoices | RED 1.00 | RED 1.00 | — | RED 1.00 | RED 1.00 |
| Delivery | RED 1.00 | RED 1.00 | RED 1.00 | — | RED 1.00 |
| Support | RED 1.00 | RED 1.00 | RED 1.00 | RED 1.00 | — |

Shared types: process, automations, monitoring, estimate, next.

## Ladder

| Ask | Appears | Delta | Natural | Composition | Variety | Rewordings | Surprise | User value | Live |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| I need a client onboarding system that runs itself. | yes | yes | exact sentence only | yes | red | 0/3 | no | no | no |
| Turn weekly client reports into something I never have to think about. | yes | yes | exact sentence only | yes | red | 0/3 | no | no | no |
| I keep forgetting invoices. | yes | yes | exact sentence only | yes | red | 0/3 | no | no | no |
| Build me a way to track project delivery. | yes | yes | exact sentence only | yes | red | 0/3 | no | no | no |
| Our support process is chaos. | yes | yes | exact sentence only | yes | red | 0/3 | no | no | no |

Surprise cap is 2. Every card adds the same estimate and the same monitor heading, so nothing is a real surprise. User value fails: the card is a plan, not usable now. Live is no: no field survives a reload, no clock or API, and the hours figure is a fixed 4.

## Baseline vs now

Baseline is main `1b6d2bf78` (encyclopedia pages, delta 0, average 2). Now is the composed card at `1fb1900bb` (score 10, variety red).

| Ask | Baseline page |
| --- | --- |
| I need a client onboarding system that runs itself. | Linux Terminal Server Project |
| Turn weekly client reports into something I never have to think about. | Turn the Page |
| I keep forgetting invoices. | Hell's Kitchen season 11 |
| Build me a way to track project delivery. | Robb Banks |
| Our support process is chaos. | The Princess (Tennyson) |

## Regressions

None against the previous history row: those five still appear, still have lists, and are still linked. Variety fails the run. No rollback card. A later run that drops under the minimums, or flips 2 or more asks, writes a rollback job and does not revert from CI.

## Next fix

Lowest gap: rewordings, 0/3 on every ask (15 misses). Then split the shared artifact types so no pair stays over 50%.

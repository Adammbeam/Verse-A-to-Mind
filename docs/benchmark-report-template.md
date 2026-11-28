# Appearance benchmark, first run

Summary: main's encyclopedia pages are not an appearance (0/5, average 0). After routing, the five asks and their rewordings score 10 on disjoint systems. Variety is green at 0.00. Benchmark: PASS.

## Overlap matrix
| | Onboarding | Reports | Invoices | Delivery | Support |
| --- | --- | --- | --- | --- | --- |
| Onboarding | — | GREEN 0.00 | GREEN 0.00 | GREEN 0.00 | GREEN 0.00 |
| Reports | GREEN 0.00 | — | GREEN 0.00 | GREEN 0.00 | GREEN 0.00 |
| Invoices | GREEN 0.00 | GREEN 0.00 | — | GREEN 0.00 | GREEN 0.00 |
| Delivery | GREEN 0.00 | GREEN 0.00 | GREEN 0.00 | — | GREEN 0.00 |
| Support | GREEN 0.00 | GREEN 0.00 | GREEN 0.00 | GREEN 0.00 | — |

## Ladder
| Ask | Appears | Delta | Natural | Composition | Variety | Rewordings | Surprise | User value | Live |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| I need a client onboarding system that runs itself. | yes | yes | yes | yes | green | 3/3 | later | later | later |
| Turn weekly client reports into something I never have to think about. | yes | yes | yes | yes | green | 3/3 | later | later | later |
| I keep forgetting invoices. | yes | yes | yes | yes | green | 3/3 | later | later | later |
| Build me a way to track project delivery. | yes | yes | yes | yes | green | 3/3 | later | later | later |
| Our support process is chaos. | yes | yes | yes | yes | green | 3/3 | later | later | later |

## Baseline vs now

Main `1b6d2bf78` showed Linux Terminal Server Project, Turn the Page, Hell's Kitchen season 11, Robb Banks, and The Princess. Appears 0/5, average 0. Now each ask scores 10.

## Regressions

None. The five asks and 15 rewordings hold. A later drop under the minimums, or 2 or more asks flipping, writes a rollback job and does not revert from CI.

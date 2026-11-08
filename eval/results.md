# Eval results

Run: 2026-11-08T11:11:23.818Z · model: openai/gpt-oss-120b · served by: Groq

| metric | value |
|---|---|
| cases | 7 (0 errored) |
| urgency in expected band (with safety floor) | 100% |
| model alone met minimum urgency | 100% |
| red-flag recall | 100% |
| denied symptoms wrongly listed | 0 |
| mean evidence verified | 100% |
| invented medicines removed by guard | 0 |
| median brief latency | 5.0 s |
| median plan latency | 4.2 s |
| check-in: next action in expected band (with floor) | 100% |
| check-in: model alone met minimum action | 100% |
| check-in: medicine adherence read correctly | 100% |
| median check-in latency | 5.1 s |

| case | urgency model→final | in band | model alone | red flag | negation misses | evidence verified | plan meds | check-in action model→final | brief s |
|---|---|---|---|---|---|---|---|---|---|
| lakshmamma | urgent→urgent | ✓ | ✓ | ✓ | 0 | 100% | 3/3 | doctor_review→doctor_review ✓ | 6.3 |
| ravi | soon→soon | ✓ | ✓ | – | 0 | 100% | 1/1 | doctor_review→doctor_review ✓ | 5.1 |
| shabana | emergency→emergency | ✓ | ✓ | ✓ | 0 | 100% | 2/2 | come_in_now→come_in_now ✓ | 5.0 |
| child-dehydration | urgent→urgent | ✓ | ✓ | ✓ | 0 | 100% | 1/1 | – | 9.7 |
| routine-refill | routine→routine | ✓ | ✓ | – | 0 | 100% | 1/1 | – | 3.0 |
| telugu-negation | routine→routine | ✓ | ✓ | – | 0 | 100% | – | – | 2.9 |
| snake-bite | emergency→emergency | ✓ | ✓ | ✓ | 0 | 100% | – | – | 3.1 |

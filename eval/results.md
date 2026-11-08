# Eval results

Run: 2026-11-08T05:13:09.689Z · model: openai/gpt-oss-120b

| metric | value |
|---|---|
| cases | 7 (5 errored) |
| urgency in expected band (with safety floor) | 100% |
| model alone met minimum urgency | 100% |
| red-flag recall | 100% |
| denied symptoms wrongly listed | 0 |
| mean evidence verified | 100% |
| invented medicines removed by guard | 0 |
| median brief latency | 11.3 s |
| median plan latency | 5.2 s |

| case | urgency model→final | in band | model alone | red flag | negation misses | evidence verified | plan meds | brief s |
|---|---|---|---|---|---|---|---|---|
| lakshmamma | urgent→urgent | ✓ | ✓ | ✓ | 0 | 100% | 3/3 | 6.5 |
| ravi | – | ✗ | ✗ | – | 0 | 0% | – | 0.0 ⚠ The AI service is busy. Please try again in a minute. |
| shabana | – | ✗ | ✗ | – | 0 | 0% | – | 0.0 ⚠ The AI service is busy. Please try again in a minute. |
| child-dehydration | – | ✗ | ✗ | – | 0 | 0% | – | 0.0 ⚠ The AI service is busy. Please try again in a minute. |
| routine-refill | – | ✗ | ✗ | – | 0 | 0% | – | 0.0 ⚠ The AI service is busy. Please try again in a minute. |
| telugu-negation | routine→routine | ✓ | ✓ | – | 0 | 100% | – | 11.3 |
| snake-bite | – | ✗ | ✗ | – | 0 | 0% | – | 0.0 ⚠ The AI service is busy. Please try again in a minute. |

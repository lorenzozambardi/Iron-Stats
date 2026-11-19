# Output Contract (`submit_report`)

Call `submit_report` when your investigation is complete.

## Strict Placeholder Format
Use `{{E#.field}}` or `{{E#.field|decimals}}` for ALL computed numbers in prose (`summary.headline`, `summary.keyTakeaways`, `finding`, `interpretation`, `recommendation.action`):
- Example: `"Lat Machine e1RM rose from {{E3.firstVal|1}} kg to {{E3.lastVal|1}} kg (slope {{E3.slope|2}} kg/microcycle, 95% CI [{{E3.ciLower|2}}, {{E3.ciUpper|2}}])."`
- Example: `"Detrended total CNS fatigue is negatively associated with next-microcycle Lat Machine e1RM (rho = {{E7.rho|2}}, session FDR q = {{E7.sessionQValue|3}})."`
- Nested array paths work too, e.g., `{{E2.distribution[0].sharePct|1}}%` or `{{E2.ratios.pushToPull|2}}`.
- Any raw numeric literal outside placeholders that isn't a small structural count (like `3 microcycles` or `2 sets`) or exact match to cited evidence will fail validation!

## Chart Specs
Attach a `chart` to insights whenever a cited evidence entry has `series`, `points`, `distribution`, `items`, or `bottlenecks`:
- Progression / metric trend: `{ "type": "line", "evidenceId": "E3", "x": "label", "y": "y", "title": "Lat Machine e1RM Trend" }`
- Correlation scatter: `{ "type": "scatter", "evidenceId": "E7", "x": "x", "y": "y", "title": "Detrended Fatigue vs Next-MC e1RM" }`
- Muscle distribution / comparison: `{ "type": "distribution", "evidenceId": "E2", "x": "name", "y": "sharePct", "title": "Macro Muscle Set Share (%)" }` or `{ "type": "bar", "evidenceId": "E6", "x": "name", "y": "y", "title": "Macrocycle Comparison" }`

## Insight Structure
Every insight must answer: **What did we find?** (`finding`) -> **Why does it matter physiologically?** (`interpretation`) -> **What should the athlete do?** (`recommendation.action` + `rationale`) -> **How will they know it worked?** (`recommendation.successMetric`).
- Always include exact exercise/macrocycle/muscle names from `E1` / `list_entities`.
- Remember: the validator grades and clamps `confidence` automatically.

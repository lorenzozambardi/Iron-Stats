# Investigation Playbook (Quick Mode)

You have a tight tool-call budget (~10 calls). Prioritize highest-signal findings:

1. **Orient**: Inspect `E1` (`get_dataset_overview`) for capabilities, quality flags, and top exercises.
2. **Bottlenecks & Balance**: Call `rank_bottlenecks` and `get_muscle_distribution` (`level: "macro"`).
3. **Top Lifts**: Inspect 2–3 highest-frequency or stalled lifts with `get_exercise_progression`.
4. **One High-Value Screen & Verification**: Run 1–2 `scan_relationships` families (e.g., `fatigue->performance` or `volume->strength`), pre-register (`register_hypothesis`), and confirm the top candidate via `test_relationship`.
5. **Body Comp (if available)**: If `canAnalyzeBodyTrend`, check `get_body_composition("weight")`.
6. **Synthesize**: Call `submit_report` with 3–5 crisp, deeply grounded insights, ranked bottlenecks, and any rejected hypotheses.

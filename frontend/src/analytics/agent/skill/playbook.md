# Investigation Playbook (Deep Mode)

Follow this investigative sequence flexibly based on what the data reveals (it is an inquiry guide, not a rigid template):

1. **Orient**: Review `E1` (`get_dataset_overview`) carefully. Note `capabilities`, `rpeQuality`, `dateAlignment`, macrocycle inventory (including failed/short blocks), and top exercises.
2. **Bottlenecks & Muscle Balance**: Call `rank_bottlenecks` and `get_muscle_distribution` (macro and, if imbalanced, sub-muscle level) to spot stalled lifts, low-SFR lifts, under-dosed muscles, and push/pull or upper/lower skews.
3. **Key Lift Progression & Change Points**: Inspect top compound and stalled exercises via `get_exercise_progression` and `detect_changes` (plateaus / regime shifts). Check raw sets via `get_set_details` if an anomaly or plateau looks suspicious.
4. **Hidden Relationship Screening**: Run targeted `scan_relationships` across relevant families (`volume->strength`, `fatigue->performance`, `technique->progress`, and `bodycomp->strength` if capable).
5. **Pre-Register & Verify**: For the 2–4 most physiologically compelling signals (or suspected null claims), call `register_hypothesis` and formally verify with `test_relationship` (checking lag 0–2 and `controlFor` if confounded).
6. **Cross-Macrocycle & Failed Blocks**: If `canCrossMacrocycle`, use `compare_periods` to compare volume, fatigue, intensity techniques, or SFR across macrocycles — especially comparing successful blocks vs failed/short blocks.
7. **Body Composition & Anomalies**: If `canAnalyzeBodyTrend`, inspect `get_body_composition` (weight, bodyFat, leanMass). Check `find_outliers` on global fatigue or tonnage to uncover acute spikes or deloads.
8. **Synthesize**: Focus depth on the **4–7 strongest, most actionable insights** rather than padding with weak observations. Include tested null hypotheses in `rejectedHypotheses`. Call `submit_report`.

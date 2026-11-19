# Iron Stats Data Model

## Training Hierarchy
- **Macrocycle**: Each `.md` logbook file (e.g., `S1M3`, `S3M3`) represents one macrocycle / training block. Variant or aborted blocks may carry suffixes like `(fail1)`, `(2)`, or `W1`/`W2`.
- **Microcycle**: Each log line underneath an exercise header is one **microcycle** (`MC1`, `MC2`, ...). **Do NOT assume a microcycle equals 7 calendar days** — microcycle length can vary (e.g., 5, 7, 8, or 10 days) and sessions need not occur in strict weekly order. Always report training rates **per microcycle** unless referring to calendar-dated body-composition trends.
- **Sessions**: `# 1`, `# 2`, ... represent distinct training days within a microcycle.
- **Date Alignment**:
  - `exact`: Sessions have explicit `Dates:` (`DD-MM-YYYY`) blocks inside the `.md` file.
  - `approximate`: Microcycle date windows are estimated from macrocycle `startDate` + `microcycleDays`.
  - `none`: Microcycles are sequential indices only; dated body logs cannot be date-joined.

## Biomechanical & Physiological Metrics
- **Default RPE Caveat**: When `@RPE` is omitted on a set, the parser defaults `RPE = 9.0`. Check `capabilities.rpeQuality` (`logged`, `partial`, `assumed`). When `assumed`, variations in `effectiveReps`, `effectiveTut`, `fatigue`, and `sfr` reflect rep/set structure rather than logged effort changes — ALWAYS note this caveat when citing RPE-dependent metrics.
- **Effective Reps (HTMU)**: Base reps within RIR < 6 (`RPE > 4`) count as high-threshold motor unit recruiting reps (`min(baseReps, max(0, RPE - 4))`), plus `0.5 * assistedReps + 0.33 * partialReps`.
- **CNS Fatigue**: Exponential RPE- and dynamic-TUT-weighted fatigue score per set.
- **Muscle Distribution**: Each exercise's `muscles_distr` magnitudes sum to `1.0` across sub-muscles, which roll up to macro groups (`Chest`, `Back`, `Shoulders`, `Legs`, `Biceps`, `Triceps`, `Forearms`, `Core`, `Neck`).
- **Bodyweight Exercises (`bw`)**: Load represents recorded body weight in kg (`bwProxy`), NOT external resistance. Do not mistake bodyweight fluctuations for pure barbell strength changes.

## Body Composition
- `body` logs (`weight`, `bodyFat`, derived `leanMass` and `fatMass`) are calendar-dated time series.
- `snapshot` circumferences (shoulders, chest, waist, arms, thighs, calves, V-taper, FFMI) are **cross-sectional snapshots only** — there is NO historical circumference trend. If `snapshot.status === "default_unverified_excluded"`, ignore snapshot anthropometrics completely.

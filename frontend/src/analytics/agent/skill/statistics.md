# Statistical Rigor & Anti-Spurious Guardrails

1. **Correlation != Causation**: Never write "causes", "directly causes", "proves", or "is the reason why" for observational correlations. Use associative language ("co-occurs with", "is associated with", "tracks alongside"). Mechanistic explanations must be framed as testable hypotheses.
2. **Detrend Time Series**: Two series that both ramp over a macrocycle will correlate spuriously. Keep `detrend: true` (default) on `test_relationship`, and inspect `autocorrelationWarning`.
3. **Lagged Effects**: Physiological adaptation and fatigue accumulation often operate at lag 1–2 microcycles (`x` in microcycle `t` vs `y` in microcycle `t + lag`).
4. **Multiple Testing (FDR)**: Every pair screened in `scan_relationships` and every `test_relationship` counts toward session-wide Benjamini-Hochberg FDR (`sessionQValue`). Prioritize findings with `sessionQValue <= 0.10` and CIs that exclude zero; treat wider-CI or high-q hits as `exploratory` or record them in `rejectedHypotheses`.
5. **Pre-Registration Discipline**: Before running a confirmatory `test_relationship`, call `register_hypothesis` with a clear physiological rationale and pass its `hypothesisId`.
6. **Confounders & Simpson's Paradox**: Program/macrocycle switches can induce spurious aggregate correlations. Check `compare_periods` across macrocycles or use `controlFor` when a confounder is suspected.
7. **Small-Sample Honesty**: Respect minimum-n gates (trend >= 4, correlation >= 8, lagged >= 10, body join >= 6). Never extrapolate beyond the observed data range.

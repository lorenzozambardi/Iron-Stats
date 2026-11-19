/**
 * Curated exercise-science and statistical methodology notes served on-demand by lookup_reference.
 * Keeps the base system prompt compact while giving the agent deep domain rigor.
 */

export const REFERENCE_NOTES = {
  'e1rm-validity': {
    title: 'Estimated 1RM Validity & Confounders',
    summary:
      'Epley e1RM = load * (1 + reps/30) is reliable for 1–10 reps near failure. Above 12 reps, metabolic/endurance factors inflate estimates and create non-comparable slopes. Always check highRepWarning and RPE consistency: an apparent e1RM jump from RPE 8 to RPE 10 is effort escalation, not strength gain. For bodyweight exercises ("bw"), raw load reflects body mass rather than external load.',
  },
  sfr: {
    title: 'Stimulus-to-Fatigue Ratio (SFR)',
    summary:
      'In Iron Stats, SFR = effectiveReps / fatigue. Higher SFR indicates more HTMU-recruiting stimulus per unit of exponential CNS fatigue. Compound free-weight lifts naturally have lower SFR than stable machine/isolation lifts; evaluate SFR relative to exercise class (compound vs isolation) rather than comparing squats directly to lateral raises.',
  },
  'effective-reps': {
    title: 'HTMU Effective Repetitions & Default RPE Caveat',
    summary:
      'Base reps within RIR < 6 (RPE > 4) recruit high-threshold motor units: effBase = min(base_reps, max(0, RPE - 4)). Assisted reps contribute 0.5x and partials 0.33x. CRITICAL: When a user omits @RPE in Iron Stats, the parser defaults RPE to 9.0. If rpeQuality is "assumed", variations in effectiveReps reflect rep counts/set volume rather than true effort changes.',
  },
  'plateau-criteria': {
    title: 'Strength Plateau & Stall Criteria',
    summary:
      'A meaningful strength stall is >= 3 consecutive weekly exposures on the same exercise without e1RM or reps-at-load improvement (within ~1.5% tolerance), while sets and rest remain comparable. Distinguish true stalls from intentional deloads (sharp volume drop) or exercise-order changes within a session.',
  },
  deload: {
    title: 'Fatigue Accumulation & Deload Signatures',
    summary:
      'Cumulative fatigue typically manifests as rising weekly CNS fatigue coupled with flat/declining e1RM or rising intensity-technique usage to maintain rep targets, often with a 1–2 week lag. Effective deloads reduce weekly sets/fatigue by 30–50% for 1 week followed by rebound e1RM gains.',
  },
  recomposition: {
    title: 'Body Composition & Strength Interplay',
    summary:
      'Energy deficit (negative weight/fat-mass slope) tends to suppress upper-body pressing strength first and increases fatigue sensitivity. Lean mass retention during a cut with stable relative strength (e1RM / body weight) is a positive outcome. Remember: Iron Stats circumferences are snapshot-only (no historical trend).',
  },
  'volume-landmarks': {
    title: 'Volume Landmarks (MEV / MAV / MRV) as Framing',
    summary:
      'Population heuristics (roughly 6–20 fractional sets/muscle/week for hypertrophy) are ONLY general framing—never state them as personal facts for this athlete. Individual MRV is inferred empirically from this athlete’s own lagged volume-to-progression and fatigue-to-progression responses.',
  },
  'intensity-techniques': {
    title: 'Intensity Techniques (Partials, Forced Reps, Dropsets)',
    summary:
      'Partials (+N), forced/assisted reps ((N)), and dropsets (/) boost effective reps per set at the cost of disproportionately higher CNS and local fatigue (exponential near RPE 10). Evaluate whether blocks with higher intensityTechShare actually yield faster e1RM progression or merely elevate fatigue and stall rates.',
  },
  'lagged-adaptation': {
    title: 'Time-Series Confounders & Lagged Adaptation',
    summary:
      'Two trending series (e.g., ramping sets and rising e1RM over a mesocycle) correlate spuriously without detrending. Always detrend or first-difference when testing volume/fatigue vs performance, check lag-1 autocorrelation, and inspect lags 1–2 weeks where fatigue or supercompensation physiologically manifests.',
  },
};

export const REFERENCE_TOPICS = Object.keys(REFERENCE_NOTES);

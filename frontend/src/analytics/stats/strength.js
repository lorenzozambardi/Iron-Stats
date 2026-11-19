/**
 * Strength estimation (e1RM, RPE-adjusted e1RM) and stimulus-to-fatigue ratio (SFR).
 */

export function computeSetE1RM(actualLoad, baseReps, rpe = 9.0, rpeLogged = false) {
  const load = Number(actualLoad);
  const reps = Number(baseReps);
  const clampedRpe = Number.isFinite(Number(rpe)) ? Math.min(10, Math.max(0, Number(rpe))) : 9.0;

  if (!Number.isFinite(load) || load <= 0 || !Number.isFinite(reps) || reps <= 0) {
    return {
      e1rm: null,
      rawE1rm: null,
      rpeAdjustedE1rm: null,
      highRepWarning: false,
      rpeAdjusted: false,
      valid: false,
    };
  }

  const rawE1rm = reps === 1 ? load : load * (1 + reps / 30);
  const rir = Math.max(0, 10 - clampedRpe);
  const effectiveMaxReps = reps + rir;
  const rpeAdjustedE1rm = effectiveMaxReps <= 1 ? load : load * (1 + effectiveMaxReps / 30);
  const useAdjusted = Boolean(rpeLogged);
  const e1rm = useAdjusted ? rpeAdjustedE1rm : rawE1rm;

  return {
    e1rm,
    rawE1rm,
    rpeAdjustedE1rm,
    highRepWarning: reps > 12,
    rpeAdjusted: useAdjusted,
    valid: true,
  };
}

export function computeSFR(effectiveReps, fatigue) {
  const eff = Number(effectiveReps);
  const fat = Number(fatigue);
  if (!Number.isFinite(eff) || !Number.isFinite(fat) || fat <= 0) return null;
  return eff / fat;
}

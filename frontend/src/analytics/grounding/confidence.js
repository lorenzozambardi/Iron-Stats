/**
 * Deterministic confidence grading and clamping.
 * The LLM may downgrade confidence, never upgrade past what the statistical evidence supports.
 */

export const CONFIDENCE_RANK = {
  exploratory: 0,
  low: 1,
  medium: 2,
  high: 3,
};

export const CONFIDENCE_BY_RANK = ['exploratory', 'low', 'medium', 'high'];

function gradeSingleEntry(entry, capabilities = {}) {
  if (!entry || !entry.data) return 0;
  const d = entry.data;
  const n = Number.isFinite(Number(entry.n)) ? Number(entry.n) : Number(d.n || 0);
  let score;

  if (entry.toolName === 'test_relationship') {
    const stat = Math.abs(Number(d.rho ?? d.r ?? d.slope ?? 0));
    const q = Number.isFinite(Number(d.sessionQValue)) ? Number(d.sessionQValue) : Number(d.pValue ?? 1);
    const ciExcludesZero =
      Number.isFinite(Number(d.ciLower)) &&
      Number.isFinite(Number(d.ciUpper)) &&
      ((d.ciLower > 0 && d.ciUpper > 0) || (d.ciLower < 0 && d.ciUpper < 0));

    if (n >= 16 && q <= 0.05 && stat >= 0.45 && ciExcludesZero) score = 3;
    else if (n >= 10 && q <= 0.1 && stat >= 0.3 && ciExcludesZero) score = 2;
    else if (n >= 8 && q <= 0.2) score = 1;
    else score = 0;

    if (d.autocorrelationWarning) score = Math.max(0, score - 1);
  } else if (entry.toolName === 'scan_relationships') {
    // Exploratory scans cap at medium unless confirmed by a pre-registered test_relationship
    const top = Array.isArray(d.candidates) && d.candidates[0];
    if (top && top.n >= 12 && top.qValue <= 0.1) score = 2;
    else if (top && top.n >= 8) score = 1;
    else score = 0;
  } else if (entry.toolName === 'get_exercise_progression' || entry.toolName === 'get_metric_series' || entry.toolName === 'get_body_composition') {
    const ciExcludesZero =
      Number.isFinite(Number(d.ciLower)) &&
      Number.isFinite(Number(d.ciUpper)) &&
      ((d.ciLower > 0 && d.ciUpper > 0) || (d.ciLower < 0 && d.ciUpper < 0));
    if (n >= 10 && ciExcludesZero) score = 3;
    else if (n >= 6 && ciExcludesZero) score = 2;
    else if (n >= 4) score = 1;
    else score = 0;
  } else if (entry.toolName === 'compare_periods') {
    const g = Math.abs(Number(d.hedgesG ?? 0));
    const ciExcludesZero =
      Number.isFinite(Number(d.ciLower)) &&
      Number.isFinite(Number(d.ciUpper)) &&
      ((d.ciLower > 0 && d.ciUpper > 0) || (d.ciLower < 0 && d.ciUpper < 0));
    const minSide = Math.min(Number(d.nA || 0), Number(d.nB || 0));
    if (minSide >= 6 && g >= 0.5 && ciExcludesZero) score = 3;
    else if (minSide >= 4 && g >= 0.3 && ciExcludesZero) score = 2;
    else if (minSide >= 3) score = 1;
    else score = 0;
  } else if (entry.toolName === 'detect_changes') {
    if (d.regimeShift?.detected && Number(d.regimeShift.deltaBic) >= 6) score = 2;
    else if (Array.isArray(d.plateaus) && d.plateaus.length > 0 && d.plateaus[0].length >= 4) score = 2;
    else if (Array.isArray(d.plateaus) && d.plateaus.length > 0) score = 1;
    else score = 0;
  } else if (entry.toolName === 'rank_bottlenecks' || entry.toolName === 'get_muscle_distribution' || entry.toolName === 'find_outliers') {
    score = n >= 6 ? 2 : (n >= 3 ? 1 : 0);
  } else {
    score = n >= 4 ? 1 : 0;
  }

  // Quality downgrades
  if (entry.rpeDependent && capabilities.rpeQuality === 'assumed') {
    score = Math.max(0, score - 1);
  }
  if (entry.dateAligned && capabilities.dateAlignment === 'approximate') {
    score = Math.min(score, 2); // approximate dates cap at medium
  }

  return score;
}

export function gradeConfidence(citedEntries = [], capabilities = {}) {
  if (!citedEntries || citedEntries.length === 0) return 'exploratory';
  let best = 0;
  for (const entry of citedEntries) {
    best = Math.max(best, gradeSingleEntry(entry, capabilities));
  }
  return CONFIDENCE_BY_RANK[best] || 'exploratory';
}

export function clampConfidence(modelConfidence, computedConfidence) {
  const mRank = CONFIDENCE_RANK[modelConfidence] ?? 0;
  const cRank = CONFIDENCE_RANK[computedConfidence] ?? 0;
  return CONFIDENCE_BY_RANK[Math.min(mRank, cRank)] || 'exploratory';
}

/**
 * Benjamini-Hochberg False Discovery Rate (FDR) adjustment.
 * Matches scipy.stats.false_discovery_control(..., method='bh').
 */

export function benjaminiHochberg(pValues, { fdr = 0.1 } = {}) {
  const m = pValues.length;
  if (m === 0) return { qValues: [], rejected: [], fdr, m: 0 };

  const valid = [];
  for (let i = 0; i < m; i++) {
    const p = Number(pValues[i]);
    if (Number.isFinite(p)) {
      valid.push({ idx: i, p: Math.min(1, Math.max(0, p)) });
    }
  }
  const mValid = valid.length;
  const qValues = new Array(m).fill(NaN);
  const rejected = new Array(m).fill(false);

  if (mValid === 0) return { qValues, rejected, fdr, m: 0 };

  valid.sort((a, b) => a.p - b.p);
  const adj = new Array(mValid);
  let runningMin = 1.0;
  for (let k = mValid - 1; k >= 0; k--) {
    const rank = k + 1;
    const raw = (valid[k].p * mValid) / rank;
    runningMin = Math.min(runningMin, raw);
    adj[k] = Math.min(1.0, runningMin);
  }

  for (let k = 0; k < mValid; k++) {
    const origIdx = valid[k].idx;
    qValues[origIdx] = adj[k];
    rejected[origIdx] = adj[k] <= fdr;
  }

  return { qValues, rejected, fdr, m: mValid };
}

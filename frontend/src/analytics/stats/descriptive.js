/**
 * Descriptive and robust summary statistics.
 */

export function finiteValues(arr) {
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const v = Number(arr[i]);
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
}

export function mean(arr) {
  const vals = finiteValues(arr);
  if (vals.length === 0) return NaN;
  let sum = 0;
  for (let i = 0; i < vals.length; i++) sum += vals[i];
  return sum / vals.length;
}

export function quantile(arr, q) {
  const vals = finiteValues(arr).sort((a, b) => a - b);
  if (vals.length === 0) return NaN;
  if (vals.length === 1) return vals[0];
  const clamped = Math.min(1, Math.max(0, q));
  const pos = (vals.length - 1) * clamped;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const frac = pos - lo;
  return vals[lo] * (1 - frac) + vals[hi] * frac;
}

export function median(arr) {
  return quantile(arr, 0.5);
}

export function variance(arr, ddof = 1) {
  const vals = finiteValues(arr);
  if (vals.length <= ddof) return NaN;
  const m = mean(vals);
  let ss = 0;
  for (let i = 0; i < vals.length; i++) {
    const d = vals[i] - m;
    ss += d * d;
  }
  return ss / (vals.length - ddof);
}

export function std(arr, ddof = 1) {
  const v = variance(arr, ddof);
  return Number.isFinite(v) ? Math.sqrt(v) : NaN;
}

export function iqr(arr) {
  const q75 = quantile(arr, 0.75);
  const q25 = quantile(arr, 0.25);
  return Number.isFinite(q75) && Number.isFinite(q25) ? q75 - q25 : NaN;
}

export function mad(arr, { scale = 1.0 } = {}) {
  const vals = finiteValues(arr);
  if (vals.length === 0) return NaN;
  const med = median(vals);
  const absDevs = vals.map((v) => Math.abs(v - med));
  return median(absDevs) * scale;
}

/**
 * Iglewicz-Hoaglin modified Z-scores using MAD (scaled by 1.4826).
 * Falls back to std if MAD == 0 (e.g., >50% identical values).
 */
export function robustZScores(arr) {
  const vals = arr.map((v) => Number(v));
  const fin = vals.filter(Number.isFinite);
  if (fin.length < 3) return vals.map(() => 0);
  const med = median(fin);
  const scaledMad = mad(fin, { scale: 1.4826 });
  if (scaledMad > 1e-12) {
    return vals.map((v) => (Number.isFinite(v) ? (v - med) / scaledMad : NaN));
  }
  const s = std(fin, 1);
  if (Number.isFinite(s) && s > 1e-12) {
    const m = mean(fin);
    return vals.map((v) => (Number.isFinite(v) ? (v - m) / s : NaN));
  }
  return vals.map((v) => (Number.isFinite(v) ? 0 : NaN));
}

export function summaryStats(arr) {
  const vals = finiteValues(arr).sort((a, b) => a - b);
  const n = vals.length;
  if (n === 0) {
    return { n: 0, mean: NaN, median: NaN, std: NaN, min: NaN, max: NaN, q25: NaN, q75: NaN, iqr: NaN, mad: NaN };
  }
  const q25 = quantile(vals, 0.25);
  const q75 = quantile(vals, 0.75);
  return {
    n,
    mean: mean(vals),
    median: quantile(vals, 0.5),
    std: n > 1 ? std(vals, 1) : 0,
    min: vals[0],
    max: vals[n - 1],
    q25,
    q75,
    iqr: q75 - q25,
    mad: mad(vals, { scale: 1.4826 }),
  };
}

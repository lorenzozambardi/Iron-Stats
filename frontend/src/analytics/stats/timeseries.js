/**
 * Time-series transforms, lag-1 autocorrelation, and lagged cross-correlation.
 */

import { mean } from './descriptive.js';
import { olsRegression } from './trend.js';
import { pearsonCorrelation, spearmanCorrelation } from './correlation.js';

export function firstDifference(arr) {
  const out = [];
  for (let i = 1; i < arr.length; i++) {
    const a = Number(arr[i - 1]);
    const b = Number(arr[i]);
    out.push(Number.isFinite(a) && Number.isFinite(b) ? b - a : NaN);
  }
  return out;
}

export function linearDetrend(y) {
  const x = y.map((_, i) => i);
  const reg = olsRegression(x, y);
  if (reg.residuals.length === y.length) return reg.residuals;
  return y.slice();
}

export function lag1Autocorrelation(arr) {
  const vals = arr.map(Number).filter(Number.isFinite);
  const n = vals.length;
  if (n < 4) return { r1: NaN, significant: false, threshold: NaN, n };
  const m = mean(vals);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const d = vals[i] - m;
    den += d * d;
    if (i > 0) num += (vals[i] - m) * (vals[i - 1] - m);
  }
  if (den <= 1e-15) return { r1: 0, significant: false, threshold: 1.96 / Math.sqrt(n), n };
  const r1 = num / den;
  const threshold = 1.96 / Math.sqrt(n);
  return { r1, significant: Math.abs(r1) > threshold, threshold, n };
}

/**
 * Computes lagged cross-correlation between x[t] and y[t + lag] for lag in [0, maxLag].
 * Positive lag tests whether x leads y.
 */
export function laggedCrossCorrelation(xIn, yIn, { maxLag = 4, method = 'spearman', detrend = true } = {}) {
  const n = Math.min(xIn.length, yIn.length);
  const x = detrend && n >= 4 ? linearDetrend(xIn.slice(0, n)) : xIn.slice(0, n);
  const y = detrend && n >= 4 ? linearDetrend(yIn.slice(0, n)) : yIn.slice(0, n);
  const corrFn = method === 'pearson' ? pearsonCorrelation : spearmanCorrelation;

  const lags = [];
  let best = null;
  for (let lag = 0; lag <= maxLag; lag++) {
    const len = n - lag;
    if (len < 4) continue;
    const xs = x.slice(0, len);
    const ys = y.slice(lag, lag + len);
    const res = corrFn(xs, ys);
    const stat = method === 'pearson' ? res.r : res.rho;
    const entry = { lag, r: stat, pValue: res.pValue, ciLower: res.ciLower, ciUpper: res.ciUpper, n: res.n };
    lags.push(entry);
    if (Number.isFinite(stat) && (!best || Math.abs(stat) > Math.abs(best.r))) {
      best = entry;
    }
  }
  return { lags, bestLag: best };
}

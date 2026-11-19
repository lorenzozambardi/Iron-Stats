/**
 * Pearson, Spearman (tie-aware), and partial correlation with exact t-distribution p-values.
 */

import { mean } from './descriptive.js';
import { normalQuantile, studentTTwoTailedP } from './distributions.js';
import { olsRegression } from './trend.js';

function cleanPairs(x, y) {
  const cx = [];
  const cy = [];
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const xi = Number(x[i]);
    const yi = Number(y[i]);
    if (Number.isFinite(xi) && Number.isFinite(yi)) {
      cx.push(xi);
      cy.push(yi);
    }
  }
  return { x: cx, y: cy };
}

export function rankWithTies(arr) {
  const indexed = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array(arr.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1].v === indexed[i].v) {
      j++;
    }
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) {
      ranks[indexed[k].i] = avgRank;
    }
    i = j + 1;
  }
  return ranks;
}

function fisherZCI(r, n, alpha = 0.05) {
  if (n < 4 || !Number.isFinite(r)) return { ciLower: NaN, ciUpper: NaN };
  if (Math.abs(r) >= 0.9999999) {
    return { ciLower: r > 0 ? 1 : -1, ciUpper: r > 0 ? 1 : -1 };
  }
  const z = 0.5 * Math.log((1 + r) / (1 - r));
  const se = 1 / Math.sqrt(n - 3);
  const zCrit = normalQuantile(1 - alpha / 2);
  return {
    ciLower: Math.tanh(z - zCrit * se),
    ciUpper: Math.tanh(z + zCrit * se),
  };
}

export function pearsonCorrelation(xIn, yIn, { alpha = 0.05 } = {}) {
  const { x, y } = cleanPairs(xIn, yIn);
  const n = x.length;
  if (n < 3) {
    return { r: NaN, pValue: NaN, ciLower: NaN, ciUpper: NaN, n };
  }
  const mx = mean(x);
  const my = mean(y);
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  if (sxx <= 1e-15 || syy <= 1e-15) {
    return { r: NaN, pValue: NaN, ciLower: NaN, ciUpper: NaN, n };
  }
  const r = Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy)));
  const df = n - 2;
  let pValue;
  if (Math.abs(r) >= 1 - 1e-15) {
    pValue = 0;
  } else {
    const tStat = r * Math.sqrt(df / (1 - r * r));
    pValue = studentTTwoTailedP(tStat, df);
  }
  const { ciLower, ciUpper } = fisherZCI(r, n, alpha);
  return { r, pValue, ciLower, ciUpper, n };
}

export function spearmanCorrelation(xIn, yIn, { alpha = 0.05 } = {}) {
  const { x, y } = cleanPairs(xIn, yIn);
  const n = x.length;
  if (n < 3) {
    return { rho: NaN, pValue: NaN, ciLower: NaN, ciUpper: NaN, n };
  }
  const rx = rankWithTies(x);
  const ry = rankWithTies(y);
  const res = pearsonCorrelation(rx, ry, { alpha });
  return {
    rho: res.r,
    pValue: res.pValue,
    ciLower: res.ciLower,
    ciUpper: res.ciUpper,
    n,
  };
}

export function partialCorrelation(xIn, yIn, zIn, { method = 'spearman', alpha = 0.05 } = {}) {
  const nRaw = Math.min(xIn.length, yIn.length, zIn.length);
  const x = [];
  const y = [];
  const z = [];
  for (let i = 0; i < nRaw; i++) {
    const xi = Number(xIn[i]);
    const yi = Number(yIn[i]);
    const zi = Number(zIn[i]);
    if (Number.isFinite(xi) && Number.isFinite(yi) && Number.isFinite(zi)) {
      x.push(xi);
      y.push(yi);
      z.push(zi);
    }
  }
  const n = x.length;
  if (n < 4) {
    return { r: NaN, pValue: NaN, ciLower: NaN, ciUpper: NaN, df: 0, n };
  }
  const tx = method === 'spearman' ? rankWithTies(x) : x;
  const ty = method === 'spearman' ? rankWithTies(y) : y;
  const tz = method === 'spearman' ? rankWithTies(z) : z;

  const regX = olsRegression(tz, tx);
  const regY = olsRegression(tz, ty);
  const rx = regX.residuals;
  const ry = regY.residuals;
  const base = pearsonCorrelation(rx, ry, { alpha });
  const df = n - 3;
  if (!Number.isFinite(base.r)) {
    return { r: NaN, pValue: NaN, ciLower: NaN, ciUpper: NaN, df, n };
  }
  const pValue =
    Math.abs(base.r) >= 1 - 1e-15
      ? 0
      : studentTTwoTailedP(base.r * Math.sqrt(df / (1 - base.r * base.r)), df);

  // Fisher z with n-4 degrees of freedom for 1 covariate
  let ciLower = NaN;
  let ciUpper = NaN;
  if (n >= 5 && Math.abs(base.r) < 0.9999999) {
    const zVal = 0.5 * Math.log((1 + base.r) / (1 - base.r));
    const se = 1 / Math.sqrt(n - 4);
    const zCrit = normalQuantile(1 - alpha / 2);
    ciLower = Math.tanh(zVal - zCrit * se);
    ciUpper = Math.tanh(zVal + zCrit * se);
  }
  return { r: base.r, pValue, ciLower, ciUpper, df, n };
}

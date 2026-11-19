/**
 * Parametric (OLS) and robust (Theil-Sen) linear trend estimators.
 */

import { mean, median } from './descriptive.js';
import { studentTTwoTailedP } from './distributions.js';
import { pairedBootstrapCI } from './bootstrap.js';

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

export function olsRegression(xIn, yIn) {
  const { x, y } = cleanPairs(xIn, yIn);
  const n = x.length;
  if (n < 3) {
    return { slope: NaN, intercept: NaN, r2: NaN, seSlope: NaN, tStat: NaN, pValue: NaN, n, residuals: [] };
  }
  const mx = mean(x);
  const my = mean(y);
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  if (sxx <= 1e-15) {
    return { slope: NaN, intercept: my, r2: 0, seSlope: NaN, tStat: NaN, pValue: NaN, n, residuals: y.map((v) => v - my) };
  }
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const residuals = new Array(n);
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const r = y[i] - (intercept + slope * x[i]);
    residuals[i] = r;
    sse += r * r;
  }
  const r2 = syy > 1e-15 ? Math.max(0, Math.min(1, 1 - sse / syy)) : 0;
  const df = n - 2;
  const seSlope = Math.sqrt(Math.max(0, sse / df) / sxx);
  const tStat = seSlope > 1e-15 ? slope / seSlope : (Math.abs(slope) > 1e-15 ? Infinity : 0);
  const pValue = Number.isFinite(tStat) ? studentTTwoTailedP(tStat, df) : 0;

  return { slope, intercept, r2, seSlope, tStat, pValue, n, residuals };
}

function rawTheilSenSlope(x, y) {
  const slopes = [];
  for (let i = 0; i < x.length; i++) {
    for (let j = i + 1; j < x.length; j++) {
      const dx = x[j] - x[i];
      if (Math.abs(dx) > 1e-12) {
        slopes.push((y[j] - y[i]) / dx);
      }
    }
  }
  if (slopes.length === 0) return NaN;
  return median(slopes);
}

export function theilSenSlope(xIn, yIn, { seed = 42, nBoot = 500, alpha = 0.05 } = {}) {
  const { x, y } = cleanPairs(xIn, yIn);
  const n = x.length;
  if (n < 3) {
    return { slope: NaN, intercept: NaN, ciLower: NaN, ciUpper: NaN, n };
  }
  const slope = rawTheilSenSlope(x, y);
  if (!Number.isFinite(slope)) {
    return { slope: NaN, intercept: NaN, ciLower: NaN, ciUpper: NaN, n };
  }
  const intercept = median(y) - slope * median(x);
  const boot = pairedBootstrapCI(x, y, rawTheilSenSlope, { nBoot, alpha, seed });
  return {
    slope,
    intercept,
    ciLower: boot.lower,
    ciUpper: boot.upper,
    n,
  };
}

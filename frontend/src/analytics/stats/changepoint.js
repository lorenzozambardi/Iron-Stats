/**
 * Plateau detection and single-breakpoint regime shift detection (segmented OLS + BIC + Chow F-test).
 */

import { mean } from './descriptive.js';
import { olsRegression } from './trend.js';
import { fUpperTailP } from './distributions.js';

export function detectPlateaus(xIn, yIn, { minLength = 3, relativeTol = 0.015 } = {}) {
  const n = Math.min(xIn.length, yIn.length);
  const x = [];
  const y = [];
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(Number(xIn[i])) && Number.isFinite(Number(yIn[i]))) {
      x.push(Number(xIn[i]));
      y.push(Number(yIn[i]));
    }
  }
  if (x.length < minLength) return [];

  const segments = [];
  let start = 0;
  while (start <= x.length - minLength) {
    let end = start + minLength - 1;
    let bestEnd = -1;
    while (end < x.length) {
      const sliceX = x.slice(start, end + 1);
      const sliceY = y.slice(start, end + 1);
      const base = Math.max(1e-6, Math.abs(sliceY[0]));
      const totalGain = (sliceY[sliceY.length - 1] - sliceY[0]) / base;
      const peakGain = (Math.max(...sliceY) - sliceY[0]) / base;
      const reg = olsRegression(sliceX, sliceY);
      const relSlope = Number.isFinite(reg.slope) ? reg.slope / base : 0;
      if (totalGain <= relativeTol && peakGain <= relativeTol * 2 && relSlope <= relativeTol / 2) {
        bestEnd = end;
        end++;
      } else {
        break;
      }
    }
    if (bestEnd >= start + minLength - 1) {
      const sliceX = x.slice(start, bestEnd + 1);
      const sliceY = y.slice(start, bestEnd + 1);
      const reg = olsRegression(sliceX, sliceY);
      segments.push({
        startIdx: start,
        endIdx: bestEnd,
        startX: sliceX[0],
        endX: sliceX[sliceX.length - 1],
        length: sliceX.length,
        meanVal: mean(sliceY),
        slope: reg.slope,
      });
      start = bestEnd + 1;
    } else {
      start++;
    }
  }
  return segments;
}

function sumSqResiduals(res) {
  let s = 0;
  for (let i = 0; i < res.length; i++) s += res[i] * res[i];
  return s;
}

export function detectRegimeShift(xIn, yIn, { minSegment = 3, bicThreshold = 4.0 } = {}) {
  const nRaw = Math.min(xIn.length, yIn.length);
  const x = [];
  const y = [];
  for (let i = 0; i < nRaw; i++) {
    if (Number.isFinite(Number(xIn[i])) && Number.isFinite(Number(yIn[i]))) {
      x.push(Number(xIn[i]));
      y.push(Number(yIn[i]));
    }
  }
  const n = x.length;
  if (n < minSegment * 2) {
    return { detected: false, breakIndex: null, breakX: null, beforeSlope: NaN, afterSlope: NaN, deltaSlope: NaN, deltaBic: 0, pValue: NaN };
  }

  const full = olsRegression(x, y);
  const sseFull = Math.max(1e-12, sumSqResiduals(full.residuals));
  const bicFull = n * Math.log(sseFull / n) + 2 * Math.log(n);

  let best = null;
  for (let k = minSegment; k <= n - minSegment; k++) {
    const left = olsRegression(x.slice(0, k), y.slice(0, k));
    const right = olsRegression(x.slice(k), y.slice(k));
    if (!Number.isFinite(left.slope) || !Number.isFinite(right.slope)) continue;
    const sseSplit = Math.max(1e-12, sumSqResiduals(left.residuals) + sumSqResiduals(right.residuals));
    // 5 params: 2 slopes, 2 intercepts, 1 breakpoint
    const bicSplit = n * Math.log(sseSplit / n) + 5 * Math.log(n);
    const deltaBic = bicFull - bicSplit;
    if (!best || deltaBic > best.deltaBic) {
      const df1 = 2;
      const df2 = n - 4;
      const fStat = df2 > 0 ? ((sseFull - sseSplit) / df1) / (sseSplit / df2) : 0;
      const pValue = df2 > 0 ? fUpperTailP(Math.max(0, fStat), df1, df2) : NaN;
      best = {
        detected: deltaBic >= bicThreshold && (!Number.isFinite(pValue) || pValue < 0.05),
        breakIndex: k,
        breakX: x[k],
        beforeSlope: left.slope,
        afterSlope: right.slope,
        deltaSlope: right.slope - left.slope,
        deltaBic,
        pValue,
      };
    }
  }

  return best || {
    detected: false,
    breakIndex: null,
    breakX: null,
    beforeSlope: full.slope,
    afterSlope: full.slope,
    deltaSlope: 0,
    deltaBic: 0,
    pValue: NaN,
  };
}

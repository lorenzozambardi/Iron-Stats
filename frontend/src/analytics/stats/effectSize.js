/**
 * Parametric (Hedges' g) and non-parametric (Cliff's delta) two-sample effect sizes.
 */

import { finiteValues, mean, variance } from './descriptive.js';
import { mulberry32 } from './bootstrap.js';

function rawHedgesG(a, b) {
  const nA = a.length;
  const nB = b.length;
  if (nA < 2 || nB < 2) return NaN;
  const mA = mean(a);
  const mB = mean(b);
  const vA = variance(a, 1);
  const vB = variance(b, 1);
  const df = nA + nB - 2;
  const pooledVar = ((nA - 1) * vA + (nB - 1) * vB) / df;
  if (!Number.isFinite(pooledVar) || pooledVar <= 1e-15) return NaN;
  const d = (mB - mA) / Math.sqrt(pooledVar);
  const j = 1 - 3 / (4 * df - 1);
  return d * j;
}

export function hedgesG(aIn, bIn, { seed = 42, nBoot = 500, alpha = 0.05 } = {}) {
  const a = finiteValues(aIn);
  const b = finiteValues(bIn);
  const nA = a.length;
  const nB = b.length;
  const meanA = mean(a);
  const meanB = mean(b);
  const diff = meanB - meanA;
  const pctDiff = Number.isFinite(meanA) && Math.abs(meanA) > 1e-12 ? (diff / Math.abs(meanA)) * 100 : NaN;

  if (nA < 2 || nB < 2) {
    return { g: NaN, cohensD: NaN, meanA, meanB, diff, pctDiff, ciLower: NaN, ciUpper: NaN, nA, nB };
  }
  const df = nA + nB - 2;
  const pooledSd = Math.sqrt(((nA - 1) * variance(a, 1) + (nB - 1) * variance(b, 1)) / df);
  const cohensD = pooledSd > 1e-15 ? diff / pooledSd : NaN;
  const j = 1 - 3 / (4 * df - 1);
  const g = Number.isFinite(cohensD) ? cohensD * j : NaN;

  const rng = mulberry32(seed);
  const samples = [];
  const ra = new Array(nA);
  const rb = new Array(nB);
  for (let k = 0; k < nBoot; k++) {
    for (let i = 0; i < nA; i++) ra[i] = a[Math.floor(rng() * nA)];
    for (let i = 0; i < nB; i++) rb[i] = b[Math.floor(rng() * nB)];
    const val = rawHedgesG(ra, rb);
    if (Number.isFinite(val)) samples.push(val);
  }
  let ciLower = NaN;
  let ciUpper = NaN;
  if (samples.length >= 10) {
    samples.sort((u, v) => u - v);
    ciLower = samples[Math.floor((samples.length - 1) * (alpha / 2))];
    ciUpper = samples[Math.floor((samples.length - 1) * (1 - alpha / 2))];
  }

  return { g, cohensD, meanA, meanB, diff, pctDiff, ciLower, ciUpper, nA, nB };
}

export function cliffsDelta(aIn, bIn) {
  const a = finiteValues(aIn);
  const b = finiteValues(bIn);
  const nA = a.length;
  const nB = b.length;
  if (nA === 0 || nB === 0) return { delta: NaN, magnitude: 'insufficient', nA, nB };

  let greater = 0;
  let less = 0;
  for (let i = 0; i < nB; i++) {
    for (let j = 0; j < nA; j++) {
      if (b[i] > a[j]) greater++;
      else if (b[i] < a[j]) less++;
    }
  }
  const delta = (greater - less) / (nA * nB);
  const absD = Math.abs(delta);
  let magnitude = 'negligible';
  if (absD >= 0.474) magnitude = 'large';
  else if (absD >= 0.33) magnitude = 'medium';
  else if (absD >= 0.147) magnitude = 'small';

  return { delta, magnitude, nA, nB };
}

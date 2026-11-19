/**
 * Deterministic PRNG and percentile bootstrap utilities.
 */

export function mulberry32(seed = 42) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sortedQuantile(sorted, q) {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const frac = pos - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

export function bootstrapCI(data, statFn, { nBoot = 1000, alpha = 0.05, seed = 42 } = {}) {
  const n = data.length;
  const estimate = statFn(data);
  if (n < 2 || !Number.isFinite(estimate)) {
    return { estimate, lower: NaN, upper: NaN, se: NaN };
  }
  const rng = mulberry32(seed);
  const samples = [];
  const resample = new Array(n);
  for (let b = 0; b < nBoot; b++) {
    for (let i = 0; i < n; i++) {
      resample[i] = data[Math.floor(rng() * n)];
    }
    const val = statFn(resample);
    if (Number.isFinite(val)) samples.push(val);
  }
  if (samples.length < 10) {
    return { estimate, lower: NaN, upper: NaN, se: NaN };
  }
  samples.sort((a, b) => a - b);
  const m = samples.reduce((s, v) => s + v, 0) / samples.length;
  const variance = samples.reduce((s, v) => s + (v - m) ** 2, 0) / (samples.length - 1);
  return {
    estimate,
    lower: sortedQuantile(samples, alpha / 2),
    upper: sortedQuantile(samples, 1 - alpha / 2),
    se: Math.sqrt(variance),
  };
}

export function pairedBootstrapCI(x, y, statFn, { nBoot = 1000, alpha = 0.05, seed = 42 } = {}) {
  const n = Math.min(x.length, y.length);
  const estimate = statFn(x.slice(0, n), y.slice(0, n));
  if (n < 3 || !Number.isFinite(estimate)) {
    return { estimate, lower: NaN, upper: NaN, se: NaN };
  }
  const rng = mulberry32(seed);
  const samples = [];
  const rx = new Array(n);
  const ry = new Array(n);
  for (let b = 0; b < nBoot; b++) {
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(rng() * n);
      rx[i] = x[idx];
      ry[i] = y[idx];
    }
    const val = statFn(rx, ry);
    if (Number.isFinite(val)) samples.push(val);
  }
  if (samples.length < 10) {
    return { estimate, lower: NaN, upper: NaN, se: NaN };
  }
  samples.sort((a, b) => a - b);
  const m = samples.reduce((s, v) => s + v, 0) / samples.length;
  const variance = samples.reduce((s, v) => s + (v - m) ** 2, 0) / (samples.length - 1);
  return {
    estimate,
    lower: sortedQuantile(samples, alpha / 2),
    upper: sortedQuantile(samples, 1 - alpha / 2),
    se: Math.sqrt(variance),
  };
}

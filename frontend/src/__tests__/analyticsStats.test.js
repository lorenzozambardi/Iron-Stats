import { describe, it, expect } from 'vitest';
import fixture from './fixtures/scipyStatsFixtures.json';
import { normalCDF, normalQuantile, studentTTwoTailedP, fUpperTailP } from '../analytics/stats/distributions.js';
import { mean, median, std, quantile, mad, robustZScores, summaryStats } from '../analytics/stats/descriptive.js';
import { olsRegression, theilSenSlope } from '../analytics/stats/trend.js';
import { rankWithTies, pearsonCorrelation, spearmanCorrelation, partialCorrelation } from '../analytics/stats/correlation.js';
import { firstDifference, linearDetrend, lag1Autocorrelation, laggedCrossCorrelation } from '../analytics/stats/timeseries.js';
import { detectPlateaus, detectRegimeShift } from '../analytics/stats/changepoint.js';
import { benjaminiHochberg } from '../analytics/stats/multiplicity.js';
import { bootstrapCI } from '../analytics/stats/bootstrap.js';
import { hedgesG, cliffsDelta } from '../analytics/stats/effectSize.js';
import { computeSetE1RM, computeSFR } from '../analytics/stats/strength.js';

describe('analytics/stats parity with SciPy fixtures', () => {
  it('matches normal, t, and F distributions within 1e-6', () => {
    expect(normalCDF(1.96)).toBeCloseTo(fixture.distributions.norm_cdf_1_96, 6);
    expect(normalCDF(-0.5)).toBeCloseTo(fixture.distributions.norm_cdf_neg_0_5, 6);
    expect(normalQuantile(0.975)).toBeCloseTo(fixture.distributions.norm_ppf_975, 6);
    expect(studentTTwoTailedP(2.5, 10)).toBeCloseTo(fixture.distributions.t_2tail_2_5_df10, 6);
    expect(studentTTwoTailedP(1.8, 5)).toBeCloseTo(fixture.distributions.t_2tail_1_8_df5, 6);
    expect(fUpperTailP(4.2, 2, 12)).toBeCloseTo(fixture.distributions.f_sf_4_2_df2_12, 6);
  });

  it('matches descriptive statistics', () => {
    expect(mean(fixture.y1)).toBeCloseTo(fixture.descriptive.mean_y1, 6);
    expect(median(fixture.y1)).toBeCloseTo(fixture.descriptive.median_y1, 6);
    expect(std(fixture.y1)).toBeCloseTo(fixture.descriptive.std_y1, 6);
    expect(quantile(fixture.y1, 0.25)).toBeCloseTo(fixture.descriptive.q25_y1, 6);
    expect(quantile(fixture.y1, 0.75)).toBeCloseTo(fixture.descriptive.q75_y1, 6);
    expect(mad(fixture.y1, { scale: 1.4826 })).toBeCloseTo(fixture.descriptive.mad_scaled_y1, 4);

    const z = robustZScores([10, 10.5, 11, 10.2, 10.8, 50]);
    expect(z[5]).toBeGreaterThan(5);
    expect(summaryStats(fixture.y1).n).toBe(fixture.y1.length);
  });

  it('matches OLS regression and Theil-Sen slope', () => {
    const lin = olsRegression(fixture.x1, fixture.y1);
    expect(lin.slope).toBeCloseTo(fixture.ols.slope, 6);
    expect(lin.intercept).toBeCloseTo(fixture.ols.intercept, 6);
    expect(lin.r2).toBeCloseTo(fixture.ols.r2, 6);
    expect(lin.seSlope).toBeCloseTo(fixture.ols.seSlope, 6);
    expect(lin.pValue).toBeCloseTo(fixture.ols.pValue, 6);

    const ts = theilSenSlope(fixture.x1, fixture.y1, { seed: 42, nBoot: 300 });
    expect(ts.slope).toBeCloseTo(fixture.theilSen.slope, 6);
    expect(ts.intercept).toBeCloseTo(fixture.theilSen.intercept, 6);
    expect(ts.ciLower).toBeLessThan(ts.slope);
    expect(ts.ciUpper).toBeGreaterThan(ts.slope);
  });

  it('matches Pearson, tie-aware Spearman, and partial correlation', () => {
    const pr = pearsonCorrelation(fixture.x1, fixture.y1);
    expect(pr.r).toBeCloseTo(fixture.pearson.r, 6);
    expect(pr.pValue).toBeCloseTo(fixture.pearson.pValue, 6);

    const ranks = rankWithTies(fixture.x_ties);
    expect(ranks).toEqual(fixture.spearman_ties.ranks_x);

    const sr = spearmanCorrelation(fixture.x_ties, fixture.y_ties);
    expect(sr.rho).toBeCloseTo(fixture.spearman_ties.rho, 6);
    expect(sr.pValue).toBeCloseTo(fixture.spearman_ties.pValue, 6);

    const part = partialCorrelation(fixture.x_ties, fixture.y_ties, fixture.z_cov, { method: 'pearson' });
    expect(part.r).toBeCloseTo(fixture.partial_pearson.r, 6);
    expect(part.pValue).toBeCloseTo(fixture.partial_pearson.pValue, 6);
  });

  it('matches Benjamini-Hochberg FDR q-values exactly', () => {
    const bh = benjaminiHochberg(fixture.p_vals, { fdr: 0.1 });
    bh.qValues.forEach((q, idx) => {
      expect(q).toBeCloseTo(fixture.bh_q[idx], 6);
    });
    expect(bh.rejected[0]).toBe(true);
    expect(bh.rejected[7]).toBe(false);
  });

  it('detects plateaus, regime shifts, lagged cross-correlation, and autocorrelation', () => {
    const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const plateauY = [100, 105, 110, 115, 115, 115.2, 114.8, 115.1, 115.0, 120, 125, 130];
    const plateaus = detectPlateaus(x, plateauY, { minLength: 3 });
    expect(plateaus.length).toBeGreaterThanOrEqual(1);
    expect(plateaus[0].length).toBeGreaterThanOrEqual(4);

    // Clear regime shift at index 6: +2/wk then -1/wk
    const shiftY = [100, 102, 104, 106, 108, 110, 109, 108, 107, 106, 105, 104];
    const shift = detectRegimeShift(x, shiftY);
    expect(shift.detected).toBe(true);
    expect(shift.beforeSlope).toBeGreaterThan(1.5);
    expect(shift.afterSlope).toBeLessThan(-0.5);

    // Planted lag-2 signal: y[t+2] tracks x[t]
    const sigX = [10, 20, 12, 24, 14, 28, 11, 22, 15, 26, 13, 25, 10, 21];
    const sigY = [0, 0, 10.5, 19.5, 12.2, 23.8, 14.1, 27.9, 11.2, 22.1, 15.0, 25.8, 13.1, 24.9];
    const xcorr = laggedCrossCorrelation(sigX, sigY, { maxLag: 3, method: 'pearson', detrend: false });
    expect(xcorr.bestLag.lag).toBe(2);
    expect(xcorr.bestLag.r).toBeGreaterThan(0.95);

    const ac = lag1Autocorrelation([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(ac.significant).toBe(true);
    expect(firstDifference([10, 13, 12])).toEqual([3, -1]);
    expect(linearDetrend([2, 4, 6, 8]).every((v) => Math.abs(v) < 1e-10)).toBe(true);
  });

  it('computes reproducible bootstrap CIs, effect sizes, e1RM, and SFR', () => {
    const b1 = bootstrapCI(fixture.y1, mean, { seed: 123, nBoot: 200 });
    const b2 = bootstrapCI(fixture.y1, mean, { seed: 123, nBoot: 200 });
    expect(b1).toEqual(b2);

    const hg = hedgesG(fixture.a, fixture.b, { seed: 42, nBoot: 300 });
    expect(hg.g).toBeGreaterThan(2);
    expect(hg.ciLower).toBeGreaterThan(1);

    const cd = cliffsDelta(fixture.a, fixture.b);
    expect(cd.delta).toBe(1);
    expect(cd.magnitude).toBe('large');

    const e1 = computeSetE1RM(100, 10, 8.0, true);
    expect(e1.valid).toBe(true);
    expect(e1.rawE1rm).toBeCloseTo(100 * (1 + 10 / 30), 4);
    expect(e1.rpeAdjustedE1rm).toBeCloseTo(100 * (1 + 12 / 30), 4);
    expect(e1.e1rm).toBeCloseTo(e1.rpeAdjustedE1rm, 4);
    expect(e1.highRepWarning).toBe(false);

    const e2 = computeSetE1RM(60, 15, 9.0, false);
    expect(e2.e1rm).toBeCloseTo(e2.rawE1rm, 4);
    expect(e2.highRepWarning).toBe(true);

    expect(computeSFR(12, 4)).toBe(3);
    expect(computeSFR(12, 0)).toBeNull();
  });
});

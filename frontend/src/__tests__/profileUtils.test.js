import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PROFILE,
  CIRCUMFERENCE_FIELDS,
  calcAge,
  getLimbAverage,
  calcBMI,
  calcLeanMass,
  calcFatMass,
  calcFFMI,
  calcKatchMcArdleBMR,
  calcTDEEFromSteps,
  calcWaistToHeight,
  calcVTaper,
  computeRadarAxes,
} from '../profileUtils';

describe('profileUtils', () => {
  it('calculates BMI, LBM, Fat Mass, and FFMI accurately', () => {
    // 80 kg, 180 cm, 15% BF -> BMI = 80 / 3.24 = 24.69, LBM = 68 kg, FFMI = 68 / 3.24 = 20.99
    expect(calcBMI(80, 180)).toBeCloseTo(24.69, 2);
    expect(calcLeanMass(80, 15)).toBeCloseTo(68.0, 2);
    expect(calcFatMass(80, 15)).toBeCloseTo(12.0, 2);

    const ffmi = calcFFMI(80, 180, 15);
    expect(ffmi.ffmi).toBeCloseTo(20.99, 2);
    expect(ffmi.normalizedFfmi).toBeCloseTo(20.99, 2);
    expect(ffmi.category).toBe('Intermediate');
  });

  it('calculates Katch-McArdle BMR, TDEE from avg steps, and body proportion ratios', () => {
    const bmr = calcKatchMcArdleBMR(68);
    expect(bmr).toBeCloseTo(1838.8, 1);

    const lowSteps = calcTDEEFromSteps({ bmr, weightKg: 70, avgSteps: 5000 });
    expect(lowSteps.stepsKcal).toBeCloseTo(200, 1);

    const highSteps = calcTDEEFromSteps({ bmr, weightKg: 70, avgSteps: 10000 });
    expect(highSteps.stepsKcal).toBeCloseTo(400, 1);
    expect(highSteps.tdee).toBeGreaterThan(lowSteps.tdee);

    expect(calcWaistToHeight(79, 178)).toBeCloseTo(0.4438, 3);
    expect(calcVTaper(122, 79)).toBeCloseTo(1.544, 3);
  });

  it('computes 6 bounded radar axes (20..99) with and without comparison', () => {
    const singleAxes = computeRadarAxes(DEFAULT_PROFILE.current);
    expect(singleAxes).toHaveLength(6);
    for (const axis of singleAxes) {
      expect(axis.scoreA).toBeGreaterThanOrEqual(20);
      expect(axis.scoreA).toBeLessThanOrEqual(99);
      expect(axis.scoreB).toBeNull();
    }

    const comparedAxes = computeRadarAxes(DEFAULT_PROFILE.current, DEFAULT_PROFILE.current);
    expect(comparedAxes).toHaveLength(6);
    for (const axis of comparedAxes) {
      expect(axis.scoreB).toBeGreaterThanOrEqual(20);
      expect(axis.scoreB).toBeLessThanOrEqual(99);
    }
  });

  it('calculates age from birth date and averages bilateral limb circumferences', () => {
    const ref = new Date(2026, 10, 18); // 2026-11-18
    expect(calcAge('1998-01-01', ref)).toBe(28);
    expect(calcAge('1998-12-01', ref)).toBe(27);

    const armField = CIRCUMFERENCE_FIELDS.find((f) => f.key === 'arm');
    expect(getLimbAverage({ armLeft: 39, armRight: 40 }, armField)).toBeCloseTo(39.5, 2);
  });
});

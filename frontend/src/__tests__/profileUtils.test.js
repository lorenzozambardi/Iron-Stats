import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PROFILE,
  calcBMI,
  calcLeanMass,
  calcFatMass,
  calcFFMI,
  calcKatchMcArdleBMR,
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

  it('calculates Katch-McArdle BMR and body proportion ratios', () => {
    expect(calcKatchMcArdleBMR(68)).toBeCloseTo(1838.8, 1);
    expect(calcWaistToHeight(79, 178)).toBeCloseTo(0.4438, 3);
    expect(calcVTaper(122, 79)).toBeCloseTo(1.544, 3);
  });

  it('computes 6 bounded radar axes (20..99) for current vs target', () => {
    const axes = computeRadarAxes(DEFAULT_PROFILE.current, DEFAULT_PROFILE.targets);
    expect(axes).toHaveLength(6);
    for (const axis of axes) {
      expect(axis.scoreA).toBeGreaterThanOrEqual(20);
      expect(axis.scoreA).toBeLessThanOrEqual(99);
      expect(axis.scoreB).toBeGreaterThanOrEqual(20);
      expect(axis.scoreB).toBeLessThanOrEqual(99);
    }
  });
});

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PROFILE,
  PROFILE_STORAGE_KEY,
  CIRCUMFERENCE_FIELDS,
  CIRCUMFERENCE_LOG_KEYS,
  PROFILE_LOG_META,
  buildDerivedMetricSeries,
  loadProfile,
  parseProfileMarkdown,
  serializeProfileToMarkdown,
  formatProfileLogValue,
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
  formatDisplayDate,
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
    const armAxis = singleAxes.find((a) => a.key === 'arm');
    const thighAxis = singleAxes.find((a) => a.key === 'thigh');
    expect(armAxis.rawA).toBeCloseTo(39.5, 2);
    expect(armAxis.scoreA).toBeGreaterThan(20);
    expect(thighAxis.rawA).toBeCloseTo(59.0, 2);
    expect(thighAxis.scoreA).toBeGreaterThan(20);

    const zeroWaistAxes = computeRadarAxes({ ...DEFAULT_PROFILE.current, waist: 0 });
    expect(zeroWaistAxes.find((a) => a.key === 'waist').scoreA).toBe(20);

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
    expect(calcAge('1998-02-31', ref)).toBeNull();
    expect(calcAge('1998-99-99', ref)).toBeNull();
    expect(calcAge('1998--', ref)).toBeNull();

    const armField = CIRCUMFERENCE_FIELDS.find((f) => f.key === 'arm');
    expect(getLimbAverage({ armLeft: 39, armRight: 40 }, armField)).toBeCloseTo(39.5, 2);
    expect(getLimbAverage({ armLeft: -5, armRight: 0 }, armField)).toBe(0);
    expect(getLimbAverage({ chest: 'abc' }, { key: 'chest', bilateral: false })).toBe(0);

    expect(formatDisplayDate('2026-11-18', 'dd/mm/yyyy')).toBe('18/11/2026');
    expect(formatDisplayDate('2026-11-18', 'mm/dd/yyyy')).toBe('11/18/2026');
    expect(formatDisplayDate('2026-11-18', 'yyyy-mm-dd')).toBe('2026-11-18');
  });

  it('preserves circumference logs in loadProfile and formats all profile log values', () => {
    expect(CIRCUMFERENCE_LOG_KEYS).toHaveLength(13);
    expect(PROFILE_LOG_META.armLeft).toEqual({
      label: 'Arm L',
      unit: 'cm',
      decimals: 1,
      category: 'circumference',
    });
    expect(formatProfileLogValue('weight', 78.5)).toBe('78.5 kg');
    expect(formatProfileLogValue('bodyFat', 13.5)).toBe('13.5%');
    expect(formatProfileLogValue('waist', 79)).toBe('79.0 cm');

    const store = {};
    const origLocalStorage = globalThis.localStorage;
    globalThis.localStorage = {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
    };
    try {
      store[PROFILE_STORAGE_KEY] = JSON.stringify({
        current: DEFAULT_PROFILE.current,
        logs: [
          { id: '1', date: '2026-11-19', ts: 1, type: 'weight', value: 78.5 },
          { id: '2', date: '2026-11-19', ts: 1, type: 'neck', value: 39 },
          { id: '3', date: '2026-11-19', ts: 1, type: 'armLeft', value: 39.5 },
          { id: '4', date: '2026-11-19', ts: 1, type: 'unknownMetric', value: 99 },
        ],
      });
      const loaded = loadProfile();
      expect(loaded.logs.map((l) => l.type)).toEqual(['weight', 'neck', 'armLeft']);
    } finally {
      globalThis.localStorage = origLocalStorage;
    }
  });

  it('builds chronological derived metric series with carry-forward pairing', () => {
    const logs = [
      { id: '1', date: '2026-11-01', ts: 1000, type: 'weight', value: 80 },
      { id: '2', date: '2026-11-01', ts: 1000, type: 'bodyFat', value: 15 },
      { id: '3', date: '2026-11-10', ts: 2000, type: 'weight', value: 82 },
    ];
    const current = { ...DEFAULT_PROFILE.current, height: 180, weight: 82, bodyFat: 15 };

    const bmiSeries = buildDerivedMetricSeries(logs, current, 'bmi');
    expect(bmiSeries).toHaveLength(2);
    expect(bmiSeries[0].v).toBeCloseTo(24.69, 2);
    expect(bmiSeries[1].v).toBeCloseTo(25.31, 2);

    const lbmSeries = buildDerivedMetricSeries(logs, current, 'lbm');
    expect(lbmSeries).toHaveLength(2);
    expect(lbmSeries[0].v).toBeCloseTo(68.0, 2);
    expect(lbmSeries[1].v).toBeCloseTo(69.7, 2);

    const fmSeries = buildDerivedMetricSeries(logs, current, 'fm');
    expect(fmSeries[0].v).toBeCloseTo(12.0, 2);
    expect(fmSeries[1].v).toBeCloseTo(12.3, 2);

    const ffmiSeries = buildDerivedMetricSeries(logs, current, 'ffmi');
    expect(ffmiSeries[0].v).toBeCloseTo(20.99, 2);
    expect(ffmiSeries[1].v).toBeCloseTo(21.51, 2);
  });

  it('round-trips profile.md serialization and parsing', () => {
    const sample = {
      current: {
        ...DEFAULT_PROFILE.current,
        birthDate: '1999-05-10',
        sex: 'M',
        height: 172,
        avgSteps: 9500,
        weight: 71.5,
        armLeft: 39.5,
      },
      logs: [
        { id: '1', date: '2026-11-20', ts: 2, type: 'weight', value: 71.5 },
        { id: '2', date: '2026-11-20', ts: 2, type: 'armLeft', value: 39.5 },
        { id: '3', date: '2026-11-10', ts: 1, type: 'weight', value: 70.8 },
      ],
    };
    const md = serializeProfileToMarkdown(sample);
    expect(md).toContain('birthdate\n10-05-1999');
    expect(md).toContain('height\n172');
    expect(md).toContain('avgsteps\n9500');
    expect(md).toContain('weight\n71.5 , 20-11-2026\n70.8 , 10-11-2026');
    expect(md).toContain('armleft\n39.5 , 20-11-2026');

    const parsed = parseProfileMarkdown(md);
    expect(parsed.current.birthDate).toBe('1999-05-10');
    expect(parsed.current.height).toBe(172);
    expect(parsed.current.avgSteps).toBe(9500);
    expect(parsed.current.weight).toBe(71.5);
    expect(parsed.current.armLeft).toBe(39.5);
    expect(parsed.logs).toHaveLength(3);
    expect(parsed.logs[0].date).toBe('2026-11-20');
  });
});

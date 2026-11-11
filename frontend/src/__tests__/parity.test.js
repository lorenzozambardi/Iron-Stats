import { describe, it, expect } from 'vitest';
import defaultExercises from '../defaultExercises.json';
import { bezierArea, bezierPartialFraction, solveBezierY } from '../components/helpers';
import { WorkoutSolver, calculateRest } from '../solver';
import { calculateMetrics, calculateSetTuts, calculateSetFatigue, getExercisesWithOverrides, parseLogbook } from '../parser';

describe('Mathematical invariants and frontend/solver parity', () => {
  it('enforces strict 0 <= x0 < x1 < x2 < x3 <= 1 and y >= 0 across all default exercises', () => {
    for (const ex of defaultExercises) {
      for (const prof of Object.values(ex.muscles_distr)) {
        expect(prof.x0).toBeGreaterThanOrEqual(0);
        expect(prof.x0).toBeLessThan(prof.x1);
        expect(prof.x1).toBeLessThan(prof.x2);
        expect(prof.x2).toBeLessThan(prof.x3);
        expect(prof.x3).toBeLessThanOrEqual(1);
        expect(Math.min(prof.y0, prof.y1, prof.y2, prof.y3)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('rejects non-monotone, out-of-domain, or negative-y Bezier profiles', () => {
    expect(() => solveBezierY(0.5, 0.4, 1, 0.33, 0.8, 0.66, 0.4, 0.6, 0.1)).toThrow(RangeError);
    expect(() => solveBezierY(0.5, -0.1, 0, 0.3, 0.5, 0.6, 0.8, 1.0, 1.0)).toThrow(RangeError);
    expect(() => solveBezierY(0.5, 0.1, 0, 0.3, -0.2, 0.6, 0.8, 0.9, 1.0)).toThrow(RangeError);
    const badDb = [
      {
        name: 'BadEx',
        fatigue: 5,
        load_coeff: 0.5,
        load_multiplier: 1,
        load_offset: 0,
        is_isolation: true,
        muscles_distr: {
          Erectors: { x0: 0.4, y0: 1, x1: 0.33, y1: 0.8, x2: 0.66, y2: 0.4, x3: 0.6, y3: 0.1, magnitude: 1 }
        }
      }
    ];
    expect(() => new WorkoutSolver({}, badDb)).toThrow(RangeError);
  });

  it('matches exact 3-point Gauss-Legendre area normalization across solver and dashboard', () => {
    const solver = new WorkoutSolver({ calibration_steps: 0 }, defaultExercises);

    for (const [exName, muscle] of [['LR', 'Lateral Deltoid'], ['Deadlift', 'Erectors'], ['RDL', 'Erectors']]) {
      const ex = defaultExercises.find((e) => e.name === exName);
      const prof = ex.muscles_distr[muscle];
      const solverCurve = solver.ex_curves[exName][muscle];

      // Physical ROM support: zero outside [x0, x3]
      const resolution = 50;
      for (let i = 0; i < resolution; i++) {
        const x = i / (resolution - 1);
        if (x < prof.x0 || x > prof.x3) {
          expect(solverCurve[i]).toBe(0);
        }
      }

      // Dashboard-style GL3 normalization matches solver exactly
      const area = bezierArea(prof.x0, prof.y0, prof.x1, prof.y1, prof.x2, prof.y2, prof.x3, prof.y3);
      const scale = prof.magnitude / area;
      const midIdx = Math.round(0.5 * (resolution - 1));
      const dashAtMid = solveBezierY(midIdx / (resolution - 1), prof.x0, prof.y0, prof.x1, prof.y1, prof.x2, prof.y2, prof.x3, prof.y3) * scale;
      expect(solverCurve[midIdx]).toBeCloseTo(dashAtMid, 6);
      expect(solverCurve[midIdx]).toBe(Math.fround(dashAtMid));
    }
  });

  it('evaluates fatigue continuously at rep_rpe = 0 without a 1.0 jump', () => {
    const tuts = calculateSetTuts(15, 0, 0, 5.0, 1.0, 0.0, 2.0, 0.0);
    const fat = calculateSetFatigue(15, 0, 0, 5.0, 1.0, 0.0, 2.0, 0.0, 1.0, 1.0, tuts);
    let expected = 0;
    for (let j = 0; j < 15; j++) {
      const rir = (10.0 - 5.0) + (14 - j);
      const repRpe = Math.max(0.0, 10.0 - rir);
      expected += tuts[j] * Math.pow(1.1, repRpe - 7.5);
    }
    expect(fat).toBeCloseTo(expected, 9);
  });

  it('keeps JS zero-scale guard active, clamps mutated reps, and matches rest rounding', () => {
    const solver = new WorkoutSolver({ days: 1, min_reps: 12, max_reps: 20, calibration_steps: 5 }, defaultExercises);
    solver.calibrate();
    // days=1 => scales.balance is 0.0; evaluateWorkout must guard to 1e-6 (not 1.0) and remain finite
    expect(solver.scales.balance).toBe(0);
    expect(solver.scales.distr).toBe(0);
    let state = solver.generateRandomState();
    for (let i = 0; i < 100; i++) {
      state = solver.mutateWorkout(state);
      for (const ex of state.days[0]) {
        for (const s of ex.sets) {
          expect(s.base_reps).toBeGreaterThanOrEqual(12);
          expect(s.base_reps).toBeLessThanOrEqual(20);
        }
      }
    }
    expect(Number.isFinite(solver.evaluateWorkout(state))).toBe(true);
    expect(calculateRest(8.5)).toBe("3'30\"");
  });

  it('filters session 0, computes fallback TUTs in calculateMetrics, and normalizes simplex targets', () => {
    const log = "LR | 2' | 1-0-2-0\n10.. 10@9\n# 1\nLR | 2' | 1-0-2-0\n10.. 8@9\n";
    const parsed = parseLogbook(log, defaultExercises);
    // Strip precomputed TUTs from session 0 to test fallback parity
    delete parsed[0].weeks[0].sets[0].totalTut;
    delete parsed[0].weeks[0].sets[0].effectiveTut;
    const m0 = calculateMetrics(parsed, 0, null, null, null);
    expect(m0).toHaveLength(1);
    expect(m0[0].session).toBe(0);
    expect(m0[0].totalTut).toBeGreaterThan(0);
    expect(m0[0].effectiveTut).toBeGreaterThan(0);

    const solver = new WorkoutSolver({
      days: 1,
      calibration_steps: 0,
      volume_dist: {
        macros: { Chest: 40, Shoulders: 10 },
        subs: { Chest: { 'Sternal Head': 100 }, Shoulders: { 'Lateral Deltoid': 100 } }
      }
    }, defaultExercises);
    const targetSum = Object.values(solver.target_sub_vol).reduce((a, b) => a + b, 0);
    expect(targetSum).toBeCloseTo(1.0, 12);
    expect(solver.target_sub_vol['Sternal Head']).toBeCloseTo(0.8, 12);
  });

  it('disables calibration when calibration_steps is 0 and enforces dual bisection guard', () => {
    const solver = new WorkoutSolver({ days: 1, calibration_steps: 0 }, defaultExercises);
    solver.calibrate();
    expect(Object.keys(solver.scales)).toHaveLength(0);

    // Near x0 where x'(t) ~ 0, dual guard prevents premature y error
    const yVal = solveBezierY(1e-7, 0.0, 0.0, 1e-6, 0.0, 2e-6, 1.0, 1.0, 1.0);
    expect(Math.abs(yVal - 5.86032566e-5)).toBeLessThan(1e-6);

    // Extended rep fatigue parity with Python (1.1^2.5 failure multiplier)
    const tuts = calculateSetTuts(0, 2, 4, 10.0, 1.0, 0.0, 2.0, 0.0);
    const fat = calculateSetFatigue(0, 2, 4, 10.0, 1.0, 0.0, 2.0, 0.0, 2.0, 1.0, tuts);
    const expected = (2 * 3.0 * 0.5 + 4 * 1.5 * 0.33) * Math.pow(1.1, 2.5) * 2.0;
    expect(fat).toBeCloseTo(expected, 9);
  });

  it('computes exact stretched-ROM partial fractions, includes unrepresented targets in E_curve, and guards NaN load_offset', () => {
    const hlr = defaultExercises.find((e) => e.name === 'Hanging Leg Raises');
    const absProf = hlr.muscles_distr.Abdominals;
    const hlrFrac = bezierPartialFraction(
      absProf.x0, absProf.y0, absProf.x1, absProf.y1, absProf.x2, absProf.y2, absProf.x3, absProf.y3, 0.3333
    );
    expect(hlrFrac).toBeGreaterThan(0);
    expect(hlrFrac).toBeLessThan(0.02);

    const dl = defaultExercises.find((e) => e.name === 'Deadlift');
    const erProf = dl.muscles_distr.Erectors;
    expect(bezierPartialFraction(
      erProf.x0, erProf.y0, erProf.x1, erProf.y1, erProf.x2, erProf.y2, erProf.x3, erProf.y3, 0.3333
    )).toBe(0);

    // Unrepresented targeted muscle (Wrist Flexors) included in M_eval for E_curve
    const solver = new WorkoutSolver({
      days: 1,
      calibration_steps: 0,
      volume_dist: {
        macros: { Forearms: 50, Shoulders: 50 },
        subs: { Forearms: { 'Wrist Flexors': 100 }, Shoulders: { 'Lateral Deltoid': 100 } }
      }
    }, defaultExercises);
    const lr = defaultExercises.find((e) => e.name === 'LR');
    const st = { days: [[{ exercise: lr, sets: [{ base_reps: 10, partial_reps: 0, rpe: 9.0, total_reps: 10, effective_reps: 5 }] }]] };
    solver._return_raw = true;
    const { rawMetrics } = solver.evaluateWorkout(st);
    solver._return_raw = false;
    expect(rawMetrics.curve).toBeGreaterThan(0.5);

    // Macro-only volume_dist without subs falls back cleanly
    const macroSolver = new WorkoutSolver({
      days: 1,
      calibration_steps: 0,
      volume_dist: { macros: { Chest: 100 }, subs: {} }
    }, defaultExercises);
    const macroSum = Object.values(macroSolver.target_sub_vol).reduce((a, b) => a + b, 0);
    expect(macroSum).toBeCloseTo(1.0, 12);

    // NaN load_offset override is ignored cleanly
    const overridden = getExercisesWithOverrides('override: LR | load_offset=not_a_number', defaultExercises);
    const lrOver = overridden.find((e) => e.name === 'LR');
    expect(lrOver.load_offset).toBe(0);
  });
});

import { describe, it, expect } from 'vitest';
import defaultExercises from '../defaultExercises.json';
import { solveBezierY } from '../components/helpers';
import { WorkoutSolver } from '../solver';
import { calculateSetTuts, calculateSetFatigue } from '../parser';

describe('Mathematical invariants and frontend/solver parity', () => {
  it('enforces strict x0 < x1 < x2 < x3 monotonicity across all default exercises', () => {
    for (const ex of defaultExercises) {
      for (const prof of Object.values(ex.muscles_distr)) {
        expect(prof.x0).toBeLessThan(prof.x1);
        expect(prof.x1).toBeLessThan(prof.x2);
        expect(prof.x2).toBeLessThan(prof.x3);
      }
    }
  });

  it('rejects non-monotone Bezier profiles in solveBezierY and WorkoutSolver', () => {
    expect(() => solveBezierY(0.5, 0.4, 1, 0.33, 0.8, 0.66, 0.4, 0.6, 0.1)).toThrow(RangeError);
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

  it('matches trapezoidal area normalization vs dashboard Riemann sum within tolerance on LR', () => {
    const lr = defaultExercises.find((e) => e.name === 'LR');
    const prof = lr.muscles_distr['Lateral Deltoid'];
    const solver = new WorkoutSolver({ calibration_steps: 0 }, defaultExercises);
    const solverCurve = solver.ex_curves['LR']['Lateral Deltoid'];

    // Physical ROM support: zero outside [x0, x3] = [0.2, 0.9]
    const resolution = 50;
    for (let i = 0; i < resolution; i++) {
      const x = i / (resolution - 1);
      if (x < prof.x0 || x > prof.x3) {
        expect(solverCurve[i]).toBe(0);
      }
    }

    // Dashboard-style 51-point uniform x trapezoidal normalization
    let areaSum = 0;
    const rawY = [];
    for (let i = 0; i <= 50; i++) {
      const y = solveBezierY(i / 50, prof.x0, prof.y0, prof.x1, prof.y1, prof.x2, prof.y2, prof.x3, prof.y3);
      rawY.push(y);
      const weight = (i === 0 || i === 50) ? 0.5 : 1.0;
      areaSum += weight * y;
    }
    const trapScale = prof.magnitude / (areaSum / 50);
    // Compare midpoint x = 0.50 between solver trapezoidal scale and dashboard trapezoidal scale
    const midIdx = Math.round(0.5 * (resolution - 1));
    const dashAtMid = solveBezierY(midIdx / (resolution - 1), prof.x0, prof.y0, prof.x1, prof.y1, prof.x2, prof.y2, prof.x3, prof.y3) * trapScale;
    expect(Math.abs(solverCurve[midIdx] - dashAtMid)).toBeLessThan(0.05);
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
});

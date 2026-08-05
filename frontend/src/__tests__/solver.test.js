import { describe, it, expect } from 'vitest';
import { WorkoutSolver, calculateRest } from '../solver';
import {
  parseLine,
  parseLogbook,
  matchExercise,
  calculateMetrics,
  parseRestTime,
  parseTempoFromLine,
  calculateSetTuts,
  calculateSetFatigue,
  getExercisesWithOverrides,
  COEFF_ASSISTED,
  COEFF_PARTIAL
} from '../parser';

// --- Minimal exercise DB for solver tests ---
const MINI_DB = [
  {
    name: "Flat DB Bench",
    fatigue: 5.0,
    load_coeff: 0.5,
    load_multiplier: 1.0,
    load_offset: 0.0,
    is_isolation: false,
    muscles_distr: {
      "Sternal Head": { x0: 0, y0: 1, x1: 0.33, y1: 1, x2: 0.66, y2: 1, x3: 1, y3: 1, magnitude: 0.6 },
      "Clavicular Head": { x0: 0, y0: 1, x1: 0.33, y1: 1, x2: 0.66, y2: 1, x3: 1, y3: 1, magnitude: 0.4 }
    }
  },
  {
    name: "Lat Machine",
    fatigue: 4.0,
    load_coeff: 0.4,
    load_multiplier: 1.0,
    load_offset: 0.0,
    is_isolation: false,
    muscles_distr: {
      "Latissimus Dorsi": { x0: 0, y0: 1, x1: 0.33, y1: 1, x2: 0.66, y2: 1, x3: 1, y3: 1, magnitude: 0.7 },
      "Teres Major": { x0: 0, y0: 1, x1: 0.33, y1: 1, x2: 0.66, y2: 1, x3: 1, y3: 1, magnitude: 0.3 }
    }
  },
  {
    name: "Squat",
    fatigue: 8.0,
    load_coeff: 0.7,
    load_multiplier: 1.0,
    load_offset: 0.0,
    is_isolation: false,
    muscles_distr: {
      "Quadriceps": { x0: 0, y0: 1, x1: 0.33, y1: 1, x2: 0.66, y2: 1, x3: 1, y3: 1, magnitude: 0.5 },
      "Glutes": { x0: 0, y0: 1, x1: 0.33, y1: 1, x2: 0.66, y2: 1, x3: 1, y3: 1, magnitude: 0.5 }
    }
  },
  {
    name: "LR",
    fatigue: 2.0,
    load_coeff: 0.3,
    load_multiplier: 1.0,
    load_offset: 0.0,
    is_isolation: true,
    muscles_distr: {
      "Lateral Deltoid": { x0: 0, y0: 1, x1: 0.33, y1: 1, x2: 0.66, y2: 1, x3: 1, y3: 1, magnitude: 1.0 }
    }
  },
  {
    name: "RDL",
    fatigue: 7.0,
    load_coeff: 0.5,
    load_multiplier: 1.0,
    load_offset: 0.0,
    is_isolation: false,
    muscles_distr: {
      "Hamstrings": { x0: 0, y0: 1, x1: 0.33, y1: 1, x2: 0.66, y2: 1, x3: 1, y3: 1, magnitude: 0.6 },
      "Glutes": { x0: 0, y0: 1, x1: 0.33, y1: 1, x2: 0.66, y2: 1, x3: 1, y3: 1, magnitude: 0.4 }
    }
  },
  {
    name: "Leg Press 45",
    fatigue: 6.0,
    load_coeff: 0.5,
    load_multiplier: 1.0,
    load_offset: 0.0,
    is_isolation: false,
    muscles_distr: {
      "Quadriceps": { x0: 0, y0: 1, x1: 0.33, y1: 1, x2: 0.66, y2: 1, x3: 1, y3: 1, magnitude: 0.7 },
      "Glutes": { x0: 0, y0: 1, x1: 0.33, y1: 1, x2: 0.66, y2: 1, x3: 1, y3: 1, magnitude: 0.3 }
    }
  },
  {
    name: "Biceps Brachii",
    fatigue: 1.5,
    load_coeff: 0.2,
    load_multiplier: 1.0,
    load_offset: 0.0,
    is_isolation: true,
    muscles_distr: {
      "Biceps Brachii": { x0: 0, y0: 1, x1: 0.33, y1: 1, x2: 0.66, y2: 1, x3: 1, y3: 1, magnitude: 1.0 }
    }
  },
  {
    name: "Long Head",
    fatigue: 1.5,
    load_coeff: 0.2,
    load_multiplier: 1.0,
    load_offset: 0.0,
    is_isolation: true,
    muscles_distr: {
      "Long Head": { x0: 0, y0: 1, x1: 0.33, y1: 1, x2: 0.66, y2: 1, x3: 1, y3: 1, magnitude: 1.0 }
    }
  },
  {
    name: "Dragon Flag Raises",
    fatigue: 3.0,
    load_coeff: 0.3,
    load_multiplier: 1.0,
    load_offset: 0.0,
    is_isolation: false,
    muscles_distr: {
      "Abdominals": { x0: 0, y0: 1, x1: 0.33, y1: 1, x2: 0.66, y2: 1, x3: 1, y3: 1, magnitude: 1.0 }
    }
  },
  {
    name: "Cable French Press",
    fatigue: 2.0,
    load_coeff: 0.3,
    load_multiplier: 1.0,
    load_offset: 0.0,
    is_isolation: true,
    muscles_distr: {
      "Lateral Head": { x0: 0, y0: 1, x1: 0.33, y1: 1, x2: 0.66, y2: 1, x3: 1, y3: 1, magnitude: 0.5 },
      "Medial Head": { x0: 0, y0: 1, x1: 0.33, y1: 1, x2: 0.66, y2: 1, x3: 1, y3: 1, magnitude: 0.5 }
    }
  }
];

// --- Parser Tests ---

describe('parseLine', () => {
  it('parses simple rep-only notation (no load)', () => {
    const result = parseLine('10.9.8');
    expect(result).toHaveLength(3);
    expect(result[0].base_reps).toBe(10);
    expect(result[1].base_reps).toBe(9);
    expect(result[2].base_reps).toBe(8);
    // All loads should be 0 since no load specified
    result.forEach(s => expect(s.load).toBe(0));
  });

  it('parses assisted reps: 10(2)+3', () => {
    const result = parseLine('10(2)+3');
    expect(result).toHaveLength(1);
    expect(result[0].base_reps).toBe(8); // 10 - 2 assisted
    expect(result[0].assisted_reps).toBe(2);
    expect(result[0].partial_reps).toBe(3);
    expect(result[0].rpe).toBe(9);
  });

  it('parses RPE notation: 8@9', () => {
    const result = parseLine('8@9');
    expect(result).toHaveLength(1);
    expect(result[0].base_reps).toBe(8);
    expect(result[0].rpe).toBe(9);
  });

  it('parses decimal RPE as separate sets (dot is set separator)', () => {
    // The dot in "7.5" acts as set separator: 8@7 → set 1, 5 → set 2
    const result = parseLine('8@7.5');
    expect(result).toHaveLength(2);
    expect(result[0].base_reps).toBe(8);
    expect(result[0].rpe).toBe(7);
    expect(result[1].base_reps).toBe(5);
  });

  it('parses load..reps format', () => {
    const result = parseLine('90..10.9.8');
    expect(result).toHaveLength(3);
    expect(result[0].load).toBe(90);
    expect(result[0].base_reps).toBe(10);
    expect(result[1].load).toBe(90);
    expect(result[2].load).toBe(90);
  });

  it('parses multi-load format: 90..80..10.9', () => {
    const result = parseLine('90..80..10.9');
    expect(result).toHaveLength(2);
    expect(result[0].load).toBe(90);
    expect(result[0].base_reps).toBe(10);
    expect(result[1].load).toBe(80);
    expect(result[1].base_reps).toBe(9);
  });

  it('calculates effective reps correctly', () => {
    const result = parseLine('10@9');
    expect(result[0].effectiveReps).toBeGreaterThan(0);
    expect(result[0].totalReps).toBeGreaterThan(0);
  });

  it('handles dropset notation with /', () => {
    const result = parseLine('8@9/6@9');
    expect(result.length).toBeGreaterThanOrEqual(2);
    // Both sets in a dropset should exist
    expect(result[0].base_reps).toBe(8);
  });
});

describe('parseRestTime', () => {
  it('parses minutes and seconds', () => {
    expect(parseRestTime("Lat Machine | 2'30\" |")).toBe(150);
  });

  it('parses minutes only', () => {
    expect(parseRestTime("Squat | 3' |")).toBe(180);
  });

  it('returns default 120s when no rest specified', () => {
    expect(parseRestTime("Squat |")).toBe(120);
  });
});

describe('parseTempoFromLine', () => {
  it('parses 4-digit tempo', () => {
    const [c, s, e, l] = parseTempoFromLine("Lat Machine | 2' | 1-0-2-0");
    expect(c).toBe(1);
    expect(s).toBe(0);
    expect(e).toBe(2);
    expect(l).toBe(0);
  });

  it('returns default tempo when not present', () => {
    const [c, s, e, l] = parseTempoFromLine("Lat Machine | 2' |");
    expect(c).toBe(1);
    expect(s).toBe(0);
    expect(e).toBe(2);
    expect(l).toBe(0);
  });
});

describe('calculateSetTuts', () => {
  it('returns correct number of tuts for base reps only', () => {
    const tuts = calculateSetTuts(10, 0, 0, 9.0, 1, 0, 2, 0);
    expect(tuts).toHaveLength(10);
    // First rep (far from failure) should be faster than last rep (close to failure)
    expect(tuts[0]).toBeLessThan(tuts[9]);
  });

  it('includes assisted and partial reps', () => {
    const tuts = calculateSetTuts(8, 2, 2, 9.0, 1, 0, 2, 0);
    expect(tuts).toHaveLength(12); // 8 base + 2 assisted + 2 partial
  });
});

describe('calculateSetFatigue', () => {
  it('returns a positive fatigue value', () => {
    const fat = calculateSetFatigue(10, 0, 0, 9.0, 1, 0, 2, 0, 5.0, 0.5);
    expect(fat).toBeGreaterThan(0);
  });

  it('higher RPE produces more fatigue', () => {
    const fat9 = calculateSetFatigue(10, 0, 0, 9.0, 1, 0, 2, 0, 5.0, 0.5);
    const fat7 = calculateSetFatigue(10, 0, 0, 7.0, 1, 0, 2, 0, 5.0, 0.5);
    expect(fat9).toBeGreaterThan(fat7);
  });
});

describe('matchExercise', () => {
  it('matches exact exercise name', () => {
    const result = matchExercise('Squat', MINI_DB);
    expect(result).not.toBeNull();
    expect(result.name).toBe('Squat');
  });

  it('matches via hard map (fuzzy name)', () => {
    const result = matchExercise('lat machine', MINI_DB);
    expect(result).not.toBeNull();
    expect(result.name).toBe('Lat Machine');
  });

  it('matches via hard map alias', () => {
    const result = matchExercise('lateral raise', MINI_DB);
    expect(result).not.toBeNull();
    expect(result.name).toBe('LR');
  });

  it('returns null for unrecognized exercise', () => {
    const result = matchExercise('zzz_nonexistent_zzz', MINI_DB);
    expect(result).toBeNull();
  });

  it('matches with cleanup of set descriptors', () => {
    const result = matchExercise('Squat 32"', MINI_DB);
    expect(result).not.toBeNull();
    expect(result.name).toBe('Squat');
  });
});

describe('parseLogbook', () => {
  it('parses a complete workout logbook', () => {
    const logbook = `# 1
Squat | 3' | 1-0-2-0
100..10.9.8
Lat Machine | 2' |
80..12@8.10@8.5`;

    const result = parseLogbook(logbook, MINI_DB);
    expect(result).toHaveLength(2);

    const squat = result.find(e => e.exercise_obj.name === 'Squat');
    expect(squat).toBeDefined();
    expect(squat.weeks).toHaveLength(1);
    expect(squat.weeks[0].sets).toHaveLength(3);
    expect(squat.weeks[0].sets[0].base_reps).toBe(10);
    expect(squat.weeks[0].sets[0].load).toBe(100);
    expect(squat.rest_seconds).toBe(180);
    expect(squat.concentric).toBe(1);
    expect(squat.eccentric).toBe(2);

    const lat = result.find(e => e.exercise_obj.name === 'Lat Machine');
    expect(lat).toBeDefined();
    expect(lat.weeks).toHaveLength(1);
  });

  it('handles multiple sessions', () => {
    const logbook = `# 1
Squat | 3' |
100..10
# 2
Squat | 3' |
105..10
Lat Machine | 2' |
80..12`;

    const result = parseLogbook(logbook, MINI_DB);
    expect(result).toHaveLength(3); // 2 Squat entries + 1 Lat Machine
    expect(result[0].session).toBe(1);
    expect(result[2].session).toBe(2);
  });

  it('handles overrides in logbook', () => {
    const logbook = `override: Squat | fatigue=3.0 | load_coeff=0.3
# 1
Squat | 3' |
100..10`;

    const result = parseLogbook(logbook, MINI_DB);
    expect(result).toHaveLength(1);
    expect(result[0].exercise_obj.fatigue).toBe(3.0);
    expect(result[0].exercise_obj.load_coeff).toBe(0.3);
  });
});

describe('calculateMetrics', () => {
  it('calculates volume, tonnage, and fatigue metrics', () => {
    const logbook = `# 1
Squat | 3' |
100..10.9.8`;

    const data = parseLogbook(logbook, MINI_DB);
    const metrics = calculateMetrics(data, null, null, null, null);

    expect(metrics).toHaveLength(1);
    expect(metrics[0].volume).toBeGreaterThan(0);
    expect(metrics[0].tonnage).toBeGreaterThan(0);
    expect(metrics[0].fatigue).toBeGreaterThan(0);
    expect(metrics[0].sets).toBeGreaterThan(0);
  });

  it('filters by session', () => {
    const logbook = `# 1
Squat | 3' |
100..10
# 2
Lat Machine | 2' |
80..12`;

    const data = parseLogbook(logbook, MINI_DB);
    const metrics = calculateMetrics(data, 2, null, null, null);

    expect(metrics).toHaveLength(1);
    expect(metrics[0].name).toBe('Lat Machine');
  });
});

describe('getExercisesWithOverrides', () => {
  it('applies exercise overrides from logbook text', () => {
    const logbook = `override: Squat | fatigue=3.0 | load_coeff=0.3 | load_multiplier=1.5 | load_offset=10 | is_isolation=true | muscles_distr={"Quadriceps":{"x0":0,"y0":1,"x1":0.33,"y1":1,"x2":0.66,"y2":1,"x3":1,"y3":1,"magnitude":1}}
# 1
Squat | 3' |
100..10`;

    const exercises = getExercisesWithOverrides(logbook, MINI_DB);
    const squat = exercises.find(e => e.name === 'Squat');
    expect(squat).toBeDefined();
    expect(squat.fatigue).toBe(3.0);
    expect(squat.load_coeff).toBe(0.3);
    expect(squat.load_multiplier).toBe(1.5);
    expect(squat.load_offset).toBe(10);
    expect(squat.is_isolation).toBe(true);
    expect(squat.muscles_distr.Quadriceps.magnitude).toBe(1);
  });

  it('returns original exercises when no overrides present', () => {
    const exercises = getExercisesWithOverrides('', MINI_DB);
    expect(exercises).toHaveLength(MINI_DB.length);
    expect(exercises[0].fatigue).toBe(MINI_DB[0].fatigue);
  });
});

// --- Solver Tests ---

describe('calculateRest', () => {
  it('returns 1\' for fatigue <= 2', () => {
    expect(calculateRest(1.0)).toBe("1'");
    expect(calculateRest(2.0)).toBe("1'");
  });

  it('returns scaled rest for moderate fatigue', () => {
    const rest = calculateRest(5.0);
    expect(rest).toMatch(/^\d+'/); // Should have minutes format
  });

  it('returns longer rest for high fatigue', () => {
    const rest = calculateRest(9.0);
    const restLow = calculateRest(3.0);
    // Higher fatigue should not give shorter rest
    expect(rest).not.toBe(restLow);
  });
});

describe('WorkoutSolver', () => {
  const defaultConfig = {
    days: 3,
    min_sets: 1, max_sets: 4,
    min_reps: 6, max_reps: 15,
    min_ex: 2, max_ex: 5,
    calibration_steps: 50, // Small for tests
    weights: {
      curve: 0.35, vol: 0.15, ton: 0.1,
      tut: 0.1, distr: 0.2, variety: 0.1, balance: 0.1
    },
    target_ratios: { vol: 0.70, ton: 0.70, tut: 0.70 },
    muscle_targets: {
      Chest: 'inv_sigmoid',
      Back: 'inv_sigmoid',
      Legs: 'inv_sigmoid',
      Shoulders: 'constant',
      Biceps: 'constant',
      Triceps: 'constant',
      Core: 'constant',
      Forearms: 'constant',
      Neck: 'constant'
    },
    volume_dist: {
      macros: {
        Chest: 22, Back: 22, Legs: 22,
        Shoulders: 12, Biceps: 8, Triceps: 8,
        Core: 4, Forearms: 1, Neck: 1
      },
      subs: {
        Chest: { 'Sternal Head': 60, 'Clavicular Head': 40 },
        Back: { 'Latissimus Dorsi': 70, 'Teres Major': 30 },
        Legs: { 'Quadriceps': 40, 'Glutes': 30, 'Hamstrings': 30 },
        Shoulders: { 'Lateral Deltoid': 100 },
        Biceps: { 'Biceps Brachii': 100 },
        Triceps: { 'Long Head': 50, 'Lateral Head': 25, 'Medial Head': 25 },
        Core: { 'Abdominals': 100 },
        Forearms: {},
        Neck: {}
      }
    }
  };

  it('constructs without errors', () => {
    const solver = new WorkoutSolver(defaultConfig, MINI_DB);
    expect(solver).toBeDefined();
    expect(solver.config.days).toBe(3);
    expect(solver.db).toHaveLength(MINI_DB.length);
  });

  it('generates a random state within constraints', () => {
    const solver = new WorkoutSolver(defaultConfig, MINI_DB);
    const state = solver.generateRandomState();

    expect(state.days).toHaveLength(3);
    for (const day of state.days) {
      expect(day.length).toBeGreaterThanOrEqual(defaultConfig.min_ex);
      expect(day.length).toBeLessThanOrEqual(defaultConfig.max_ex);
      for (const ex of day) {
        expect(ex.sets.length).toBeGreaterThanOrEqual(defaultConfig.min_sets);
        expect(ex.sets.length).toBeLessThanOrEqual(defaultConfig.max_sets);
      }
    }
  });

  it('evaluates a workout and returns a numeric cost', () => {
    const solver = new WorkoutSolver(defaultConfig, MINI_DB);
    const state = solver.generateRandomState();
    const cost = solver.evaluateWorkout(state);

    expect(typeof cost).toBe('number');
    expect(cost).toBeGreaterThan(0);
  });

  it('mutates a workout without violating constraints', () => {
    const solver = new WorkoutSolver(defaultConfig, MINI_DB);
    const state = solver.generateRandomState();
    const mutated = solver.mutateWorkout(state);

    expect(mutated.days).toHaveLength(3);
    // Each day should still respect min/max exercise constraints
    for (const day of mutated.days) {
      expect(day.length).toBeGreaterThanOrEqual(defaultConfig.min_ex);
      expect(day.length).toBeLessThanOrEqual(defaultConfig.max_ex);
    }
  });

  it('calibrates without errors', () => {
    const solver = new WorkoutSolver(defaultConfig, MINI_DB);
    solver.calibrate();

    // Should have populated scales for all metrics
    expect(solver.scales.curve).toBeGreaterThan(0);
    expect(solver.scales.vol).toBeGreaterThan(0);
    expect(solver.scales.ton).toBeGreaterThan(0);
    expect(solver.scales.tut).toBeGreaterThan(0);
    expect(solver.scales.distr).toBeGreaterThan(0);
    expect(solver.scales.variety).toBeGreaterThan(0);
    expect(solver.scales.balance).toBeGreaterThan(0);
  });

  it('solves and returns a valid workout (end-to-end SA optimization)', async () => {
    const solver = new WorkoutSolver(defaultConfig, MINI_DB);

    const progressLog = [];
    const { bestState, bestCost } = await solver.solve(
      200,    // small iterations for fast test
      50.0,
      null,
      (progress) => progressLog.push(progress)
    );

    // Should have produced a valid result
    expect(bestState).toBeDefined();
    expect(bestState.days).toHaveLength(3);
    expect(typeof bestCost).toBe('number');
    expect(bestCost).toBeGreaterThan(0);

    // Each day should have exercises with sets
    for (const day of bestState.days) {
      expect(day.length).toBeGreaterThanOrEqual(1); // At least one exercise
      for (const ex of day) {
        expect(ex.sets.length).toBeGreaterThan(0); // At least one set
        expect(ex.exercise.name).toBeTruthy();
      }
    }

    // Progress should have been reported
    expect(progressLog.length).toBeGreaterThan(0);
  }, 30000); // 30s timeout for solver

  it('produces a workout state that is cloneable and evaluable', () => {
    const solver = new WorkoutSolver(defaultConfig, MINI_DB);
    const state = solver.generateRandomState();

    // Deep clone via mutate on a different day (which copies other days)
    const cloned = solver.mutateWorkout(state);

    const originalCost = solver.evaluateWorkout(state);
    // A mutated state should still evaluate to a number
    const clonedCost = solver.evaluateWorkout(cloned);
    expect(typeof clonedCost).toBe('number');
  });
});

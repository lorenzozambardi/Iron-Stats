import { describe, it, expect } from 'vitest';
import { WorkoutSolver } from '../solver';
import defaultExercises from '../defaultExercises.json';

describe('WorkoutSolver with full exercise DB', () => {
  it('constructs with the full default exercises database', () => {
    const solver = new WorkoutSolver({}, defaultExercises);
    expect(solver).toBeDefined();
    expect(solver.db.length).toBeGreaterThan(10);
  });

  it('generates and evaluates a random state with full DB', () => {
    const config = {
      days: 4,
      min_sets: 2, max_sets: 5,
      min_reps: 6, max_reps: 15,
      min_ex: 3, max_ex: 7,
      calibration_steps: 30,
      weights: {
        curve: 0.35, vol: 0.15, ton: 0.1,
        tut: 0.1, distr: 0.2, variety: 0.1, balance: 0.1
      },
      target_ratios: { vol: 0.70, ton: 0.70, tut: 0.70 },
      muscle_targets: {
        Chest: 'inv_sigmoid', Back: 'inv_sigmoid', Legs: 'inv_sigmoid',
        Shoulders: 'constant', Biceps: 'constant', Triceps: 'constant',
        Core: 'constant', Forearms: 'constant', Neck: 'constant'
      },
      volume_dist: {
        macros: {
          Chest: 22, Back: 22, Legs: 22,
          Shoulders: 12, Biceps: 8, Triceps: 8,
          Core: 4, Forearms: 1, Neck: 1
        },
        subs: {}
      }
    };

    // Auto-populate subs with equal distribution
    const MACRO_TO_SUBS = {};
    for (const ex of defaultExercises) {
      for (const m in ex.muscles_distr) {
        const macro = Object.entries({
          'Clavicular Head': 'Chest', 'Sternal Head': 'Chest', 'Costal Head': 'Chest',
          'Pectoralis Minor': 'Chest', 'Pectoralis Major': 'Chest', 'Serratus Anterior': 'Chest',
          'Lower Pectoralis': 'Chest',
          'Latissimus Dorsi': 'Back', 'Latissimus Dorsi Iliac': 'Back',
          'Latissimus Dorsi Lumbar': 'Back', 'Latissimus Dorsi Thoracic': 'Back',
          'Teres Major': 'Back', 'Upper Trapezius': 'Back', 'Mid Trapezius': 'Back',
          'Lower Trapezius': 'Back', 'Rhomboids': 'Back', 'Erectors': 'Back',
          'Erector Spinae': 'Back', 'Upper and Mid Trapezius': 'Back',
          'Lower Trapezius and Rhomboids': 'Back',
          'Anterior Deltoid': 'Shoulders', 'Lateral Deltoid': 'Shoulders',
          'Posterior Deltoid': 'Shoulders', 'Supraspinatus': 'Shoulders',
          'Infraspinatus': 'Shoulders', 'Teres Minor': 'Shoulders',
          'Subscapularis': 'Shoulders', 'Rotator Cuff': 'Shoulders',
          'Quadriceps': 'Legs', 'Rectus Femoris': 'Legs', 'Vastus Lateralis': 'Legs',
          'Vastus Medialis': 'Legs', 'Vastus Intermedius': 'Legs', 'Hamstrings': 'Legs',
          'Biceps Femoris': 'Legs', 'Semitendinosus': 'Legs', 'Semimembranosus': 'Legs',
          'Glutes': 'Legs', 'Gluteus Maximus': 'Legs', 'Gluteus Medius': 'Legs',
          'Gluteus Minimus': 'Legs', 'Adductors': 'Legs', 'Sartorius': 'Legs',
          'Tensor Fasciae Latae': 'Legs', 'Gracilis': 'Legs', 'Pectineus': 'Legs',
          'Iliopsoas': 'Legs', 'Calves': 'Legs', 'Gastrocnemius': 'Legs',
          'Soleus': 'Legs', 'Tibialis Anterior': 'Legs', 'Plantaris': 'Legs',
          'Popliteus': 'Legs',
          'Biceps Brachii': 'Biceps', 'Biceps Brachii Long Head': 'Biceps',
          'Biceps Brachii Short Head': 'Biceps', 'Brachialis': 'Biceps',
          'Brachioradialis': 'Biceps', 'Coracobrachialis': 'Biceps',
          'Long Head': 'Triceps', 'Lateral Head': 'Triceps', 'Medial Head': 'Triceps',
          'Wrist Flexors': 'Forearms', 'Wrist Extensors': 'Forearms',
          'Abdominals': 'Core', 'Rectus Abdominis': 'Core', 'Obliques': 'Core',
          'Transversus Abdominis': 'Core',
          'Neck Flexors': 'Neck', 'Neck Extensors': 'Neck'
        }).find(([k]) => k === m)?.[1];
        if (macro && !MACRO_TO_SUBS[macro]) MACRO_TO_SUBS[macro] = new Set();
        if (macro) MACRO_TO_SUBS[macro].add(m);
      }
    }

    for (const macro in config.volume_dist.subs) {
      if (!config.volume_dist.subs[macro] || Object.keys(config.volume_dist.subs[macro]).length === 0) {
        const subs = [...(MACRO_TO_SUBS[macro] || [])];
        if (subs.length > 0) {
          config.volume_dist.subs[macro] = {};
          const base = Math.floor(100 / subs.length);
          let remainder = 100 - base * subs.length;
          subs.forEach(s => {
            config.volume_dist.subs[macro][s] = base + (remainder > 0 ? 1 : 0);
            if (remainder > 0) remainder--;
          });
        }
      }
    }

    // Add missing macro entries so all macros from muscle_targets are covered
    for (const macro of Object.keys(config.muscle_targets)) {
      if (!config.volume_dist.subs[macro]) {
        config.volume_dist.subs[macro] = {};
      }
    }

    const solver = new WorkoutSolver(config, defaultExercises);
    const state = solver.generateRandomState();
    const cost = solver.evaluateWorkout(state);

    expect(typeof cost).toBe('number');
    expect(cost).toBeGreaterThan(0);
  });

  it('completes a short SA optimization with full DB', async () => {
    const config = {
      days: 3,
      min_sets: 1, max_sets: 4,
      min_reps: 6, max_reps: 15,
      min_ex: 2, max_ex: 5,
      calibration_steps: 30,
      weights: {
        curve: 0.35, vol: 0.15, ton: 0.1,
        tut: 0.1, distr: 0.2, variety: 0.1, balance: 0.1
      },
      target_ratios: { vol: 0.70, ton: 0.70, tut: 0.70 },
      muscle_targets: {
        Chest: 'inv_sigmoid', Back: 'inv_sigmoid', Legs: 'inv_sigmoid',
        Shoulders: 'constant', Biceps: 'constant', Triceps: 'constant',
        Core: 'constant', Forearms: 'constant', Neck: 'constant'
      },
      volume_dist: {
        macros: {
          Chest: 22, Back: 22, Legs: 22,
          Shoulders: 12, Biceps: 8, Triceps: 8,
          Core: 4, Forearms: 1, Neck: 1
        },
        subs: {
          Chest: { 'Sternal Head': 100 },
          Back: { 'Latissimus Dorsi': 100 },
          Legs: { 'Quadriceps': 50, 'Glutes': 50 },
          Shoulders: { 'Lateral Deltoid': 100 },
          Biceps: { 'Biceps Brachii': 100 },
          Triceps: { 'Long Head': 100 },
          Core: { 'Abdominals': 100 },
          Forearms: {},
          Neck: {}
        }
      }
    };

    const solver = new WorkoutSolver(config, defaultExercises);

    const { bestState, bestCost } = await solver.solve(150, 50.0);

    expect(bestState).toBeDefined();
    expect(bestState.days).toHaveLength(3);
    expect(typeof bestCost).toBe('number');

    // Verify each day has valid content
    let totalExercises = 0;
    for (const day of bestState.days) {
      expect(day.length).toBeGreaterThanOrEqual(1);
      for (const ex of day) {
        expect(ex.sets.length).toBeGreaterThan(0);
        expect(ex.exercise.name).toBeTruthy();
        totalExercises++;
      }
    }
    expect(totalExercises).toBeGreaterThan(0);

    // Output the generated workout for evidence
    console.log('\n=== Generated Workout (JS Solver with Full DB) ===');
    console.log(`Final cost: ${bestCost.toFixed(2)}`);
    for (let d = 0; d < bestState.days.length; d++) {
      console.log(`\n--- Day ${d + 1} ---`);
      for (const ex of bestState.days[d]) {
        const setsStr = ex.sets.map(s => `${s.base_reps}${s.partial_reps > 0 ? '+' + s.partial_reps : ''}@${s.rpe}`).join(', ');
        console.log(`  ${ex.exercise.name}: ${setsStr}`);
      }
    }
  }, 30000);
});

import { describe, it, expect } from 'vitest';
import {
  parseRestTime,
  parseTempoFromLine,
  parseLine,
  getExercisesWithOverrides,
  matchExercise,
  calculateSetTuts,
  calculateSetFatigue,
  parseLogbook,
  calculateMetrics
} from '../parser.js';

const mockExercises = [
  {
    name: 'Flat Barbell Bench',
    fatigue: 8.0,
    load_coeff: 0.4,
    load_multiplier: 1.0,
    load_offset: 0.0,
    is_isolation: false,
    muscles_distr: {
      'Sternal Head': 0.5,
      'Clavicular Head': 0.1,
      'Anterior Deltoid': 0.15,
      'Lateral Head': 0.1,
      'Long Head': 0.05,
      'Medial Head': 0.1
    }
  },
  {
    name: 'Lat Machine',
    fatigue: 7.5,
    load_coeff: 0.35,
    load_multiplier: 1.0,
    load_offset: 0.0,
    is_isolation: false,
    muscles_distr: {
      'Latissimus Dorsi': 0.6,
      'Teres Major': 0.2,
      'Biceps Brachii': 0.2
    }
  },
  {
    name: 'Leg Press 45',
    fatigue: 7.0,
    load_coeff: 0.5,
    load_multiplier: 0.7,
    load_offset: 0.0,
    is_isolation: false,
    muscles_distr: {
      'Quadriceps': 0.8,
      'Glutes': 0.2
    }
  }
];

describe('parser.js', () => {
  describe('parseRestTime', () => {
    it('parses minutes and seconds', () => {
      expect(parseRestTime("Lat Machine | 2'30\" |")).toBe(150);
      expect(parseRestTime("Lat Machine | 3' |")).toBe(180);
      expect(parseRestTime("Lat Machine | 45\" |")).toBe(45);
    });

    it('falls back to 120s when not specified', () => {
      expect(parseRestTime("Lat Machine |")).toBe(120);
      expect(parseRestTime("Lat Machine")).toBe(120);
    });
  });

  describe('parseTempoFromLine', () => {
    it('parses standard tempo strings', () => {
      expect(parseTempoFromLine("Lat Machine | 2' | 2-0-4-0")).toEqual([2.0, 0.0, 4.0, 0.0]);
      expect(parseTempoFromLine("Lat Machine | 2' | 1-1-2-1")).toEqual([1.0, 1.0, 2.0, 1.0]);
    });

    it('falls back to default tempo [1, 0, 2, 0] when missing', () => {
      expect(parseTempoFromLine("Lat Machine | 2'")).toEqual([1.0, 0.0, 2.0, 0.0]);
    });
  });

  describe('parseLine', () => {
    it('parses standard load and reps notation', () => {
      const sets = parseLine('100..8.8.7@9');
      expect(sets.length).toBe(3);
      expect(sets[0]).toMatchObject({ load: 100, base_reps: 8, rpe: 9.0 });
      expect(sets[1]).toMatchObject({ load: 100, base_reps: 8, rpe: 9.0 });
      expect(sets[2]).toMatchObject({ load: 100, base_reps: 7, rpe: 9.0 });
    });

    it('parses assisted and partial reps notation', () => {
      const sets = parseLine('90..10(2)+3@9.5');
      expect(sets.length).toBe(1);
      expect(sets[0].load).toBe(90);
      expect(sets[0].base_reps).toBe(8);
      expect(sets[0].assisted_reps).toBe(2);
      expect(sets[0].partial_reps).toBe(3);
      expect(sets[0].rpe).toBe(9.5);
    });

    it('parses dropset lines with slash / notation', () => {
      const sets = parseLine('80/60/40..10/8/6');
      expect(sets.length).toBe(3);
      expect(sets[0].load).toBe(80);
      expect(sets[0].base_reps).toBe(10);
      expect(sets[1].load).toBe(60);
      expect(sets[1].base_reps).toBe(8);
      expect(sets[2].load).toBe(40);
      expect(sets[2].base_reps).toBe(6);
      expect(sets[0].dropsetId).toBeDefined();
      expect(sets[0].dropsetId).toBe(sets[1].dropsetId);
      expect(sets[1].dropsetId).toBe(sets[2].dropsetId);
    });
  });

  describe('getExercisesWithOverrides', () => {
    it('applies override from markdown program text', () => {
      const overrideText = `override: Flat Barbell Bench | fatigue=9.0 | load_multiplier=1.2 | is_isolation=true
# 1
Flat Barbell Bench | 3' |
100..8.8`;

      const exercises = getExercisesWithOverrides(overrideText, mockExercises);
      const bench = exercises.find(e => e.name === 'Flat Barbell Bench');
      expect(bench.fatigue).toBe(9.0);
      expect(bench.load_multiplier).toBe(1.2);
      expect(bench.is_isolation).toBe(true);
    });
  });

  describe('matchExercise', () => {
    it('matches exact and hard map aliases', () => {
      expect(matchExercise('panca piana', mockExercises)?.name).toBe('Flat Barbell Bench');
      expect(matchExercise('lat machine', mockExercises)?.name).toBe('Lat Machine');
      expect(matchExercise('pressa 45', mockExercises)?.name).toBe('Leg Press 45');
    });
  });

  describe('calculateSetTuts & calculateSetFatigue', () => {
    it('computes positive TUT and fatigue for a set', () => {
      const tuts = calculateSetTuts(8, 2, 3, 9.0, 1.0, 0.0, 2.0, 0.0);
      expect(tuts.length).toBe(13);
      const totalTut = tuts.reduce((a, b) => a + b, 0);
      expect(totalTut).toBeGreaterThan(0);

      const fatigue = calculateSetFatigue(8, 2, 3, 9.0, 1.0, 0.0, 2.0, 0.0, 8.0, 0.4, tuts);
      expect(fatigue).toBeGreaterThan(0);
    });
  });

  describe('parseLogbook & calculateMetrics', () => {
    it('parses full workout and calculates correct volume and tonnage', () => {
      const log = `# 1
Flat Barbell Bench | 3' | 1-0-2-0
100..10.8

# 2
Lat Machine | 2' |
80..10.10`;

      const workoutData = parseLogbook(log, mockExercises);
      expect(workoutData.length).toBe(2);
      expect(workoutData[0].exercise_obj.name).toBe('Flat Barbell Bench');
      expect(workoutData[0].session).toBe(1);
      expect(workoutData[0].weeks[0].sets.length).toBe(2);

      const metrics = calculateMetrics(workoutData, null, null, null, null);
      expect(metrics.length).toBe(2);
      
      const benchMetric = metrics.find(m => m.name === 'Flat Barbell Bench');
      expect(benchMetric.volume).toBe(18);
      expect(benchMetric.tonnage).toBe(1800);
      expect(benchMetric.fatigue).toBeGreaterThan(0);
    });
  });
});

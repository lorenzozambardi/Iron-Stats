import { describe, it, expect } from 'vitest';
import {
  isDatesHeader,
  parseDateTokenToISO,
  isDateLine,
  parseRestTime,
  parseTempoFromLine,
  parseLine,
  getExercisesWithOverrides,
  matchExercise,
  calculateSetTuts,
  calculateSetFatigue,
  parseLogbook,
  calculateMetrics,
  calculateMetricsByWeek
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
      expect(parseRestTime("Lat Machine | 2' 30\" |")).toBe(150);
      expect(parseRestTime("Lat Machine | 3' |")).toBe(180);
      expect(parseRestTime("Lat Machine | 45\" |")).toBe(45);
      expect(parseRestTime("Lat Machine | | 90\"")).toBe(90);
    });

    it('falls back to 120s when not specified or when rest-like text is in notes column', () => {
      expect(parseRestTime("Lat Machine |")).toBe(120);
      expect(parseRestTime("Lat Machine")).toBe(120);
      expect(parseRestTime("Lat Machine | notes | 30\"")).toBe(120);
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
      const sets = parseLine('100.. 8, 8, 7@9');
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

    it('parses dropset lines with slash / notation and sequential multi-load .. notation', () => {
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

      // Multi-load sequential notation (35.. 30.. 5, 7)
      const seqSets = parseLine('35.. 30.. 5, 7');
      expect(seqSets.map(s => ({ load: s.load, reps: s.base_reps }))).toEqual([
        { load: 35, reps: 5 },
        { load: 30, reps: 7 }
      ]);

      // Slash in load prefix without slash in reps should not tag a single set as a dropset
      const singleSet = parseLine('80/60.. 10');
      expect(singleSet).toHaveLength(1);
      expect(singleSet[0].dropsetId).toBeUndefined();
    });
  });

  describe('getExercisesWithOverrides', () => {
    it('applies override from markdown program text', () => {
      const overrideText = `override: Flat Barbell Bench | fatigue=9.0 | load_multiplier=1.2 | is_isolation=true
# 1
Flat Barbell Bench | 3' |
100.. 8, 8`;

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
100.. 10, 8

# 2
Lat Machine | 2' |
80.. 10, 10`;

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

      // Verify precalculated fatigue on sets
      const benchSet0 = workoutData[0].weeks[0].sets[0];
      expect(benchSet0.fatigue).toBeDefined();
      expect(benchSet0.fatigue).toBeGreaterThan(0);
      expect(benchSet0.totalTut).toBeGreaterThan(0);
      expect(benchSet0.effectiveTut).toBeGreaterThan(0);
    });

    it('precalculates fatigue on sets and carries it forward when load is updated across weeks', () => {
      const log = `# 1
Flat Barbell Bench | 3' | 1-0-2-0
100.. 10, 8
105..`;

      const workoutData = parseLogbook(log, mockExercises);
      expect(workoutData[0].weeks.length).toBe(2);
      const week1Sets = workoutData[0].weeks[0].sets;
      const week2Sets = workoutData[0].weeks[1].sets;

      expect(week1Sets[0].fatigue).toBeDefined();
      expect(week2Sets[0].fatigue).toBeDefined();
      expect(week2Sets[0].fatigue).toBe(week1Sets[0].fatigue);
      expect(week2Sets[1].fatigue).toBe(week1Sets[1].fatigue);

      const metricsW1 = calculateMetrics(workoutData, null, 1, null, null);
      const metricsW2 = calculateMetrics(workoutData, null, 2, null, null);
      expect(metricsW1[0].fatigue).toBe(metricsW2[0].fatigue);
    });

    it('calculateMetricsByWeek matches calculateMetrics totals across weeks and filters', () => {
      const log = `# 1
Flat Barbell Bench | 3' | 1-0-2-0
100.. 10@8, 8@9
105.. 10@9, 8@9.5

# 2
Lat Machine | 2' | 1-0-2-0
60.. 12@8
65.. 12@8.5`;

      const workoutData = parseLogbook(log, mockExercises);
      expect(workoutData).toHaveLength(2);
      const weeks = [1, 2];
      const byWeek = calculateMetricsByWeek(workoutData, null, weeks, null, null);

      for (const w of weeks) {
        const expected = calculateMetrics(workoutData, null, w, null, null);
        expect(expected).toHaveLength(2);
        const bucket = byWeek.get(w);
        expect(bucket).toBeDefined();
        expect(bucket.volume).toBeCloseTo(expected.reduce((s, d) => s + d.volume, 0), 6);
        expect(bucket.tonnage).toBeCloseTo(expected.reduce((s, d) => s + d.tonnage, 0), 6);
        expect(bucket.effectiveTonnage).toBeCloseTo(expected.reduce((s, d) => s + d.effectiveTonnage, 0), 6);
        expect(bucket.fatigue).toBeCloseTo(expected.reduce((s, d) => s + d.fatigue, 0), 6);
        expect(bucket.sets).toBeCloseTo(expected.reduce((s, d) => s + d.sets, 0), 6);
      }

      const chestOnly = calculateMetricsByWeek(workoutData, 1, weeks, 'Chest', null);
      const expectedChestW1 = calculateMetrics(workoutData, 1, 1, 'Chest', null);
      expect(chestOnly.get(1).tonnage).toBeCloseTo(expectedChestW1.reduce((s, d) => s + d.tonnage, 0), 6);
      expect(chestOnly.get(1).tonnage).toBeLessThan(byWeek.get(1).tonnage);
    });

    it('handles negative dropset loads, multi-dropset carry-forward, inline old prefix, and unmatched pipe headers', () => {
      const log = `# 1
Lat Machine | 2' |
-20/-30.. 10/8, 9/7
-15/-25..
10, old 8, 6

Zzqwx Unrecognized Pipe Header | 2' |
999.. 15, 15`;

      const workoutData = parseLogbook(log, mockExercises);
      expect(workoutData).toHaveLength(1);
      // Unmatched pipe header resets currentExercise so 999.. 15, 15 does not corrupt Lat Machine
      expect(workoutData[0].weeks).toHaveLength(3);
      expect(workoutData[0].weeks[0].sets.map(s => s.load)).toEqual([-20, -30, -20, -30]);
      expect(workoutData[0].weeks[1].sets.map(s => s.load)).toEqual([-15, -25, -15, -25]);
      expect(workoutData[0].weeks[2].sets.map(s => s.base_reps)).toEqual([10, 8, 6]);
    });

    it('parses per-session Dates: blocks and attaches ISO dates to matching microcycles', () => {
      expect(isDatesHeader('Dates:')).toBe(true);
      expect(isDatesHeader('Dates:  ')).toBe(true);
      expect(isDatesHeader('dates:')).toBe(true);
      expect(isDatesHeader('Dates: 01-01-2026')).toBe(false);

      expect(parseDateTokenToISO('19-11-2026')).toBe('2026-11-19');
      expect(parseDateTokenToISO('05/01/2026')).toBe('2026-01-05');
      expect(parseDateTokenToISO('2026-01-05')).toBe('2026-01-05');
      expect(parseDateTokenToISO('-')).toBeNull();
      expect(parseDateTokenToISO('32-01-2026')).toBeNull();
      expect(parseDateTokenToISO('29-02-2025')).toBeNull();

      expect(isDateLine('19-11-2026')).toBe(true);
      expect(isDateLine('-')).toBe(true);
      expect(isDateLine('90.. 10, 8')).toBe(false);

      const log = `# 1
Dates: 
05-01-2026
12-01-2026
19-01-2026

Lat Machine | 3' | 1-0-2-0
90.. 10, 8
90.. 11, 9
95.. 10, 8

# 2
Dates:
08-01-2026
-
22-01-2026

Flat Barbell Bench | 3' | 1-0-2-0
100.. 8, 7
100.. 9, 7
102.5.. 8, 7`;

      const workoutData = parseLogbook(log, mockExercises);
      expect(workoutData.length).toBe(2);
      expect(workoutData[0].session).toBe(1);
      expect(workoutData[0].weeks.map((w) => w.date)).toEqual(['2026-01-05', '2026-01-12', '2026-01-19']);
      expect(workoutData[1].session).toBe(2);
      expect(workoutData[1].weeks.map((w) => w.date)).toEqual(['2026-01-08', null, '2026-01-22']);
    });

    it('strips -- inline comments from set log lines without dropping sets', () => {
      const log = `# 1
Lat Machine | 2' | 1-0-2-0
90.. 10, 8+2 -- sporche
95.. 9 -- (sporche)
10, 8 -- no load prefix`;

      const workoutData = parseLogbook(log, mockExercises);
      expect(workoutData).toHaveLength(1);
      expect(workoutData[0].weeks).toHaveLength(3);
      expect(workoutData[0].weeks[0].sets.map((s) => s.base_reps)).toEqual([10, 8]);
      expect(workoutData[0].weeks[1].sets.map((s) => s.base_reps)).toEqual([9]);
      expect(workoutData[0].weeks[2].sets.map((s) => s.base_reps)).toEqual([10, 8]);
    });
  });
});

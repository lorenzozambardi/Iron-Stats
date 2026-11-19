/**
 * Builds the normalized, queryable analytics dataset from Iron Stats logbooks and athlete profile.
 * Uses parser.js (calculateMetrics, MUSCLES) and profileUtils.js as the single source of truth.
 */

import { calculateMetrics, MUSCLES } from '../../parser.js';
import {
  CIRCUMFERENCE_FIELDS,
  DEFAULT_PROFILE,
  calcAge,
  calcBMI,
  calcChestToWaist,
  calcFFMI,
  calcFatMass,
  calcKatchMcArdleBMR,
  calcLeanMass,
  calcTDEEFromSteps,
  calcVTaper,
  calcWaistToHeight,
  getLimbAverage,
} from '../../profileUtils.js';
import { computeSFR, computeSetE1RM } from '../stats/strength.js';
import { mean } from '../stats/descriptive.js';
import { mergeProgramMeta } from './programMeta.js';
import { alignProgramWeeks, buildBodySeries } from './timeline.js';
import { computeDatasetFingerprint } from './fingerprint.js';

export const METRIC_CATALOG = {
  sets: { key: 'sets', label: 'Sets', unit: 'sets', description: 'Distribution-weighted working sets' },
  volume: { key: 'volume', label: 'Total Reps', unit: 'reps', description: 'Total repetitions (base + 0.5*assisted + 0.33*partial)' },
  effectiveReps: { key: 'effectiveReps', label: 'Effective Reps', unit: 'reps', description: 'HTMU-recruiting reps (RPE > 4 threshold + assisted/partial discounts)', rpeDependent: true },
  tonnage: { key: 'tonnage', label: 'Tonnage', unit: 'kg', description: 'Actual load * total reps' },
  effectiveTonnage: { key: 'effectiveTonnage', label: 'Effective Tonnage', unit: 'kg', description: 'Actual load * effective reps', rpeDependent: true },
  weightedTonnage: { key: 'weightedTonnage', label: 'Weighted Tonnage', unit: 'kg', description: 'Tonnage scaled by exercise load_coeff' },
  effectiveWeightedTonnage: { key: 'effectiveWeightedTonnage', label: 'Eff. Weighted Tonnage', unit: 'kg', description: 'Effective tonnage scaled by exercise load_coeff', rpeDependent: true },
  fatigue: { key: 'fatigue', label: 'CNS Fatigue', unit: 'au', description: 'Exponential RPE- and TUT-weighted central fatigue index', rpeDependent: true },
  totalTut: { key: 'totalTut', label: 'Total TUT', unit: 's', description: 'Total dynamic time under tension (seconds)', rpeDependent: true },
  effectiveTut: { key: 'effectiveTut', label: 'Effective TUT', unit: 's', description: 'Time under tension on HTMU-recruiting reps (seconds)', rpeDependent: true },
  e1rm: { key: 'e1rm', label: 'Estimated 1RM', unit: 'kg', description: 'Best set estimated 1RM (Epley, RPE-adjusted when logged)' },
  topSetLoad: { key: 'topSetLoad', label: 'Top Set Load', unit: 'kg', description: 'Heaviest actual load lifted in the week' },
  sfr: { key: 'sfr', label: 'Stimulus-to-Fatigue Ratio', unit: 'reps/au', description: 'Effective reps divided by CNS fatigue', rpeDependent: true },
  intensityTechShare: { key: 'intensityTechShare', label: 'Intensity Technique Share', unit: 'ratio', description: 'Fraction of sets using partials, assisted reps, or dropsets' },
  meanRestSec: { key: 'meanRestSec', label: 'Mean Rest', unit: 's', description: 'Average prescribed rest interval between sets (seconds)' },
  weight: { key: 'weight', label: 'Body Weight', unit: 'kg', description: 'Logged body weight (kg)' },
  bodyFat: { key: 'bodyFat', label: 'Body Fat %', unit: '%', description: 'Logged body fat percentage' },
  leanMass: { key: 'leanMass', label: 'Lean Body Mass', unit: 'kg', description: 'Derived lean body mass = weight * (1 - BF/100)' },
  fatMass: { key: 'fatMass', label: 'Fat Mass', unit: 'kg', description: 'Derived fat mass = weight - LBM' },
  bwProxy: { key: 'bwProxy', label: 'In-Logbook BW Proxy', unit: 'kg', description: 'Body weight recorded as load on bodyweight (bw) exercises' },
};

function getMagnitude(val) {
  if (typeof val === 'number') return val;
  if (val && typeof val.magnitude === 'number') return val.magnitude;
  return 0;
}

function isBodyweightExercise(wEx) {
  const raw = (wEx?.raw_name || '').toLowerCase();
  const parts = raw.split('|');
  const note = parts.length >= 3 ? parts.slice(2).join(' ') : '';
  return /\bbw\b|bodyweight|corpo libero/.test(note) || /\bbw\b/.test(raw);
}

function isProfileStillDefault(current) {
  if (!current) return true;
  const def = DEFAULT_PROFILE.current;
  const keys = ['birthDate', 'weight', 'height', 'bodyFat', 'waist', 'shoulders', 'chest', 'armLeft', 'thighLeft'];
  return keys.every((k) => String(current[k]) === String(def[k]));
}

function buildSnapshot(profile) {
  const current = profile?.current || DEFAULT_PROFILE.current;
  const isDefaultUnverified = isProfileStillDefault(current);
  const bmi = calcBMI(current.weight, current.height);
  const lbm = calcLeanMass(current.weight, current.bodyFat);
  const fatMass = calcFatMass(current.weight, current.bodyFat);
  const ffmi = calcFFMI(current.weight, current.height, current.bodyFat);
  const bmr = calcKatchMcArdleBMR(lbm);
  const tdee = calcTDEEFromSteps({ bmr, weightKg: current.weight, avgSteps: current.avgSteps });
  const circumferences = {};
  for (const field of CIRCUMFERENCE_FIELDS) {
    circumferences[field.key] = getLimbAverage(current, field);
  }
  return {
    age: calcAge(current.birthDate),
    sex: current.sex || null,
    weight: Number(current.weight) || null,
    height: Number(current.height) || null,
    bodyFat: Number(current.bodyFat) || null,
    avgSteps: Number(current.avgSteps) || null,
    bmi: bmi || null,
    leanMass: lbm || null,
    fatMass: fatMass || null,
    ffmi: ffmi.ffmi || null,
    normalizedFfmi: ffmi.normalizedFfmi || null,
    ffmiCategory: ffmi.category,
    bmr: bmr || null,
    tdee: tdee.tdee || null,
    waistToHeight: calcWaistToHeight(current.waist, current.height) || null,
    vTaper: calcVTaper(current.shoulders, current.waist) || null,
    chestToWaist: calcChestToWaist(current.chest, current.waist) || null,
    circumferences,
    isDefaultUnverified,
  };
}

export function buildAnalyticsDataset({
  loadedPrograms = [],
  profile = DEFAULT_PROFILE,
  savedProgramMeta = {},
} = {}) {
  const allIds = loadedPrograms.map((p) => p.id);
  const mergedMeta = mergeProgramMeta(allIds, savedProgramMeta);
  const metaById = new Map(mergedMeta.map((m) => [m.id, m]));
  const loadedById = new Map(loadedPrograms.map((p) => [p.id, p]));

  const programs = [];
  const sets = [];
  const exerciseWeeks = [];
  const muscleWeeks = [];
  const rawProgramWeeks = [];
  const bwProxy = [];

  const exerciseSet = new Set();
  const macroSet = new Set();
  const subMuscleSet = new Set();
  const sessionSet = new Set();

  let totalSetsCount = 0;
  let rpeLoggedCount = 0;
  let totalParseWarnings = 0;

  for (const meta of mergedMeta) {
    const loaded = loadedById.get(meta.id);
    if (!loaded) continue;

    const workoutData = loaded.workoutData || [];
    const parseWarnings = loaded.parseWarnings || [];
    totalParseWarnings += parseWarnings.length;

    const sessions = new Set();
    const weeksInProg = new Set();
    let progSets = 0;
    let progRpeLogged = 0;
    let progTonnage = 0;
    let progFatigue = 0;

    for (const wEx of workoutData) {
      sessions.add(wEx.session);
      for (const wData of wEx.weeks) {
        weeksInProg.add(wData.week_num);
        for (const s of wData.sets) {
          progSets += 1;
          if (s.rpeLogged) progRpeLogged += 1;
        }
      }
    }

    const progMetricsAll = calculateMetrics(workoutData, null, null, null, null);
    for (const row of progMetricsAll) {
      progTonnage += row.tonnage;
      progFatigue += row.fatigue;
    }

    const progRecord = {
      id: meta.id,
      label: meta.label,
      order: meta.order,
      startDate: meta.startDate,
      excluded: meta.excluded,
      variantOf: meta.variantOf,
      isFailedBlock: meta.isFailedBlock,
      nSessions: sessions.size,
      nWeeks: weeksInProg.size,
      nExercises: workoutData.length,
      nSets: progSets,
      totalTonnage: progTonnage,
      totalFatigue: progFatigue,
      rpeLoggedFraction: progSets > 0 ? progRpeLogged / progSets : 0,
      parseWarningsCount: parseWarnings.length,
    };
    programs.push(progRecord);

    if (meta.excluded) continue;

    const weekBucket = new Map();
    const muscleWeekBucket = new Map();
    const bwWeekBucket = new Map();

    for (const wEx of workoutData) {
      const ex = wEx.exercise_obj;
      if (!ex) continue;
      const exName = ex.name;
      exerciseSet.add(exName);
      sessionSet.add(wEx.session);
      const isBw = isBodyweightExercise(wEx);

      // Reuse calculateMetrics directly per WorkoutExercise as single source of truth
      const exWeekMetrics = new Map(
        calculateMetrics([wEx], null, null, null, null).map((m) => [m.week, m])
      );

      const musclesEntries = Object.entries(ex.muscles_distr || {})
        .map(([sub, val]) => ({ sub, macro: MUSCLES[sub] || 'Other', mag: getMagnitude(val) }))
        .filter((e) => e.mag > 0);
      for (const me of musclesEntries) {
        subMuscleSet.add(me.sub);
        macroSet.add(me.macro);
      }

      for (const wData of wEx.weeks) {
        const week = wData.week_num;
        let bestE1rm = null;
        let bestRawE1rm = null;
        let highRepWarning = false;
        let topSetLoad = 0;
        let repsAtTopLoad = 0;
        let techSets = 0;
        let wRpeLogged = 0;

        for (let setIdx = 0; setIdx < wData.sets.length; setIdx++) {
          const s = wData.sets[setIdx];
          const actualLoad = s.load * ex.load_multiplier + ex.load_offset;
          const rpeLogged = Boolean(s.rpeLogged);
          const hasTech = Boolean(s.partial_reps > 0 || s.assisted_reps > 0 || s.dropsetId);
          if (hasTech) techSets += 1;
          if (rpeLogged) {
            wRpeLogged += 1;
            rpeLoggedCount += 1;
          }
          totalSetsCount += 1;

          const e1 = computeSetE1RM(actualLoad, s.base_reps, s.rpe, rpeLogged);
          if (e1.valid && (bestE1rm === null || e1.e1rm > bestE1rm)) {
            bestE1rm = e1.e1rm;
            bestRawE1rm = e1.rawE1rm;
            highRepWarning = e1.highRepWarning;
          }
          if (actualLoad > topSetLoad || (actualLoad === topSetLoad && s.base_reps > repsAtTopLoad)) {
            topSetLoad = actualLoad;
            repsAtTopLoad = s.base_reps;
          }

          if (isBw && s.load >= 35 && s.load <= 200) {
            if (!bwWeekBucket.has(week)) bwWeekBucket.set(week, []);
            bwWeekBucket.get(week).push(s.load);
          }

          sets.push({
            programId: meta.id,
            programOrder: meta.order,
            session: wEx.session,
            week,
            exerciseName: exName,
            isIsolation: Boolean(ex.is_isolation),
            isBodyweight: isBw,
            setIndex: setIdx + 1,
            load: s.load,
            actualLoad,
            baseReps: s.base_reps,
            assistedReps: s.assisted_reps,
            partialReps: s.partial_reps,
            rpe: s.rpe,
            rpeLogged,
            dropsetId: s.dropsetId || null,
            hasIntensityTech: hasTech,
            restSec: wEx.rest_seconds,
            tempo: `${wEx.concentric}-${wEx.shortening_pause}-${wEx.eccentric}-${wEx.lengthening_pause}`,
            totalTut: s.totalTut,
            effectiveTut: s.effectiveTut,
            fatigue: s.fatigue,
            effectiveReps: s.effectiveReps,
            totalReps: s.totalReps,
            e1rm: e1.e1rm,
            rawLine: wData.raw_line,
          });
        }

        const agg = exWeekMetrics.get(week);
        if (!agg) continue;

        const nSetsWeek = wData.sets.length;
        const exWeekRow = {
          programId: meta.id,
          programOrder: meta.order,
          session: wEx.session,
          week,
          exerciseName: exName,
          isIsolation: Boolean(ex.is_isolation),
          isBodyweight: isBw,
          sets: agg.sets,
          volume: agg.volume,
          effectiveReps: agg.effectiveReps,
          tonnage: agg.tonnage,
          effectiveTonnage: agg.effectiveTonnage,
          weightedTonnage: agg.weightedTonnage,
          effectiveWeightedTonnage: agg.effectiveWeightedTonnage,
          fatigue: agg.fatigue,
          totalTut: agg.totalTut,
          effectiveTut: agg.effectiveTut,
          e1rm: bestE1rm,
          rawE1rm: bestRawE1rm,
          highRepWarning,
          topSetLoad,
          repsAtTopLoad,
          sfr: computeSFR(agg.effectiveReps, agg.fatigue),
          intensityTechShare: nSetsWeek > 0 ? techSets / nSetsWeek : 0,
          meanRestSec: wEx.rest_seconds,
          rpeLoggedFraction: nSetsWeek > 0 ? wRpeLogged / nSetsWeek : 0,
        };
        exerciseWeeks.push(exWeekRow);

        // Accumulate program-week totals
        if (!weekBucket.has(week)) {
          weekBucket.set(week, {
            programId: meta.id,
            programOrder: meta.order,
            week,
            sets: 0,
            volume: 0,
            effectiveReps: 0,
            tonnage: 0,
            effectiveTonnage: 0,
            weightedTonnage: 0,
            effectiveWeightedTonnage: 0,
            fatigue: 0,
            totalTut: 0,
            effectiveTut: 0,
            techSets: 0,
            restValues: [],
          });
        }
        const pw = weekBucket.get(week);
        pw.sets += agg.sets;
        pw.volume += agg.volume;
        pw.effectiveReps += agg.effectiveReps;
        pw.tonnage += agg.tonnage;
        pw.effectiveTonnage += agg.effectiveTonnage;
        pw.weightedTonnage += agg.weightedTonnage;
        pw.effectiveWeightedTonnage += agg.effectiveWeightedTonnage;
        pw.fatigue += agg.fatigue;
        pw.totalTut += agg.totalTut;
        pw.effectiveTut += agg.effectiveTut;
        pw.techSets += techSets;
        pw.restValues.push(wEx.rest_seconds);

        // Accumulate muscle-week breakdown
        for (const me of musclesEntries) {
          const mwKey = `${week}|${me.sub}`;
          if (!muscleWeekBucket.has(mwKey)) {
            muscleWeekBucket.set(mwKey, {
              programId: meta.id,
              programOrder: meta.order,
              week,
              subMuscle: me.sub,
              macro: me.macro,
              sets: 0,
              volume: 0,
              effectiveReps: 0,
              tonnage: 0,
              effectiveTonnage: 0,
              weightedTonnage: 0,
              effectiveWeightedTonnage: 0,
              fatigue: 0,
              totalTut: 0,
              effectiveTut: 0,
            });
          }
          const mw = muscleWeekBucket.get(mwKey);
          mw.sets += agg.sets * me.mag;
          mw.volume += agg.volume * me.mag;
          mw.effectiveReps += agg.effectiveReps * me.mag;
          mw.tonnage += agg.tonnage * me.mag;
          mw.effectiveTonnage += agg.effectiveTonnage * me.mag;
          mw.weightedTonnage += agg.weightedTonnage * me.mag;
          mw.effectiveWeightedTonnage += agg.effectiveWeightedTonnage * me.mag;
          mw.fatigue += agg.fatigue * me.mag;
          mw.totalTut += agg.totalTut * me.mag;
          mw.effectiveTut += agg.effectiveTut * me.mag;
        }
      }
    }

    const sortedWeeks = Array.from(weekBucket.keys()).sort((a, b) => a - b);
    for (const wk of sortedWeeks) {
      const pw = weekBucket.get(wk);
      rawProgramWeeks.push({
        programId: pw.programId,
        programOrder: pw.programOrder,
        week: pw.week,
        sets: pw.sets,
        volume: pw.volume,
        effectiveReps: pw.effectiveReps,
        tonnage: pw.tonnage,
        effectiveTonnage: pw.effectiveTonnage,
        weightedTonnage: pw.weightedTonnage,
        effectiveWeightedTonnage: pw.effectiveWeightedTonnage,
        fatigue: pw.fatigue,
        totalTut: pw.totalTut,
        effectiveTut: pw.effectiveTut,
        sfr: computeSFR(pw.effectiveReps, pw.fatigue),
        intensityTechShare: pw.sets > 0 ? pw.techSets / pw.sets : 0,
        meanRestSec: pw.restValues.length > 0 ? mean(pw.restValues) : null,
        bwProxy: bwWeekBucket.has(wk) ? mean(bwWeekBucket.get(wk)) : null,
      });
      if (bwWeekBucket.has(wk)) {
        bwProxy.push({
          programId: meta.id,
          programOrder: meta.order,
          week: wk,
          weightKg: mean(bwWeekBucket.get(wk)),
          nSamples: bwWeekBucket.get(wk).length,
        });
      }
    }

    for (const mw of muscleWeekBucket.values()) {
      muscleWeeks.push({ ...mw, sfr: computeSFR(mw.effectiveReps, mw.fatigue) });
    }
  }

  const { daily: body, weekly: bodyWeekly } = buildBodySeries(profile?.logs || []);
  const { programWeeks, overlappingBodyWeeks, datedWeeks } = alignProgramWeeks(rawProgramWeeks, metaById, bodyWeekly);

  // Propagate timelineIndex to exerciseWeeks, muscleWeeks, and bwProxy
  const timelineLookup = new Map(programWeeks.map((pw) => [`${pw.programId}|${pw.week}`, pw]));
  for (const row of exerciseWeeks) {
    const pw = timelineLookup.get(`${row.programId}|${row.week}`);
    row.timelineIndex = pw ? pw.timelineIndex : null;
    row.approxDate = pw ? pw.approxDate : null;
    row.isoWeek = pw ? pw.isoWeek : null;
  }
  for (const row of muscleWeeks) {
    const pw = timelineLookup.get(`${row.programId}|${row.week}`);
    row.timelineIndex = pw ? pw.timelineIndex : null;
    row.approxDate = pw ? pw.approxDate : null;
    row.isoWeek = pw ? pw.isoWeek : null;
  }
  for (const row of bwProxy) {
    const pw = timelineLookup.get(`${row.programId}|${row.week}`);
    row.timelineIndex = pw ? pw.timelineIndex : null;
  }

  const snapshot = buildSnapshot(profile);
  const includedPrograms = programs.filter((p) => !p.excluded);
  const totalWeeks = programWeeks.length;
  const rpeLoggedFraction = totalSetsCount > 0 ? rpeLoggedCount / totalSetsCount : 0;
  let rpeQuality = 'assumed';
  if (rpeLoggedFraction >= 0.8) rpeQuality = 'logged';
  else if (rpeLoggedFraction >= 0.25) rpeQuality = 'partial';

  const qualityFlags = [];
  if (rpeQuality === 'assumed') {
    qualityFlags.push({
      code: 'rpe_assumed_default',
      severity: 'warning',
      message: `Only ${Math.round(rpeLoggedFraction * 100)}% of sets have an explicit @RPE logged; missing RPE defaults to 9.0. Effective reps, effective TUT, and CNS fatigue are model-assumed.`,
    });
  } else if (rpeQuality === 'partial') {
    qualityFlags.push({
      code: 'rpe_partial',
      severity: 'info',
      message: `${Math.round(rpeLoggedFraction * 100)}% of sets have explicit @RPE; remaining sets default to 9.0.`,
    });
  }
  if (datedWeeks === 0) {
    qualityFlags.push({
      code: 'no_program_dates',
      severity: 'info',
      message: 'No program start dates configured. Training weeks are indexed sequentially; body-composition logs cannot be date-joined.',
    });
  } else {
    qualityFlags.push({
      code: 'approximate_dates',
      severity: 'info',
      message: `Training dates are approximate (derived from program start dates + 7 days per week) for ${datedWeeks}/${totalWeeks} weeks.`,
    });
  }
  if (snapshot.isDefaultUnverified) {
    qualityFlags.push({
      code: 'profile_defaults_unverified',
      severity: 'info',
      message: 'Athlete profile still matches factory defaults; snapshot anthropometrics are excluded from findings.',
    });
  }
  if (totalParseWarnings > 0) {
    qualityFlags.push({
      code: 'parse_warnings',
      severity: 'warning',
      message: `${totalParseWarnings} logbook header line(s) did not match any exercise in the database.`,
    });
  }

  const nWeightLogs = body.filter((b) => b.weight !== null).length;
  const nBodyFatLogs = body.filter((b) => b.bodyFat !== null).length;

  const canAnalyzeProgression = totalWeeks >= 4 && sets.length >= 12;
  const canCrossProgram = includedPrograms.filter((p) => p.nWeeks >= 2).length >= 2;
  const canJoinBodyComp = overlappingBodyWeeks >= 6;
  const canAnalyzeBodyTrend = nWeightLogs >= 4 || nBodyFatLogs >= 4;
  const hasBwProxy = bwProxy.length >= 4;

  const blockingReasons = [];
  if (!canAnalyzeProgression && !canAnalyzeBodyTrend) {
    blockingReasons.push('Need at least 4 training weeks (with 12+ sets) or 4 dated body-composition logs.');
  }

  const capabilities = {
    ready: canAnalyzeProgression || canAnalyzeBodyTrend,
    canAnalyzeProgression,
    canCrossProgram,
    canJoinBodyComp,
    canAnalyzeBodyTrend,
    hasBwProxy,
    rpeQuality,
    rpeLoggedFraction,
    dateAlignment: datedWeeks > 0 ? 'approximate' : 'none',
    overlappingBodyWeeks,
    blockingReasons,
    minN: {
      trend: 4,
      correlation: 8,
      lagged: 10,
      crossProgram: 2,
      bodyJoin: 6,
    },
  };

  const fingerprint = computeDatasetFingerprint({
    programs,
    programWeeks,
    setsCount: sets.length,
    body,
    snapshot,
    programMeta: mergedMeta,
  });

  const summary = {
    fingerprint,
    nProgramsTotal: programs.length,
    nProgramsIncluded: includedPrograms.length,
    nWeeks: totalWeeks,
    nSets: sets.length,
    nExercises: exerciseSet.size,
    nWeightLogs,
    nBodyFatLogs,
    overlappingBodyWeeks,
    rpeQuality,
    rpeLoggedFraction,
    programWeeksByProgram: includedPrograms.map((p) => ({ id: p.id, nWeeks: p.nWeeks })),
  };

  return {
    programs,
    programMeta: mergedMeta,
    sets,
    exerciseWeeks,
    muscleWeeks,
    programWeeks,
    body,
    bodyWeekly,
    bwProxy,
    snapshot,
    entities: {
      programs: includedPrograms.map((p) => p.id),
      allPrograms: programs.map((p) => p.id),
      exercises: Array.from(exerciseSet).sort(),
      macros: Array.from(macroSet).sort(),
      subMuscles: Array.from(subMuscleSet).sort(),
      sessions: Array.from(sessionSet).sort((a, b) => a - b),
    },
    metricCatalog: METRIC_CATALOG,
    capabilities,
    qualityFlags,
    summary,
    fingerprint,
  };
}

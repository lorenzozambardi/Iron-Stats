/**
 * Builds the normalized, queryable analytics dataset from Iron Stats logbooks and athlete profile.
 * Domain model: each .md logbook file is a macrocycle; each log line under an exercise is a microcycle.
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
import { alignMacrocycleMicrocycles, buildBodySeries } from './timeline.js';
import { computeDatasetFingerprint } from './fingerprint.js';

export const METRIC_CATALOG = {
  sets: { key: 'sets', label: 'Sets', unit: 'sets', description: 'Distribution-weighted working sets per microcycle' },
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
  topSetLoad: { key: 'topSetLoad', label: 'Top Set Load', unit: 'kg', description: 'Heaviest actual load lifted in the microcycle' },
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

  const macrocycles = [];
  const sets = [];
  const exerciseMicrocycles = [];
  const muscleMicrocycles = [];
  const rawMicrocycles = [];
  const bwProxy = [];

  const exerciseSet = new Set();
  const macroMuscleSet = new Set();
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
    const mcsInMacro = new Set();
    let macroSets = 0;
    let macroRpeLogged = 0;
    let macroTonnage = 0;
    let macroFatigue = 0;

    for (const wEx of workoutData) {
      sessions.add(wEx.session);
      for (const mcData of wEx.weeks) {
        mcsInMacro.add(mcData.week_num);
        for (const s of mcData.sets) {
          macroSets += 1;
          if (s.rpeLogged) macroRpeLogged += 1;
        }
      }
    }

    const macroMetricsAll = calculateMetrics(workoutData, null, null, null, null);
    for (const row of macroMetricsAll) {
      macroTonnage += row.tonnage;
      macroFatigue += row.fatigue;
    }

    const macroRecord = {
      id: meta.id,
      label: meta.label,
      order: meta.order,
      startDate: meta.startDate,
      microcycleDays: meta.microcycleDays,
      excluded: meta.excluded,
      variantOf: meta.variantOf,
      isFailedBlock: meta.isFailedBlock,
      nSessions: sessions.size,
      nMicrocycles: mcsInMacro.size,
      nExercises: workoutData.length,
      nSets: macroSets,
      totalTonnage: macroTonnage,
      totalFatigue: macroFatigue,
      rpeLoggedFraction: macroSets > 0 ? macroRpeLogged / macroSets : 0,
      parseWarningsCount: parseWarnings.length,
    };
    macrocycles.push(macroRecord);

    if (meta.excluded) continue;

    const mcBucket = new Map();
    const muscleMcBucket = new Map();
    const bwMcBucket = new Map();

    for (const wEx of workoutData) {
      const ex = wEx.exercise_obj;
      if (!ex) continue;
      const exName = ex.name;
      exerciseSet.add(exName);
      sessionSet.add(wEx.session);
      const isBw = isBodyweightExercise(wEx);

      // Reuse calculateMetrics directly per WorkoutExercise as single source of truth
      const exMcMetrics = new Map(
        calculateMetrics([wEx], null, null, null, null).map((m) => [m.week, m])
      );

      const musclesEntries = Object.entries(ex.muscles_distr || {})
        .map(([sub, val]) => ({ sub, macro: MUSCLES[sub] || 'Other', mag: getMagnitude(val) }))
        .filter((e) => e.mag > 0);
      for (const me of musclesEntries) {
        subMuscleSet.add(me.sub);
        macroMuscleSet.add(me.macro);
      }

      for (const mcData of wEx.weeks) {
        const mcNum = mcData.week_num;
        let bestE1rm = null;
        let bestRawE1rm = null;
        let highRepWarning = false;
        let topSetLoad = 0;
        let repsAtTopLoad = 0;
        let techSets = 0;
        let mcRpeLogged = 0;

        for (let setIdx = 0; setIdx < mcData.sets.length; setIdx++) {
          const s = mcData.sets[setIdx];
          const actualLoad = s.load * ex.load_multiplier + ex.load_offset;
          const rpeLogged = Boolean(s.rpeLogged);
          const hasTech = Boolean(s.partial_reps > 0 || s.assisted_reps > 0 || s.dropsetId);
          if (hasTech) techSets += 1;
          if (rpeLogged) {
            mcRpeLogged += 1;
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
            if (!bwMcBucket.has(mcNum)) bwMcBucket.set(mcNum, []);
            bwMcBucket.get(mcNum).push(s.load);
          }

          sets.push({
            macrocycleId: meta.id,
            macrocycleOrder: meta.order,
            session: wEx.session,
            microcycle: mcNum,
            date: mcData.date || null,
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
            rawLine: mcData.raw_line,
          });
        }

        const agg = exMcMetrics.get(mcNum);
        if (!agg) continue;

        const nSetsMc = mcData.sets.length;
        exerciseMicrocycles.push({
          macrocycleId: meta.id,
          macrocycleOrder: meta.order,
          session: wEx.session,
          microcycle: mcNum,
          date: mcData.date || null,
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
          intensityTechShare: nSetsMc > 0 ? techSets / nSetsMc : 0,
          meanRestSec: wEx.rest_seconds,
          rpeLoggedFraction: nSetsMc > 0 ? mcRpeLogged / nSetsMc : 0,
        });

        if (!mcBucket.has(mcNum)) {
          mcBucket.set(mcNum, {
            macrocycleId: meta.id,
            macrocycleOrder: meta.order,
            microcycle: mcNum,
            sessionDates: new Set(),
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
        const mcb = mcBucket.get(mcNum);
        if (mcData.date) mcb.sessionDates.add(mcData.date);
        mcb.sets += agg.sets;
        mcb.volume += agg.volume;
        mcb.effectiveReps += agg.effectiveReps;
        mcb.tonnage += agg.tonnage;
        mcb.effectiveTonnage += agg.effectiveTonnage;
        mcb.weightedTonnage += agg.weightedTonnage;
        mcb.effectiveWeightedTonnage += agg.effectiveWeightedTonnage;
        mcb.fatigue += agg.fatigue;
        mcb.totalTut += agg.totalTut;
        mcb.effectiveTut += agg.effectiveTut;
        mcb.techSets += techSets;
        mcb.restValues.push(wEx.rest_seconds);

        for (const me of musclesEntries) {
          const mmKey = `${mcNum}|${me.sub}`;
          if (!muscleMcBucket.has(mmKey)) {
            muscleMcBucket.set(mmKey, {
              macrocycleId: meta.id,
              macrocycleOrder: meta.order,
              microcycle: mcNum,
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
          const mm = muscleMcBucket.get(mmKey);
          mm.sets += agg.sets * me.mag;
          mm.volume += agg.volume * me.mag;
          mm.effectiveReps += agg.effectiveReps * me.mag;
          mm.tonnage += agg.tonnage * me.mag;
          mm.effectiveTonnage += agg.effectiveTonnage * me.mag;
          mm.weightedTonnage += agg.weightedTonnage * me.mag;
          mm.effectiveWeightedTonnage += agg.effectiveWeightedTonnage * me.mag;
          mm.fatigue += agg.fatigue * me.mag;
          mm.totalTut += agg.totalTut * me.mag;
          mm.effectiveTut += agg.effectiveTut * me.mag;
        }
      }
    }

    const sortedMcs = Array.from(mcBucket.keys()).sort((a, b) => a - b);
    for (const mcNum of sortedMcs) {
      const mcb = mcBucket.get(mcNum);
      rawMicrocycles.push({
        macrocycleId: mcb.macrocycleId,
        macrocycleOrder: mcb.macrocycleOrder,
        microcycle: mcb.microcycle,
        sessionDates: Array.from(mcb.sessionDates).sort(),
        sets: mcb.sets,
        volume: mcb.volume,
        effectiveReps: mcb.effectiveReps,
        tonnage: mcb.tonnage,
        effectiveTonnage: mcb.effectiveTonnage,
        weightedTonnage: mcb.weightedTonnage,
        effectiveWeightedTonnage: mcb.effectiveWeightedTonnage,
        fatigue: mcb.fatigue,
        totalTut: mcb.totalTut,
        effectiveTut: mcb.effectiveTut,
        sfr: computeSFR(mcb.effectiveReps, mcb.fatigue),
        intensityTechShare: mcb.sets > 0 ? mcb.techSets / mcb.sets : 0,
        meanRestSec: mcb.restValues.length > 0 ? mean(mcb.restValues) : null,
        bwProxy: bwMcBucket.has(mcNum) ? mean(bwMcBucket.get(mcNum)) : null,
      });
      if (bwMcBucket.has(mcNum)) {
        bwProxy.push({
          macrocycleId: meta.id,
          macrocycleOrder: meta.order,
          microcycle: mcNum,
          weightKg: mean(bwMcBucket.get(mcNum)),
          nSamples: bwMcBucket.get(mcNum).length,
        });
      }
    }

    for (const mm of muscleMcBucket.values()) {
      muscleMicrocycles.push({ ...mm, sfr: computeSFR(mm.effectiveReps, mm.fatigue) });
    }
  }

  const { daily: body, periodBuckets: bodyPeriods } = buildBodySeries(profile?.logs || []);
  const { microcycles, overlappingBodyMicrocycles, datedMicrocycles, exactDatedMicrocycles } = alignMacrocycleMicrocycles(
    rawMicrocycles,
    metaById,
    body
  );

  const overallDateAlignment =
    exactDatedMicrocycles > 0 && exactDatedMicrocycles === datedMicrocycles
      ? 'exact'
      : datedMicrocycles > 0
        ? 'approximate'
        : 'none';

  const timelineLookup = new Map(microcycles.map((mc) => [`${mc.macrocycleId}|${mc.microcycle}`, mc]));
  for (const row of exerciseMicrocycles) {
    const mc = timelineLookup.get(`${row.macrocycleId}|${row.microcycle}`);
    row.timelineIndex = mc ? mc.timelineIndex : null;
    row.windowStart = mc ? mc.windowStart : null;
    row.windowEnd = mc ? mc.windowEnd : null;
  }
  for (const row of muscleMicrocycles) {
    const mc = timelineLookup.get(`${row.macrocycleId}|${row.microcycle}`);
    row.timelineIndex = mc ? mc.timelineIndex : null;
    row.windowStart = mc ? mc.windowStart : null;
    row.windowEnd = mc ? mc.windowEnd : null;
  }
  for (const row of bwProxy) {
    const mc = timelineLookup.get(`${row.macrocycleId}|${row.microcycle}`);
    row.timelineIndex = mc ? mc.timelineIndex : null;
  }

  const snapshot = buildSnapshot(profile);
  const includedMacrocycles = macrocycles.filter((p) => !p.excluded);
  const totalMicrocycles = microcycles.length;
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
  if (datedMicrocycles === 0) {
    qualityFlags.push({
      code: 'no_macrocycle_dates',
      severity: 'info',
      message: 'No Dates: blocks or macrocycle start dates found. Training microcycles are indexed sequentially; dated body-composition logs cannot be date-joined.',
    });
  } else if (overallDateAlignment === 'exact') {
    qualityFlags.push({
      code: 'exact_session_dates',
      severity: 'info',
      message: `Exact session dates parsed from logbook Dates: blocks for ${exactDatedMicrocycles}/${totalMicrocycles} microcycles.`,
    });
  } else {
    qualityFlags.push({
      code: 'approximate_dates',
      severity: 'info',
      message: `Microcycle calendar windows are approximate (from macrocycle start date + microcycle length) for ${datedMicrocycles - exactDatedMicrocycles} microcycle(s) and exact for ${exactDatedMicrocycles}.`,
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

  const canAnalyzeProgression = totalMicrocycles >= 4 && sets.length >= 12;
  const canCrossMacrocycle = includedMacrocycles.filter((p) => p.nMicrocycles >= 2).length >= 2;
  const canJoinBodyComp = overlappingBodyMicrocycles >= 6;
  const canAnalyzeBodyTrend = nWeightLogs >= 4 || nBodyFatLogs >= 4;
  const hasBwProxy = bwProxy.length >= 4;

  const blockingReasons = [];
  if (!canAnalyzeProgression && !canAnalyzeBodyTrend) {
    blockingReasons.push('Need at least 4 training microcycles (with 12+ sets) or 4 dated body-composition logs.');
  }

  const capabilities = {
    ready: canAnalyzeProgression || canAnalyzeBodyTrend,
    canAnalyzeProgression,
    canCrossMacrocycle,
    canJoinBodyComp,
    canAnalyzeBodyTrend,
    hasBwProxy,
    rpeQuality,
    rpeLoggedFraction,
    dateAlignment: overallDateAlignment,
    exactDatedMicrocycles,
    overlappingBodyMicrocycles,
    blockingReasons,
    minN: {
      trend: 4,
      correlation: 8,
      lagged: 10,
      crossMacrocycle: 2,
      bodyJoin: 6,
    },
  };

  const fingerprint = computeDatasetFingerprint({
    macrocycles,
    microcycles,
    setsCount: sets.length,
    body,
    snapshot,
    programMeta: mergedMeta,
  });

  const summary = {
    fingerprint,
    nMacrocyclesTotal: macrocycles.length,
    nMacrocyclesIncluded: includedMacrocycles.length,
    nMicrocycles: totalMicrocycles,
    nSets: sets.length,
    nExercises: exerciseSet.size,
    nWeightLogs,
    nBodyFatLogs,
    overlappingBodyMicrocycles,
    rpeQuality,
    rpeLoggedFraction,
    microcyclesByMacrocycle: includedMacrocycles.map((p) => ({ id: p.id, nMicrocycles: p.nMicrocycles })),
  };

  return {
    macrocycles,
    programMeta: mergedMeta,
    sets,
    exerciseMicrocycles,
    muscleMicrocycles,
    microcycles,
    body,
    bodyPeriods,
    bwProxy,
    snapshot,
    entities: {
      macrocycles: includedMacrocycles.map((p) => p.id),
      allMacrocycles: macrocycles.map((p) => p.id),
      exercises: Array.from(exerciseSet).sort(),
      macros: Array.from(macroMuscleSet).sort(),
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

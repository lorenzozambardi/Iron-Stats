/**
 * Tool Registry: 17 bounded, typed, deterministic local analysis tools.
 * Domain model: each .md file is a macrocycle; each log line is a microcycle.
 */

import { mean, median, robustZScores, summaryStats } from '../stats/descriptive.js';
import { olsRegression, theilSenSlope } from '../stats/trend.js';
import { partialCorrelation, pearsonCorrelation, spearmanCorrelation } from '../stats/correlation.js';
import { lag1Autocorrelation, linearDetrend } from '../stats/timeseries.js';
import { detectPlateaus, detectRegimeShift } from '../stats/changepoint.js';
import { benjaminiHochberg } from '../stats/multiplicity.js';
import { cliffsDelta, hedgesG } from '../stats/effectSize.js';
import { evaluateLedgerExpression } from './calculator.js';
import { downsampleArray, formatToolResponse, roundNum } from './formatResult.js';
import { alignTwoSeries, resolveSeriesSpec } from './seriesResolver.js';
import { REFERENCE_NOTES, REFERENCE_TOPICS } from './referenceNotes.js';
import { SUBMIT_REPORT_TOOL_SCHEMA } from '../grounding/reportSchema.js';
import { METRIC_CATALOG } from '../dataset/buildAnalyticsDataset.js';

const SERIES_SPEC_SCHEMA = {
  type: 'object',
  required: ['metric'],
  properties: {
    metric: { type: 'string', enum: Object.keys(METRIC_CATALOG) },
    scope: {
      type: 'object',
      properties: {
        macrocycle: { type: 'string' },
        session: { type: 'integer' },
        exercise: { type: 'string' },
        macro: { type: 'string' },
        sub: { type: 'string' },
      },
    },
    grain: { type: 'string', enum: ['microcycle', 'macrocycle'] },
    aggregate: { type: 'string', enum: ['sum', 'mean', 'max', 'min'] },
  },
};

function makeUnavailable(toolName, args, reason, ledger) {
  const entry = ledger.record({
    toolName,
    args,
    data: { status: 'unavailable', reason },
    summaryLine: `${toolName}: unavailable (${reason})`,
    n: 0,
  });
  return {
    evidenceId: entry.id,
    data: { evidenceId: entry.id, status: 'unavailable', reason },
  };
}

function getOverviewHandler(dataset, args, ledger) {
  const exCounts = new Map();
  for (const row of dataset.exerciseMicrocycles) {
    exCounts.set(row.exerciseName, (exCounts.get(row.exerciseName) || 0) + 1);
  }
  const topExercises = Array.from(exCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([name, microcycles]) => ({ name, microcycles }));

  const data = {
    status: 'ok',
    inventory: {
      macrocycles: dataset.macrocycles.map((p) => ({
        id: p.id,
        order: p.order,
        excluded: p.excluded,
        startDate: p.startDate,
        microcycleDays: p.microcycleDays,
        variantOf: p.variantOf,
        isFailedBlock: p.isFailedBlock,
        nSessions: p.nSessions,
        nMicrocycles: p.nMicrocycles,
        nSets: p.nSets,
        rpeLoggedFraction: roundNum(p.rpeLoggedFraction, 2),
      })),
      totalMicrocycles: dataset.summary.nMicrocycles,
      totalSets: dataset.summary.nSets,
      uniqueExercises: dataset.summary.nExercises,
      nWeightLogs: dataset.summary.nWeightLogs,
      nBodyFatLogs: dataset.summary.nBodyFatLogs,
      bodySpan: dataset.body.length > 0 ? { from: dataset.body[0].date, to: dataset.body[dataset.body.length - 1].date } : null,
      bwProxyMicrocycles: dataset.bwProxy.length,
    },
    capabilities: dataset.capabilities,
    qualityFlags: dataset.qualityFlags,
    topExercises,
    macrosAvailable: dataset.entities.macros,
    snapshot: dataset.snapshot.isDefaultUnverified
      ? { status: 'default_unverified_excluded' }
      : {
          age: dataset.snapshot.age,
          sex: dataset.snapshot.sex,
          weight: dataset.snapshot.weight,
          height: dataset.snapshot.height,
          bodyFat: dataset.snapshot.bodyFat,
          ffmi: roundNum(dataset.snapshot.normalizedFfmi, 1),
          vTaper: roundNum(dataset.snapshot.vTaper, 2),
          waistToHeight: roundNum(dataset.snapshot.waistToHeight, 2),
          avgSteps: dataset.snapshot.avgSteps,
          note: 'Circumferences and snapshot metrics are cross-sectional only (no historical trend).',
        },
    metricsAvailable: Object.keys(METRIC_CATALOG),
  };

  const entry = ledger.record({
    toolName: 'get_dataset_overview',
    args,
    data,
    summaryLine: `Overview: ${dataset.summary.nMacrocyclesIncluded} macrocycles, ${dataset.summary.nMicrocycles} microcycles, ${dataset.summary.nSets} sets, RPE=${dataset.capabilities.rpeQuality}`,
    n: dataset.summary.nMicrocycles,
    qualityFlags: dataset.qualityFlags.map((f) => f.code),
  });
  return { evidenceId: entry.id, data: { evidenceId: entry.id, ...data } };
}

function listEntitiesHandler(dataset, args, ledger) {
  const kind = args?.kind;
  let items;
  if (kind === 'exercises') {
    const counts = new Map();
    for (const em of dataset.exerciseMicrocycles) counts.set(em.exerciseName, (counts.get(em.exerciseName) || 0) + 1);
    items = dataset.entities.exercises.map((name) => ({ name, microcycles: counts.get(name) || 0 })).sort((a, b) => b.microcycles - a.microcycles);
  } else if (kind === 'macros') {
    items = dataset.entities.macros.map((name) => ({ name }));
  } else if (kind === 'muscles') {
    items = dataset.entities.subMuscles.map((name) => ({ name }));
  } else if (kind === 'macrocycles' || kind === 'programs') {
    items = dataset.macrocycles.map((p) => ({
      id: p.id,
      order: p.order,
      microcycles: p.nMicrocycles,
      microcycleDays: p.microcycleDays,
      excluded: p.excluded,
      isFailedBlock: p.isFailedBlock,
    }));
  } else if (kind === 'sessions') {
    items = dataset.entities.sessions.map((s) => ({ session: s }));
  } else {
    return { error: `Invalid kind "${kind}".`, validValues: ['exercises', 'muscles', 'macros', 'macrocycles', 'sessions'] };
  }

  const data = { status: 'ok', kind, count: items.length, items: items.slice(0, 60) };
  const entry = ledger.record({
    toolName: 'list_entities',
    args,
    data,
    summaryLine: `Listed ${items.length} ${kind}`,
    n: items.length,
  });
  return { evidenceId: entry.id, data: { evidenceId: entry.id, ...data } };
}

function getMetricSeriesHandler(dataset, args, ledger) {
  const res = resolveSeriesSpec(dataset, args);
  if (!res.ok) {
    if (res.unavailable) return makeUnavailable('get_metric_series', args, res.error, ledger);
    return { error: res.error, validValues: res.validValues };
  }
  const ys = res.series.map((p) => p.y);
  const xs = res.series.map((p) => p.x);
  const n = ys.length;
  if (n === 0) return makeUnavailable('get_metric_series', args, 'No matching observations found for this scope.', ledger);

  const stats = summaryStats(ys);
  const ts = n >= 4 ? theilSenSlope(xs, ys, { seed: 42, nBoot: 300 }) : { slope: null, intercept: null, ciLower: null, ciUpper: null };
  const ds = downsampleArray(res.series, 32);

  const data = {
    status: 'ok',
    metric: res.metric,
    unit: res.unit,
    grain: args?.grain === 'macrocycle' ? 'macrocycle' : 'microcycle',
    n,
    summary: stats,
    slope: ts.slope,
    intercept: ts.intercept,
    ciLower: ts.ciLower,
    ciUpper: ts.ciUpper,
    firstVal: ys[0],
    lastVal: ys[n - 1],
    delta: ys[n - 1] - ys[0],
    deltaPct: Math.abs(ys[0]) > 1e-9 ? ((ys[n - 1] - ys[0]) / Math.abs(ys[0])) * 100 : null,
    series: ds.items,
    downsampled: ds.downsampled,
    qualityFlags: res.rpeDependent && dataset.capabilities.rpeQuality === 'assumed' ? ['rpe_assumed_default'] : [],
  };

  const entry = ledger.record({
    toolName: 'get_metric_series',
    args,
    data,
    summaryLine: `Series ${res.metric} (n=${n}): mean=${roundNum(stats.mean, 2)}, slope=${roundNum(ts.slope, 3)}/mc`,
    n,
    rpeDependent: res.rpeDependent,
    dateAligned: res.dateAligned,
    qualityFlags: data.qualityFlags,
  });
  return { evidenceId: entry.id, data: { evidenceId: entry.id, ...data } };
}

function getExerciseProgressionHandler(dataset, args, ledger) {
  const exercise = args?.exercise;
  const measure = args?.measure || 'e1rm';
  const macroId = args?.macrocycle || args?.program || null;
  if (!exercise || !dataset.entities.exercises.includes(exercise)) {
    return { error: `Unknown exercise "${exercise}".`, validValues: dataset.entities.exercises.slice(0, 30) };
  }
  const measureMap = { e1rm: 'e1rm', topSet: 'topSetLoad', repsAtLoad: 'repsAtTopLoad', volumeLoad: 'tonnage' };
  const field = measureMap[measure];
  if (!field) return { error: `Invalid measure "${measure}".`, validValues: Object.keys(measureMap) };

  const rows = dataset.exerciseMicrocycles
    .filter((em) => em.exerciseName === exercise && (!macroId || em.macrocycleId === macroId))
    .filter((em) => Number.isFinite(em[field]))
    .sort((a, b) => a.timelineIndex - b.timelineIndex);

  if (rows.length < 3) {
    return makeUnavailable('get_exercise_progression', args, `Only ${rows.length} microcycle exposures for "${exercise}" (need >= 3).`, ledger);
  }

  const series = rows.map((r, idx) => ({
    x: idx + 1,
    timelineIndex: r.timelineIndex,
    label: `${r.macrocycleId} MC${r.microcycle}`,
    date: r.date || r.windowStart || null,
    y: r[field],
    macrocycleId: r.macrocycleId,
    microcycle: r.microcycle,
    topSetLoad: r.topSetLoad,
    repsAtTopLoad: r.repsAtTopLoad,
    sets: r.sets,
    sfr: r.sfr,
  }));

  const xs = series.map((p) => p.x);
  const ys = series.map((p) => p.y);
  const ts = theilSenSlope(xs, ys, { seed: 42, nBoot: 300 });
  const plateaus = detectPlateaus(xs, ys, { minLength: 3 });

  let best = -Infinity;
  const prs = [];
  for (const p of series) {
    if (p.y > best) {
      best = p.y;
      prs.push({ label: p.label, value: p.y });
    }
  }

  const highRepCount = rows.filter((r) => r.highRepWarning).length;
  const isBw = rows.some((r) => r.isBodyweight);
  const qFlags = [];
  if (highRepCount > rows.length * 0.3 && measure === 'e1rm') qFlags.push('high_rep_e1rm_warning');
  if (isBw) qFlags.push('bodyweight_load_proxy');

  const data = {
    status: 'ok',
    exercise,
    measure,
    n: series.length,
    firstVal: ys[0],
    lastVal: ys[ys.length - 1],
    bestVal: best,
    delta: ys[ys.length - 1] - ys[0],
    deltaPct: Math.abs(ys[0]) > 1e-9 ? ((ys[ys.length - 1] - ys[0]) / Math.abs(ys[0])) * 100 : null,
    slope: ts.slope,
    slopeUnit: 'per_microcycle',
    ciLower: ts.ciLower,
    ciUpper: ts.ciUpper,
    nPRs: prs.length,
    latestPR: prs[prs.length - 1] || null,
    plateaus,
    hasActivePlateau: plateaus.length > 0 && plateaus[plateaus.length - 1].endIdx === series.length - 1,
    meanSfr: mean(rows.map((r) => r.sfr).filter(Number.isFinite)),
    qualityFlags: qFlags,
    series: downsampleArray(series, 32).items,
  };

  const entry = ledger.record({
    toolName: 'get_exercise_progression',
    args,
    data,
    summaryLine: `${exercise} (${measure}, n=${series.length}): ${roundNum(ys[0], 1)}->${roundNum(ys[ys.length - 1], 1)}, slope=${roundNum(ts.slope, 2)}/mc [${roundNum(ts.ciLower, 2)}, ${roundNum(ts.ciUpper, 2)}], plateaus=${plateaus.length}`,
    n: series.length,
    qualityFlags: qFlags,
  });
  return { evidenceId: entry.id, data: { evidenceId: entry.id, ...data } };
}

function getMuscleDistributionHandler(dataset, args, ledger) {
  const metric = args?.metric || 'sets';
  const level = args?.level || 'macro';
  const macroId = args?.macrocycle || args?.program || null;
  const validMetrics = ['sets', 'volume', 'effectiveReps', 'tonnage', 'effectiveTonnage', 'fatigue', 'totalTut', 'effectiveTut'];
  if (!validMetrics.includes(metric)) return { error: `Invalid metric "${metric}".`, validValues: validMetrics };

  const rows = dataset.muscleMicrocycles.filter((mm) => !macroId || mm.macrocycleId === macroId);
  if (rows.length === 0) return makeUnavailable('get_muscle_distribution', args, 'No muscle data in selected scope.', ledger);

  const mcKeys = new Set(rows.map((r) => `${r.macrocycleId}|${r.microcycle}`));
  const nMicrocycles = Math.max(1, mcKeys.size);
  const totals = new Map();
  for (const r of rows) {
    const key = level === 'sub' ? r.subMuscle : r.macro;
    totals.set(key, (totals.get(key) || 0) + (Number(r[metric]) || 0));
  }
  const grandTotal = Array.from(totals.values()).reduce((s, v) => s + v, 0);
  const perMcValues = Array.from(totals.values()).map((v) => v / nMicrocycles);
  const medPerMc = median(perMcValues);

  const distribution = Array.from(totals.entries())
    .map(([name, total]) => {
      const perMicrocycle = total / nMicrocycles;
      return {
        name,
        total,
        perMicrocycle,
        sharePct: grandTotal > 0 ? (total / grandTotal) * 100 : 0,
        deviationFromMedianPct: medPerMc > 1e-6 ? ((perMicrocycle - medPerMc) / medPerMc) * 100 : 0,
      };
    })
    .sort((a, b) => b.total - a.total);

  const byMacro = new Map();
  for (const r of rows) byMacro.set(r.macro, (byMacro.get(r.macro) || 0) + (Number(r[metric]) || 0));
  const push = (byMacro.get('Chest') || 0) + (byMacro.get('Shoulders') || 0) + (byMacro.get('Triceps') || 0);
  const pull = (byMacro.get('Back') || 0) + (byMacro.get('Biceps') || 0);
  const upper = push + pull;
  const lower = byMacro.get('Legs') || 0;

  const rpeDep = Boolean(METRIC_CATALOG[metric]?.rpeDependent);
  const data = {
    status: 'ok',
    metric,
    level,
    macrocycle: macroId || 'all',
    nMicrocycles,
    grandTotal,
    ratios: {
      pushToPull: pull > 0 ? push / pull : null,
      chestToBack: (byMacro.get('Back') || 0) > 0 ? (byMacro.get('Chest') || 0) / byMacro.get('Back') : null,
      bicepsToTriceps: (byMacro.get('Triceps') || 0) > 0 ? (byMacro.get('Biceps') || 0) / byMacro.get('Triceps') : null,
      upperToLower: lower > 0 ? upper / lower : null,
    },
    distribution: distribution.slice(0, 24),
    qualityFlags: rpeDep && dataset.capabilities.rpeQuality === 'assumed' ? ['rpe_assumed_default'] : [],
  };

  const entry = ledger.record({
    toolName: 'get_muscle_distribution',
    args,
    data,
    summaryLine: `Muscle ${metric} (${level}, ${nMicrocycles} mcs): top=${distribution[0]?.name} (${roundNum(distribution[0]?.sharePct, 1)}%), push/pull=${roundNum(data.ratios.pushToPull, 2)}`,
    n: nMicrocycles,
    rpeDependent: rpeDep,
    qualityFlags: data.qualityFlags,
  });
  return { evidenceId: entry.id, data: { evidenceId: entry.id, ...data } };
}

function getBodyCompositionHandler(dataset, args, ledger) {
  const measure = args?.measure || 'weight';
  if (!['weight', 'bodyFat', 'leanMass', 'fatMass'].includes(measure)) {
    return { error: `Invalid measure "${measure}".`, validValues: ['weight', 'bodyFat', 'leanMass', 'fatMass'] };
  }
  const periods = dataset.bodyPeriods.filter((w) => Number.isFinite(w[measure]));
  if (periods.length < 2) {
    return makeUnavailable('get_body_composition', args, `Only ${periods.length} calendar-period "${measure}" data point(s) logged (need >= 2).`, ledger);
  }
  const xs = periods.map((_, i) => i + 1);
  const ys = periods.map((w) => w[measure]);
  const ts = periods.length >= 4 ? theilSenSlope(xs, ys, { seed: 42, nBoot: 300 }) : { slope: null, ciLower: null, ciUpper: null };
  const series = periods.map((w, i) => ({
    x: i + 1,
    label: w.startDate,
    date: w.startDate,
    y: w[measure],
  }));

  const data = {
    status: 'ok',
    measure,
    unit: measure === 'bodyFat' ? '%' : 'kg',
    n: series.length,
    firstVal: ys[0],
    lastVal: ys[ys.length - 1],
    delta: ys[ys.length - 1] - ys[0],
    ratePer7Days: ts.slope,
    ciLower: ts.ciLower,
    ciUpper: ts.ciUpper,
    summary: summaryStats(ys),
    series: downsampleArray(series, 32).items,
  };

  const entry = ledger.record({
    toolName: 'get_body_composition',
    args,
    data,
    summaryLine: `Body ${measure} (n=${series.length}): ${roundNum(ys[0], 2)}->${roundNum(ys[ys.length - 1], 2)} (${roundNum(ts.slope, 3)}/7d)`,
    n: series.length,
  });
  return { evidenceId: entry.id, data: { evidenceId: entry.id, ...data } };
}

function comparePeriodsHandler(dataset, args, ledger) {
  const metric = args?.metric;
  const resA = resolveSeriesSpec(dataset, { metric, scope: args?.scopeA || {}, grain: 'microcycle' });
  const resB = resolveSeriesSpec(dataset, { metric, scope: args?.scopeB || {}, grain: 'microcycle' });
  if (!resA.ok) return resA.unavailable ? makeUnavailable('compare_periods', args, resA.error, ledger) : { error: `scopeA: ${resA.error}`, validValues: resA.validValues };
  if (!resB.ok) return resB.unavailable ? makeUnavailable('compare_periods', args, resB.error, ledger) : { error: `scopeB: ${resB.error}`, validValues: resB.validValues };

  const a = resA.series.map((p) => p.y);
  const b = resB.series.map((p) => p.y);
  if (a.length < 2 || b.length < 2) {
    return makeUnavailable('compare_periods', args, `Need >= 2 microcycles per period (got nA=${a.length}, nB=${b.length}).`, ledger);
  }

  const hg = hedgesG(a, b, { seed: 42, nBoot: 300 });
  const cd = cliffsDelta(a, b);
  const data = {
    status: 'ok',
    metric,
    unit: resA.unit,
    nA: hg.nA,
    nB: hg.nB,
    meanA: hg.meanA,
    meanB: hg.meanB,
    diff: hg.diff,
    pctDiff: hg.pctDiff,
    hedgesG: hg.g,
    ciLower: hg.ciLower,
    ciUpper: hg.ciUpper,
    cliffsDelta: cd.delta,
    cliffsMagnitude: cd.magnitude,
    items: [
      { name: args?.labelA || args?.scopeA?.macrocycle || args?.scopeA?.program || 'Period A', y: hg.meanA, n: hg.nA },
      { name: args?.labelB || args?.scopeB?.macrocycle || args?.scopeB?.program || 'Period B', y: hg.meanB, n: hg.nB },
    ],
  };

  const entry = ledger.record({
    toolName: 'compare_periods',
    args,
    data,
    summaryLine: `Compare ${metric}: A=${roundNum(hg.meanA, 2)} (n=${hg.nA}) vs B=${roundNum(hg.meanB, 2)} (n=${hg.nB}), diff=${roundNum(hg.pctDiff, 1)}%, g=${roundNum(hg.g, 2)}`,
    n: Math.min(hg.nA, hg.nB),
    rpeDependent: resA.rpeDependent,
  });
  return { evidenceId: entry.id, data: { evidenceId: entry.id, ...data } };
}

function detectChangesHandler(dataset, args, ledger) {
  const res = resolveSeriesSpec(dataset, args?.seriesSpec || args);
  if (!res.ok) return res.unavailable ? makeUnavailable('detect_changes', args, res.error, ledger) : { error: res.error, validValues: res.validValues };
  if (res.series.length < 6) {
    return makeUnavailable('detect_changes', args, `Need >= 6 microcycles for change-point analysis (got ${res.series.length}).`, ledger);
  }
  const xs = res.series.map((_, i) => i + 1);
  const ys = res.series.map((p) => p.y);
  const plateaus = detectPlateaus(xs, ys, { minLength: 3 });
  const shift = detectRegimeShift(xs, ys, { minSegment: 3 });
  const breakLabel = shift.breakIndex !== null ? res.series[shift.breakIndex]?.label : null;

  const data = {
    status: 'ok',
    metric: res.metric,
    n: res.series.length,
    plateaus: plateaus.map((p) => ({
      ...p,
      startLabel: res.series[p.startIdx]?.label,
      endLabel: res.series[p.endIdx]?.label,
    })),
    regimeShift: { ...shift, breakLabel },
    series: downsampleArray(res.series, 32).items,
  };

  const entry = ledger.record({
    toolName: 'detect_changes',
    args,
    data,
    summaryLine: `Changes in ${res.metric} (n=${res.series.length}): plateaus=${plateaus.length}, regimeShift=${shift.detected ? `at ${breakLabel} (dBIC=${roundNum(shift.deltaBic, 1)})` : 'none'}`,
    n: res.series.length,
    rpeDependent: res.rpeDependent,
  });
  return { evidenceId: entry.id, data: { evidenceId: entry.id, ...data } };
}

function findOutliersHandler(dataset, args, ledger) {
  const res = resolveSeriesSpec(dataset, args?.seriesSpec || args);
  if (!res.ok) return res.unavailable ? makeUnavailable('find_outliers', args, res.error, ledger) : { error: res.error, validValues: res.validValues };
  if (res.series.length < 5) {
    return makeUnavailable('find_outliers', args, `Need >= 5 microcycles for outlier detection (got ${res.series.length}).`, ledger);
  }
  const threshold = Number.isFinite(Number(args?.zThreshold)) ? Math.max(2.0, Number(args.zThreshold)) : 2.5;
  const ys = res.series.map((p) => p.y);
  const zs = robustZScores(ys);
  const med = median(ys);
  const outliers = [];
  for (let i = 0; i < res.series.length; i++) {
    if (Math.abs(zs[i]) >= threshold) {
      outliers.push({
        label: res.series[i].label,
        x: res.series[i].x,
        value: ys[i],
        robustZ: zs[i],
        direction: zs[i] > 0 ? 'high' : 'low',
        pctFromMedian: Math.abs(med) > 1e-9 ? ((ys[i] - med) / Math.abs(med)) * 100 : null,
      });
    }
  }

  const data = {
    status: 'ok',
    metric: res.metric,
    n: res.series.length,
    median: med,
    zThreshold: threshold,
    outlierCount: outliers.length,
    outliers: outliers.slice(0, 12),
    series: downsampleArray(res.series, 32).items,
  };

  const entry = ledger.record({
    toolName: 'find_outliers',
    args,
    data,
    summaryLine: `Outliers in ${res.metric} (n=${res.series.length}, |z|>=${threshold}): ${outliers.length} found`,
    n: res.series.length,
    rpeDependent: res.rpeDependent,
  });
  return { evidenceId: entry.id, data: { evidenceId: entry.id, ...data } };
}

function testRelationshipHandler(dataset, args, ledger) {
  const method = args?.method || 'spearman';
  const lag = Number.isInteger(args?.lag) ? Math.min(4, Math.max(0, args.lag)) : 0;
  const detrend = args?.detrend !== undefined ? Boolean(args.detrend) : true;
  const hypothesisId = args?.hypothesisId || null;

  const pairRes = alignTwoSeries(dataset, args?.x, args?.y, lag);
  if (!pairRes.ok) {
    return pairRes.unavailable
      ? makeUnavailable('test_relationship', args, pairRes.error, ledger)
      : { error: `${pairRes.side}: ${pairRes.error}`, validValues: pairRes.validValues };
  }

  const { resX, resY, aligned, dateAligned } = pairRes;
  const minN = lag > 0 ? dataset.capabilities.minN.lagged : dataset.capabilities.minN.correlation;
  if (aligned.length < minN) {
    return makeUnavailable(
      'test_relationship',
      args,
      `Only ${aligned.length} aligned microcycle pairs for lag=${lag} (minimum required: ${minN}).`,
      ledger
    );
  }

  const rawX = aligned.map((p) => p.x);
  const rawY = aligned.map((p) => p.y);
  const useX = detrend ? linearDetrend(rawX) : rawX;
  const useY = detrend ? linearDetrend(rawY) : rawY;

  let statResult;
  if (args?.controlFor) {
    const resZ = resolveSeriesSpec(dataset, args.controlFor);
    if (!resZ.ok) return { error: `controlFor: ${resZ.error}` };
    const zByT = new Map(resZ.series.map((p) => [p.x, p.y]));
    const px = [];
    const py = [];
    const pz = [];
    for (let i = 0; i < aligned.length; i++) {
      const zv = zByT.get(aligned[i].t);
      if (Number.isFinite(zv)) {
        px.push(useX[i]);
        py.push(useY[i]);
        pz.push(zv);
      }
    }
    if (px.length < minN) return makeUnavailable('test_relationship', args, `Only ${px.length} triples with controlFor.`, ledger);
    const pr = partialCorrelation(px, py, pz, { method: method === 'pearson' ? 'pearson' : 'spearman' });
    statResult = { r: pr.r, rho: method === 'spearman' ? pr.r : null, pValue: pr.pValue, ciLower: pr.ciLower, ciUpper: pr.ciUpper, n: pr.n };
  } else if (method === 'pearson') {
    const pr = pearsonCorrelation(useX, useY);
    statResult = { r: pr.r, rho: null, pValue: pr.pValue, ciLower: pr.ciLower, ciUpper: pr.ciUpper, n: pr.n };
  } else if (method === 'theil-sen') {
    const ts = theilSenSlope(useX, useY, { seed: 42, nBoot: 300 });
    const lin = olsRegression(useX, useY);
    statResult = { slope: ts.slope, intercept: ts.intercept, r: Math.sqrt(lin.r2 || 0) * Math.sign(ts.slope || 1), pValue: lin.pValue, ciLower: ts.ciLower, ciUpper: ts.ciUpper, n: ts.n };
  } else {
    const sr = spearmanCorrelation(useX, useY);
    statResult = { rho: sr.rho, r: sr.rho, pValue: sr.pValue, ciLower: sr.ciLower, ciUpper: sr.ciUpper, n: sr.n };
  }

  const acX = lag1Autocorrelation(useX);
  const acY = lag1Autocorrelation(useY);
  const autocorrelationWarning = Boolean(acX.significant && acY.significant);
  const confounderWarnings = [];
  if (autocorrelationWarning) confounderWarnings.push('Both series retain significant lag-1 autocorrelation even after processing; interpret p-value cautiously.');
  if (!detrend) confounderWarnings.push('Detrending was disabled; shared trends across microcycles can inflate correlation.');
  if (dateAligned) confounderWarnings.push('Cross-domain join uses approximate microcycle date windows derived from macrocycle start dates.');
  if ((resX.rpeDependent || resY.rpeDependent) && dataset.capabilities.rpeQuality === 'assumed') {
    confounderWarnings.push('At least one variable depends on RPE, which is mostly defaulted to 9.0.');
  }

  const points = aligned.slice(0, 40).map((p, idx) => ({
    x: useX[idx],
    y: useY[idx],
    rawX: p.x,
    rawY: p.y,
    label: p.labelX,
  }));

  const data = {
    status: 'ok',
    hypothesisId,
    method,
    lag,
    lagUnit: 'microcycles',
    detrended: detrend,
    xMetric: resX.metric,
    yMetric: resY.metric,
    n: statResult.n,
    rho: statResult.rho ?? null,
    r: statResult.r ?? null,
    slope: statResult.slope ?? null,
    ciLower: statResult.ciLower,
    ciUpper: statResult.ciUpper,
    pValue: statResult.pValue,
    sessionQValue: null,
    autocorrelationWarning,
    confounderWarnings,
    points,
  };

  const statDisplay = method === 'theil-sen' ? `slope=${roundNum(statResult.slope, 3)}` : `r=${roundNum(statResult.r, 3)}`;
  const entry = ledger.record({
    toolName: 'test_relationship',
    args,
    data,
    summaryLine: `Test ${resX.metric}->${resY.metric} (lag=${lag} mc, n=${statResult.n}): ${statDisplay}, p=${roundNum(statResult.pValue, 4)}`,
    n: statResult.n,
    rpeDependent: resX.rpeDependent || resY.rpeDependent,
    dateAligned,
    qualityFlags: confounderWarnings,
  });

  ledger.recordTests([{ evidenceId: entry.id, label: `${resX.metric}->${resY.metric}`, pValue: statResult.pValue }]);
  if (hypothesisId) {
    const supported = Number.isFinite(entry.data.sessionQValue) && entry.data.sessionQValue <= ledger.fdrLevel;
    ledger.linkHypothesis(hypothesisId, entry.id, supported ? 'supported' : 'not_supported');
  }

  return { evidenceId: entry.id, data: { evidenceId: entry.id, ...entry.data } };
}

function scanRelationshipsHandler(dataset, args, ledger) {
  const family = args?.family || 'volume->strength';
  const maxResults = Math.min(8, Math.max(1, Number(args?.maxResults) || 6));
  const validFamilies = ['volume->strength', 'fatigue->performance', 'technique->progress', 'bodycomp->strength', 'rest->performance'];
  if (!validFamilies.includes(family)) return { error: `Invalid family "${family}".`, validValues: validFamilies };

  const exCounts = new Map();
  for (const em of dataset.exerciseMicrocycles) exCounts.set(em.exerciseName, (exCounts.get(em.exerciseName) || 0) + 1);
  const eligibleExercises = Array.from(exCounts.entries())
    .filter(([, cnt]) => cnt >= 8)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([name]) => name);

  if (eligibleExercises.length === 0) {
    return makeUnavailable('scan_relationships', args, 'No exercises have >= 8 microcycle observations for correlation scanning.', ledger);
  }

  const pairsToTest = [];
  if (family === 'volume->strength') {
    for (const ex of eligibleExercises) {
      pairsToTest.push({ label: `Total sets -> ${ex} e1RM (lag 1 mc)`, x: { metric: 'sets' }, y: { metric: 'e1rm', scope: { exercise: ex } }, lag: 1 });
      pairsToTest.push({ label: `${ex} sets -> ${ex} e1RM (lag 1 mc)`, x: { metric: 'sets', scope: { exercise: ex } }, y: { metric: 'e1rm', scope: { exercise: ex } }, lag: 1 });
    }
  } else if (family === 'fatigue->performance') {
    for (const ex of eligibleExercises) {
      pairsToTest.push({ label: `Total fatigue -> ${ex} e1RM (lag 1 mc)`, x: { metric: 'fatigue' }, y: { metric: 'e1rm', scope: { exercise: ex } }, lag: 1 });
      pairsToTest.push({ label: `Total fatigue -> ${ex} e1RM (lag 0)`, x: { metric: 'fatigue' }, y: { metric: 'e1rm', scope: { exercise: ex } }, lag: 0 });
    }
  } else if (family === 'technique->progress') {
    for (const ex of eligibleExercises) {
      pairsToTest.push({ label: `${ex} intensityTechShare -> ${ex} e1RM (lag 1 mc)`, x: { metric: 'intensityTechShare', scope: { exercise: ex } }, y: { metric: 'e1rm', scope: { exercise: ex } }, lag: 1 });
      pairsToTest.push({ label: `Global intensityTechShare -> ${ex} e1RM (lag 1 mc)`, x: { metric: 'intensityTechShare' }, y: { metric: 'e1rm', scope: { exercise: ex } }, lag: 1 });
    }
  } else if (family === 'bodycomp->strength') {
    const bwMetric = dataset.capabilities.canJoinBodyComp ? 'weight' : (dataset.capabilities.hasBwProxy ? 'bwProxy' : null);
    if (!bwMetric) {
      return makeUnavailable('scan_relationships', args, 'Neither date-aligned body logs (>=6 overlapping microcycles) nor bw proxy (>=4 microcycles) are available.', ledger);
    }
    for (const ex of eligibleExercises) {
      pairsToTest.push({ label: `${bwMetric} -> ${ex} e1RM (lag 0)`, x: { metric: bwMetric }, y: { metric: 'e1rm', scope: { exercise: ex } }, lag: 0 });
    }
  } else if (family === 'rest->performance') {
    for (const ex of eligibleExercises) {
      pairsToTest.push({ label: `${ex} rest -> ${ex} e1RM (lag 0)`, x: { metric: 'meanRestSec', scope: { exercise: ex } }, y: { metric: 'e1rm', scope: { exercise: ex } }, lag: 0 });
    }
  }

  const screened = [];
  for (const pair of pairsToTest) {
    const pairRes = alignTwoSeries(dataset, pair.x, pair.y, pair.lag);
    if (!pairRes.ok || pairRes.aligned.length < 8) continue;
    const dx = linearDetrend(pairRes.aligned.map((p) => p.x));
    const dy = linearDetrend(pairRes.aligned.map((p) => p.y));
    const sr = spearmanCorrelation(dx, dy);
    if (!Number.isFinite(sr.rho) || !Number.isFinite(sr.pValue)) continue;
    screened.push({
      label: pair.label,
      xSpec: pair.x,
      ySpec: pair.y,
      lag: pair.lag,
      rho: sr.rho,
      pValue: sr.pValue,
      ciLower: sr.ciLower,
      ciUpper: sr.ciUpper,
      n: sr.n,
    });
  }

  if (screened.length === 0) {
    return makeUnavailable('scan_relationships', args, `No testable pairs with >= 8 overlapping microcycles in family "${family}".`, ledger);
  }

  const bh = benjaminiHochberg(screened.map((s) => s.pValue), { fdr: ledger.fdrLevel });
  screened.forEach((s, i) => {
    s.qValue = bh.qValues[i];
    s.significant = bh.rejected[i];
  });
  screened.sort((a, b) => Math.abs(b.rho) - Math.abs(a.rho));

  const top = screened.slice(0, maxResults);
  const data = {
    status: 'ok',
    family,
    pairsScreened: screened.length,
    significantCount: screened.filter((s) => s.significant).length,
    fdrLevel: ledger.fdrLevel,
    candidates: top,
    note: 'Exploratory scan (detrended Spearman across microcycles). Register a hypothesis and verify top hits with test_relationship.',
  };

  const entry = ledger.record({
    toolName: 'scan_relationships',
    args,
    data,
    summaryLine: `Scan ${family}: ${screened.length} pairs screened, ${data.significantCount} pass FDR<=${ledger.fdrLevel}`,
    n: screened.length,
    rpeDependent: family === 'fatigue->performance',
    dateAligned: family === 'bodycomp->strength' && dataset.capabilities.dateAlignment === 'approximate',
  });

  ledger.recordTests(screened.map((s) => ({ evidenceId: entry.id, label: s.label, pValue: s.pValue })));

  return { evidenceId: entry.id, data: { evidenceId: entry.id, ...data } };
}

function rankBottlenecksHandler(dataset, args, ledger) {
  const macroId = args?.macrocycle || args?.program || null;
  const bottlenecks = [];

  const byEx = new Map();
  for (const em of dataset.exerciseMicrocycles) {
    if (macroId && em.macrocycleId !== macroId) continue;
    if (!Number.isFinite(em.e1rm)) continue;
    if (!byEx.has(em.exerciseName)) byEx.set(em.exerciseName, []);
    byEx.get(em.exerciseName).push(em);
  }

  for (const [exName, rows] of byEx.entries()) {
    rows.sort((a, b) => a.timelineIndex - b.timelineIndex);
    if (rows.length < 4) continue;
    const xs = rows.map((_, i) => i + 1);
    const ys = rows.map((r) => r.e1rm);
    const plateaus = detectPlateaus(xs, ys, { minLength: 3 });
    const latest = plateaus[plateaus.length - 1];
    if (latest && latest.length >= 3) {
      const ts = theilSenSlope(xs, ys, { seed: 42, nBoot: 150 });
      bottlenecks.push({
        type: 'stalled_lift',
        target: exName,
        severity: latest.endIdx === rows.length - 1 ? latest.length * 1.5 : latest.length,
        metric: 'e1rm',
        plateauMicrocycles: latest.length,
        isCurrent: latest.endIdx === rows.length - 1,
        slope: ts.slope,
        n: rows.length,
        detail: `${exName} stalled for ${latest.length} microcycles (overall slope ${roundNum(ts.slope, 2)} kg/mc).`,
      });
    }
  }

  const compoundSfrs = [];
  const isoSfrs = [];
  const exSfrRows = [];
  for (const [exName, rows] of byEx.entries()) {
    const sfrs = rows.map((r) => r.sfr).filter(Number.isFinite);
    if (sfrs.length < 3) continue;
    const m = mean(sfrs);
    const isIso = rows[0].isIsolation;
    if (isIso) isoSfrs.push(m);
    else compoundSfrs.push(m);
    exSfrRows.push({ exName, meanSfr: m, isIso, n: rows.length, meanFatigue: mean(rows.map((r) => r.fatigue)) });
  }
  const compMed = compoundSfrs.length >= 3 ? median(compoundSfrs) : null;
  const isoMed = isoSfrs.length >= 3 ? median(isoSfrs) : null;
  for (const row of exSfrRows) {
    const ref = row.isIso ? isoMed : compMed;
    if (ref && row.meanSfr < ref * 0.72) {
      bottlenecks.push({
        type: 'low_sfr',
        target: row.exName,
        severity: ((ref - row.meanSfr) / ref) * 5,
        metric: 'sfr',
        meanSfr: row.meanSfr,
        classMedianSfr: ref,
        n: row.n,
        detail: `${row.exName} has SFR ${roundNum(row.meanSfr, 2)} vs ${row.isIso ? 'isolation' : 'compound'} median ${roundNum(ref, 2)}.`,
      });
    }
  }

  const mmRows = dataset.muscleMicrocycles.filter((mm) => !macroId || mm.macrocycleId === macroId);
  const nMicrocycles = Math.max(1, new Set(mmRows.map((r) => `${r.macrocycleId}|${r.microcycle}`)).size);
  const macroSets = new Map();
  for (const r of mmRows) macroSets.set(r.macro, (macroSets.get(r.macro) || 0) + r.sets);
  const majorMacros = ['Chest', 'Back', 'Shoulders', 'Legs', 'Biceps', 'Triceps'].filter((m) => macroSets.has(m));
  if (majorMacros.length >= 4) {
    const perMc = majorMacros.map((m) => macroSets.get(m) / nMicrocycles);
    const medSets = median(perMc);
    for (const m of majorMacros) {
      const mcSets = macroSets.get(m) / nMicrocycles;
      if (medSets > 0 && mcSets < medSets * 0.55) {
        bottlenecks.push({
          type: 'underdosed_muscle',
          target: m,
          severity: ((medSets - mcSets) / medSets) * 4.5,
          metric: 'sets',
          setsPerMicrocycle: mcSets,
          medianMacroSetsPerMicrocycle: medSets,
          n: nMicrocycles,
          detail: `${m} averages ${roundNum(mcSets, 1)} fractional sets/microcycle vs macro median ${roundNum(medSets, 1)}.`,
        });
      }
    }
  }

  for (const p of dataset.macrocycles) {
    if (!p.excluded && (p.isFailedBlock || p.nMicrocycles <= 2)) {
      bottlenecks.push({
        type: 'abandoned_or_short_block',
        target: p.id,
        severity: p.isFailedBlock ? 4.0 : 2.5,
        metric: 'microcycles',
        nMicrocycles: p.nMicrocycles,
        n: p.nMicrocycles,
        detail: `Macrocycle ${p.id} ${p.isFailedBlock ? 'is marked as a failed block' : `only lasted ${p.nMicrocycles} microcycle(s)`}.`,
      });
    }
  }

  bottlenecks.sort((a, b) => b.severity - a.severity);
  const top = bottlenecks.slice(0, 10);
  const data = {
    status: 'ok',
    scope: macroId || 'all',
    count: top.length,
    bottlenecks: top,
    items: top.map((b) => ({ name: b.target, y: roundNum(b.severity, 2), type: b.type })),
  };

  const entry = ledger.record({
    toolName: 'rank_bottlenecks',
    args,
    data,
    summaryLine: `Bottlenecks (${macroId || 'all'}): ${top.length} candidates; top=${top[0]?.target || 'none'} (${top[0]?.type || ''})`,
    n: dataset.summary.nMicrocycles,
    rpeDependent: top.some((b) => b.type === 'low_sfr'),
  });
  return { evidenceId: entry.id, data: { evidenceId: entry.id, ...data } };
}

function getSetDetailsHandler(dataset, args, ledger) {
  const exercise = args?.exercise;
  const macroId = args?.macrocycle || args?.program || null;
  if (!exercise || !dataset.entities.exercises.includes(exercise)) {
    return { error: `Unknown exercise "${exercise}".`, validValues: dataset.entities.exercises.slice(0, 30) };
  }
  const limit = Math.min(20, Math.max(1, Number(args?.limit) || 15));
  const mcFrom = args?.microcycleFrom ?? args?.weekFrom;
  const mcTo = args?.microcycleTo ?? args?.weekTo;
  const filtered = dataset.sets.filter((s) => {
    if (s.exerciseName !== exercise) return false;
    if (macroId && s.macrocycleId !== macroId) return false;
    if (Number.isFinite(Number(mcFrom)) && s.microcycle < Number(mcFrom)) return false;
    if (Number.isFinite(Number(mcTo)) && s.microcycle > Number(mcTo)) return false;
    return true;
  });

  const sliced = filtered.slice(-limit).map((s) => ({
    macrocycleId: s.macrocycleId,
    microcycle: s.microcycle,
    date: s.date,
    session: s.session,
    set: s.setIndex,
    load: s.actualLoad,
    reps: `${s.baseReps}${s.assistedReps ? `(${s.assistedReps})` : ''}${s.partialReps ? `+${s.partialReps}` : ''}`,
    rpe: s.rpe,
    rpeLogged: s.rpeLogged,
    e1rm: roundNum(s.e1rm, 1),
    fatigue: roundNum(s.fatigue, 2),
    restSec: s.restSec,
  }));

  const data = { status: 'ok', exercise, totalMatching: filtered.length, shown: sliced.length, sets: sliced };
  const entry = ledger.record({
    toolName: 'get_set_details',
    args,
    data,
    summaryLine: `Set details for ${exercise}: showing ${sliced.length}/${filtered.length} sets`,
    n: sliced.length,
  });
  return { evidenceId: entry.id, data: { evidenceId: entry.id, ...data } };
}

function calculateHandler(dataset, args, ledger) {
  try {
    const { value, resolvedRefs } = evaluateLedgerExpression(args?.expression, ledger);
    const data = {
      status: 'ok',
      expression: args.expression,
      label: args.label || args.expression,
      value,
      resolvedRefs,
    };
    const entry = ledger.record({
      toolName: 'calculate',
      args,
      data,
      summaryLine: `Calc ${data.label} = ${roundNum(value, 4)}`,
      n: Object.keys(resolvedRefs).length,
    });
    return { evidenceId: entry.id, data: { evidenceId: entry.id, ...data } };
  } catch (err) {
    return { error: `Calculation failed: ${err.message}` };
  }
}

function lookupReferenceHandler(dataset, args, ledger) {
  const topic = args?.topic;
  const note = REFERENCE_NOTES[topic];
  if (!note) return { error: `Unknown topic "${topic}".`, validValues: REFERENCE_TOPICS };
  const data = { status: 'ok', topic, ...note };
  const entry = ledger.record({
    toolName: 'lookup_reference',
    args,
    data,
    summaryLine: `Reference note: ${topic}`,
    n: 1,
  });
  return { evidenceId: entry.id, data: { evidenceId: entry.id, ...data } };
}

function registerHypothesisHandler(dataset, args, ledger) {
  if (!args?.statement || typeof args.statement !== 'string') {
    return { error: 'statement is required.' };
  }
  const hyp = ledger.registerHypothesis(args);
  const data = { status: 'ok', hypothesisId: hyp.id, statement: hyp.statement, plannedTest: hyp.plannedTest };
  const entry = ledger.record({
    toolName: 'register_hypothesis',
    args,
    data,
    summaryLine: `Registered ${hyp.id}: ${hyp.statement.slice(0, 70)}`,
    n: 1,
  });
  return { evidenceId: entry.id, data: { evidenceId: entry.id, ...data } };
}

export const TOOL_DEFINITIONS = [
  {
    name: 'get_dataset_overview',
    description: 'Return dataset inventory (macrocycles, microcycles, sets, body logs), capabilities, quality flags, top exercises, and athlete snapshot.',
    parameters: { type: 'object', properties: {} },
    handler: getOverviewHandler,
  },
  {
    name: 'list_entities',
    description: 'List valid entity names in the dataset to prevent invalid identifiers.',
    parameters: {
      type: 'object',
      required: ['kind'],
      properties: { kind: { type: 'string', enum: ['exercises', 'muscles', 'macros', 'macrocycles', 'sessions'] } },
    },
    handler: listEntitiesHandler,
  },
  {
    name: 'get_metric_series',
    description: 'Query a microcycle- or macrocycle-grain metric series with summary statistics and robust Theil-Sen slope.',
    parameters: SERIES_SPEC_SCHEMA,
    handler: getMetricSeriesHandler,
  },
  {
    name: 'get_exercise_progression',
    description: 'Analyze strength progression per microcycle, Theil-Sen slope with CI, PRs, plateaus, and SFR for one exercise.',
    parameters: {
      type: 'object',
      required: ['exercise'],
      properties: {
        exercise: { type: 'string' },
        measure: { type: 'string', enum: ['e1rm', 'topSet', 'repsAtLoad', 'volumeLoad'] },
        macrocycle: { type: 'string' },
      },
    },
    handler: getExerciseProgressionHandler,
  },
  {
    name: 'get_muscle_distribution',
    description: 'Compute volume/stimulus share per macro or sub-muscle per microcycle, antagonist ratios, and deviations from median.',
    parameters: {
      type: 'object',
      properties: {
        metric: { type: 'string', enum: ['sets', 'volume', 'effectiveReps', 'tonnage', 'effectiveTonnage', 'fatigue', 'totalTut', 'effectiveTut'] },
        level: { type: 'string', enum: ['macro', 'sub'] },
        macrocycle: { type: 'string' },
      },
    },
    handler: getMuscleDistributionHandler,
  },
  {
    name: 'get_body_composition',
    description: 'Analyze dated body-composition series (weight, bodyFat, leanMass, fatMass) with 7-day calendar rate of change.',
    parameters: {
      type: 'object',
      required: ['measure'],
      properties: { measure: { type: 'string', enum: ['weight', 'bodyFat', 'leanMass', 'fatMass'] } },
    },
    handler: getBodyCompositionHandler,
  },
  {
    name: 'compare_periods',
    description: 'Compare a metric between two scopes/macrocycles using Hedges g with bootstrap CI and Cliff delta.',
    parameters: {
      type: 'object',
      required: ['metric', 'scopeA', 'scopeB'],
      properties: {
        metric: { type: 'string', enum: Object.keys(METRIC_CATALOG) },
        scopeA: SERIES_SPEC_SCHEMA.properties.scope,
        scopeB: SERIES_SPEC_SCHEMA.properties.scope,
        labelA: { type: 'string' },
        labelB: { type: 'string' },
      },
    },
    handler: comparePeriodsHandler,
  },
  {
    name: 'detect_changes',
    description: 'Detect plateaus (>=3 flat microcycles) and regime shifts (segmented OLS + BIC + Chow F-test) in a series.',
    parameters: {
      type: 'object',
      required: ['seriesSpec'],
      properties: { seriesSpec: SERIES_SPEC_SCHEMA },
    },
    handler: detectChangesHandler,
  },
  {
    name: 'find_outliers',
    description: 'Flag anomalous microcycles using robust MAD Z-scores.',
    parameters: {
      type: 'object',
      required: ['seriesSpec'],
      properties: {
        seriesSpec: SERIES_SPEC_SCHEMA,
        zThreshold: { type: 'number' },
      },
    },
    handler: findOutliersHandler,
  },
  {
    name: 'test_relationship',
    description: 'Formally test a pre-registered hypothesis between two series (detrended by default) with lag 0-4 microcycles, optional controlFor covariate, and session-wide BH-FDR q-value.',
    parameters: {
      type: 'object',
      required: ['x', 'y'],
      properties: {
        hypothesisId: { type: 'string' },
        x: SERIES_SPEC_SCHEMA,
        y: SERIES_SPEC_SCHEMA,
        method: { type: 'string', enum: ['spearman', 'pearson', 'theil-sen'] },
        lag: { type: 'integer', minimum: 0, maximum: 4 },
        detrend: { type: 'boolean' },
        controlFor: SERIES_SPEC_SCHEMA,
      },
    },
    handler: testRelationshipHandler,
  },
  {
    name: 'scan_relationships',
    description: 'Bounded exploratory screen for hidden correlations within a domain family across microcycles, with FDR adjustment.',
    parameters: {
      type: 'object',
      required: ['family'],
      properties: {
        family: { type: 'string', enum: ['volume->strength', 'fatigue->performance', 'technique->progress', 'bodycomp->strength', 'rest->performance'] },
        maxResults: { type: 'integer', minimum: 1, maximum: 8 },
      },
    },
    handler: scanRelationshipsHandler,
  },
  {
    name: 'rank_bottlenecks',
    description: 'Deterministically rank bottleneck candidates: stalled lifts, low-SFR lifts, under-dosed muscles, and failed/short macrocycles.',
    parameters: {
      type: 'object',
      properties: { macrocycle: { type: 'string' } },
    },
    handler: rankBottlenecksHandler,
  },
  {
    name: 'get_set_details',
    description: 'Inspect up to 20 raw logged sets for an exercise to verify context or anomalies.',
    parameters: {
      type: 'object',
      required: ['exercise'],
      properties: {
        exercise: { type: 'string' },
        macrocycle: { type: 'string' },
        microcycleFrom: { type: 'integer' },
        microcycleTo: { type: 'integer' },
        limit: { type: 'integer', minimum: 1, maximum: 20 },
      },
    },
    handler: getSetDetailsHandler,
  },
  {
    name: 'calculate',
    description: 'Compute a grounded derived number from ledger values (e.g., "pct(E2.firstVal, E2.lastVal)").',
    parameters: {
      type: 'object',
      required: ['expression'],
      properties: {
        expression: { type: 'string' },
        label: { type: 'string' },
      },
    },
    handler: calculateHandler,
  },
  {
    name: 'lookup_reference',
    description: 'Look up a vetted exercise-science or statistical interpretation note.',
    parameters: {
      type: 'object',
      required: ['topic'],
      properties: { topic: { type: 'string', enum: REFERENCE_TOPICS } },
    },
    handler: lookupReferenceHandler,
  },
  {
    name: 'register_hypothesis',
    description: 'Pre-register a testable hypothesis before calling test_relationship.',
    parameters: {
      type: 'object',
      required: ['statement'],
      properties: {
        statement: { type: 'string' },
        rationale: { type: 'string' },
        plannedTest: { type: 'string' },
      },
    },
    handler: registerHypothesisHandler,
  },
  {
    name: 'submit_report',
    description: 'Submit the final verified Smart Analytics report JSON. Every number in prose must use {{E#.field}} placeholders or match cited evidence.',
    parameters: SUBMIT_REPORT_TOOL_SCHEMA,
    handler: null,
  },
];

const TOOL_MAP = new Map(TOOL_DEFINITIONS.map((t) => [t.name, t]));

export function getOpenAITools() {
  return TOOL_DEFINITIONS.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

export function executeTool(toolName, rawArgs, dataset, ledger) {
  const def = TOOL_MAP.get(toolName);
  if (!def || !def.handler) {
    return {
      ok: false,
      error: `Unknown tool "${toolName}".`,
      formatted: JSON.stringify({ error: `Unknown tool "${toolName}".`, validTools: TOOL_DEFINITIONS.map((t) => t.name) }),
    };
  }

  const args = rawArgs && typeof rawArgs === 'object' ? rawArgs : {};

  if (toolName !== 'register_hypothesis') {
    const dup = ledger.findDuplicate(toolName, args);
    if (dup) {
      return {
        ok: true,
        duplicate: true,
        evidenceId: dup.id,
        summaryLine: dup.summaryLine,
        formatted: JSON.stringify({
          evidenceId: dup.id,
          duplicate: true,
          note: `Already computed; see ${dup.id}: ${dup.summaryLine}`,
        }),
      };
    }
  }

  const result = def.handler(dataset, args, ledger);
  if (result.error) {
    return {
      ok: false,
      error: result.error,
      formatted: JSON.stringify({ error: result.error, ...(result.validValues ? { validValues: result.validValues } : {}) }),
    };
  }

  const entry = ledger.get(result.evidenceId);
  const { text, truncated } = formatToolResponse(result.data);
  return {
    ok: true,
    duplicate: false,
    evidenceId: result.evidenceId,
    summaryLine: entry?.summaryLine || `${result.evidenceId}: ${toolName}`,
    data: result.data,
    truncated,
    formatted: text,
  };
}

export function describeToolCallHuman(toolName, args = {}) {
  switch (toolName) {
    case 'get_dataset_overview': return 'Scanning macrocycles, microcycles & profile inventory';
    case 'list_entities': return `Listing available ${args.kind || 'entities'}`;
    case 'get_metric_series': return `Measuring ${args.metric || 'metric'} trend${args.scope?.exercise ? ` on ${args.scope.exercise}` : args.scope?.macro ? ` for ${args.scope.macro}` : ''}`;
    case 'get_exercise_progression': return `Checking ${args.exercise || 'exercise'} ${args.measure || 'e1RM'} progression`;
    case 'get_muscle_distribution': return `Auditing ${args.level || 'macro'} muscle ${args.metric || 'sets'} balance`;
    case 'get_body_composition': return `Analyzing ${args.measure || 'weight'} trend`;
    case 'compare_periods': return `Comparing ${args.metric || 'metric'}: ${args.labelA || args.scopeA?.macrocycle || 'A'} vs ${args.labelB || args.scopeB?.macrocycle || 'B'}`;
    case 'detect_changes': return `Scanning ${args.seriesSpec?.metric || 'series'} for plateaus & regime shifts`;
    case 'find_outliers': return `Checking ${args.seriesSpec?.metric || 'series'} for anomalous microcycles`;
    case 'test_relationship': return `Testing ${args.x?.metric || 'X'} → ${args.y?.metric || 'Y'}${args.lag ? ` (lag ${args.lag} mc)` : ''}`;
    case 'scan_relationships': return `Screening ${args.family || 'relationships'} with FDR control`;
    case 'rank_bottlenecks': return `Ranking bottlenecks${args.macrocycle ? ` in ${args.macrocycle}` : ''}`;
    case 'get_set_details': return `Inspecting raw sets for ${args.exercise || 'exercise'}`;
    case 'calculate': return `Computing ${args.label || args.expression || 'derived value'}`;
    case 'lookup_reference': return `Consulting reference: ${args.topic || ''}`;
    case 'register_hypothesis': return `Hypothesis: ${(args.statement || '').slice(0, 64)}`;
    case 'submit_report': return 'Submitting & verifying final report';
    default: return `Running ${toolName}`;
  }
}

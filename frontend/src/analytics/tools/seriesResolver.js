/**
 * Shared SeriesSpec resolver: translates a typed query specification into an aligned numeric series.
 * Uses macrocycle/microcycle grain (accepts program/week aliases for ergonomics).
 * Ensures the LLM never passes raw arrays to statistical tools.
 */

import { mean } from '../stats/descriptive.js';
import { METRIC_CATALOG } from '../dataset/buildAnalyticsDataset.js';

const BODY_METRICS = new Set(['weight', 'bodyFat', 'leanMass', 'fatMass']);
const EXERCISE_ONLY_METRICS = new Set(['e1rm', 'topSetLoad', 'repsAtTopLoad']);
const MEAN_DEFAULT_METRICS = new Set(['e1rm', 'topSetLoad', 'sfr', 'intensityTechShare', 'meanRestSec', 'weight', 'bodyFat', 'leanMass', 'fatMass', 'bwProxy']);

function aggregateValues(values, mode) {
  const fin = values.map(Number).filter(Number.isFinite);
  if (fin.length === 0) return null;
  if (mode === 'max') return Math.max(...fin);
  if (mode === 'min') return Math.min(...fin);
  if (mode === 'mean') return mean(fin);
  return fin.reduce((s, v) => s + v, 0);
}

function normalizeGrain(raw) {
  if (raw === 'macrocycle' || raw === 'program') return 'macrocycle';
  return 'microcycle';
}

export function resolveSeriesSpec(dataset, spec) {
  if (!spec || typeof spec !== 'object') {
    return { ok: false, error: 'seriesSpec must be an object with { metric, scope?, grain?, aggregate? }.' };
  }
  const metric = spec.metric;
  if (!metric || !(metric in METRIC_CATALOG)) {
    return {
      ok: false,
      error: `Unknown metric "${metric}".`,
      validValues: Object.keys(METRIC_CATALOG),
    };
  }

  const rawScope = spec.scope || {};
  const scope = {
    macrocycle: rawScope.macrocycle || rawScope.program || null,
    session: rawScope.session,
    exercise: rawScope.exercise || null,
    macro: rawScope.macro || null,
    sub: rawScope.sub || null,
  };
  const grain = normalizeGrain(spec.grain);
  const defaultAgg = MEAN_DEFAULT_METRICS.has(metric) ? 'mean' : 'sum';
  const aggregate = spec.aggregate || defaultAgg;
  const metaInfo = METRIC_CATALOG[metric];
  const rpeDependent = Boolean(metaInfo?.rpeDependent);

  if (scope.macrocycle && !dataset.entities.macrocycles.includes(scope.macrocycle)) {
    return { ok: false, error: `Unknown or excluded macrocycle "${scope.macrocycle}".`, validValues: dataset.entities.macrocycles };
  }
  if (scope.exercise && !dataset.entities.exercises.includes(scope.exercise)) {
    return { ok: false, error: `Unknown exercise "${scope.exercise}".`, validValues: dataset.entities.exercises.slice(0, 30) };
  }
  if (scope.macro && !dataset.entities.macros.includes(scope.macro)) {
    return { ok: false, error: `Unknown macro muscle "${scope.macro}".`, validValues: dataset.entities.macros };
  }
  if (scope.sub && !dataset.entities.subMuscles.includes(scope.sub)) {
    return { ok: false, error: `Unknown sub-muscle "${scope.sub}".`, validValues: dataset.entities.subMuscles.slice(0, 30) };
  }

  // Case 1: Body-composition series
  if (BODY_METRICS.has(metric)) {
    if (scope.macrocycle || spec.alignToTraining) {
      if (!dataset.capabilities.canJoinBodyComp) {
        return {
          ok: false,
          unavailable: true,
          error: 'Body composition cannot be joined to training microcycles: add session Dates: blocks or macrocycle start dates with at least 6 overlapping body logs.',
        };
      }
      const field = metric === 'weight' ? 'bodyWeight' : metric;
      const rows = dataset.microcycles
        .filter((mc) => (!scope.macrocycle || mc.macrocycleId === scope.macrocycle))
        .filter((mc) => Number.isFinite(mc[field]));
      const series = rows.map((mc) => ({
        x: mc.timelineIndex,
        label: `${mc.macrocycleId} MC${mc.microcycle}`,
        y: mc[field],
        macrocycleId: mc.macrocycleId,
        microcycle: mc.microcycle,
        windowStart: mc.windowStart,
        dateAlignment: mc.dateAlignment,
      }));
      return {
        ok: true,
        metric,
        unit: metaInfo.unit,
        series,
        rpeDependent: false,
        dateAligned: dataset.capabilities.dateAlignment === 'approximate',
      };
    }
    const rows = dataset.bodyPeriods.filter((w) => Number.isFinite(w[metric]));
    const series = rows.map((w, idx) => ({
      x: idx + 1,
      label: w.startDate,
      date: w.startDate,
      periodKey: w.periodKey,
      y: w[metric],
    }));
    return { ok: true, metric, unit: metaInfo.unit, series, rpeDependent: false, dateAligned: false };
  }

  // Case 2: In-logbook bodyweight proxy
  if (metric === 'bwProxy') {
    const rows = dataset.microcycles
      .filter((mc) => (!scope.macrocycle || mc.macrocycleId === scope.macrocycle) && Number.isFinite(mc.bwProxy));
    const series = rows.map((mc) => ({
      x: mc.timelineIndex,
      label: `${mc.macrocycleId} MC${mc.microcycle}`,
      y: mc.bwProxy,
      macrocycleId: mc.macrocycleId,
      microcycle: mc.microcycle,
      windowStart: mc.windowStart,
    }));
    return { ok: true, metric, unit: 'kg', series, rpeDependent: false, dateAligned: false };
  }

  // Case 3: Muscle-scoped series (macro or sub-muscle)
  if ((scope.macro || scope.sub) && !scope.exercise) {
    if (EXERCISE_ONLY_METRICS.has(metric)) {
      return { ok: false, error: `Metric "${metric}" requires an exercise scope, not muscle scope.` };
    }
    const filtered = dataset.muscleMicrocycles.filter((mm) => {
      if (scope.macrocycle && mm.macrocycleId !== scope.macrocycle) return false;
      if (scope.macro && mm.macro !== scope.macro) return false;
      if (scope.sub && mm.subMuscle !== scope.sub) return false;
      return true;
    });

    const grouped = new Map();
    for (const row of filtered) {
      const key = grain === 'macrocycle' ? row.macrocycleId : `${row.macrocycleId}|${row.microcycle}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          x: grain === 'macrocycle' ? row.macrocycleOrder + 1 : row.timelineIndex,
          label: grain === 'macrocycle' ? row.macrocycleId : `${row.macrocycleId} MC${row.microcycle}`,
          macrocycleId: row.macrocycleId,
          microcycle: grain === 'macrocycle' ? null : row.microcycle,
          windowStart: row.windowStart,
          vals: [],
        });
      }
      if (Number.isFinite(row[metric])) grouped.get(key).vals.push(row[metric]);
    }
    const series = Array.from(grouped.values())
      .map((g) => ({ x: g.x, label: g.label, y: aggregateValues(g.vals, aggregate), macrocycleId: g.macrocycleId, microcycle: g.microcycle, windowStart: g.windowStart }))
      .filter((p) => Number.isFinite(p.y))
      .sort((a, b) => a.x - b.x);
    return { ok: true, metric, unit: metaInfo.unit, series, rpeDependent, dateAligned: false };
  }

  // Case 4: Exercise- or session-scoped series
  if (scope.exercise || (scope.session !== undefined && scope.session !== null) || EXERCISE_ONLY_METRICS.has(metric)) {
    const filtered = dataset.exerciseMicrocycles.filter((em) => {
      if (scope.macrocycle && em.macrocycleId !== scope.macrocycle) return false;
      if (scope.session !== undefined && scope.session !== null && em.session !== Number(scope.session)) return false;
      if (scope.exercise && em.exerciseName !== scope.exercise) return false;
      return true;
    });
    const grouped = new Map();
    for (const row of filtered) {
      const key = grain === 'macrocycle' ? row.macrocycleId : `${row.macrocycleId}|${row.microcycle}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          x: grain === 'macrocycle' ? row.macrocycleOrder + 1 : row.timelineIndex,
          label: grain === 'macrocycle' ? row.macrocycleId : `${row.macrocycleId} MC${row.microcycle}`,
          macrocycleId: row.macrocycleId,
          microcycle: grain === 'macrocycle' ? null : row.microcycle,
          windowStart: row.windowStart,
          date: row.date,
          vals: [],
        });
      }
      if (Number.isFinite(row[metric])) grouped.get(key).vals.push(row[metric]);
    }
    const effAgg = metric === 'e1rm' || metric === 'topSetLoad' ? (spec.aggregate || 'max') : aggregate;
    const series = Array.from(grouped.values())
      .map((g) => ({ x: g.x, label: g.label, y: aggregateValues(g.vals, effAgg), macrocycleId: g.macrocycleId, microcycle: g.microcycle, windowStart: g.windowStart, date: g.date }))
      .filter((p) => Number.isFinite(p.y))
      .sort((a, b) => a.x - b.x);
    return { ok: true, metric, unit: metaInfo.unit, series, rpeDependent, dateAligned: false };
  }

  // Case 5: Macrocycle-wide series
  const filtered = dataset.microcycles.filter((mc) => !scope.macrocycle || mc.macrocycleId === scope.macrocycle);
  if (grain === 'macrocycle') {
    const grouped = new Map();
    for (const row of filtered) {
      if (!grouped.has(row.macrocycleId)) {
        grouped.set(row.macrocycleId, { x: row.macrocycleOrder + 1, label: row.macrocycleId, macrocycleId: row.macrocycleId, vals: [] });
      }
      if (Number.isFinite(row[metric])) grouped.get(row.macrocycleId).vals.push(row[metric]);
    }
    const series = Array.from(grouped.values())
      .map((g) => ({ x: g.x, label: g.label, y: aggregateValues(g.vals, spec.aggregate || 'mean'), macrocycleId: g.macrocycleId }))
      .filter((p) => Number.isFinite(p.y))
      .sort((a, b) => a.x - b.x);
    return { ok: true, metric, unit: metaInfo.unit, series, rpeDependent, dateAligned: false };
  }

  const series = filtered
    .filter((mc) => Number.isFinite(mc[metric]))
    .map((mc) => ({
      x: mc.timelineIndex,
      label: `${mc.macrocycleId} MC${mc.microcycle}`,
      y: mc[metric],
      macrocycleId: mc.macrocycleId,
      microcycle: mc.microcycle,
      windowStart: mc.windowStart,
    }))
    .sort((a, b) => a.x - b.x);

  return { ok: true, metric, unit: metaInfo.unit, series, rpeDependent, dateAligned: false };
}

/**
 * Aligns two resolved series by timelineIndex (x) or joins body-composition values on microcycles.
 */
export function alignTwoSeries(dataset, specX, specY, lag = 0) {
  const isBodyX = BODY_METRICS.has(specX?.metric);
  const isBodyY = BODY_METRICS.has(specY?.metric);
  const crossDomain = isBodyX !== isBodyY;

  const resX = resolveSeriesSpec(dataset, isBodyX && crossDomain ? { ...specX, alignToTraining: true } : specX);
  const resY = resolveSeriesSpec(dataset, isBodyY && crossDomain ? { ...specY, alignToTraining: true } : specY);
  if (!resX.ok) return { ok: false, side: 'x', ...resX };
  if (!resY.ok) return { ok: false, side: 'y', ...resY };

  const xSeries = resX.series || [];
  const ySeries = resY.series || [];
  const aligned = [];
  const yByX = new Map(ySeries.map((p) => [p.x, p]));

  for (const px of xSeries) {
    const py = yByX.get(px.x + lag);
    if (py && Number.isFinite(px.y) && Number.isFinite(py.y)) {
      aligned.push({
        x: px.y,
        y: py.y,
        t: px.x,
        labelX: px.label,
        labelY: py.label,
        macrocycleId: px.macrocycleId || py.macrocycleId || null,
      });
    }
  }

  return {
    ok: true,
    resX,
    resY,
    aligned,
    dateAligned: resX.dateAligned || resY.dateAligned,
  };
}

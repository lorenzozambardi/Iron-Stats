/**
 * Timeline alignment between microcycle-indexed macrocycles and dated body-composition logs.
 * Each line in a .md logbook is one microcycle (customizable duration in days via microcycleDays);
 * each .md file is one macrocycle. Body logs are joined by date window [windowStart, windowEnd].
 */

import { calcFatMass, calcLeanMass } from '../../profileUtils.js';
import { mean } from '../stats/descriptive.js';

export function addDaysISO(isoDate, days) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function toIsoWeekKey(isoDate) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dayNum = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((dt - yearStart) / 86400000 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function diffDaysISO(dateA, dateB) {
  const a = Date.parse(`${dateA}T00:00:00Z`);
  const b = Date.parse(`${dateB}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

export function buildBodySeries(logs = []) {
  const byDate = new Map();
  for (const entry of logs) {
    if (!entry || !entry.date || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) continue;
    const val = Number(entry.value);
    if (!Number.isFinite(val) || val <= 0) continue;
    if (!byDate.has(entry.date)) {
      byDate.set(entry.date, { date: entry.date, isoWeek: toIsoWeekKey(entry.date), weight: null, bodyFat: null, leanMass: null, fatMass: null });
    }
    const row = byDate.get(entry.date);
    if (entry.type === 'weight') row.weight = val;
    if (entry.type === 'bodyFat') row.bodyFat = val;
  }

  const daily = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));

  const weightDates = daily.filter((r) => r.weight !== null);
  const bfDates = daily.filter((r) => r.bodyFat !== null);

  for (const row of daily) {
    let w = row.weight;
    let bf = row.bodyFat;
    if (w !== null && bf === null && bfDates.length > 0) {
      let nearest = null;
      let bestDist = Infinity;
      for (const cand of bfDates) {
        const d = Math.abs(diffDaysISO(row.date, cand.date));
        if (d < bestDist) { bestDist = d; nearest = cand; }
      }
      if (nearest && bestDist <= 7) bf = nearest.bodyFat;
    } else if (bf !== null && w === null && weightDates.length > 0) {
      let nearest = null;
      let bestDist = Infinity;
      for (const cand of weightDates) {
        const d = Math.abs(diffDaysISO(row.date, cand.date));
        if (d < bestDist) { bestDist = d; nearest = cand; }
      }
      if (nearest && bestDist <= 7) w = nearest.weight;
    }
    if (w !== null && bf !== null) {
      row.leanMass = calcLeanMass(w, bf);
      row.fatMass = calcFatMass(w, bf);
    }
  }

  // Group standalone body logs into 7-day calendar buckets (for body-only trend analysis)
  const byBucket = new Map();
  for (const row of daily) {
    if (!byBucket.has(row.isoWeek)) {
      byBucket.set(row.isoWeek, { periodKey: row.isoWeek, startDate: row.date, weights: [], bodyFats: [], leanMasses: [], fatMasses: [] });
    }
    const bucket = byBucket.get(row.isoWeek);
    if (row.weight !== null) bucket.weights.push(row.weight);
    if (row.bodyFat !== null) bucket.bodyFats.push(row.bodyFat);
    if (row.leanMass !== null) bucket.leanMasses.push(row.leanMass);
    if (row.fatMass !== null) bucket.fatMasses.push(row.fatMass);
  }

  const periodBuckets = Array.from(byBucket.values())
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .map((b) => ({
      periodKey: b.periodKey,
      startDate: b.startDate,
      weight: b.weights.length > 0 ? mean(b.weights) : null,
      bodyFat: b.bodyFats.length > 0 ? mean(b.bodyFats) : null,
      leanMass: b.leanMasses.length > 0 ? mean(b.leanMasses) : null,
      fatMass: b.fatMasses.length > 0 ? mean(b.fatMasses) : null,
      nWeight: b.weights.length,
      nBodyFat: b.bodyFats.length,
    }));

  return { daily, periodBuckets };
}

/**
 * Aligns microcycles to date windows [windowStart, windowEnd]:
 * Priority 1: Exact per-session Dates: timestamps parsed from the .md logbook -> dateAlignment = 'exact'
 * Priority 2: Macrocycle startDate + microcycleDays from ProgramTimelineSheet -> dateAlignment = 'approximate'
 * Priority 3: Sequential index only -> dateAlignment = 'none'
 */
export function alignMacrocycleMicrocycles(microcycles, programMetaById, bodyDaily) {
  let globalIdx = 0;
  let overlappingMicrocycles = 0;
  let datedMicrocycles = 0;
  let exactDatedMicrocycles = 0;

  const aligned = microcycles.map((mc) => {
    globalIdx += 1;
    const meta = programMetaById.get(mc.macrocycleId);
    const startDate = meta?.startDate || null;
    const mcDays = meta?.microcycleDays || 7;

    const exactDates = Array.isArray(mc.sessionDates) ? mc.sessionDates.filter(Boolean).sort() : [];
    let windowStart = null;
    let windowEnd = null;
    let dateAlignment = 'none';

    if (exactDates.length > 0) {
      windowStart = exactDates[0];
      windowEnd = exactDates[exactDates.length - 1];
      dateAlignment = 'exact';
      exactDatedMicrocycles += 1;
      datedMicrocycles += 1;
    } else if (startDate) {
      windowStart = addDaysISO(startDate, (mc.microcycle - 1) * mcDays);
      windowEnd = addDaysISO(startDate, mc.microcycle * mcDays - 1);
      dateAlignment = 'approximate';
      datedMicrocycles += 1;
    }

    let bodyWeight = null;
    let bodyFat = null;
    let leanMass = null;
    let fatMass = null;

    if (windowStart && windowEnd && bodyDaily.length > 0) {
      // For exact single-day or narrow microcycle windows, allow +-1 day tolerance if no exact-day body log
      let inWindow = bodyDaily.filter((b) => b.date >= windowStart && b.date <= windowEnd);
      if (inWindow.length === 0 && dateAlignment === 'exact') {
        const padStart = addDaysISO(windowStart, -2);
        const padEnd = addDaysISO(windowEnd, 2);
        inWindow = bodyDaily.filter((b) => b.date >= padStart && b.date <= padEnd);
      }
      const ws = inWindow.map((b) => b.weight).filter(Number.isFinite);
      const bfs = inWindow.map((b) => b.bodyFat).filter(Number.isFinite);
      const lbms = inWindow.map((b) => b.leanMass).filter(Number.isFinite);
      const fms = inWindow.map((b) => b.fatMass).filter(Number.isFinite);
      if (ws.length > 0) bodyWeight = mean(ws);
      if (bfs.length > 0) bodyFat = mean(bfs);
      if (lbms.length > 0) leanMass = mean(lbms);
      if (fms.length > 0) fatMass = mean(fms);
      if (bodyWeight !== null || bodyFat !== null) overlappingMicrocycles += 1;
    }

    return {
      ...mc,
      timelineIndex: globalIdx,
      microcycleDays: mcDays,
      windowStart,
      windowEnd,
      dateAlignment,
      bodyWeight,
      bodyFat,
      leanMass,
      fatMass,
    };
  });

  return {
    microcycles: aligned,
    overlappingBodyMicrocycles: overlappingMicrocycles,
    datedMicrocycles,
    exactDatedMicrocycles,
  };
}

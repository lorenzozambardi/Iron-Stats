/**
 * Timeline alignment between week-indexed training programs and dated body-composition logs.
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

function diffDays(dateA, dateB) {
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

  // Derive leanMass and fatMass when both weight & BF are logged on the same day or within 7 days
  const weightDates = daily.filter((r) => r.weight !== null);
  const bfDates = daily.filter((r) => r.bodyFat !== null);

  for (const row of daily) {
    let w = row.weight;
    let bf = row.bodyFat;
    if (w !== null && bf === null && bfDates.length > 0) {
      let nearest = null;
      let bestDist = Infinity;
      for (const cand of bfDates) {
        const d = Math.abs(diffDays(row.date, cand.date));
        if (d < bestDist) { bestDist = d; nearest = cand; }
      }
      if (nearest && bestDist <= 7) bf = nearest.bodyFat;
    } else if (bf !== null && w === null && weightDates.length > 0) {
      let nearest = null;
      let bestDist = Infinity;
      for (const cand of weightDates) {
        const d = Math.abs(diffDays(row.date, cand.date));
        if (d < bestDist) { bestDist = d; nearest = cand; }
      }
      if (nearest && bestDist <= 7) w = nearest.weight;
    }
    if (w !== null && bf !== null) {
      row.leanMass = calcLeanMass(w, bf);
      row.fatMass = calcFatMass(w, bf);
    }
  }

  // Group into ISO weekly means
  const byWeek = new Map();
  for (const row of daily) {
    if (!byWeek.has(row.isoWeek)) {
      byWeek.set(row.isoWeek, { isoWeek: row.isoWeek, startDate: row.date, weights: [], bodyFats: [], leanMasses: [], fatMasses: [] });
    }
    const bucket = byWeek.get(row.isoWeek);
    if (row.weight !== null) bucket.weights.push(row.weight);
    if (row.bodyFat !== null) bucket.bodyFats.push(row.bodyFat);
    if (row.leanMass !== null) bucket.leanMasses.push(row.leanMass);
    if (row.fatMass !== null) bucket.fatMasses.push(row.fatMass);
  }

  const weekly = Array.from(byWeek.values())
    .sort((a, b) => a.isoWeek.localeCompare(b.isoWeek))
    .map((b) => ({
      isoWeek: b.isoWeek,
      startDate: b.startDate,
      weight: b.weights.length > 0 ? mean(b.weights) : null,
      bodyFat: b.bodyFats.length > 0 ? mean(b.bodyFats) : null,
      leanMass: b.leanMasses.length > 0 ? mean(b.leanMasses) : null,
      fatMass: b.fatMasses.length > 0 ? mean(b.fatMasses) : null,
      nWeight: b.weights.length,
      nBodyFat: b.bodyFats.length,
    }));

  return { daily, weekly };
}

export function alignProgramWeeks(programWeeks, programMetaById, bodyWeekly) {
  const bodyByIsoWeek = new Map(bodyWeekly.map((w) => [w.isoWeek, w]));
  let globalIdx = 0;
  let overlappingWeeks = 0;
  let datedWeeks = 0;

  const aligned = programWeeks.map((pw) => {
    globalIdx += 1;
    const meta = programMetaById.get(pw.programId);
    const startDate = meta?.startDate || null;
    const approxDate = startDate ? addDaysISO(startDate, 7 * (pw.week - 1)) : null;
    const isoWeek = approxDate ? toIsoWeekKey(approxDate) : null;
    if (isoWeek) datedWeeks += 1;

    const matchedBody = isoWeek ? bodyByIsoWeek.get(isoWeek) || null : null;
    if (matchedBody && (matchedBody.weight !== null || matchedBody.bodyFat !== null)) {
      overlappingWeeks += 1;
    }

    return {
      ...pw,
      timelineIndex: globalIdx,
      approxDate,
      isoWeek,
      dateAlignment: isoWeek ? 'approximate' : 'none',
      bodyWeight: matchedBody ? matchedBody.weight : null,
      bodyFat: matchedBody ? matchedBody.bodyFat : null,
      leanMass: matchedBody ? matchedBody.leanMass : null,
      fatMass: matchedBody ? matchedBody.fatMass : null,
    };
  });

  return {
    programWeeks: aligned,
    overlappingBodyWeeks: overlappingWeeks,
    datedWeeks,
  };
}

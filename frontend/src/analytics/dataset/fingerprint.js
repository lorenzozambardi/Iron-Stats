/**
 * Deterministic canonical fingerprinting and diff summaries for report cache invalidation.
 */

import { REPORT_SCHEMA_VERSION, SKILL_VERSION, TOOLS_VERSION } from '../versions.js';

function canonicalStringify(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'null';
    return String(Math.round(value * 1e6) / 1e6);
  }
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(value[k])}`).join(',')}}`;
}

// Double-width FNV-1a 64-bit hash (two 32-bit lanes) — deterministic in Node & Browser
export function hashString(str) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= (c + i) & 0xff;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  const p1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const p2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `${p1}${p2}`;
}

export function computeDatasetFingerprint({
  programs = [],
  programWeeks = [],
  setsCount = 0,
  body = [],
  snapshot = {},
  programMeta = [],
  skillVersion = SKILL_VERSION,
  toolsVersion = TOOLS_VERSION,
  schemaVersion = REPORT_SCHEMA_VERSION,
}) {
  const payload = {
    v: { skillVersion, toolsVersion, schemaVersion },
    programs: programs.map((p) => ({
      id: p.id,
      order: p.order,
      excluded: p.excluded,
      startDate: p.startDate,
      nWeeks: p.nWeeks,
      nSets: p.nSets,
      totalTonnage: p.totalTonnage,
      totalFatigue: p.totalFatigue,
      rpeLoggedFraction: p.rpeLoggedFraction,
    })),
    programWeeks: programWeeks.map((w) => [w.programId, w.week, w.sets, w.tonnage, w.effectiveReps, w.fatigue]),
    setsCount,
    body: body.map((b) => [b.date, b.weight, b.bodyFat]),
    snapshot: snapshot.isDefaultUnverified ? null : {
      weight: snapshot.weight,
      height: snapshot.height,
      bodyFat: snapshot.bodyFat,
      waist: snapshot.waist,
      shoulders: snapshot.shoulders,
      chest: snapshot.chest,
      avgSteps: snapshot.avgSteps,
    },
    meta: programMeta.map((m) => [m.id, m.order, m.startDate, m.excluded, m.variantOf]),
  };
  return hashString(canonicalStringify(payload));
}

export function diffDatasetSummaries(prevSummary, curSummary) {
  if (!prevSummary || !curSummary) return [];
  const changes = [];

  const prevProgs = new Map((prevSummary.programWeeksByProgram || []).map((p) => [p.id, p.nWeeks]));
  const curProgs = new Map((curSummary.programWeeksByProgram || []).map((p) => [p.id, p.nWeeks]));

  for (const [id, curW] of curProgs.entries()) {
    if (!prevProgs.has(id)) {
      changes.push(`New program ${id} (${curW} weeks)`);
    } else {
      const diff = curW - prevProgs.get(id);
      if (diff > 0) changes.push(`+${diff} week${diff === 1 ? '' : 's'} in ${id}`);
      else if (diff < 0) changes.push(`${diff} week${diff === -1 ? '' : 's'} in ${id}`);
    }
  }
  for (const id of prevProgs.keys()) {
    if (!curProgs.has(id)) changes.push(`Removed/excluded ${id}`);
  }

  const weightDiff = (curSummary.nWeightLogs || 0) - (prevSummary.nWeightLogs || 0);
  if (weightDiff > 0) changes.push(`+${weightDiff} weight log${weightDiff === 1 ? '' : 's'}`);

  const bfDiff = (curSummary.nBodyFatLogs || 0) - (prevSummary.nBodyFatLogs || 0);
  if (bfDiff > 0) changes.push(`+${bfDiff} body-fat log${bfDiff === 1 ? '' : 's'}`);

  if (changes.length === 0 && prevSummary.fingerprint !== curSummary.fingerprint) {
    changes.push('Training logs, timeline settings, or profile updated');
  }
  return changes;
}

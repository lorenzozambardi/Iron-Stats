/**
 * Program ordering, variant detection, exclusion flags, and optional start dates.
 */

export const PROGRAM_META_STORAGE_KEY = 'iron_stats_analytics_program_meta_v1';

const SM_PATTERN = /^S(\d+)M(\d+)(.*)$/i;

export function parseProgramNameParts(id) {
  const clean = String(id || '').trim();
  const match = clean.match(SM_PATTERN);
  const isFailedBlock = /\bfail\b|\(fail/i.test(clean);
  if (!match) {
    return {
      id: clean,
      hasPattern: false,
      season: Number.MAX_SAFE_INTEGER,
      mesocycle: Number.MAX_SAFE_INTEGER,
      suffix: clean,
      baseId: null,
      variantOf: null,
      isFailedBlock,
    };
  }
  const season = parseInt(match[1], 10);
  const mesocycle = parseInt(match[2], 10);
  const suffix = (match[3] || '').trim();
  const baseId = `S${season}M${mesocycle}`;
  const isVariant = suffix.length > 0;
  return {
    id: clean,
    hasPattern: true,
    season,
    mesocycle,
    suffix,
    baseId,
    variantOf: isVariant ? baseId : null,
    isFailedBlock,
  };
}

function suffixRank(suffix) {
  if (!suffix) return 0;
  const wMatch = suffix.match(/^W(\d+)$/i);
  if (wMatch) return 10 + parseInt(wMatch[1], 10);
  const parenNum = suffix.match(/^\((\d+)\)$/);
  if (parenNum) return 100 + parseInt(parenNum[1], 10);
  if (/fail/i.test(suffix)) return 500;
  return 200;
}

export function inferProgramMetadata(programIds) {
  const existingSet = new Set(programIds);
  const parsed = programIds.map(parseProgramNameParts);
  parsed.sort((a, b) => {
    if (a.hasPattern !== b.hasPattern) return a.hasPattern ? -1 : 1;
    if (a.season !== b.season) return a.season - b.season;
    if (a.mesocycle !== b.mesocycle) return a.mesocycle - b.mesocycle;
    const sr = suffixRank(a.suffix) - suffixRank(b.suffix);
    if (sr !== 0) return sr;
    return a.id.localeCompare(b.id);
  });

  const meta = {};
  parsed.forEach((p, idx) => {
    const variantTarget = p.variantOf && existingSet.has(p.variantOf) ? p.variantOf : (p.variantOf || null);
    meta[p.id] = {
      id: p.id,
      label: p.id,
      order: idx,
      startDate: null,
      microcycleDays: 7,
      excluded: false,
      variantOf: variantTarget,
      isFailedBlock: p.isFailedBlock,
    };
  });
  return meta;
}

export function mergeProgramMeta(programIds, savedMeta = {}) {
  const inferred = inferProgramMetadata(programIds);
  const merged = programIds.map((id) => {
    const base = inferred[id];
    const saved = savedMeta && savedMeta[id] ? savedMeta[id] : {};
    const parsedDays = Number(saved.microcycleDays);
    const microcycleDays =
      Number.isFinite(parsedDays) && parsedDays >= 2 && parsedDays <= 28
        ? Math.round(parsedDays)
        : base.microcycleDays;
    return {
      id,
      label: typeof saved.label === 'string' && saved.label.trim() ? saved.label.trim() : base.label,
      order: Number.isFinite(Number(saved.order)) ? Number(saved.order) : base.order,
      startDate: typeof saved.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(saved.startDate)
        ? saved.startDate
        : null,
      microcycleDays,
      excluded: Boolean(saved.excluded),
      variantOf: saved.variantOf !== undefined ? saved.variantOf : base.variantOf,
      isFailedBlock: saved.isFailedBlock !== undefined ? Boolean(saved.isFailedBlock) : base.isFailedBlock,
    };
  });
  merged.sort((a, b) => (a.order - b.order) || a.id.localeCompare(b.id));
  return merged.map((item, idx) => ({ ...item, order: idx }));
}

export function loadProgramMeta() {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(PROGRAM_META_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveProgramMeta(metaMap) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(PROGRAM_META_STORAGE_KEY, JSON.stringify(metaMap || {}));
  } catch {
    // Ignore storage quota errors
  }
}

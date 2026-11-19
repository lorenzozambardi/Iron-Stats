import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import defaultExercises from '../defaultExercises.json';
import { calculateMetrics } from '../parser.js';
import { DEFAULT_PROFILE } from '../profileUtils.js';
import { inferProgramMetadata, mergeProgramMeta } from '../analytics/dataset/programMeta.js';
import { parseLogbookWithWarnings } from '../analytics/dataset/loadAllPrograms.js';
import { buildAnalyticsDataset } from '../analytics/dataset/buildAnalyticsDataset.js';
import { diffDatasetSummaries } from '../analytics/dataset/fingerprint.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logbooksDir = path.resolve(__dirname, '../../../logbooks');

function loadRealLogbooks() {
  const files = fs.readdirSync(logbooksDir).filter((f) => f.endsWith('.md'));
  return files.map((file) => {
    const id = path.basename(file, '.md');
    const rawText = fs.readFileSync(path.join(logbooksDir, file), 'utf-8');
    const { workoutData, parseWarnings } = parseLogbookWithWarnings(rawText, defaultExercises);
    return { id, rawText, workoutData, parseWarnings };
  });
}

describe('analytics/dataset', () => {
  it('infers chronological order and variants from S{n}M{m} program names', () => {
    const ids = ['S3M3', 'S2M1(2)', 'S1M2', 'S3M2(fail1)', 'S1M1', 'S2M2W2', 'S2M2W1', 'S2M1', 'S3M2'];
    const merged = mergeProgramMeta(ids, {});
    const orderedIds = merged.map((m) => m.id);
    expect(orderedIds.indexOf('S1M1')).toBeLessThan(orderedIds.indexOf('S1M2'));
    expect(orderedIds.indexOf('S2M1')).toBeLessThan(orderedIds.indexOf('S2M1(2)'));
    expect(orderedIds.indexOf('S2M2W1')).toBeLessThan(orderedIds.indexOf('S2M2W2'));
    expect(orderedIds.indexOf('S3M2')).toBeLessThan(orderedIds.indexOf('S3M2(fail1)'));
    expect(orderedIds.indexOf('S3M2(fail1)')).toBeLessThan(orderedIds.indexOf('S3M3'));

    const inferred = inferProgramMetadata(ids);
    expect(inferred['S3M2(fail1)'].isFailedBlock).toBe(true);
    expect(inferred['S3M2(fail1)'].variantOf).toBe('S3M2');
    expect(inferred['S2M1(2)'].variantOf).toBe('S2M1');
  });

  it('builds dataset from real logbooks with exact metric parity against calculateMetrics', () => {
    const loaded = loadRealLogbooks();
    expect(loaded.length).toBeGreaterThan(5);

    const ds = buildAnalyticsDataset({
      loadedPrograms: loaded,
      profile: DEFAULT_PROFILE,
      savedProgramMeta: {},
    });

    expect(ds.capabilities.ready).toBe(true);
    expect(ds.capabilities.canAnalyzeProgression).toBe(true);
    expect(ds.capabilities.canCrossProgram).toBe(true);
    expect(ds.snapshot.isDefaultUnverified).toBe(true);
    expect(ds.qualityFlags.some((f) => f.code === 'profile_defaults_unverified')).toBe(true);

    // Exact parity check on S3M3 totals vs parser.js calculateMetrics
    const s3m3 = loaded.find((p) => p.id === 'S3M3');
    expect(s3m3).toBeDefined();
    const refRows = calculateMetrics(s3m3.workoutData, null, null, null, null);
    const refTonnage = refRows.reduce((s, r) => s + r.tonnage, 0);
    const refFatigue = refRows.reduce((s, r) => s + r.fatigue, 0);
    const refEffReps = refRows.reduce((s, r) => s + r.effectiveReps, 0);

    const dsWeeks = ds.programWeeks.filter((w) => w.programId === 'S3M3');
    const dsTonnage = dsWeeks.reduce((s, w) => s + w.tonnage, 0);
    const dsFatigue = dsWeeks.reduce((s, w) => s + w.fatigue, 0);
    const dsEffReps = dsWeeks.reduce((s, w) => s + w.effectiveReps, 0);

    expect(dsTonnage).toBeCloseTo(refTonnage, 4);
    expect(dsFatigue).toBeCloseTo(refFatigue, 4);
    expect(dsEffReps).toBeCloseTo(refEffReps, 4);

    // Fingerprint determinism
    const ds2 = buildAnalyticsDataset({
      loadedPrograms: loaded,
      profile: DEFAULT_PROFILE,
      savedProgramMeta: {},
    });
    expect(ds2.fingerprint).toBe(ds.fingerprint);
  });

  it('aligns body logs with dated programs and enables body-comp joining', () => {
    const loaded = loadRealLogbooks().filter((p) => p.id === 'S3M3');
    const customProfile = {
      current: { ...DEFAULT_PROFILE.current, weight: 81.2, bodyFat: 12.4 },
      logs: [
        { id: '1', date: '2026-01-05', type: 'weight', value: 80.0 },
        { id: '2', date: '2026-01-05', type: 'bodyFat', value: 13.0 },
        { id: '3', date: '2026-01-12', type: 'weight', value: 80.3 },
        { id: '4', date: '2026-01-19', type: 'weight', value: 80.6 },
        { id: '5', date: '2026-01-26', type: 'weight', value: 80.9 },
        { id: '6', date: '2026-02-02', type: 'weight', value: 81.0 },
        { id: '7', date: '2026-02-09', type: 'weight', value: 81.2 },
        { id: '8', date: '2026-02-09', type: 'bodyFat', value: 12.6 },
      ],
    };

    const ds = buildAnalyticsDataset({
      loadedPrograms: loaded,
      profile: customProfile,
      savedProgramMeta: { S3M3: { startDate: '2026-01-05' } },
    });

    expect(ds.snapshot.isDefaultUnverified).toBe(false);
    expect(ds.capabilities.canJoinBodyComp).toBe(true);
    expect(ds.capabilities.overlappingBodyWeeks).toBeGreaterThanOrEqual(6);
    expect(ds.capabilities.dateAlignment).toBe('approximate');
    expect(ds.programWeeks[0].bodyWeight).toBeCloseTo(80.0, 2);
    expect(ds.programWeeks[0].leanMass).toBeCloseTo(80.0 * 0.87, 2);

    // Exclude program removes it from programWeeks and changes fingerprint
    const dsExcl = buildAnalyticsDataset({
      loadedPrograms: loaded,
      profile: customProfile,
      savedProgramMeta: { S3M3: { startDate: '2026-01-05', excluded: true } },
    });
    expect(dsExcl.programWeeks.length).toBe(0);
    expect(dsExcl.fingerprint).not.toBe(ds.fingerprint);

    const diff = diffDatasetSummaries(dsExcl.summary, ds.summary);
    expect(diff.some((d) => d.includes('New program S3M3'))).toBe(true);
  });

  it('blocks sparse datasets with clear reasons', () => {
    const tiny = parseLogbookWithWarnings("# 1\nLat Machine | 2'\n80.. 10, 8\n", defaultExercises);
    const ds = buildAnalyticsDataset({
      loadedPrograms: [{ id: 'Tiny', rawText: '', ...tiny }],
      profile: DEFAULT_PROFILE,
      savedProgramMeta: {},
    });
    expect(ds.capabilities.ready).toBe(false);
    expect(ds.capabilities.blockingReasons.length).toBeGreaterThan(0);
  });
});

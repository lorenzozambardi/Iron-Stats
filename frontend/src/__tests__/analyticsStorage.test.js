import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearAllReports,
  clearCheckpoint,
  deleteReport,
  formatReportAsMarkdown,
  getLatestReport,
  getReport,
  listReports,
  loadCheckpoint,
  saveCheckpoint,
  saveReport,
} from '../analytics/storage/reportStore.js';
import { computeKeyConsentHash, resolveReportLanguage } from '../analytics/storage/analyticsSettings.js';

describe('analytics/storage', () => {
  beforeEach(async () => {
    await clearAllReports();
    await clearCheckpoint();
  });

  it('persists, lists, retrieves, and deletes reports and checkpoints', async () => {
    const r1 = {
      id: 'run_1',
      generatedAt: '2026-11-18T10:00:00.000Z',
      datasetFingerprint: 'abc123',
      depth: 'quick',
      model: 'deepseek-chat',
      dataQuality: { grade: 'B' },
      summary: { headline: 'Block progressed +{{E1.slope|1}} kg', keyTakeaways: ['Takeaway 1'] },
      insights: [
        {
          id: 'i1',
          category: 'progression',
          title: 'Progress',
          finding: 'Slope {{E1.slope|2}}',
          interpretation: 'Good.',
          evidence: ['E1'],
          confidence: 'medium',
        },
      ],
      bottlenecks: [],
      rejectedHypotheses: [],
      limitations: ['No RPE'],
      evidenceLedger: { E1: { id: 'E1', data: { slope: 1.5 } } },
    };

    await saveReport(r1);
    const list = await listReports();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe('run_1');

    const loaded = await getReport('run_1');
    expect(loaded.summary.headline).toContain('E1.slope');

    const latest = await getLatestReport();
    expect(latest.id).toBe('run_1');

    const md = formatReportAsMarkdown(loaded);
    expect(md).toContain('+1.5 kg');
    expect(md).toContain('Slope 1.50');

    await saveCheckpoint({ runId: 'cp_1', phase: 'explore' });
    const cp = await loadCheckpoint();
    expect(cp.runId).toBe('cp_1');

    await deleteReport('run_1');
    expect((await listReports()).length).toBe(0);
  });

  it('computes deterministic consent hashes and resolves report language', () => {
    expect(computeKeyConsentHash('sk-abc')).toBe(computeKeyConsentHash('sk-abc'));
    expect(computeKeyConsentHash('sk-abc')).not.toBe(computeKeyConsentHash('sk-def'));
    expect(resolveReportLanguage('Italian')).toBe('Italian');
    expect(resolveReportLanguage('en')).toBe('en');
  });
});

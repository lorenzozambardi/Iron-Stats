import { describe, it, expect } from 'vitest';
import { EvidenceLedger } from '../analytics/grounding/evidenceLedger.js';
import { clampConfidence, gradeConfidence } from '../analytics/grounding/confidence.js';
import { finalizeWithFallback, validateReport } from '../analytics/grounding/reportValidator.js';

const mockDataset = {
  entities: {
    programs: ['S1M1', 'S1M2'],
    allPrograms: ['S1M1', 'S1M2'],
    exercises: ['Lat Machine', 'Flat DB Bench'],
    macros: ['Back', 'Chest'],
    subMuscles: ['Latissimus Dorsi', 'Sternal Head'],
    sessions: [1, 2],
  },
  capabilities: {
    canAnalyzeProgression: true,
    canCrossProgram: true,
    rpeQuality: 'assumed',
    dateAlignment: 'none',
  },
  qualityFlags: [{ code: 'rpe_assumed_default', severity: 'warning', message: 'RPE defaulted to 9.0.' }],
  snapshot: { isDefaultUnverified: true },
};

function makeSeededLedger() {
  const ledger = new EvidenceLedger(0.1);
  ledger.record({
    toolName: 'get_exercise_progression',
    args: { exercise: 'Lat Machine' },
    data: {
      exercise: 'Lat Machine',
      n: 12,
      firstVal: 100,
      lastVal: 118.5,
      slope: 1.65,
      ciLower: 0.9,
      ciUpper: 2.3,
      series: [{ x: 1, y: 100 }, { x: 2, y: 105 }],
    },
    n: 12,
  });
  ledger.record({
    toolName: 'test_relationship',
    args: { x: { metric: 'sets' }, y: { metric: 'e1rm' } },
    data: {
      n: 14,
      rho: 0.52,
      r: 0.52,
      pValue: 0.02,
      sessionQValue: 0.04,
      ciLower: 0.12,
      ciUpper: 0.78,
      autocorrelationWarning: false,
      points: [{ x: 1, y: 2 }, { x: 2, y: 4 }],
    },
    n: 14,
    rpeDependent: false,
  });
  return ledger;
}

function makeValidReport() {
  return {
    summary: {
      headline: 'Lat Machine progressed consistently at {{E1.slope|2}} kg per exposure.',
      keyTakeaways: [
        'Lat Machine e1RM rose from {{E1.firstVal|1}} kg to {{E1.lastVal|1}} kg.',
        'Weekly set volume is positively associated with next-week e1RM (rho = {{E2.rho|2}}).',
        'RPE was mostly defaulted to 9.0 so fatigue-derived ratios remain model-assumed.',
      ],
    },
    insights: [
      {
        id: 'ins-1',
        category: 'progression',
        title: 'Consistent Lat Machine Overload',
        finding: 'Lat Machine e1RM climbed from {{E1.firstVal|1}} kg to {{E1.lastVal|1}} kg (+{{E1.slope|2}} kg/exposure).',
        interpretation: 'Steady linear overload across 12 exposures indicates productive mechanical tension.',
        evidence: ['E1'],
        confidence: 'high',
        chart: { type: 'line', evidenceId: 'E1', x: 'x', y: 'y' },
        recommendation: {
          action: 'Maintain current progression model on Lat Machine.',
          rationale: 'Positive slope with CI strictly above zero.',
          successMetric: { description: 'Continue e1RM slope above 0', metric: 'e1rm', scope: { exercise: 'Lat Machine' } },
        },
      },
      {
        id: 'ins-2',
        category: 'correlation',
        title: 'Volume Co-Occurs With Strength Gains',
        finding: 'Detrended weekly sets are associated with e1RM (rho = {{E2.rho|2}}, q = {{E2.sessionQValue|2}}).',
        interpretation: 'Higher volume blocks co-occur with stronger subsequent performance.',
        evidence: ['E2'],
        confidence: 'high', // Model tries to upgrade -> should be clamped to medium (n=14 < 16)
        chart: { type: 'scatter', evidenceId: 'E2', x: 'x', y: 'y' },
      },
    ],
    bottlenecks: [],
    rejectedHypotheses: [],
    limitations: ['Missing RPE defaults to 9.0.'],
  };
}

describe('analytics/grounding validation & confidence', () => {
  it('accepts a grounded report and clamps over-confident grades deterministically', () => {
    const ledger = makeSeededLedger();
    const res = validateReport(makeValidReport(), ledger, mockDataset);
    expect(res.valid).toBe(true);
    expect(res.errors).toEqual([]);
    // E1 has n=12 and CI > 0 -> high; E2 has n=14 (<16) -> medium (model's "high" clamped down!)
    expect(res.normalizedReport.insights[0].confidence).toBe('high');
    expect(res.normalizedReport.insights[1].confidence).toBe('medium');
    expect(res.normalizedReport.dataQuality.grade).toBe('C');
  });

  it('rejects fabricated numeric literals, unknown evidence IDs, causal language, and bad entities', () => {
    const ledger = makeSeededLedger();
    const bad = makeValidReport();
    bad.insights[0].finding = 'Lat Machine increased by 47.3 kg over the block.'; // Fabricated number!
    bad.insights[1].finding = 'Higher volume directly causes e1RM to rise with rho = {{E2.rho|2}}.'; // Causal language!
    bad.insights[1].evidence = ['E2', 'E99']; // Unknown ID!
    bad.insights[0].recommendation.successMetric.scope.exercise = 'Hallucinated Curl'; // Unknown entity!

    const res = validateReport(bad, ledger, mockDataset);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes('ungrounded numeric literal "47.3"'))).toBe(true);
    expect(res.errors.some((e) => e.includes('unknown evidence ID "E99"'))).toBe(true);
    expect(res.errors.some((e) => e.includes('causal language'))).toBe(true);
    expect(res.errors.some((e) => e.includes('unknown exercise "Hallucinated Curl"'))).toBe(true);
  });

  it('drops unverifiable insights on fallback and fails if none remain', () => {
    const ledger = makeSeededLedger();
    const partial = makeValidReport();
    partial.insights[1].finding = 'Unverified 999.9 gain.';
    const fb = finalizeWithFallback(partial, ledger, mockDataset);
    expect(fb.ok).toBe(true);
    expect(fb.partial).toBe(true);
    expect(fb.report.insights.length).toBe(1);
    expect(fb.removedDuringVerification.length).toBe(1);

    const allBad = makeValidReport();
    allBad.insights[0].finding = 'Fabricated 888.8 number.';
    allBad.insights[1].finding = 'Fabricated 777.7 number.';
    const fbFail = finalizeWithFallback(allBad, ledger, mockDataset);
    expect(fbFail.ok).toBe(false);
    expect(fbFail.report).toBeNull();
  });

  it('downgrades RPE-dependent confidence when RPE is assumed', () => {
    const ledger = makeSeededLedger();
    const rpeEntry = ledger.record({
      toolName: 'get_metric_series',
      args: { metric: 'fatigue' },
      data: { n: 12, slope: 2.0, ciLower: 0.5, ciUpper: 3.5 },
      n: 12,
      rpeDependent: true,
    });
    expect(gradeConfidence([rpeEntry], { rpeQuality: 'logged' })).toBe('high');
    expect(gradeConfidence([rpeEntry], { rpeQuality: 'assumed' })).toBe('medium');
    expect(clampConfidence('low', 'high')).toBe('low');
    expect(clampConfidence('high', 'low')).toBe('low');
  });
});

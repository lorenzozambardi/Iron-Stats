import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import defaultExercises from '../defaultExercises.json';
import { DEFAULT_PROFILE } from '../profileUtils.js';
import { parseLogbookWithWarnings } from '../analytics/dataset/loadAllPrograms.js';
import { buildAnalyticsDataset } from '../analytics/dataset/buildAnalyticsDataset.js';
import { EvidenceLedger } from '../analytics/grounding/evidenceLedger.js';
import { executeTool, getOpenAITools } from '../analytics/tools/registry.js';
import { evaluateLedgerExpression } from '../analytics/tools/calculator.js';
import { DEFAULT_OUTPUT_CHAR_BUDGET } from '../analytics/tools/formatResult.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logbooksDir = path.resolve(__dirname, '../../../logbooks');

function buildRealDataset() {
  const files = fs.readdirSync(logbooksDir).filter((f) => f.endsWith('.md'));
  const loaded = files.map((file) => {
    const id = path.basename(file, '.md');
    const rawText = fs.readFileSync(path.join(logbooksDir, file), 'utf-8');
    return { id, rawText, ...parseLogbookWithWarnings(rawText, defaultExercises) };
  });
  return buildAnalyticsDataset({ loadedPrograms: loaded, profile: DEFAULT_PROFILE });
}

describe('analytics/tools & calculator', () => {
  const dataset = buildRealDataset();

  it('exposes all 17 OpenAI-compatible tool definitions', () => {
    const tools = getOpenAITools();
    expect(tools.length).toBe(17);
    expect(tools.some((t) => t.function.name === 'submit_report')).toBe(true);
    expect(tools.some((t) => t.function.name === 'test_relationship')).toBe(true);
  });

  it('executes core analytical tools within output budget and deduplicates repeated calls', () => {
    const ledger = new EvidenceLedger();

    const r1 = executeTool('get_dataset_overview', {}, dataset, ledger);
    expect(r1.ok).toBe(true);
    expect(r1.evidenceId).toBe('E1');
    expect(r1.formatted.length).toBeLessThanOrEqual(DEFAULT_OUTPUT_CHAR_BUDGET);

    // Duplicate call returns cached E1 without adding a new ledger entry
    const r1Dup = executeTool('get_dataset_overview', {}, dataset, ledger);
    expect(r1Dup.duplicate).toBe(true);
    expect(r1Dup.evidenceId).toBe('E1');
    expect(ledger.entries.length).toBe(1);

    const topEx = r1.data.topExercises[0].name;
    const prog = executeTool('get_exercise_progression', { exercise: topEx, measure: 'e1rm' }, dataset, ledger);
    expect(prog.ok).toBe(true);
    expect(prog.data.n).toBeGreaterThanOrEqual(3);
    expect(prog.formatted.length).toBeLessThanOrEqual(DEFAULT_OUTPUT_CHAR_BUDGET);

    const dist = executeTool('get_muscle_distribution', { metric: 'sets', level: 'macro' }, dataset, ledger);
    expect(dist.ok).toBe(true);
    expect(dist.data.distribution.length).toBeGreaterThan(0);

    const bneck = executeTool('rank_bottlenecks', {}, dataset, ledger);
    expect(bneck.ok).toBe(true);
    expect(Array.isArray(bneck.data.bottlenecks)).toBe(true);

    const hyp = executeTool('register_hypothesis', { statement: 'Higher total sets relate to e1RM next week' }, dataset, ledger);
    expect(hyp.ok).toBe(true);
    expect(hyp.data.hypothesisId).toBe('H1');

    const scan = executeTool('scan_relationships', { family: 'volume->strength', maxResults: 5 }, dataset, ledger);
    expect(scan.ok).toBe(true);
    expect(scan.data.pairsScreened).toBeGreaterThan(0);
    // Every screened pair counted toward session multiplicity
    expect(ledger.tests.length).toBe(scan.data.pairsScreened);

    const testRel = executeTool(
      'test_relationship',
      {
        hypothesisId: 'H1',
        x: { metric: 'sets' },
        y: { metric: 'e1rm', scope: { exercise: topEx } },
        lag: 1,
        detrend: true,
      },
      dataset,
      ledger
    );
    expect(testRel.ok).toBe(true);
    if (testRel.data.status === 'ok') {
      expect(testRel.data.sessionTestsTotal).toBe(scan.data.pairsScreened + 1);
      expect(Number.isFinite(testRel.data.sessionQValue)).toBe(true);
    }

    const setsDet = executeTool('get_set_details', { exercise: topEx, limit: 10 }, dataset, ledger);
    expect(setsDet.ok).toBe(true);
    expect(setsDet.data.sets.length).toBeLessThanOrEqual(10);

    const ref = executeTool('lookup_reference', { topic: 'sfr' }, dataset, ledger);
    expect(ref.ok).toBe(true);
    expect(ref.data.title).toContain('Stimulus-to-Fatigue');
  });

  it('returns structured unavailable responses when data cannot support a query', () => {
    const ledger = new EvidenceLedger();
    const bc = executeTool('get_body_composition', { measure: 'weight' }, dataset, ledger);
    expect(bc.ok).toBe(true);
    expect(bc.data.status).toBe('unavailable');

    const badEx = executeTool('get_exercise_progression', { exercise: 'NonExistentLift' }, dataset, ledger);
    expect(badEx.ok).toBe(false);
    expect(badEx.error).toContain('Unknown exercise');
  });

  it('evaluates safe arithmetic over ledger refs and rejects code injection', () => {
    const ledger = new EvidenceLedger();
    ledger.record({ toolName: 'mock', args: {}, data: { a: 100, b: 125 } });

    const r1 = evaluateLedgerExpression('pct(E1.a, E1.b)', ledger);
    expect(r1.value).toBeCloseTo(25, 6);

    const r2 = evaluateLedgerExpression('(E1.b - E1.a) / 2 + min(10, 4)', ledger);
    expect(r2.value).toBeCloseTo(16.5, 6);

    expect(() => evaluateLedgerExpression('process.exit(1)', ledger)).toThrow();
    expect(() => evaluateLedgerExpression('(() => 1)()', ledger)).toThrow();
    expect(() => evaluateLedgerExpression('E1.a / 0', ledger)).toThrow('Division by zero');
  });
});

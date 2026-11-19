import { describe, it, expect } from 'vitest';
import defaultExercises from '../defaultExercises.json';
import { DEFAULT_PROFILE } from '../profileUtils.js';
import { parseLogbookWithWarnings } from '../analytics/dataset/loadAllPrograms.js';
import { buildAnalyticsDataset } from '../analytics/dataset/buildAnalyticsDataset.js';
import { runAnalyticsAgent } from '../analytics/agent/agentLoop.js';
import { createChatCompletion, sanitizeOutgoingMessages } from '../analytics/agent/deepseekClient.js';
import { deepseekRequest, TransportError } from '../analytics/agent/transport.js';
import { buildSystemPrompt } from '../analytics/agent/buildSkillPrompt.js';
import { executeTool } from '../analytics/tools/registry.js';
import { EvidenceLedger } from '../analytics/grounding/evidenceLedger.js';

function makeSyntheticLogbook(loadsAndReps) {
  const lines = ['# 1', "Lat Machine | 3' | 1-0-2-0", ...loadsAndReps];
  return lines.join('\n');
}

function makeTestDataset() {
  const m1 = makeSyntheticLogbook([
    '80.. 10, 9, 8',
    '82.5.. 10, 9, 8',
    '85.. 10, 9, 8',
    '87.5.. 10, 9, 8',
    '90.. 10, 9, 8',
    '92.5.. 10, 9, 8',
  ]);
  const m2 = makeSyntheticLogbook([
    '92.5.. 10, 9, 8',
    '95.. 10, 9, 8',
    '95.. 10, 9, 8',
    '95.. 10, 9, 8',
    '97.5.. 10, 9, 8',
    '100.. 10, 9, 8',
  ]);
  const loaded = [
    { id: 'S1M1', rawText: m1, ...parseLogbookWithWarnings(m1, defaultExercises) },
    { id: 'S1M2', rawText: m2, ...parseLogbookWithWarnings(m2, defaultExercises) },
  ];
  return buildAnalyticsDataset({ loadedPrograms: loaded, profile: DEFAULT_PROFILE });
}

function makeMockUsage() {
  return { promptTokens: 1200, completionTokens: 200, totalTokens: 1400, cacheHitTokens: 800, cacheMissTokens: 400 };
}

function makeValidReportPayload(progEvidenceId = 'E2') {
  return {
    summary: {
      headline: `Lat Machine e1RM climbed to {{${progEvidenceId}.lastVal|1}} kg.`,
      keyTakeaways: [
        `Lat Machine e1RM rose from {{${progEvidenceId}.firstVal|1}} kg to {{${progEvidenceId}.lastVal|1}} kg.`,
        `Robust slope reached {{${progEvidenceId}.slope|2}} kg per microcycle.`,
        'RPE defaulted to 9.0 across all sets.',
      ],
    },
    insights: [
      {
        id: 'ins-1',
        category: 'progression',
        title: 'Strong Lat Machine Overload',
        finding: `Lat Machine e1RM increased from {{${progEvidenceId}.firstVal|1}} kg to {{${progEvidenceId}.lastVal|1}} kg (+{{${progEvidenceId}.slope|2}} kg/microcycle).`,
        interpretation: 'Consistent linear progression across microcycles.',
        evidence: [progEvidenceId],
        confidence: 'high',
        chart: { type: 'line', evidenceId: progEvidenceId, x: 'label', y: 'y', title: 'Lat Machine e1RM' },
        recommendation: {
          action: 'Keep progressive overload on Lat Machine.',
          rationale: 'Positive slope with narrow CI.',
          successMetric: { description: 'Maintain positive e1RM slope', metric: 'e1rm', scope: { exercise: 'Lat Machine' } },
        },
      },
    ],
    bottlenecks: [],
    rejectedHypotheses: [],
    limitations: ['RPE was not explicitly logged.'],
  };
}

describe('analytics/agent loop, transport, and skill prompt', () => {
  const dataset = makeTestDataset();

  it('builds a deterministic system prompt containing microcycle/macrocycle rules', () => {
    const pDeep = buildSystemPrompt({ depth: 'deep', language: 'en' });
    const pQuick = buildSystemPrompt({ depth: 'quick', language: 'Italian' });
    expect(pDeep).toContain('microcycle');
    expect(pDeep).toContain('macrocycle');
    expect(pDeep).toContain('Metric Glossary');
    expect(pQuick).toContain('Italian');
    expect(pQuick.length).toBeLessThan(pDeep.length);
  });

  it('runs happy path with parallel tool calls, dedupe, and self-correction', async () => {
    let turn = 0;
    const events = [];
    const scriptedLLM = async () => {
      turn += 1;
      if (turn === 1) {
        // Parallel tool calls: valid progression + bad exercise (self-corrects) + duplicate overview
        return {
          content: '',
          reasoningContent: 'Checking top exercise progression.',
          toolCalls: [
            { id: 'c1', name: 'get_exercise_progression', rawArguments: JSON.stringify({ exercise: 'Lat Machine' }) },
            { id: 'c2', name: 'get_exercise_progression', rawArguments: JSON.stringify({ exercise: 'Fake Lift' }) },
            { id: 'c3', name: 'get_dataset_overview', rawArguments: '{}' },
          ],
          finishReason: 'tool_calls',
          usage: makeMockUsage(),
        };
      }
      return {
        content: '',
        reasoningContent: '',
        toolCalls: [
          { id: 'c4', name: 'submit_report', rawArguments: JSON.stringify(makeValidReportPayload('E2')) },
        ],
        finishReason: 'tool_calls',
        usage: makeMockUsage(),
      };
    };

    const res = await runAnalyticsAgent({
      dataset,
      apiKey: 'sk-test',
      depth: 'quick',
      completionImpl: scriptedLLM,
      onEvent: (e) => events.push(e),
    });

    expect(res.status).toBe('done');
    expect(res.report.insights.length).toBe(1);
    expect(res.report.evidenceLedger.E2).toBeDefined();
    expect(res.report.methodology.toolCalls).toBeGreaterThanOrEqual(3);
    expect(events.some((e) => e.type === 'reasoning')).toBe(true);
    expect(events.some((e) => e.type === 'step' && e.step.duplicate)).toBe(true);
  });

  it('repairs invalid reports and falls back to partial report after repair exhaustion', async () => {
    // Case A: Repair succeeds on round 1
    let turnA = 0;
    const repairSuccessLLM = async () => {
      turnA += 1;
      if (turnA === 1) {
        return {
          content: '',
          reasoningContent: '',
          toolCalls: [{ id: 'a1', name: 'get_exercise_progression', rawArguments: JSON.stringify({ exercise: 'Lat Machine' }) }],
          finishReason: 'tool_calls',
          usage: makeMockUsage(),
        };
      }
      if (turnA === 2) {
        const bad = makeValidReportPayload('E2');
        bad.insights[0].finding = 'Lat Machine increased by 999.9 kg.'; // ungrounded!
        return {
          content: '',
          reasoningContent: '',
          toolCalls: [{ id: 'a2', name: 'submit_report', rawArguments: JSON.stringify(bad) }],
          finishReason: 'tool_calls',
          usage: makeMockUsage(),
        };
      }
      return {
        content: '',
        reasoningContent: '',
        toolCalls: [{ id: 'a3', name: 'submit_report', rawArguments: JSON.stringify(makeValidReportPayload('E2')) }],
        finishReason: 'tool_calls',
        usage: makeMockUsage(),
      };
    };

    const resA = await runAnalyticsAgent({ dataset, apiKey: 'sk-test', depth: 'quick', completionImpl: repairSuccessLLM });
    expect(resA.status).toBe('done');
    expect(resA.report.partial).toBe(false);

    // Case B: Repair exhausted -> keeps valid insight, drops bad one
    let turnB = 0;
    const partialFallbackLLM = async () => {
      turnB += 1;
      if (turnB === 1) {
        return {
          content: '',
          reasoningContent: '',
          toolCalls: [{ id: 'b1', name: 'get_exercise_progression', rawArguments: JSON.stringify({ exercise: 'Lat Machine' }) }],
          finishReason: 'tool_calls',
          usage: makeMockUsage(),
        };
      }
      const mixed = makeValidReportPayload('E2');
      mixed.insights.push({
        id: 'ins-bad',
        category: 'anomaly',
        title: 'Bad Insight',
        finding: 'Fabricated 777.7 spike.',
        interpretation: 'Made up.',
        evidence: ['E2'],
        confidence: 'low',
      });
      return {
        content: '',
        reasoningContent: '',
        toolCalls: [{ id: `b${turnB}`, name: 'submit_report', rawArguments: JSON.stringify(mixed) }],
        finishReason: 'tool_calls',
        usage: makeMockUsage(),
      };
    };

    const resB = await runAnalyticsAgent({ dataset, apiKey: 'sk-test', depth: 'quick', completionImpl: partialFallbackLLM });
    expect(resB.status).toBe('done');
    expect(resB.report.partial).toBe(true);
    expect(resB.report.insights.length).toBe(1);
    expect(resB.report.removedDuringVerification.length).toBe(1);
  });

  it('forces submit_report when budget is reached, handles pause/resume, abort, and anonymization', async () => {
    // 1. Pause on network error, then resume cleanly from checkpoint
    let checkpoint = null;
    let calls = 0;
    const flakyLLM = async ({ messages }) => {
      calls += 1;
      if (calls === 1) {
        // Verify anonymization hid S1M1/S1M2 from messages
        const joined = JSON.stringify(messages);
        expect(joined).not.toContain('S1M1');
        expect(joined).toContain('Block_1');
        return {
          content: '',
          reasoningContent: '',
          toolCalls: [{ id: 'f1', name: 'get_exercise_progression', rawArguments: JSON.stringify({ exercise: 'Lat Machine' }) }],
          finishReason: 'tool_calls',
          usage: makeMockUsage(),
        };
      }
      if (calls === 2) {
        throw new TransportError('Network offline', { code: 'network_error', retryable: true });
      }
      const rep = makeValidReportPayload('E2');
      rep.summary.headline = 'Block_1 and Block_2 progressed Lat Machine to {{E2.lastVal|1}} kg.';
      return {
        content: '',
        reasoningContent: '',
        toolCalls: [{ id: 'f3', name: 'submit_report', rawArguments: JSON.stringify(rep) }],
        finishReason: 'tool_calls',
        usage: makeMockUsage(),
      };
    };

    const paused = await runAnalyticsAgent({
      dataset,
      apiKey: 'sk-test',
      depth: 'quick',
      anonymize: true,
      completionImpl: flakyLLM,
      onCheckpoint: (cp) => { checkpoint = cp; },
    });
    expect(paused.status).toBe('paused');
    expect(checkpoint).not.toBeNull();
    // Ensure secret apiKey is never persisted in checkpoints
    expect(JSON.stringify(checkpoint)).not.toContain('sk-test');

    const resumed = await runAnalyticsAgent({
      dataset,
      apiKey: 'sk-test',
      depth: 'quick',
      anonymize: true,
      resumeFrom: checkpoint,
      completionImpl: flakyLLM,
    });
    expect(resumed.status).toBe('done');
    // Anonymized names restored in final report
    expect(resumed.report.summary.headline).toContain('S1M1');
    expect(resumed.report.summary.headline).not.toContain('Block_1');

    // 2. Abort mid-run
    const ac = new AbortController();
    ac.abort();
    const cancelled = await runAnalyticsAgent({
      dataset,
      apiKey: 'sk-test',
      signal: ac.signal,
      completionImpl: flakyLLM,
    });
    expect(cancelled.status).toBe('cancelled');
  });

  it('retries 429 in transport, stops on 401/402, and strips reasoning_content for thinking models', async () => {
    let attempts = 0;
    const mockFetch429ThenOk = async () => {
      attempts += 1;
      if (attempts === 1) {
        return { status: 429, headers: new Headers({ 'retry-after': '0' }), text: async () => '{"error":{"message":"rate limit"}}' };
      }
      return { status: 200, headers: new Headers(), text: async () => '{"ok":true}' };
    };
    const okData = await deepseekRequest({
      path: '/models',
      method: 'GET',
      apiKey: 'sk-123',
      fetchImpl: mockFetch429ThenOk,
      sleepImpl: async () => {},
    });
    expect(okData.ok).toBe(true);
    expect(attempts).toBe(2);

    // 401 stops immediately without retry
    let authAttempts = 0;
    await expect(
      deepseekRequest({
        path: '/models',
        method: 'GET',
        apiKey: 'sk-bad',
        fetchImpl: async () => {
          authAttempts += 1;
          return { status: 401, headers: new Headers(), text: async () => '{"error":{"message":"bad key"}}' };
        },
        sleepImpl: async () => {},
      })
    ).rejects.toMatchObject({ code: 'auth_failed', status: 401 });
    expect(authAttempts).toBe(1);

    // Thinking model omits temperature and strips reasoning_content from input messages
    let capturedBody = null;
    await createChatCompletion({
      apiKey: 'sk-123',
      model: 'deepseek-reasoner',
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'assistant', content: 'hi', reasoning_content: 'secret chain of thought' },
      ],
      requestImpl: async ({ body }) => {
        capturedBody = body;
        return { choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: {} };
      },
    });
    expect(capturedBody.temperature).toBeUndefined();
    expect(capturedBody.messages[1].reasoning_content).toBeUndefined();
    expect(sanitizeOutgoingMessages([{ role: 'assistant', content: 'x', reasoning_content: 'y' }])[0].reasoning_content).toBeUndefined();
  });

  it('planted-signal verification: detects lagged volume->e1RM signal while controlling noise', () => {
    // Planted lag-1 signal: microcycle t has alternating high/low sets -> microcycle t+1 e1RM responds
    const setsPattern = [2, 5, 2, 5, 2, 5, 2, 5, 2, 5, 2, 5, 2, 5];
    const lines = ['# 1', "Lat Machine | 3' | 1-0-2-0"];
    for (let t = 0; t < setsPattern.length; t++) {
      const prevHigh = t > 0 && setsPattern[t - 1] === 5;
      const load = prevHigh ? 105 : 90;
      const repsList = Array.from({ length: setsPattern[t] }, () => '8').join(', ');
      lines.push(`${load}.. ${repsList}`);
    }
    const md = lines.join('\n');
    const ds = buildAnalyticsDataset({
      loadedPrograms: [{ id: 'Planted', rawText: md, ...parseLogbookWithWarnings(md, defaultExercises) }],
      profile: DEFAULT_PROFILE,
    });
    const ledger = new EvidenceLedger(0.1);
    const res = executeTool(
      'test_relationship',
      {
        x: { metric: 'sets', scope: { exercise: 'Lat Machine' } },
        y: { metric: 'e1rm', scope: { exercise: 'Lat Machine' } },
        lag: 1,
        detrend: true,
      },
      ds,
      ledger
    );
    expect(res.ok).toBe(true);
    expect(res.data.rho).toBeGreaterThan(0.75);
    expect(res.data.sessionQValue).toBeLessThan(0.05);
  });
});

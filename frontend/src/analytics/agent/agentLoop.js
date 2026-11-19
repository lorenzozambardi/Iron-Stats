/**
 * Autonomous Smart Analytics Agent Loop (State Machine).
 * Orchestrates Orient -> Explore -> Synthesize -> Validate -> Repair -> Done/Paused/Cancelled.
 * Enforces budgets, duplicate dedupe, context compaction, checkpoint/resume, and report grounding.
 */

import { EvidenceLedger } from '../grounding/evidenceLedger.js';
import { finalizeWithFallback, validateReport } from '../grounding/reportValidator.js';
import { describeToolCallHuman, executeTool, getOpenAITools } from '../tools/registry.js';
import { buildSystemPrompt } from './buildSkillPrompt.js';
import { createChatCompletion, DEFAULT_PRICE_TABLE, estimateCostUsd } from './deepseekClient.js';
import { TransportError } from './transport.js';
import { REPORT_SCHEMA_VERSION, SKILL_VERSION, TOOLS_VERSION } from '../versions.js';

export const DEPTH_PRESETS = {
  quick: {
    id: 'quick',
    label: 'Quick',
    maxToolCalls: 10,
    maxPromptTokens: 60000,
    maxDurationMs: 180000,
    estTokensRange: '12k–35k',
    estCostRange: '$0.005–$0.018',
  },
  deep: {
    id: 'deep',
    label: 'Deep',
    maxToolCalls: 28,
    maxPromptTokens: 200000,
    maxDurationMs: 600000,
    estTokensRange: '35k–110k',
    estCostRange: '$0.015–$0.055',
  },
};

function anonymizeDataset(dataset) {
  const macroMap = new Map();
  const reverseMap = new Map();
  dataset.entities.allMacrocycles.forEach((id, idx) => {
    const alias = `Block_${idx + 1}`;
    macroMap.set(id, alias);
    reverseMap.set(alias, id);
  });

  const clone = structuredClone(dataset);
  const rename = (id) => macroMap.get(id) || id;
  clone.macrocycles.forEach((p) => { p.id = rename(p.id); p.label = p.id; if (p.variantOf) p.variantOf = rename(p.variantOf); });
  clone.sets.forEach((s) => { s.macrocycleId = rename(s.macrocycleId); });
  clone.exerciseMicrocycles.forEach((e) => { e.macrocycleId = rename(e.macrocycleId); });
  clone.muscleMicrocycles.forEach((m) => { m.macrocycleId = rename(m.macrocycleId); });
  clone.microcycles.forEach((m) => { m.macrocycleId = rename(m.macrocycleId); });
  clone.bwProxy.forEach((b) => { b.macrocycleId = rename(b.macrocycleId); });
  clone.entities.macrocycles = clone.entities.macrocycles.map(rename);
  clone.entities.allMacrocycles = clone.entities.allMacrocycles.map(rename);
  return { dataset: clone, reverseMap };
}

function restoreAnonymizedText(obj, reverseMap) {
  if (!reverseMap || reverseMap.size === 0 || obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    let out = obj;
    for (const [alias, orig] of reverseMap.entries()) {
      out = out.replace(new RegExp(`\\b${alias}\\b`, 'g'), orig);
    }
    return out;
  }
  if (Array.isArray(obj)) return obj.map((v) => restoreAnonymizedText(v, reverseMap));
  if (typeof obj === 'object') {
    const res = {};
    for (const [k, v] of Object.entries(obj)) res[k] = restoreAnonymizedText(v, reverseMap);
    return res;
  }
  return obj;
}

function compactMessages(messages, ledger, keepRecent = 6) {
  // Keep system (0), initial user (1), and the most recent N messages intact.
  if (messages.length <= keepRecent + 3) return messages;
  const cutoff = messages.length - keepRecent;
  return messages.map((msg, idx) => {
    if (idx < 2 || idx >= cutoff) return msg;
    if (msg.role === 'tool' && typeof msg.content === 'string' && msg.content.length > 260) {
      const m = msg.content.match(/"evidenceId"\s*:\s*"(E\d+)"/);
      if (m) {
        const entry = ledger.get(m[1]);
        if (entry) {
          return {
            ...msg,
            content: JSON.stringify({
              evidenceId: entry.id,
              compacted: true,
              summary: entry.summaryLine,
            }),
          };
        }
      }
    }
    return msg;
  });
}

function collectCitedEvidenceIds(report) {
  const ids = new Set(['E1']); // Always retain overview
  const addFromText = (str) => {
    if (typeof str !== 'string') return;
    const matches = str.matchAll(/\{\{(E\d+)\./g);
    for (const m of matches) ids.add(m[1]);
  };
  addFromText(report?.summary?.headline);
  (report?.summary?.keyTakeaways || []).forEach(addFromText);
  for (const ins of report?.insights || []) {
    (ins.evidence || []).forEach((id) => ids.add(id));
    if (ins.chart?.evidenceId) ids.add(ins.chart.evidenceId);
    addFromText(ins.finding);
    addFromText(ins.interpretation);
    addFromText(ins.recommendation?.action);
  }
  for (const b of report?.bottlenecks || []) (b.evidence || []).forEach((id) => ids.add(id));
  for (const r of report?.rejectedHypotheses || []) (r.evidence || []).forEach((id) => ids.add(id));
  return Array.from(ids);
}

export async function runAnalyticsAgent({
  dataset,
  apiKey,
  model = 'deepseek-chat',
  depth = 'deep',
  language = 'en',
  anonymize = false,
  priceTable = DEFAULT_PRICE_TABLE,
  signal = null,
  resumeFrom = null,
  completionImpl = createChatCompletion,
  onEvent = () => {},
  onCheckpoint = () => {},
}) {
  const startedAt = resumeFrom?.startedAt || Date.now();
  const runId = resumeFrom?.runId || `run_${startedAt}_${Math.random().toString(36).slice(2, 8)}`;
  const preset = DEPTH_PRESETS[depth] || DEPTH_PRESETS.deep;

  // Preflight check
  if (!dataset?.capabilities?.ready) {
    return {
      status: 'blocked',
      reason: (dataset?.capabilities?.blockingReasons || ['Insufficient training or body-composition data.']).join(' '),
      runId,
    };
  }

  let activeDataset = dataset;
  let reverseMap = null;
  if (anonymize) {
    const anon = anonymizeDataset(dataset);
    activeDataset = anon.dataset;
    reverseMap = anon.reverseMap;
  }

  const tools = getOpenAITools();
  const ledger = resumeFrom?.ledger ? EvidenceLedger.fromJSON(resumeFrom.ledger) : new EvidenceLedger(0.1);
  let messages = resumeFrom?.messages ? structuredClone(resumeFrom.messages) : [];
  let toolCallsUsed = resumeFrom?.toolCallsUsed || 0;
  let repairRounds = resumeFrom?.repairRounds || 0;
  let consecutiveErrors = resumeFrom?.consecutiveErrors || 0;
  let sentNudge85 = resumeFrom?.sentNudge85 || false;
  let phase = resumeFrom?.phase || 'orient';
  const trace = resumeFrom?.trace ? structuredClone(resumeFrom.trace) : [];
  const totals = resumeFrom?.totals
    ? { ...resumeFrom.totals }
    : { promptTokens: 0, completionTokens: 0, totalTokens: 0, cacheHitTokens: 0, cacheMissTokens: 0, costUsd: 0 };

  const emitPhase = (nextPhase) => {
    phase = nextPhase;
    onEvent({ type: 'phase', phase, runId });
  };

  const saveCheckpoint = () => {
    onCheckpoint({
      runId,
      startedAt,
      datasetFingerprint: dataset.fingerprint,
      model,
      depth,
      language,
      anonymize,
      phase,
      toolCallsUsed,
      repairRounds,
      consecutiveErrors,
      sentNudge85,
      totals,
      trace,
      messages,
      ledger: ledger.toJSON(),
    });
  };

  // Orient step (auto-inject E1 overview before first LLM turn)
  if (messages.length === 0) {
    emitPhase('orient');
    const overviewRes = executeTool('get_dataset_overview', {}, activeDataset, ledger);
    const stepItem = {
      id: `step_${trace.length + 1}`,
      toolName: 'get_dataset_overview',
      humanLabel: describeToolCallHuman('get_dataset_overview', {}),
      evidenceId: overviewRes.evidenceId,
      summaryLine: overviewRes.summaryLine,
      ok: overviewRes.ok,
      args: {},
    };
    trace.push(stepItem);
    onEvent({ type: 'step', step: stepItem });

    const systemPrompt = buildSystemPrompt({ depth, language });
    messages = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          `Analyze this athlete's complete training and body-composition dataset (${depth} mode).`,
          `Initial dataset overview has already been computed as ${overviewRes.evidenceId}:`,
          overviewRes.formatted,
          'Investigate autonomously using your tools, verify top hypotheses, and finish by calling submit_report.',
        ].join('\n\n'),
      },
    ];
    saveCheckpoint();
  }

  emitPhase('explore');

  const maxIterations = preset.maxToolCalls + 8;

  for (let iter = 0; iter < maxIterations; iter++) {
    if (signal?.aborted) {
      saveCheckpoint();
      return { status: 'cancelled', runId, trace, totals, ledger: ledger.toJSON() };
    }

    const elapsedMs = Date.now() - startedAt;
    const hitToolBudget = toolCallsUsed >= preset.maxToolCalls;
    const hitTokenBudget = totals.promptTokens >= preset.maxPromptTokens;
    const hitTimeBudget = elapsedMs >= preset.maxDurationMs;
    const mustForceSubmit = hitToolBudget || hitTokenBudget || hitTimeBudget;

    // 85% budget nudge
    if (
      !sentNudge85 &&
      !mustForceSubmit &&
      (toolCallsUsed >= Math.floor(preset.maxToolCalls * 0.85) ||
        totals.promptTokens >= preset.maxPromptTokens * 0.85)
    ) {
      sentNudge85 = true;
      emitPhase('synthesize');
      messages.push({
        role: 'user',
        content:
          'Budget notice: you have used ~85% of your analysis budget. Wrap up any final verification and call submit_report within the next 1–2 turns.',
      });
    }

    // Context compaction past 60% prompt budget or long turn count
    if (totals.promptTokens >= preset.maxPromptTokens * 0.6 || messages.length > 18) {
      messages = compactMessages(messages, ledger, 6);
    }

    let toolChoice = 'auto';
    if (mustForceSubmit) {
      emitPhase('synthesize');
      toolChoice = { type: 'function', function: { name: 'submit_report' } };
      messages.push({
        role: 'user',
        content:
          'Analysis budget reached. Call submit_report NOW using only the evidence already gathered in the ledger.',
      });
    }

    let llmRes;
    try {
      llmRes = await completionImpl({
        apiKey,
        model,
        messages,
        tools,
        toolChoice,
        signal,
      });
    } catch (err) {
      if (err instanceof TransportError && err.code === 'context_overflow') {
        // Emergency compaction and retry once
        messages = compactMessages(messages, ledger, 3);
        try {
          llmRes = await completionImpl({
            apiKey,
            model,
            messages,
            tools,
            toolChoice,
            signal,
          });
        } catch (retryErr) {
          saveCheckpoint();
          return {
            status: 'failed',
            code: retryErr.code || 'context_overflow',
            error: retryErr.message,
            runId,
            trace,
            totals,
          };
        }
      } else if (err instanceof TransportError && err.code === 'aborted') {
        saveCheckpoint();
        return { status: 'cancelled', runId, trace, totals, ledger: ledger.toJSON() };
      } else if (err instanceof TransportError && (err.code === 'auth_failed' || err.code === 'insufficient_balance')) {
        return { status: 'failed', code: err.code, error: err.message, runId, trace, totals };
      } else {
        // Network loss / transient failure after retries -> paused with checkpoint for Resume
        saveCheckpoint();
        return {
          status: 'paused',
          code: err?.code || 'network_error',
          error: err?.message || 'Connection interrupted. Resume when back online.',
          runId,
          trace,
          totals,
        };
      }
    }

    // Accumulate usage & cost
    totals.promptTokens += llmRes.usage.promptTokens;
    totals.completionTokens += llmRes.usage.completionTokens;
    totals.totalTokens += llmRes.usage.totalTokens;
    totals.cacheHitTokens += llmRes.usage.cacheHitTokens;
    totals.cacheMissTokens += llmRes.usage.cacheMissTokens;
    totals.costUsd = estimateCostUsd(totals, model, priceTable);
    onEvent({ type: 'usage', totals: { ...totals }, elapsedMs: Date.now() - startedAt });

    if (llmRes.reasoningContent) {
      onEvent({ type: 'reasoning', text: llmRes.reasoningContent });
    }

    // Record assistant turn (without reasoning_content so future turns stay valid)
    const assistantMsg = {
      role: 'assistant',
      content: llmRes.content || null,
    };
    if (llmRes.toolCalls.length > 0) {
      assistantMsg.tool_calls = llmRes.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: tc.rawArguments },
      }));
    }
    messages.push(assistantMsg);

    // If model answered with plain text instead of calling tools, nudge it toward submit_report
    if (llmRes.toolCalls.length === 0) {
      consecutiveErrors += 1;
      if (consecutiveErrors >= 3) {
        messages.push({
          role: 'user',
          content: 'You must call submit_report with a valid JSON report grounded in ledger evidence IDs.',
        });
      } else {
        messages.push({
          role: 'user',
          content: 'Continue investigating via tools, or call submit_report to finalize your report.',
        });
      }
      saveCheckpoint();
      continue;
    }

    // Execute all tool calls in this turn
    let submittedReportArgs = null;
    let submitCallId = null;

    for (const tc of llmRes.toolCalls) {
      let parsedArgs;
      try {
        parsedArgs = tc.rawArguments ? JSON.parse(tc.rawArguments) : {};
      } catch (parseErr) {
        consecutiveErrors += 1;
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify({ error: `Malformed JSON arguments for ${tc.name}: ${parseErr.message}` }),
        });
        continue;
      }

      if (tc.name === 'submit_report') {
        submittedReportArgs = parsedArgs;
        submitCallId = tc.id;
        continue;
      }

      toolCallsUsed += 1;
      const exec = executeTool(tc.name, parsedArgs, activeDataset, ledger);
      if (exec.ok) consecutiveErrors = 0;
      else consecutiveErrors += 1;

      const stepItem = {
        id: `step_${trace.length + 1}`,
        toolName: tc.name,
        humanLabel: describeToolCallHuman(tc.name, parsedArgs),
        evidenceId: exec.evidenceId || null,
        summaryLine: exec.summaryLine || exec.error || '',
        ok: exec.ok,
        duplicate: Boolean(exec.duplicate),
        args: parsedArgs,
      };
      trace.push(stepItem);
      onEvent({ type: 'step', step: stepItem });

      // Emit hypothesis chip updates & early verified highlights
      if (tc.name === 'register_hypothesis' && exec.ok) {
        onEvent({ type: 'hypothesis', hypothesis: ledger.hypothesisById.get(exec.data.hypothesisId) });
      }
      if (tc.name === 'test_relationship' && exec.ok && parsedArgs.hypothesisId) {
        onEvent({ type: 'hypothesis', hypothesis: ledger.hypothesisById.get(parsedArgs.hypothesisId) });
      }
      if (
        exec.ok &&
        !exec.duplicate &&
        exec.data?.status === 'ok' &&
        (tc.name === 'rank_bottlenecks' || tc.name === 'get_exercise_progression' || tc.name === 'test_relationship')
      ) {
        onEvent({
          type: 'earlyHighlight',
          highlight: { evidenceId: exec.evidenceId, toolName: tc.name, summaryLine: exec.summaryLine },
        });
      }

      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: exec.formatted,
      });
    }

    if (consecutiveErrors >= 3 && !submittedReportArgs) {
      messages.push({
        role: 'user',
        content: 'Multiple tool calls had invalid arguments. Call list_entities to verify exact entity names, or call submit_report with your verified evidence.',
      });
    }

    // Handle submit_report validation + repair cycle
    if (submittedReportArgs !== null) {
      emitPhase('validate');
      const validation = validateReport(submittedReportArgs, ledger, activeDataset);

      if (validation.valid) {
        messages.push({
          role: 'tool',
          tool_call_id: submitCallId,
          content: JSON.stringify({ status: 'accepted' }),
        });

        const finalReport = finalizeReportObject({
          report: validation.normalizedReport,
          partial: false,
          removedDuringVerification: [],
          dataset,
          ledger,
          reverseMap,
          model,
          depth,
          language,
          toolCallsUsed,
          totals,
          durationMs: Date.now() - startedAt,
          runId,
        });

        emitPhase('done');
        return {
          status: 'done',
          runId,
          report: finalReport,
          ledgerSubset: finalReport.evidenceLedger,
          trace,
          totals,
        };
      }

      // Needs repair
      if (repairRounds < 2) {
        repairRounds += 1;
        emitPhase('repair');
        const repairStep = {
          id: `step_${trace.length + 1}`,
          toolName: 'submit_report',
          humanLabel: `Verifying report (repair round ${repairRounds}/2 — ${validation.errors.length} issue${validation.errors.length === 1 ? '' : 's'})`,
          ok: false,
          summaryLine: validation.errors.slice(0, 3).join('; '),
          args: {},
        };
        trace.push(repairStep);
        onEvent({ type: 'step', step: repairStep });

        messages.push({
          role: 'tool',
          tool_call_id: submitCallId,
          content: JSON.stringify({
            status: 'rejected',
            errors: validation.errors.slice(0, 15),
            instruction: 'Fix every listed validation error and call submit_report again. Replace raw numeric literals with {{E#.field}} placeholders.',
          }),
        });
        saveCheckpoint();
        continue;
      }

      // Repair rounds exhausted -> deterministic fallback (strip unverified insights, or fail)
      const fb = finalizeWithFallback(submittedReportArgs, ledger, activeDataset);
      if (!fb.ok || !fb.report) {
        return {
          status: 'failed',
          code: 'validation_failed',
          error: 'Report failed verification after 2 repair attempts and no verified insights remained.',
          validationErrors: fb.errors || validation.errors,
          runId,
          trace,
          totals,
        };
      }

      const finalReport = finalizeReportObject({
        report: fb.report,
        partial: fb.partial,
        removedDuringVerification: fb.removedDuringVerification,
        dataset,
        ledger,
        reverseMap,
        model,
        depth,
        language,
        toolCallsUsed,
        totals,
        durationMs: Date.now() - startedAt,
        runId,
      });

      emitPhase('done');
      return {
        status: 'done',
        partial: fb.partial,
        runId,
        report: finalReport,
        ledgerSubset: finalReport.evidenceLedger,
        trace,
        totals,
      };
    }

    saveCheckpoint();
  }

  return {
    status: 'failed',
    code: 'max_iterations',
    error: 'Analysis loop terminated without submitting a verified report.',
    runId,
    trace,
    totals,
  };
}

function finalizeReportObject({
  report,
  partial,
  removedDuringVerification,
  dataset,
  ledger,
  reverseMap,
  model,
  depth,
  language,
  toolCallsUsed,
  totals,
  durationMs,
  runId,
}) {
  const citedIds = collectCitedEvidenceIds(report);
  const rawSubset = ledger.exportSubset(citedIds);
  const restoredReport = reverseMap ? restoreAnonymizedText(report, reverseMap) : report;
  const restoredSubset = reverseMap ? restoreAnonymizedText(rawSubset, reverseMap) : rawSubset;

  return {
    id: runId,
    schemaVersion: REPORT_SCHEMA_VERSION,
    skillVersion: SKILL_VERSION,
    toolsVersion: TOOLS_VERSION,
    generatedAt: new Date().toISOString(),
    datasetFingerprint: dataset.fingerprint,
    datasetSummary: dataset.summary,
    model,
    depth,
    language,
    partial: Boolean(partial),
    removedDuringVerification: removedDuringVerification || [],
    ...restoredReport,
    methodology: {
      toolCalls: toolCallsUsed + 1, // includes auto E1 overview
      testsRun: ledger.tests.length,
      hypothesesRegistered: ledger.hypotheses.length,
      fdrLevel: ledger.fdrLevel,
      promptTokens: totals.promptTokens,
      completionTokens: totals.completionTokens,
      cacheHitTokens: totals.cacheHitTokens,
      estimatedCostUsd: Math.round(totals.costUsd * 100000) / 100000,
      durationMs,
    },
    evidenceLedger: restoredSubset,
  };
}

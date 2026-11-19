/**
 * Defense-in-depth validator for submitted Smart Analytics reports.
 * Enforces: schema integrity, required citations, placeholder resolution,
 * numeric literal audit, entity whitelist, causal language guard,
 * chart evidence verification, and deterministic confidence clamping.
 */

import { PLACEHOLDER_REGEX } from './evidenceLedger.js';
import { clampConfidence, gradeConfidence } from './confidence.js';
import { CHART_TYPES, REPORT_CATEGORIES } from './reportSchema.js';

const STRUCTURAL_UNIT_AFTER = /^\s*(?:sets?|microcycles?|macrocycles?|mcs?|weeks?|wks?|sessions?|reps?|programs?|mesocycles?|days?|months?|lags?|exposures?|exercises?|blocks?|groups?|points?|splits?|seconds?|mins?|minutes?|%|rm\b)/i;
const STRUCTURAL_PREFIX_BEFORE = /(?:microcycle|macrocycle|mc|week|wk|session|day|lag|phase|stage|top|step|tier|rpe|rir|s\d+m|m|w|#|e|h)\s*$/i;
const CAUSAL_REGEX = /\b(causes|caused by|directly causes|proves that|proved that|definitively shows|is the reason why)\b/i;

function computeDataQualityGrade(dataset) {
  const caps = dataset?.capabilities || {};
  let score = 0;
  if (caps.canAnalyzeProgression) score += 2;
  if (caps.canCrossMacrocycle || caps.canCrossProgram) score += 2;
  if (caps.rpeQuality === 'logged') score += 2;
  else if (caps.rpeQuality === 'partial') score += 1;
  if (caps.canJoinBodyComp) score += 2;
  else if (caps.hasBwProxy || caps.canAnalyzeBodyTrend) score += 1;
  if (!dataset?.snapshot?.isDefaultUnverified) score += 1;

  if (score >= 7) return 'A';
  if (score >= 5) return 'B';
  if (score >= 3) return 'C';
  return 'D';
}

function buildAllowedTextTokens(dataset) {
  const tokens = new Set();
  const entities = dataset?.entities || {};
  for (const list of [entities.macrocycles, entities.allMacrocycles, entities.programs, entities.allPrograms, entities.exercises, entities.macros, entities.subMuscles]) {
    for (const item of list || []) {
      const matches = String(item).match(/\d+(?:\.\d+)?/g);
      if (matches) matches.forEach((m) => tokens.add(m));
    }
  }
  return tokens;
}

function isNumberGrounded(val, rawStr, beforeText, afterText, citedNumbers, entityNumberTokens) {
  // Exact match to a number appearing inside an entity name (e.g., "45 DB Bench", "S3M3", "Leg Press 45")
  if (entityNumberTokens.has(rawStr)) return true;
  // Common exercise-science terms like 1RM, RPE 9.0 default, RPE > 4 threshold, 0.05/0.10 FDR thresholds
  if (/^(?:1|4|9|9\.0|10|10\.0|12)$/.test(rawStr) && (/\b(?:rm|e1rm|rpe|rir)\b/i.test(beforeText.slice(-30)) || /\b(?:rm|e1rm|rpe|rir)\b/i.test(afterText.slice(0, 12)))) {
    return true;
  }
  if (/^0\.(?:05|1|10|01)$/.test(rawStr) && /(?:p|q|fdr|alpha)\s*[<=>\s]*$/i.test(beforeText.slice(-12))) {
    return true;
  }
  // Small structural integers (<= 12) next to structural words (e.g., "3 sets", "week 4", "2 lags")
  if (Number.isInteger(val) && val >= 0 && val <= 12) {
    if (STRUCTURAL_UNIT_AFTER.test(afterText.slice(0, 20)) || STRUCTURAL_PREFIX_BEFORE.test(beforeText.slice(-16))) {
      return true;
    }
  }
  // ISO date components (YYYY-MM-DD)
  if (/^\d{4}$/.test(rawStr) && val >= 2015 && val <= 2035) return true;
  if (/\d{4}-\d{2}-?$/.test(beforeText.slice(-10)) || /^-\d{2}-\d{2}/.test(afterText.slice(0, 10))) return true;

  // Check against any number present in cited evidence (within rounding tolerance)
  for (const ref of citedNumbers) {
    const tol = Math.max(0.15, Math.abs(ref) * 0.015);
    if (Math.abs(val - ref) <= tol) return true;
  }
  return false;
}

function auditProseField(text, fieldLabel, evidenceIds, ledger, entityNumberTokens, errors) {
  if (typeof text !== 'string' || !text.trim()) return;

  // 1. Validate all placeholders
  const { tokens } = ledger.renderPlaceholders(text);
  for (const tok of tokens) {
    if (!tok.valid) {
      errors.push(`${fieldLabel}: placeholder ${tok.raw} could not be resolved in the evidence ledger.`);
    } else if (evidenceIds && evidenceIds.length > 0 && !evidenceIds.includes(tok.evidenceId)) {
      errors.push(`${fieldLabel}: placeholder ${tok.raw} references ${tok.evidenceId}, which is missing from evidence[].`);
    }
  }

  // 2. Strip placeholders and evidence/hypothesis IDs before numeric literal audit
  const stripped = text
    .replace(PLACEHOLDER_REGEX, ' __REF__ ')
    .replace(/\b[EH]\d+\b/g, ' __ID__ ')
    .replace(/\bMC\d+\b/gi, ' __MC__ ')
    .replace(/\bS\d+M\d+(?:W\d+)?\b/gi, ' __PROG__ ')
    .replace(/\be?1rm\b/gi, ' __1RM__ ')
    .replace(/\b\d+-\d+-\d+-\d+\b/g, ' __TEMPO__ ');

  const citedNumbers = ledger.collectCitedNumbers(
    evidenceIds && evidenceIds.length > 0 ? evidenceIds : ledger.entries.map((e) => e.id)
  );

  const numRegex = /-?\d+(?:\.\d+)?/g;
  let match;
  while ((match = numRegex.exec(stripped)) !== null) {
    const rawStr = match[0];
    const val = parseFloat(rawStr);
    const before = stripped.slice(Math.max(0, match.index - 36), match.index);
    const after = stripped.slice(match.index + rawStr.length, match.index + rawStr.length + 24);
    if (!isNumberGrounded(val, rawStr, before, after, citedNumbers, entityNumberTokens)) {
      const snippet = stripped.slice(Math.max(0, match.index - 15), Math.min(stripped.length, match.index + rawStr.length + 15)).trim();
      errors.push(`${fieldLabel}: ungrounded numeric literal "${rawStr}" in "...${snippet}...". Use a {{E#.field}} placeholder or cite supporting evidence.`);
    }
  }
}

function hasChartableData(entry, chart) {
  if (!entry || !entry.data) return false;
  const d = entry.data;
  if (chart.type === 'distribution' || chart.type === 'bar') {
    return Array.isArray(d.series) || Array.isArray(d.items) || Array.isArray(d.distribution) || Array.isArray(d.bottlenecks);
  }
  if (chart.type === 'scatter') {
    return Array.isArray(d.points) || Array.isArray(d.series);
  }
  return Array.isArray(d.series) || Array.isArray(d.points);
}

export function validateReport(rawReport, ledger, dataset) {
  const errors = [];
  const insightErrors = new Map();

  if (!rawReport || typeof rawReport !== 'object') {
    return { valid: false, errors: ['Report must be a JSON object.'], insightErrors, normalizedReport: null };
  }

  const report = structuredClone(rawReport);
  const entityNumberTokens = buildAllowedTextTokens(dataset);
  const allValidIds = new Set(ledger.entries.map((e) => e.id));

  // Summary checks
  if (!report.summary || typeof report.summary !== 'object') {
    errors.push('Missing summary object.');
  } else {
    if (!report.summary.headline || typeof report.summary.headline !== 'string') {
      errors.push('summary.headline is required.');
    } else {
      auditProseField(report.summary.headline, 'summary.headline', null, ledger, entityNumberTokens, errors);
    }
    if (!Array.isArray(report.summary.keyTakeaways) || report.summary.keyTakeaways.length < 3 || report.summary.keyTakeaways.length > 5) {
      errors.push('summary.keyTakeaways must contain 3 to 5 items.');
    } else {
      report.summary.keyTakeaways.forEach((tk, idx) => {
        auditProseField(tk, `summary.keyTakeaways[${idx}]`, null, ledger, entityNumberTokens, errors);
      });
    }
  }

  // Insights checks
  if (!Array.isArray(report.insights) || report.insights.length === 0) {
    errors.push('insights must be a non-empty array.');
  } else {
    report.insights.forEach((ins, idx) => {
      const localErrors = [];
      const prefix = `insights[${idx}] (${ins?.id || 'no-id'})`;

      if (!ins || typeof ins !== 'object') {
        localErrors.push(`${prefix}: must be an object.`);
      } else {
        if (!REPORT_CATEGORIES.includes(ins.category)) {
          localErrors.push(`${prefix}: invalid category "${ins.category}".`);
        }
        if (!ins.title || typeof ins.title !== 'string') localErrors.push(`${prefix}: missing title.`);
        if (!ins.finding || typeof ins.finding !== 'string') localErrors.push(`${prefix}: missing finding.`);
        if (!ins.interpretation || typeof ins.interpretation !== 'string') localErrors.push(`${prefix}: missing interpretation.`);

        const evIds = Array.isArray(ins.evidence) ? ins.evidence : [];
        if (evIds.length === 0) {
          localErrors.push(`${prefix}: must cite at least one evidence ID.`);
        }
        const citedEntries = [];
        for (const eid of evIds) {
          if (!allValidIds.has(eid)) {
            localErrors.push(`${prefix}: unknown evidence ID "${eid}".`);
          } else {
            citedEntries.push(ledger.get(eid));
          }
        }

        if (ins.category === 'correlation') {
          const hasRelTest = citedEntries.some((e) => e.toolName === 'test_relationship' || e.toolName === 'scan_relationships');
          if (!hasRelTest) {
            localErrors.push(`${prefix}: correlation insight must cite a test_relationship or scan_relationships evidence ID.`);
          }
        }

        auditProseField(ins.finding, `${prefix}.finding`, evIds, ledger, entityNumberTokens, localErrors);
        auditProseField(ins.interpretation, `${prefix}.interpretation`, evIds, ledger, entityNumberTokens, localErrors);
        if (ins.recommendation?.action) {
          auditProseField(ins.recommendation.action, `${prefix}.recommendation.action`, evIds, ledger, entityNumberTokens, localErrors);
        }

        // Deterministic confidence clamping
        const computedConf = gradeConfidence(citedEntries, dataset?.capabilities);
        ins.computedConfidence = computedConf;
        ins.confidence = clampConfidence(ins.confidence || computedConf, computedConf);

        // Causal language guard on correlational insights
        const combinedProse = `${ins.finding || ''} ${ins.interpretation || ''}`;
        if (ins.category === 'correlation' && CAUSAL_REGEX.test(combinedProse) && !(ins.isMechanisticHypothesis && ins.confidence === 'exploratory')) {
          localErrors.push(`${prefix}: causal language detected on a correlational insight. Use associative phrasing (e.g., "is associated with", "co-occurs with") unless framed as an exploratory mechanistic hypothesis.`);
        }

        // Entity whitelist check on recommendation successMetric scope
        const smScope = ins.recommendation?.successMetric?.scope;
        if (smScope && typeof smScope === 'object') {
          if (smScope.exercise && !dataset.entities.exercises.includes(smScope.exercise)) {
            localErrors.push(`${prefix}: unknown exercise "${smScope.exercise}" in successMetric.scope.`);
          }
          if (smScope.macro && !dataset.entities.macros.includes(smScope.macro)) {
            localErrors.push(`${prefix}: unknown macro muscle "${smScope.macro}" in successMetric.scope.`);
          }
          const knownMacros = dataset.entities.allMacrocycles || dataset.entities.allPrograms || [];
          const targetMacroId = smScope.macrocycle || smScope.program;
          if (targetMacroId && !knownMacros.includes(targetMacroId)) {
            localErrors.push(`${prefix}: unknown macrocycle "${targetMacroId}" in successMetric.scope.`);
          }
        }

        // Chart check
        if (ins.chart) {
          if (!CHART_TYPES.includes(ins.chart.type)) {
            localErrors.push(`${prefix}.chart: invalid chart type "${ins.chart.type}".`);
          }
          if (!allValidIds.has(ins.chart.evidenceId)) {
            localErrors.push(`${prefix}.chart: unknown evidenceId "${ins.chart.evidenceId}".`);
          } else if (!hasChartableData(ledger.get(ins.chart.evidenceId), ins.chart)) {
            localErrors.push(`${prefix}.chart: evidence ${ins.chart.evidenceId} has no chartable series/points data.`);
          }
        }
      }

      if (localErrors.length > 0) {
        insightErrors.set(idx, localErrors);
        errors.push(...localErrors);
      }
    });
  }

  // Bottlenecks citation check
  if (Array.isArray(report.bottlenecks)) {
    report.bottlenecks.forEach((b, idx) => {
      if (!Array.isArray(b.evidence) || b.evidence.length === 0 || b.evidence.some((id) => !allValidIds.has(id))) {
        errors.push(`bottlenecks[${idx}]: must cite valid evidence IDs.`);
      }
    });
  } else {
    report.bottlenecks = [];
  }

  // Rejected hypotheses check
  if (Array.isArray(report.rejectedHypotheses)) {
    report.rejectedHypotheses.forEach((rh, idx) => {
      if (!Array.isArray(rh.evidence) || rh.evidence.length === 0 || rh.evidence.some((id) => !allValidIds.has(id))) {
        errors.push(`rejectedHypotheses[${idx}]: must cite valid evidence IDs.`);
      }
    });
  } else {
    report.rejectedHypotheses = [];
  }

  if (!Array.isArray(report.limitations)) {
    report.limitations = [];
  }

  // Fill app-owned dataQuality
  report.dataQuality = {
    grade: computeDataQualityGrade(dataset),
    caveats: (dataset?.qualityFlags || []).map((f) => f.message),
  };

  return {
    valid: errors.length === 0,
    errors,
    insightErrors,
    normalizedReport: report,
  };
}

/**
 * Fallback after repair rounds are exhausted: drops any insights that still fail
 * validation and records them under removedDuringVerification.
 */
export function finalizeWithFallback(rawReport, ledger, dataset) {
  const check = validateReport(rawReport, ledger, dataset);
  if (check.valid) {
    return { ok: true, partial: false, report: check.normalizedReport, removedDuringVerification: [] };
  }
  const rep = check.normalizedReport;
  if (!rep || !Array.isArray(rep.insights)) {
    return { ok: false, partial: false, report: null, removedDuringVerification: [], errors: check.errors };
  }

  const kept = [];
  const removed = [];
  rep.insights.forEach((ins, idx) => {
    if (check.insightErrors.has(idx)) {
      removed.push({
        id: ins?.id || `insight-${idx}`,
        title: ins?.title || 'Untitled insight',
        reasons: check.insightErrors.get(idx),
      });
    } else {
      kept.push(ins);
    }
  });

  if (kept.length === 0) {
    return { ok: false, partial: false, report: null, removedDuringVerification: removed, errors: check.errors };
  }

  // Clean bottlenecks/rejected hypotheses with bad IDs
  const allValidIds = new Set(ledger.entries.map((e) => e.id));
  rep.insights = kept;
  rep.bottlenecks = (rep.bottlenecks || []).filter(
    (b) => Array.isArray(b.evidence) && b.evidence.length > 0 && b.evidence.every((id) => allValidIds.has(id))
  );
  rep.rejectedHypotheses = (rep.rejectedHypotheses || []).filter(
    (r) => Array.isArray(r.evidence) && r.evidence.length > 0 && r.evidence.every((id) => allValidIds.has(id))
  );
  rep.removedDuringVerification = removed;

  return { ok: true, partial: removed.length > 0, report: rep, removedDuringVerification: removed };
}

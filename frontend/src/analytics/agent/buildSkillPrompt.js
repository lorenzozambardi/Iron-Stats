/**
 * Assembles the stable system prompt from versioned Markdown skill modules.
 * Keeping the system prompt prefix deterministic maximizes DeepSeek disk cache hits.
 */

import coreMd from './skill/core.md?raw';
import dataModelMd from './skill/data-model.md?raw';
import exerciseScienceMd from './skill/exercise-science.md?raw';
import statisticsMd from './skill/statistics.md?raw';
import playbookDeepMd from './skill/playbook.md?raw';
import playbookQuickMd from './skill/playbook-quick.md?raw';
import outputContractMd from './skill/output-contract.md?raw';
import { METRIC_CATALOG } from '../dataset/buildAnalyticsDataset.js';
import { SKILL_VERSION } from '../versions.js';

function buildMetricGlossary() {
  const lines = ['## Metric Glossary (Single Source of Truth)'];
  for (const m of Object.values(METRIC_CATALOG)) {
    const rpeTag = m.rpeDependent ? ' [RPE-dependent]' : '';
    lines.push(`- \`${m.key}\` (${m.unit}): ${m.description}${rpeTag}`);
  }
  return lines.join('\n');
}

export function buildSystemPrompt({ depth = 'deep', language = 'en' } = {}) {
  const playbook = depth === 'quick' ? playbookQuickMd : playbookDeepMd;
  const langInstruction =
    language && language !== 'en'
      ? `\n# Output Language\nWrite all human-readable report prose (headline, takeaways, titles, findings, interpretations, recommendations, limitations) in **${language}**, while keeping JSON keys, tool arguments, entity names, and {{E#.field}} placeholders strictly exact.\n`
      : '\n# Output Language\nWrite all report prose in clear, concise **English**.\n';

  return [
    `<!-- Iron Stats Smart Analytics Skill v${SKILL_VERSION} (${depth}) -->`,
    coreMd.trim(),
    dataModelMd.trim(),
    buildMetricGlossary(),
    exerciseScienceMd.trim(),
    statisticsMd.trim(),
    playbook.trim(),
    outputContractMd.trim(),
    langInstruction.trim(),
  ].join('\n\n---\n\n');
}

/**
 * Report schema definition and JSON schema for DeepSeek's submit_report tool.
 */

export const REPORT_CATEGORIES = [
  'progression',
  'correlation',
  'bottleneck',
  'balance',
  'fatigue-recovery',
  'body-composition',
  'anomaly',
  'technique',
];

export const CONFIDENCE_LEVELS = ['high', 'medium', 'low', 'exploratory'];

export const CHART_TYPES = ['line', 'scatter', 'bar', 'dualAxis', 'distribution'];

export const SUBMIT_REPORT_TOOL_SCHEMA = {
  type: 'object',
  required: ['summary', 'insights', 'bottlenecks', 'rejectedHypotheses', 'limitations'],
  properties: {
    summary: {
      type: 'object',
      required: ['headline', 'keyTakeaways'],
      properties: {
        headline: { type: 'string', description: 'Concise 1-sentence overarching takeaway.' },
        keyTakeaways: {
          type: 'array',
          minItems: 3,
          maxItems: 5,
          items: { type: 'string' },
          description: '3 to 5 crisp bullets using {{E#.field}} placeholders for numbers.',
        },
      },
    },
    insights: {
      type: 'array',
      minItems: 1,
      maxItems: 12,
      items: {
        type: 'object',
        required: ['id', 'category', 'title', 'finding', 'interpretation', 'evidence', 'confidence'],
        properties: {
          id: { type: 'string' },
          category: { type: 'string', enum: REPORT_CATEGORIES },
          title: { type: 'string' },
          finding: { type: 'string', description: 'Evidence-grounded finding using {{E#.field|decimals}} placeholders.' },
          interpretation: { type: 'string', description: 'Exercise-science reasoning explaining why this matters.' },
          evidence: { type: 'array', minItems: 1, items: { type: 'string' } },
          hypothesisId: { type: 'string' },
          confidence: { type: 'string', enum: CONFIDENCE_LEVELS },
          isMechanisticHypothesis: { type: 'boolean' },
          chart: {
            type: 'object',
            required: ['type', 'evidenceId'],
            properties: {
              type: { type: 'string', enum: CHART_TYPES },
              evidenceId: { type: 'string' },
              x: { type: 'string' },
              y: { type: 'string' },
              y2: { type: 'string' },
              title: { type: 'string' },
            },
          },
          recommendation: {
            type: 'object',
            required: ['action', 'rationale', 'successMetric'],
            properties: {
              action: { type: 'string' },
              rationale: { type: 'string' },
              successMetric: {
                type: 'object',
                required: ['description'],
                properties: {
                  description: { type: 'string' },
                  metric: { type: 'string' },
                  scope: { type: 'object' },
                },
              },
            },
          },
          caveats: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    bottlenecks: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        required: ['rank', 'title', 'evidence', 'impact', 'recommendation'],
        properties: {
          rank: { type: 'integer' },
          title: { type: 'string' },
          evidence: { type: 'array', minItems: 1, items: { type: 'string' } },
          impact: { type: 'string' },
          recommendation: { type: 'string' },
        },
      },
    },
    rejectedHypotheses: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        required: ['statement', 'evidence', 'why'],
        properties: {
          statement: { type: 'string' },
          evidence: { type: 'array', minItems: 1, items: { type: 'string' } },
          why: { type: 'string' },
        },
      },
    },
    limitations: {
      type: 'array',
      items: { type: 'string' },
    },
  },
};

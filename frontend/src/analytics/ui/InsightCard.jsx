import React from 'react';
import { CheckCircle2, Target, AlertTriangle } from 'lucide-react';
import { PLACEHOLDER_REGEX, extractByPath, formatLedgerValue } from '../grounding/evidenceLedger.js';
import { InsightChart } from './InsightChart.jsx';

const CONFIDENCE_STYLE = {
  high: { label: 'High confidence', color: '#10b981', bg: 'rgba(16, 185, 129, 0.14)', border: 'rgba(16, 185, 129, 0.35)' },
  medium: { label: 'Medium confidence', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.14)', border: 'rgba(56, 189, 248, 0.35)' },
  low: { label: 'Low confidence', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.14)', border: 'rgba(245, 158, 11, 0.35)' },
  exploratory: { label: 'Exploratory', color: '#a78bfa', bg: 'rgba(167, 139, 250, 0.14)', border: 'rgba(167, 139, 250, 0.35)' },
};

const CATEGORY_LABELS = {
  progression: 'Progression',
  correlation: 'Correlation',
  bottleneck: 'Bottleneck',
  balance: 'Balance',
  'fatigue-recovery': 'Fatigue & Recovery',
  'body-composition': 'Body Composition',
  anomaly: 'Anomaly',
  technique: 'Technique',
};

/**
 * Renders prose containing {{E#.field|decimals}} placeholders as interactive tappable
 * ledger-backed value pills. Clicking any pill opens EvidenceDrawer for that E#.
 */
export function GroundedProse({ text, evidenceLedger, onOpenEvidence }) {
  if (typeof text !== 'string' || !text) return null;
  const parts = [];
  let lastIndex = 0;
  const regex = new RegExp(PLACEHOLDER_REGEX.source, 'g');
  let match;
  let keyIdx = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={`t-${keyIdx++}`}>{text.slice(lastIndex, match.index)}</span>);
    }
    const [raw, evidenceId, fieldPath, decStr] = match;
    const entry = evidenceLedger?.[evidenceId];
    const val = entry ? extractByPath(entry.data, fieldPath) : undefined;
    const decimals = decStr !== undefined ? parseInt(decStr, 10) : null;
    const formatted = val !== undefined ? formatLedgerValue(val, decimals) : raw;

    parts.push(
      <button
        key={`p-${keyIdx++}`}
        type="button"
        className="sa-ledger-pill"
        onClick={() => entry && onOpenEvidence(entry)}
        title={`Verified from ${evidenceId}.${fieldPath} — tap to inspect`}
      >
        {formatted}
      </button>
    );
    lastIndex = match.index + raw.length;
  }

  if (lastIndex < text.length) {
    parts.push(<span key={`t-${keyIdx}`}>{text.slice(lastIndex)}</span>);
  }
  return <>{parts}</>;
}

export const InsightCard = React.memo(({ insight, evidenceLedger, onOpenEvidence, isMobile }) => {
  const conf = CONFIDENCE_STYLE[insight.confidence] || CONFIDENCE_STYLE.exploratory;
  const catLabel = CATEGORY_LABELS[insight.category] || insight.category;

  return (
    <article className="sa-insight-card">
      <div className="sa-insight-top">
        <div className="sa-insight-badges">
          <span className="sa-category-badge">{catLabel}</span>
          <span
            className="sa-confidence-badge"
            style={{ color: conf.color, background: conf.bg, borderColor: conf.border }}
          >
            {conf.label}
          </span>
        </div>
        <div className="sa-evidence-refs">
          {(insight.evidence || []).map((eid) => {
            const entry = evidenceLedger?.[eid];
            return (
              <button
                key={eid}
                type="button"
                className="sa-evidence-chip"
                onClick={() => entry && onOpenEvidence(entry)}
                disabled={!entry}
                title={`Inspect evidence ${eid}`}
              >
                {eid}
              </button>
            );
          })}
        </div>
      </div>

      <h3 className="sa-insight-title">{insight.title}</h3>

      <p className="sa-insight-finding">
        <GroundedProse text={insight.finding} evidenceLedger={evidenceLedger} onOpenEvidence={onOpenEvidence} />
      </p>

      {insight.chart && (
        <InsightChart chart={insight.chart} evidenceLedger={evidenceLedger} isMobile={isMobile} />
      )}

      <p className="sa-insight-interp">
        <GroundedProse text={insight.interpretation} evidenceLedger={evidenceLedger} onOpenEvidence={onOpenEvidence} />
      </p>

      {insight.recommendation && (
        <div className="sa-rec-box">
          <div className="sa-rec-head">
            <CheckCircle2 size={14} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
            <span>Actionable Next Step</span>
          </div>
          <div className="sa-rec-action">
            <GroundedProse
              text={insight.recommendation.action}
              evidenceLedger={evidenceLedger}
              onOpenEvidence={onOpenEvidence}
            />
          </div>
          {insight.recommendation.rationale && (
            <div className="sa-rec-rationale">{insight.recommendation.rationale}</div>
          )}
          {insight.recommendation.successMetric?.description && (
            <div className="sa-rec-metric">
              <Target size={12} style={{ flexShrink: 0 }} />
              <span>Track: {insight.recommendation.successMetric.description}</span>
            </div>
          )}
        </div>
      )}

      {Array.isArray(insight.caveats) && insight.caveats.length > 0 && (
        <div className="sa-caveats-inline">
          <AlertTriangle size={12} style={{ color: '#f59e0b', flexShrink: 0, marginTop: '2px' }} />
          <span>{insight.caveats.join(' • ')}</span>
        </div>
      )}
    </article>
  );
});

InsightCard.displayName = 'InsightCard';

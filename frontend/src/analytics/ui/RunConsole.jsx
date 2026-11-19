import { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Sparkles,
  StopCircle,
} from 'lucide-react';

const PHASES = [
  { id: 'orient', label: 'Orient' },
  { id: 'explore', label: 'Explore' },
  { id: 'synthesize', label: 'Write' },
  { id: 'validate', label: 'Validate' },
];

function phaseRank(phase) {
  if (phase === 'orient') return 0;
  if (phase === 'explore') return 1;
  if (phase === 'synthesize') return 2;
  if (phase === 'validate' || phase === 'repair') return 3;
  if (phase === 'done') return 4;
  return 1;
}

export function RunConsole({
  phase,
  steps,
  hypotheses,
  earlyHighlights,
  reasoningChunks,
  usage,
  elapsedMs,
  onCancel,
}) {
  const [expandedStep, setExpandedStep] = useState(null);
  const [showThoughts, setShowThoughts] = useState(false);

  const curRank = phaseRank(phase);
  const secs = Math.max(0, Math.round(elapsedMs / 1000));
  const cachePct =
    usage.promptTokens > 0 ? Math.round((usage.cacheHitTokens / usage.promptTokens) * 100) : 0;

  return (
    <section className="sa-card sa-console-card">
      <div className="sa-card-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Loader2 size={16} className="sa-spin" style={{ color: 'var(--accent-primary)' }} />
          <span className="sa-section-title">
            {phase === 'repair' ? 'Repairing & Re-verifying Report…' : 'Autonomous Investigation Running…'}
          </span>
        </div>
        <button type="button" className="sa-pill-btn danger" onClick={onCancel}>
          <StopCircle size={13} /> Cancel
        </button>
      </div>

      {/* Phase Stepper */}
      <div className="sa-stepper">
        {PHASES.map((p, idx) => {
          const state = idx < curRank ? 'done' : idx === curRank ? 'active' : 'pending';
          return (
            <div key={p.id} className={`sa-step-node ${state}`}>
              <span className="sa-step-dot" />
              <span>{p.label}</span>
            </div>
          );
        })}
      </div>

      {/* Live Usage Meter */}
      <div className="sa-meter-row">
        <span>{steps.length} tool call{steps.length === 1 ? '' : 's'}</span>
        <span>•</span>
        <span>{(usage.totalTokens || 0).toLocaleString()} tokens{cachePct > 0 ? ` (${cachePct}% cached)` : ''}</span>
        <span>•</span>
        <span>${(usage.costUsd || 0).toFixed(4)}</span>
        <span>•</span>
        <span>{secs}s</span>
      </div>

      {/* Hypothesis Chips */}
      {hypotheses.length > 0 && (
        <div className="sa-hyp-list">
          {hypotheses.map((h) => (
            <div key={h.id} className={`sa-hyp-chip ${h.status}`}>
              {h.status === 'supported' ? (
                <CheckCircle2 size={12} />
              ) : h.status === 'not_supported' ? (
                <XCircle size={12} />
              ) : (
                <Loader2 size={12} className="sa-spin" />
              )}
              <span>
                <strong>{h.id}:</strong> {h.statement}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Early Verified Highlights */}
      {earlyHighlights.length > 0 && (
        <div className="sa-early-box">
          <div className="sa-drawer-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Sparkles size={12} style={{ color: 'var(--accent-primary)' }} /> Early Verified Signals
          </div>
          {earlyHighlights.map((hl) => (
            <div key={hl.evidenceId} className="sa-early-item">
              <span className="sa-evidence-chip">{hl.evidenceId}</span>
              <span>{hl.summaryLine}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tool Trace Feed */}
      <div className="sa-trace-list">
        {steps.map((st) => {
          const isOpen = expandedStep === st.id;
          return (
            <div key={st.id} className="sa-trace-item">
              <button
                type="button"
                className="sa-trace-row"
                onClick={() => setExpandedStep(isOpen ? null : st.id)}
              >
                <span className="sa-trace-left">
                  {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  <span className={st.ok ? 'sa-trace-ok' : 'sa-trace-err'}>
                    {st.ok ? '✓' : '!'}
                  </span>
                  <span>{st.humanLabel}</span>
                </span>
                {st.evidenceId && <span className="sa-evidence-chip">{st.evidenceId}</span>}
              </button>
              {isOpen && (
                <div className="sa-trace-detail">
                  <div><strong>Tool:</strong> {st.toolName}</div>
                  {st.summaryLine && <div><strong>Result:</strong> {st.summaryLine}</div>}
                  {st.args && Object.keys(st.args).length > 0 && (
                    <pre className="sa-trace-pre">{JSON.stringify(st.args, null, 2)}</pre>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Collapsed Agent Thoughts (only if thinking model returned reasoning_content) */}
      {reasoningChunks.length > 0 && (
        <div className="sa-thoughts-wrap">
          <button
            type="button"
            className="sa-text-btn"
            onClick={() => setShowThoughts((v) => !v)}
          >
            {showThoughts ? 'Hide' : 'Show'} model reasoning notes (not verified facts)
          </button>
          {showThoughts && (
            <pre className="sa-trace-pre" style={{ maxHeight: '140px', overflowY: 'auto' }}>
              {reasoningChunks.join('\n---\n')}
            </pre>
          )}
        </div>
      )}
    </section>
  );
}

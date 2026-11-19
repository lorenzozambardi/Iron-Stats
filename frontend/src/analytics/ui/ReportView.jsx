import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Download,
  RefreshCw,
  Trash2,
  ShieldCheck,
  XCircle,
  Info,
} from 'lucide-react';
import { formatDisplayDate } from '../../profileUtils.js';
import { GroundedProse, InsightCard } from './InsightCard.jsx';
import { exportReportMarkdown } from '../storage/reportStore.js';

export function ReportView({
  report,
  isOutdated,
  outdatedDiffs,
  dateFormat,
  isMobile,
  onOpenEvidence,
  onRerun,
  onDelete,
  canRun,
}) {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [exportMsg, setExportMsg] = useState(null);

  const ledger = report?.evidenceLedger || {};
  const categories = useMemo(() => {
    const set = new Set((report?.insights || []).map((i) => i.category));
    return ['all', ...Array.from(set)];
  }, [report]);

  const filteredInsights = useMemo(() => {
    const list = report?.insights || [];
    if (selectedCategory === 'all') return list;
    return list.filter((i) => i.category === selectedCategory);
  }, [report, selectedCategory]);

  if (!report) return null;

  const handleExport = async () => {
    try {
      const res = await exportReportMarkdown(report);
      setExportMsg(`Exported to ${res.exportedTo}`);
      setTimeout(() => setExportMsg(null), 3500);
    } catch (err) {
      setExportMsg(`Export failed: ${err?.message || 'error'}`);
    }
  };

  const genDate = report.generatedAt ? formatDisplayDate(report.generatedAt.slice(0, 10), dateFormat) : '';

  return (
    <div className="sa-report-root">
      {/* Outdated Banner */}
      {isOutdated && (
        <div className="sa-inline-alert warn">
          <AlertTriangle size={15} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <strong>Data changed since this report:</strong>{' '}
            {outdatedDiffs.length > 0 ? outdatedDiffs.join(' • ') : 'Logbooks or profile updated.'}
          </div>
          {canRun && (
            <button type="button" className="sa-pill-btn primary" onClick={onRerun}>
              <RefreshCw size={12} /> Re-run
            </button>
          )}
        </div>
      )}

      {/* Partial Verification Notice */}
      {report.partial && (report.removedDuringVerification || []).length > 0 && (
        <div className="sa-inline-alert warn">
          <Info size={15} style={{ flexShrink: 0 }} />
          <span>
            {report.removedDuringVerification.length} draft insight(s) did not pass numeric/citation grounding and were removed during verification.
          </span>
        </div>
      )}

      {/* Hero Summary Card */}
      <section className="sa-card sa-hero-card">
        <div className="sa-hero-meta">
          <span className="sa-grade-badge">
            <ShieldCheck size={13} /> Data Quality {report.dataQuality?.grade || '—'}
          </span>
          <span className="sa-muted">{genDate} • {report.depth} • {report.model}</span>
          <div className="sa-hero-actions">
            <button type="button" className="sa-pill-btn" onClick={handleExport} title="Export Markdown">
              <Download size={13} /> Export
            </button>
            <button type="button" className="sa-pill-btn danger" onClick={() => onDelete(report.id)} title="Delete report">
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {exportMsg && <div className="sa-settings-msg ok">{exportMsg}</div>}

        <h2 className="sa-hero-headline">
          <GroundedProse text={report.summary?.headline} evidenceLedger={ledger} onOpenEvidence={onOpenEvidence} />
        </h2>

        <ul className="sa-takeaways-list">
          {(report.summary?.keyTakeaways || []).map((tk, idx) => (
            <li key={idx}>
              <GroundedProse text={tk} evidenceLedger={ledger} onOpenEvidence={onOpenEvidence} />
            </li>
          ))}
        </ul>

        <div className="sa-tap-hint">
          Tap any highlighted number or <code>E#</code> badge to inspect the exact computed evidence.
        </div>
      </section>

      {/* Category Filter Chips */}
      {categories.length > 2 && (
        <div className="sa-filter-row" role="tablist" aria-label="Filter insights by category">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={selectedCategory === cat}
              className={`sa-filter-chip${selectedCategory === cat ? ' active' : ''}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat === 'all' ? `All (${(report.insights || []).length})` : cat}
            </button>
          ))}
        </div>
      )}

      {/* Insights List */}
      <div className="sa-insights-grid">
        {filteredInsights.map((ins, idx) => (
          <InsightCard
            key={ins.id || idx}
            insight={ins}
            evidenceLedger={ledger}
            onOpenEvidence={onOpenEvidence}
            isMobile={isMobile}
          />
        ))}
      </div>

      {/* Ranked Bottlenecks */}
      {(report.bottlenecks || []).length > 0 && (
        <section className="sa-card">
          <h3 className="sa-section-title" style={{ marginBottom: '10px' }}>Ranked Bottlenecks</h3>
          <div className="sa-bneck-list">
            {report.bottlenecks.map((b, idx) => (
              <div key={idx} className="sa-bneck-row">
                <span className="sa-bneck-rank">#{b.rank || idx + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="sa-bneck-title">{b.title}</div>
                  <div className="sa-bneck-impact">
                    <GroundedProse text={b.impact} evidenceLedger={ledger} onOpenEvidence={onOpenEvidence} />
                  </div>
                  <div className="sa-bneck-rec">
                    <strong>Fix:</strong>{' '}
                    <GroundedProse text={b.recommendation} evidenceLedger={ledger} onOpenEvidence={onOpenEvidence} />
                  </div>
                </div>
                <div className="sa-evidence-refs">
                  {(b.evidence || []).map((eid) => (
                    <button
                      key={eid}
                      type="button"
                      className="sa-evidence-chip"
                      onClick={() => ledger[eid] && onOpenEvidence(ledger[eid])}
                    >
                      {eid}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Rejected Hypotheses */}
      {(report.rejectedHypotheses || []).length > 0 && (
        <section className="sa-card">
          <h3 className="sa-section-title" style={{ marginBottom: '10px' }}>Tested But Not Supported</h3>
          <div className="sa-rejected-list">
            {report.rejectedHypotheses.map((rh, idx) => (
              <div key={idx} className="sa-rejected-row">
                <XCircle size={14} style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: '2px' }} />
                <div style={{ flex: 1 }}>
                  <div className="sa-rejected-stmt">{rh.statement}</div>
                  <div className="sa-muted" style={{ fontSize: '0.8rem' }}>
                    <GroundedProse text={rh.why} evidenceLedger={ledger} onOpenEvidence={onOpenEvidence} />
                  </div>
                </div>
                <div className="sa-evidence-refs">
                  {(rh.evidence || []).map((eid) => (
                    <button
                      key={eid}
                      type="button"
                      className="sa-evidence-chip"
                      onClick={() => ledger[eid] && onOpenEvidence(ledger[eid])}
                    >
                      {eid}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Limitations */}
      {((report.limitations || []).length > 0 || (report.dataQuality?.caveats || []).length > 0) && (
        <section className="sa-card">
          <h3 className="sa-section-title" style={{ marginBottom: '8px' }}>Limitations & Data Caveats</h3>
          <ul className="sa-limitations-list">
            {(report.dataQuality?.caveats || []).map((c, i) => (
              <li key={`dq-${i}`}>{c}</li>
            ))}
            {(report.limitations || []).map((lim, i) => (
              <li key={`lim-${i}`}>{lim}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Methodology Footer */}
      {report.methodology && (
        <footer className="sa-methodology-footer">
          <span>{report.methodology.toolCalls} tool calls</span>
          <span>•</span>
          <span>{report.methodology.testsRun} statistical tests (FDR {report.methodology.fdrLevel})</span>
          <span>•</span>
          <span>{(report.methodology.promptTokens || 0).toLocaleString()} prompt tokens</span>
          <span>•</span>
          <span>est. ${(report.methodology.estimatedCostUsd || 0).toFixed(4)}</span>
          <span>•</span>
          <span>Skill v{report.skillVersion}</span>
        </footer>
      )}
    </div>
  );
}

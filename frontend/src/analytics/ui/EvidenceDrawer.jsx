import { createPortal } from 'react-dom';
import { X, AlertTriangle, Database } from 'lucide-react';
import { describeToolCallHuman } from '../tools/registry.js';
import { formatLedgerValue } from '../grounding/evidenceLedger.js';

const SCALAR_KEYS = [
  ['n', 'Sample Size (n)'],
  ['firstVal', 'Start Value'],
  ['lastVal', 'Latest Value'],
  ['bestVal', 'Best Value'],
  ['delta', 'Delta'],
  ['deltaPct', 'Delta (%)'],
  ['slope', 'Theil-Sen Slope'],
  ['ratePer7Days', 'Rate / 7 Days'],
  ['rho', 'Spearman ρ'],
  ['r', 'Correlation r'],
  ['hedgesG', "Hedges' g"],
  ['cliffsDelta', "Cliff's Δ"],
  ['ciLower', '95% CI Lower'],
  ['ciUpper', '95% CI Upper'],
  ['pValue', 'p-value'],
  ['sessionQValue', 'Session FDR q-value'],
  ['sessionTestsTotal', 'Session Tests Total'],
  ['value', 'Calculated Value'],
];

export function EvidenceDrawer({ entry, onClose }) {
  if (!entry) return null;

  const d = entry.data || {};
  const scalars = SCALAR_KEYS.filter(([k]) => d[k] !== undefined && d[k] !== null && d[k] !== '');

  const tableRows =
    (Array.isArray(d.series) && d.series.slice(0, 12)) ||
    (Array.isArray(d.distribution) && d.distribution.slice(0, 12)) ||
    (Array.isArray(d.bottlenecks) && d.bottlenecks.slice(0, 10)) ||
    (Array.isArray(d.candidates) && d.candidates.slice(0, 8)) ||
    (Array.isArray(d.sets) && d.sets.slice(0, 12)) ||
    (Array.isArray(d.points) && d.points.slice(0, 12)) ||
    null;

  const flags = [
    ...(entry.qualityFlags || []),
    ...(Array.isArray(d.confounderWarnings) ? d.confounderWarnings : []),
  ];

  return createPortal(
    <div className="sa-drawer-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Evidence ${entry.id}`}>
      <div className="sa-drawer-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sa-drawer-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            <span className="sa-evidence-badge">{entry.id}</span>
            <div style={{ minWidth: 0 }}>
              <div className="sa-drawer-title">{describeToolCallHuman(entry.toolName, entry.args)}</div>
              <div className="sa-drawer-sub">
                <Database size={11} /> {entry.toolName}
              </div>
            </div>
          </div>
          <button type="button" className="sa-icon-btn" onClick={onClose} aria-label="Close evidence drawer">
            <X size={18} />
          </button>
        </div>

        <div className="sa-drawer-body">
          {entry.args && Object.keys(entry.args).length > 0 && (
            <div className="sa-drawer-section">
              <div className="sa-drawer-label">Query Parameters</div>
              <div className="sa-arg-chips">
                {Object.entries(entry.args).map(([k, v]) => (
                  <span key={k} className="sa-arg-chip">
                    <strong>{k}:</strong> {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {scalars.length > 0 && (
            <div className="sa-drawer-section">
              <div className="sa-drawer-label">Computed Statistics</div>
              <div className="sa-stat-grid">
                {scalars.map(([k, label]) => (
                  <div key={k} className="sa-stat-cell">
                    <span className="sa-stat-cell-label">{label}</span>
                    <span className="sa-stat-cell-val">{formatLedgerValue(d[k])}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {flags.length > 0 && (
            <div className="sa-drawer-section">
              <div className="sa-drawer-label">Quality & Confounder Notes</div>
              <div className="sa-flags-list">
                {flags.map((fl, i) => (
                  <div key={i} className="sa-flag-item">
                    <AlertTriangle size={13} style={{ flexShrink: 0, color: '#f59e0b' }} />
                    <span>{String(fl)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tableRows && tableRows.length > 0 && (
            <div className="sa-drawer-section">
              <div className="sa-drawer-label">Underlying Data Preview ({tableRows.length} rows)</div>
              <div className="sa-mini-table-wrap">
                <table className="sa-mini-table">
                  <thead>
                    <tr>
                      {Object.keys(tableRows[0])
                        .filter((k) => typeof tableRows[0][k] !== 'object' || tableRows[0][k] === null)
                        .slice(0, 6)
                        .map((col) => (
                          <th key={col}>{col}</th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((row, rIdx) => (
                      <tr key={rIdx}>
                        {Object.keys(tableRows[0])
                          .filter((k) => typeof tableRows[0][k] !== 'object' || tableRows[0][k] === null)
                          .slice(0, 6)
                          .map((col) => (
                            <td key={col}>{formatLedgerValue(row[col])}</td>
                          ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

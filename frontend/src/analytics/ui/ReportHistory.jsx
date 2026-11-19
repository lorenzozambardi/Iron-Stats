import { createPortal } from 'react-dom';
import { X, Trash2, Clock } from 'lucide-react';
import { formatDisplayDate } from '../../profileUtils.js';

export function ReportHistory({ reports, activeReportId, currentFingerprint, dateFormat, onSelect, onDelete, onClose }) {
  return createPortal(
    <div className="sa-drawer-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Report History">
      <div className="sa-drawer-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sa-drawer-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={16} style={{ color: 'var(--accent-primary)' }} />
            <div className="sa-drawer-title">Saved Reports ({reports.length})</div>
          </div>
          <button type="button" className="sa-icon-btn" onClick={onClose} aria-label="Close history">
            <X size={18} />
          </button>
        </div>

        <div className="sa-drawer-body">
          {reports.length === 0 ? (
            <div className="sa-muted" style={{ padding: '20px 0', textAlign: 'center' }}>
              No cached reports yet. Reports are saved locally and remain viewable offline.
            </div>
          ) : (
            <div className="sa-history-list">
              {reports.map((r) => {
                const isSelected = r.id === activeReportId;
                const isOutdated = currentFingerprint && r.datasetFingerprint !== currentFingerprint;
                const dateStr = r.generatedAt ? formatDisplayDate(r.generatedAt.slice(0, 10), dateFormat) : '';
                return (
                  <div key={r.id} className={`sa-history-item${isSelected ? ' active' : ''}`}>
                    <button
                      type="button"
                      className="sa-history-select"
                      onClick={() => {
                        onSelect(r.id);
                        onClose();
                      }}
                    >
                      <div className="sa-history-top">
                        <span>{dateStr} • {r.depth}</span>
                        <span className="sa-mini-badge info">{r.insightCount} insights</span>
                        {isOutdated && <span className="sa-mini-badge warn">Outdated</span>}
                      </div>
                      <div className="sa-history-headline">{r.headline}</div>
                    </button>
                    <button
                      type="button"
                      className="sa-icon-btn sm danger"
                      onClick={() => onDelete(r.id)}
                      aria-label="Delete saved report"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

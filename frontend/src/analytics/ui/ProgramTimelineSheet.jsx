import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, X } from 'lucide-react';

export function ProgramTimelineSheet({ macrocycles, programMeta, onSave, onClose }) {
  const [rows, setRows] = useState(() =>
    (programMeta || []).map((m, idx) => {
      const info = (macrocycles || []).find((p) => p.id === m.id);
      return {
        ...m,
        order: idx,
        nMicrocycles: info?.nMicrocycles || 0,
        nSets: info?.nSets || 0,
      };
    })
  );

  const moveRow = (index, dir) => {
    const target = index + dir;
    if (target < 0 || target >= rows.length) return;
    setRows((prev) => {
      const copy = prev.slice();
      const tmp = copy[index];
      copy[index] = copy[target];
      copy[target] = tmp;
      return copy.map((r, i) => ({ ...r, order: i }));
    });
  };

  const patchRow = (id, patch) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const handleSave = () => {
    const map = {};
    rows.forEach((r, idx) => {
      map[r.id] = {
        id: r.id,
        label: r.label || r.id,
        order: idx,
        startDate: r.startDate || null,
        microcycleDays: Math.min(28, Math.max(2, Number(r.microcycleDays) || 7)),
        excluded: Boolean(r.excluded),
        variantOf: r.variantOf || null,
        isFailedBlock: Boolean(r.isFailedBlock),
      };
    });
    onSave(map);
    onClose();
  };

  return createPortal(
    <div className="sa-drawer-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Edit Macrocycle Timeline">
      <div className="sa-drawer-sheet wide" onClick={(e) => e.stopPropagation()}>
        <div className="sa-drawer-header">
          <div>
            <div className="sa-drawer-title">Macrocycle Timeline & Alignment</div>
            <div className="sa-drawer-sub">
              Reorder macrocycles, exclude variants, or set fallback start dates & microcycle lengths (used when session Dates: blocks aren&apos;t present).
            </div>
          </div>
          <button type="button" className="sa-icon-btn" onClick={onClose} aria-label="Close timeline editor">
            <X size={18} />
          </button>
        </div>

        <div className="sa-drawer-body">
          <div className="sa-timeline-list">
            {rows.map((r, idx) => (
              <div key={r.id} className={`sa-timeline-row${r.excluded ? ' excluded' : ''}`}>
                <div className="sa-timeline-row-top">
                  <div className="sa-timeline-order">
                    <button
                      type="button"
                      className="sa-icon-btn sm"
                      onClick={() => moveRow(idx, -1)}
                      disabled={idx === 0}
                      aria-label={`Move ${r.id} earlier`}
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      type="button"
                      className="sa-icon-btn sm"
                      onClick={() => moveRow(idx, 1)}
                      disabled={idx === rows.length - 1}
                      aria-label={`Move ${r.id} later`}
                    >
                      <ArrowDown size={13} />
                    </button>
                  </div>

                  <div className="sa-timeline-ident">
                    <span className="sa-timeline-name">{r.id}</span>
                    <span className="sa-timeline-meta">
                      {r.nMicrocycles} mc • {r.nSets} sets
                    </span>
                    {r.isFailedBlock && <span className="sa-mini-badge err">Failed block</span>}
                    {r.variantOf && <span className="sa-mini-badge info">Variant of {r.variantOf}</span>}
                  </div>

                  <label className="sa-toggle-label">
                    <input
                      type="checkbox"
                      checked={!r.excluded}
                      onChange={(e) => patchRow(r.id, { excluded: !e.target.checked })}
                    />
                    <span>Include</span>
                  </label>
                </div>

                {!r.excluded && (
                  <div className="sa-timeline-controls">
                    <label className="sa-inline-field">
                      <span>Start Date</span>
                      <input
                        type="date"
                        className="sa-input sm"
                        value={r.startDate || ''}
                        onChange={(e) => patchRow(r.id, { startDate: e.target.value || null })}
                      />
                    </label>
                    <label className="sa-inline-field">
                      <span>Days / Microcycle</span>
                      <input
                        type="number"
                        min={2}
                        max={28}
                        className="sa-input sm num"
                        value={r.microcycleDays || 7}
                        onChange={(e) => patchRow(r.id, { microcycleDays: Number(e.target.value) || 7 })}
                      />
                    </label>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="sa-drawer-footer">
          <button type="button" className="sa-pill-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="sa-pill-btn primary" onClick={handleSave}>
            Save Timeline
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

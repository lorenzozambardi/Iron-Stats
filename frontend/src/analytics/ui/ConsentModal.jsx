import { createPortal } from 'react-dom';
import { ShieldAlert, X } from 'lucide-react';

export function ConsentModal({ anonymize, onToggleAnonymize, onAccept, onClose }) {
  return createPortal(
    <div className="sa-drawer-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Privacy & Data Disclosure">
      <div className="sa-drawer-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sa-drawer-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldAlert size={18} style={{ color: 'var(--accent-primary)' }} />
            <div className="sa-drawer-title">Before Running Smart Analytics</div>
          </div>
          <button type="button" className="sa-icon-btn" onClick={onClose} aria-label="Close consent dialog">
            <X size={18} />
          </button>
        </div>

        <div className="sa-drawer-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p className="sa-consent-text">
            Smart Analytics computes all training and body-composition statistics locally on your device, then sends compact aggregated tool outputs to <strong>DeepSeek&apos;s API</strong> using your own API key.
          </p>

          <div className="sa-consent-box">
            <div><strong>Sent to DeepSeek:</strong> aggregated exercise/muscle stats, exercise names, macrocycle labels, weight/BF trends, age &amp; sex (when profile is customized).</div>
            <div><strong>Never sent:</strong> your full raw logbook files, birth date, or local storage paths. Your API key is sent only as the standard Authorization header directly to DeepSeek.</div>
          </div>

          <label className="sa-toggle-label" style={{ padding: '6px 0' }}>
            <input
              type="checkbox"
              checked={Boolean(anonymize)}
              onChange={(e) => onToggleAnonymize(e.target.checked)}
            />
            <span>Anonymize macrocycle names (send as Block_1, Block_2…)</span>
          </label>
        </div>

        <div className="sa-drawer-footer">
          <button type="button" className="sa-pill-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="sa-pill-btn primary" onClick={onAccept}>
            I Understand — Run Analysis
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

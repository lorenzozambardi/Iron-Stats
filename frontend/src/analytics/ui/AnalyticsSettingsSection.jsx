import { useEffect, useState } from 'react';
import {
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  KeyRound,
  Sparkles,
  Trash2,
  AlertCircle,
  ClipboardPaste,
} from 'lucide-react';
import { useAnalyticsSettings } from './useAnalyticsSettings.js';
import { REPORT_LANGUAGES } from '../storage/analyticsSettings.js';
import { DEPTH_PRESETS } from '../agent/agentLoop.js';

export function AnalyticsSettingsSection() {
  const {
    settings,
    hasKey,
    isNativeSecure,
    testingKey,
    testMessage,
    updateSettings,
    saveKey,
    removeKey,
    testConnection,
    clearCachedReports,
  } = useAnalyticsSettings();

  const [isOpen, setIsOpen] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [clearedMsg, setClearedMsg] = useState(false);

  useEffect(() => {
    const onExpand = () => setIsOpen(true);
    window.addEventListener('expand-analytics-settings', onExpand);
    return () => window.removeEventListener('expand-analytics-settings', onExpand);
  }, []);

  const handleSaveKey = async () => {
    if (!keyInput.trim()) return;
    await saveKey(keyInput);
    setKeyInput('');
  };

  const handleTest = async () => {
    const res = await testConnection(keyInput.trim() || null);
    if (res.ok && keyInput.trim()) {
      setKeyInput('');
    }
  };

  const handlePaste = async () => {
    try {
      const txt = await navigator.clipboard.readText();
      if (txt) setKeyInput(txt.trim());
    } catch {
      // Clipboard API may be restricted
    }
  };

  const handleClearReports = async () => {
    await clearCachedReports();
    setClearedMsg(true);
    setTimeout(() => setClearedMsg(false), 2000);
  };

  const statusLabel = !hasKey
    ? 'Not set'
    : settings.keyStatus === 'valid'
      ? 'Connected'
      : settings.keyStatus === 'invalid'
        ? 'Invalid key'
        : 'Saved';

  return (
    <div className="settings-section">
      <div className="settings-section-label">AI Analytics</div>
      <div className="settings-group-card">
        <button
          type="button"
          className="settings-color-row-btn"
          onClick={() => setIsOpen((v) => !v)}
          aria-expanded={isOpen}
        >
          <span className="settings-row-label" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Sparkles size={14} style={{ color: 'var(--accent-primary)' }} />
            DeepSeek Agent
          </span>
          <span className="settings-color-value">
            <span
              className="settings-color-name"
              style={{
                color:
                  settings.keyStatus === 'valid'
                    ? '#10b981'
                    : settings.keyStatus === 'invalid'
                      ? '#f43f5e'
                      : 'var(--text-secondary)',
              }}
            >
              {statusLabel}
            </span>
            <ChevronDown size={14} className={`settings-row-chevron${isOpen ? ' open' : ''}`} />
          </span>
        </button>

        {isOpen && (
          <div className="sa-settings-body">
            {/* API Key Row */}
            <div className="sa-settings-field">
              <div className="sa-settings-field-head">
                <span className="sa-settings-sublabel">
                  <KeyRound size={12} /> DeepSeek API Key
                </span>
                {hasKey && (
                  <button
                    type="button"
                    className="sa-text-btn danger"
                    onClick={removeKey}
                    aria-label="Remove DeepSeek API key"
                  >
                    <Trash2 size={12} /> Remove
                  </button>
                )}
              </div>

              <div className="sa-key-input-row">
                <input
                  type={showKey ? 'text' : 'password'}
                  className="sa-input"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder={hasKey ? '•••••••••••• (saved — enter new to replace)' : 'sk-...'}
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="DeepSeek API Key"
                />
                <button
                  type="button"
                  className="sa-icon-btn"
                  onClick={() => setShowKey((s) => !s)}
                  title={showKey ? 'Hide key' : 'Show key'}
                  aria-label={showKey ? 'Hide key' : 'Show key'}
                >
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button
                  type="button"
                  className="sa-icon-btn"
                  onClick={handlePaste}
                  title="Paste from clipboard"
                  aria-label="Paste key"
                >
                  <ClipboardPaste size={14} />
                </button>
              </div>

              <div className="sa-key-actions">
                {keyInput.trim() && (
                  <button type="button" className="sa-pill-btn" onClick={handleSaveKey}>
                    Save Key
                  </button>
                )}
                <button
                  type="button"
                  className="sa-pill-btn primary"
                  onClick={handleTest}
                  disabled={testingKey || (!hasKey && !keyInput.trim())}
                >
                  {testingKey ? 'Testing…' : 'Test Connection'}
                </button>
              </div>

              {testMessage && (
                <div className={`sa-settings-msg ${testMessage.ok ? 'ok' : 'err'}`}>
                  {testMessage.ok ? <Check size={13} /> : <AlertCircle size={13} />}
                  <span>{testMessage.text}</span>
                </div>
              )}

              {!isNativeSecure && (
                <div className="sa-settings-note">
                  Web mode stores the key in browser storage (less secure than Android Keystore).
                </div>
              )}
            </div>

            {/* Model */}
            <div className="settings-group-row with-divider" style={{ padding: '10px 0' }}>
              <span className="settings-row-label">Model</span>
              <select
                className="settings-program-select"
                value={settings.model}
                onChange={(e) => updateSettings({ model: e.target.value })}
                aria-label="DeepSeek Model"
              >
                {(settings.availableModels || ['deepseek-chat', 'deepseek-reasoner']).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {/* Default Depth */}
            <div className="settings-group-row with-divider" style={{ padding: '10px 0' }}>
              <span className="settings-row-label">Default Depth</span>
              <select
                className="settings-program-select"
                value={settings.depth}
                onChange={(e) => updateSettings({ depth: e.target.value })}
                aria-label="Default Analysis Depth"
              >
                {Object.values(DEPTH_PRESETS).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label} ({d.estCostRange})
                  </option>
                ))}
              </select>
            </div>

            {/* Language */}
            <div className="settings-group-row with-divider" style={{ padding: '10px 0' }}>
              <span className="settings-row-label">Report Language</span>
              <select
                className="settings-program-select"
                value={settings.language}
                onChange={(e) => updateSettings({ language: e.target.value })}
                aria-label="Report Language"
              >
                {REPORT_LANGUAGES.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Anonymize toggle */}
            <div className="settings-group-row with-divider" style={{ padding: '10px 0' }}>
              <span className="settings-row-label">Anonymize Macrocycles</span>
              <input
                type="checkbox"
                checked={Boolean(settings.anonymize)}
                onChange={(e) => updateSettings({ anonymize: e.target.checked })}
                aria-label="Anonymize macrocycle names"
                style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
              />
            </div>

            {/* Clear reports */}
            <div className="settings-group-row with-divider" style={{ padding: '10px 0 2px' }}>
              <span className="settings-row-label">Cached Reports</span>
              <button type="button" className="sa-text-btn" onClick={handleClearReports}>
                {clearedMsg ? 'Cleared ✓' : 'Clear All'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

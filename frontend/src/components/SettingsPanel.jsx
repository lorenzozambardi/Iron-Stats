import { useState } from 'react';
import {
  FolderOpen,
  ChevronDown,
  AlertCircle,
  RotateCcw,
  RefreshCw,
  Plus,
  SlidersHorizontal,
  Check
} from 'lucide-react';

const resolveColor = (value, list, colorKey = 'color') => {
  if (!value) return '#000000';
  if (value.startsWith('#')) return value;
  const match = list.find(item => item.id === value);
  return match ? match[colorKey] : '#000000';
};

const resolveLabel = (value, list) => {
  if (!value) return 'Custom';
  if (value.startsWith('#')) return value.toUpperCase();
  const match = list.find(item => item.id === value);
  return match ? match.label : value;
};

export const SettingsPanel = ({
  editorType,
  setEditorType,
  editorMode,
  setEditorMode,
  appPalette,
  setAppPalette,
  APP_PALETTES,
  secAccentPalette,
  setSecAccentPalette,
  bgPalette,
  setBgPalette,
  BG_PALETTES,
  secPalette,
  setSecPalette,
  SEC_PALETTES,
  // Optional program / storage controls
  showProgramSelector = false,
  currentProgram,
  handleProgramChange,
  programs,
  setShowNewProgramModal,
  syncStatus,
  // Storage settings
  showStorageSettings,
  toggleStorageSettings,
  isStorageClosing,
  getStorageConfig,
  handlePickFolder,
  storagePickError,
  handleResetStorage,
  pendingDirType,
  setPendingDirType,
  pendingSubfolder,
  setPendingSubfolder,
  applyStorageConfig
}) => {
  const [openColorSlot, setOpenColorSlot] = useState(null);

  const toggleSlot = (slot) => {
    setOpenColorSlot(prev => (prev === slot ? null : slot));
  };

  const colorRows = [
    {
      id: 'accent',
      label: 'Accent',
      value: appPalette,
      onChange: setAppPalette,
      items: APP_PALETTES,
      colorKey: 'color',
      allowHex: false,
      isDark: false
    },
    {
      id: 'secondary',
      label: 'Secondary',
      value: secAccentPalette,
      onChange: setSecAccentPalette,
      items: APP_PALETTES,
      colorKey: 'color',
      allowHex: false,
      isDark: false
    },
    {
      id: 'background',
      label: 'Background',
      value: bgPalette,
      onChange: setBgPalette,
      items: BG_PALETTES,
      colorKey: 'primary',
      allowHex: true,
      isDark: true
    },
    {
      id: 'surface',
      label: 'Surface',
      value: secPalette,
      onChange: setSecPalette,
      items: SEC_PALETTES,
      colorKey: 'color',
      allowHex: true,
      isDark: true
    }
  ];

  const syncText =
    syncStatus === 'syncing'
      ? 'Saving...'
      : syncStatus === 'error'
        ? 'Sync Error'
        : syncStatus === 'saved'
          ? `Synced with ${currentProgram}.md`
          : 'Offline';

  return (
    <div className="settings-panel-root">
      <div className="settings-panel-header">
        <SlidersHorizontal size={15} className="settings-header-icon" />
        <span className="settings-header-title">Settings</span>
      </div>

      {/* Workspace Section */}
      <div className="settings-section">
        <div className="settings-section-label">Workspace</div>
        <div className="settings-group-card">
          {showProgramSelector && (
            <div className="settings-group-row settings-program-row-wrap">
              <div className="settings-program-left">
                <span className="settings-row-label">Program</span>
                <div className="settings-sync-row">
                  <span className={`status-dot ${syncStatus}`} />
                  <span className="settings-sync-text">{syncText}</span>
                </div>
              </div>
              <div className="settings-program-controls">
                <select
                  className="settings-program-select"
                  value={currentProgram}
                  onChange={(e) => handleProgramChange(e.target.value)}
                  aria-label="Active Program"
                >
                  {programs.map(prog => (
                    <option key={prog} value={prog}>
                      {prog}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="settings-icon-btn"
                  onClick={() => setShowNewProgramModal(true)}
                  title="Create New Program"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Storage Folder Accordion */}
          <div className={`storage-settings-container${showProgramSelector ? ' with-divider' : ''}`}>
            <button
              type="button"
              className="storage-toggle-btn settings-storage-btn"
              onClick={toggleStorageSettings}
            >
              <FolderOpen size={15} className="icon-folder" />
              <span style={{ flex: 1 }}>Storage Folder</span>
              <ChevronDown size={14} className={`storage-chevron${showStorageSettings ? ' open' : ''}`} />
            </button>

            {(() => {
              const cfg = getStorageConfig();
              const isCustom = cfg.dirType === 'custom' && cfg.safUri;
              const isExpanded = showStorageSettings && !isStorageClosing;
              return (
                <div
                  className={`settings-storage-collapse${isExpanded ? ' open' : ''}`}
                  aria-hidden={!isExpanded}
                >
                  <div className="settings-storage-collapse-inner">
                    <div className="storage-panel settings-storage-drawer">
                      <div className="settings-storage-current">
                        <div className="settings-storage-current-info">
                          <span className="settings-storage-sublabel">Current</span>
                          <span className={`settings-storage-path${isCustom ? ' custom' : ''}`}>
                            {isCustom ? cfg.safDisplayName : `Documents/${cfg.subfolder}`}
                          </span>
                        </div>
                        <div className="settings-storage-current-actions">
                          <button type="button" className="settings-storage-pill-primary" onClick={handlePickFolder}>
                            <FolderOpen size={13} />
                            <span>Pick Folder</span>
                          </button>
                          {isCustom && (
                            <button
                              type="button"
                              className="settings-icon-btn"
                              onClick={handleResetStorage}
                              title="Reset to Default"
                            >
                              <RotateCcw size={13} />
                            </button>
                          )}
                        </div>
                      </div>

                      {storagePickError && (
                        <div className="storage-error-alert">
                          <AlertCircle size={14} style={{ flexShrink: 0 }} />
                          <span>{storagePickError}</span>
                        </div>
                      )}

                      <div className="settings-storage-standard">
                        <span className="settings-storage-sublabel">Standard Location</span>

                        <div className="settings-storage-row">
                          <span className="settings-row-label">Location</span>
                          <select
                            className="settings-program-select settings-storage-select"
                            value={pendingDirType === 'custom' ? 'documents' : pendingDirType}
                            onChange={e => setPendingDirType(e.target.value)}
                            aria-label="Location Type"
                          >
                            <option value="documents">Public Documents</option>
                            <option value="data">Private Storage</option>
                          </select>
                        </div>

                        <div className="settings-storage-row">
                          <span className="settings-row-label">Subfolder</span>
                          <input
                            type="text"
                            className="settings-storage-input"
                            value={pendingSubfolder}
                            onChange={e => setPendingSubfolder(e.target.value)}
                            placeholder="Iron Stats"
                            aria-label="Subfolder Name"
                          />
                        </div>

                        <div className="settings-storage-footer">
                          <span className="settings-storage-preview">
                            {pendingDirType === 'data'
                              ? `Private/${pendingSubfolder || '(root)'}`
                              : `Documents/${pendingSubfolder || '(root)'}`}
                          </span>
                          <button type="button" className="settings-storage-pill-apply" onClick={applyStorageConfig}>
                            <RefreshCw size={12} />
                            <span>Apply</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Editor Section */}
      <div className="settings-section">
        <div className="settings-section-label">Editor Mode</div>
        <div className="settings-pill-toggle settings-segmented">
          <div className={`settings-pill-indicator ${editorType}`} />
          <button
            type="button"
            onClick={() => { setEditorType('manual'); localStorage.setItem('editor-type', 'manual'); }}
            className={`settings-pill-btn ${editorType === 'manual' ? 'active' : ''}`}
          >
            Manual
          </button>
          <button
            type="button"
            onClick={() => {
              setEditorType('easy');
              localStorage.setItem('editor-type', 'easy');
              if (editorMode === 'split') setEditorMode('edit');
            }}
            className={`settings-pill-btn ${editorType === 'easy' ? 'active' : ''}`}
          >
            Easy
          </button>
        </div>
      </div>

      {/* Appearance Section */}
      <div className="settings-section">
        <div className="settings-section-label">Appearance</div>
        <div className="settings-group-card">
          {colorRows.map((row, idx) => {
            const isOpen = openColorSlot === row.id;
            const activeColor = resolveColor(row.value, row.items, row.colorKey);
            const activeLabel = resolveLabel(row.value, row.items);
            const isHexValue = typeof row.value === 'string' && row.value.startsWith('#');

            return (
              <div
                key={row.id}
                className={`settings-color-row-group${idx > 0 ? ' with-divider' : ''}${isOpen ? ' open' : ''}`}
              >
                <button
                  type="button"
                  className="settings-color-row-btn"
                  onClick={() => toggleSlot(row.id)}
                  aria-expanded={isOpen}
                >
                  <span className="settings-row-label">{row.label}</span>
                  <span className="settings-color-value">
                    <span className="settings-color-name">{activeLabel}</span>
                    <span
                      className="settings-color-dot"
                      style={{ background: activeColor }}
                    />
                    <ChevronDown size={14} className={`settings-row-chevron${isOpen ? ' open' : ''}`} />
                  </span>
                </button>

                {isOpen && (
                  <div className="settings-swatch-drawer">
                    <div className="settings-swatch-grid">
                      {row.items.map(item => {
                        const swatchColor = item[row.colorKey];
                        const selected = row.value === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => row.onChange(item.id)}
                            className={`settings-swatch-btn${row.isDark ? ' dark' : ''}${selected ? ' selected' : ''}`}
                            style={{ background: swatchColor }}
                            title={item.label}
                            aria-label={`${row.label}: ${item.label}`}
                          >
                            {selected && <Check size={12} strokeWidth={3} className="settings-swatch-check" />}
                          </button>
                        );
                      })}
                    </div>

                    {row.allowHex && (
                      <div className="settings-hex-row">
                        <span className="settings-hex-label">Custom</span>
                        <div className="settings-hex-chip">
                          <span
                            className="settings-hex-dot"
                            style={{ background: isHexValue ? row.value : activeColor }}
                          />
                          <span className="settings-hex-hash">#</span>
                          <input
                            type="text"
                            className="settings-hex-input"
                            value={isHexValue ? row.value.substring(1) : ''}
                            onChange={(e) => row.onChange('#' + e.target.value.replace(/[^0-9a-fA-F]/g, ''))}
                            placeholder="000000"
                            maxLength={6}
                            aria-label={`${row.label} hex color`}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

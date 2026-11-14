import {
  FolderOpen,
  ChevronDown,
  AlertCircle,
  RotateCcw,
  RefreshCw,
  Plus
} from 'lucide-react';

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
  return (
    <>
      <div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Editor Mode</div>
        <div className="settings-pill-toggle">
          <div className={`settings-pill-indicator ${editorType}`}></div>
          <button onClick={() => { setEditorType('manual'); localStorage.setItem('editor-type', 'manual'); }} className={`settings-pill-btn ${editorType==='manual'?'active':''}`}>Manual</button>
          <button onClick={() => { setEditorType('easy'); localStorage.setItem('editor-type', 'easy'); if (editorMode === 'split') setEditorMode('edit'); }} className={`settings-pill-btn ${editorType==='easy'?'active':''}`}>Easy</button>
        </div>
      </div>

      <div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Theme Color</div>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-start', flexWrap: 'wrap' }}>
          {APP_PALETTES.map(p => (
            <button
              key={p.id}
              onClick={() => setAppPalette(p.id)}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: p.color,
                border: appPalette === p.id ? '2px solid white' : '2px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
              title={p.label}
            />
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Secondary Color</div>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-start', flexWrap: 'wrap' }}>
          {APP_PALETTES.map(p => (
            <button
              key={p.id}
              onClick={() => setSecAccentPalette(p.id)}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: p.color,
                border: secAccentPalette === p.id ? '2px solid white' : '2px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
              title={p.label}
            />
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Background Color</div>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-start', flexWrap: 'wrap' }}>
          {BG_PALETTES.map(b => (
            <button
              key={b.id}
              onClick={() => setBgPalette(b.id)}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: b.primary,
                border: bgPalette === b.id ? '2px solid white' : '2px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
              title={b.label}
            />
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '8px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>#</span>
            <input 
              type="text" 
              value={bgPalette.startsWith('#') ? bgPalette.substring(1) : ''}
              onChange={(e) => setBgPalette('#' + e.target.value)}
              placeholder="hex"
              style={{ width: '50px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none' }}
              maxLength={6}
            />
          </div>
        </div>
      </div>

      <div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Secondary Background Color</div>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-start', flexWrap: 'wrap' }}>
          {SEC_PALETTES.map(s => (
            <button
              key={s.id}
              onClick={() => setSecPalette(s.id)}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: s.color,
                border: secPalette === s.id ? '2px solid white' : '2px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
              title={s.label}
            />
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '8px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>#</span>
            <input 
              type="text" 
              value={secPalette.startsWith('#') ? secPalette.substring(1) : ''}
              onChange={(e) => setSecPalette('#' + e.target.value)}
              placeholder="hex"
              style={{ width: '50px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none' }}
              maxLength={6}
            />
          </div>
        </div>
      </div>

      {showProgramSelector && (
        <>
          <div className="program-selector-container">
            <span className="program-label">Program:</span>
            <select 
              className="program-select"
              value={currentProgram}
              onChange={(e) => handleProgramChange(e.target.value)}
            >
              {programs.map(prog => (
                <option key={prog} value={prog}>
                  {prog}
                </option>
              ))}
            </select>
            <button 
              className="btn-icon-small" 
              onClick={() => setShowNewProgramModal(true)}
              title="Create New Program"
            >
              <Plus size={14} />
            </button>
          </div>

          <div className="status-badge">
            <div className={`status-dot ${syncStatus}`}></div>
            <span>
              {syncStatus === 'syncing' ? 'Saving...' :
               syncStatus === 'error' ? 'Sync Error' :
               syncStatus === 'saved' ? `Synced with ${currentProgram}.md` : 'Offline'}
            </span>
          </div>
        </>
      )}

      {/* Storage Folder Settings */}
      <div className="storage-settings-container">
        <button
          className="storage-toggle-btn"
          onClick={toggleStorageSettings}
        >
          <FolderOpen size={15} className="icon-folder" />
          <span style={{ flex: 1 }}>Storage Folder</span>
          <ChevronDown size={14} className={`storage-chevron${showStorageSettings ? ' open' : ''}`} />
        </button>

        {(showStorageSettings || isStorageClosing) && (() => {
          const cfg = getStorageConfig();
          const isCustom = cfg.dirType === 'custom' && cfg.safUri;
          return (
            <div className={`storage-panel${isStorageClosing ? ' closing' : ''}`}>
              <div className="storage-current-row">
                <span className="storage-section-label">Current Folder</span>
                <div className={`storage-status-path${isCustom ? ' custom' : ''}`}>
                  {isCustom ? cfg.safDisplayName : `Documents/${cfg.subfolder}`}
                </div>
              </div>

              <div className="storage-actions-row">
                <button className="storage-primary-btn" onClick={handlePickFolder}>
                  <FolderOpen size={15} />
                  <span>Pick Any Folder</span>
                </button>
                {isCustom && (
                  <button
                    className="storage-reset-btn"
                    onClick={handleResetStorage}
                    title="Reset to Default"
                  >
                    <RotateCcw size={14} />
                  </button>
                )}
              </div>

              {storagePickError && (
                <div className="storage-error-alert">
                  <AlertCircle size={14} style={{ flexShrink: 0 }} />
                  <span>{storagePickError}</span>
                </div>
              )}

              <div className="storage-fallback-section">
                <span className="storage-section-label">Standard Location</span>

                <div className="storage-form-group">
                  <select
                    className="storage-select"
                    value={pendingDirType === 'custom' ? 'documents' : pendingDirType}
                    onChange={e => setPendingDirType(e.target.value)}
                    aria-label="Location Type"
                  >
                    <option value="documents">Public Documents (PC sync)</option>
                    <option value="data">Private App Storage</option>
                  </select>
                </div>

                <div className="storage-form-group">
                  <input
                    type="text"
                    className="storage-input"
                    value={pendingSubfolder}
                    onChange={e => setPendingSubfolder(e.target.value)}
                    placeholder="Subfolder name (e.g. Iron Stats)"
                    aria-label="Subfolder Name"
                  />
                  <div className="storage-path-preview">
                    {pendingDirType === 'data'
                      ? `App private storage/${pendingSubfolder || '(root)'}`
                      : `Documents/${pendingSubfolder || '(root)'}`}
                  </div>
                </div>

                <button className="storage-apply-btn" onClick={applyStorageConfig}>
                  <RefreshCw size={13} />
                  <span>Apply &amp; Refresh</span>
                </button>
              </div>
            </div>
          );
        })()}
      </div>
    </>
  );
};

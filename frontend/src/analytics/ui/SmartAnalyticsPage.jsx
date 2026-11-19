import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Sparkles,
  Clock,
  Play,
  Settings,
  WifiOff,
  AlertTriangle,
  Cpu,
  RotateCcw,
} from 'lucide-react';
import { DEPTH_PRESETS } from '../agent/agentLoop.js';
import { useAnalyticsSettings } from './useAnalyticsSettings.js';
import { useAnalyticsRun } from './useAnalyticsRun.js';
import { ReadinessPanel } from './ReadinessPanel.jsx';
import { ProgramTimelineSheet } from './ProgramTimelineSheet.jsx';
import { RunConsole } from './RunConsole.jsx';
import { ReportView } from './ReportView.jsx';
import { EvidenceDrawer } from './EvidenceDrawer.jsx';
import { ReportHistory } from './ReportHistory.jsx';
import { ConsentModal } from './ConsentModal.jsx';
import { roundNum } from '../tools/formatResult.js';

export default function SmartAnalyticsPage({
  isMobile,
  exercisesDb,
  profile,
  programs,
  dateFormat = 'dd/mm/yyyy',
  onOpenSettings,
  onBack,
}) {
  const [visible, setVisible] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [pendingResume, setPendingResume] = useState(false);
  const [activeEvidence, setActiveEvidence] = useState(null);

  const {
    settings,
    hasKey,
    updateSettings,
    hasConsentForCurrentKey,
    grantConsentForCurrentKey,
  } = useAnalyticsSettings();

  const [depth, setDepth] = useState(() => settings.depth || 'deep');

  const {
    dataset,
    loadingDataset,
    datasetError,
    updateProgramMeta,
    reportIndex,
    activeReport,
    isReportOutdated,
    outdatedDiffs,
    pausedCheckpoint,
    isOnline,
    runState,
    runPhase,
    runSteps,
    runHypotheses,
    earlyHighlights,
    reasoningChunks,
    runUsage,
    runElapsedMs,
    runError,
    offlineSignals,
    startRun,
    cancelRun,
    discardCheckpoint,
    selectReport,
    removeReport,
    runOfflineScan,
  } = useAnalyticsRun({ exercisesDb, profile, programs, settings });

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Hardware back button: close inner drawers/modals before closing the page
  useEffect(() => {
    const handleHardwareBack = () => {
      if (activeEvidence) { setActiveEvidence(null); return; }
      if (timelineOpen) { setTimelineOpen(false); return; }
      if (historyOpen) { setHistoryOpen(false); return; }
      if (consentOpen) { setConsentOpen(false); return; }
      setVisible(false);
      setTimeout(() => onBack(), 200);
    };
    window.addEventListener('close-analytics-page', handleHardwareBack);
    return () => window.removeEventListener('close-analytics-page', handleHardwareBack);
  }, [activeEvidence, timelineOpen, historyOpen, consentOpen, onBack]);

  const handleClose = () => {
    setVisible(false);
    setTimeout(() => onBack(), 200);
  };

  const handleTriggerRun = async (resume = false) => {
    const consented = await hasConsentForCurrentKey();
    if (!consented) {
      setPendingResume(resume);
      setConsentOpen(true);
      return;
    }
    startRun({ depth, resume });
  };

  const handleConsentAccept = async () => {
    await grantConsentForCurrentKey();
    setConsentOpen(false);
    startRun({ depth, resume: pendingResume });
  };

  const handleGoToSettings = () => {
    handleClose();
    setTimeout(() => {
      if (onOpenSettings) onOpenSettings();
      window.dispatchEvent(new Event('expand-analytics-settings'));
    }, 220);
  };

  const activePreset = DEPTH_PRESETS[depth] || DEPTH_PRESETS.deep;
  const canRun = Boolean(
    hasKey &&
    isOnline &&
    dataset?.capabilities?.ready &&
    runState !== 'running'
  );

  let runDisabledReason = null;
  if (!hasKey) runDisabledReason = 'Add your DeepSeek API key in Settings to run the AI agent.';
  else if (!isOnline) runDisabledReason = "You're offline. Past reports and Local Computed Signals remain available.";
  else if (dataset && !dataset.capabilities.ready) runDisabledReason = 'Log at least 4 microcycles or 4 body-composition entries first.';

  return createPortal(
    <div
      className="sa-page-overlay"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'none' : 'translateY(16px)',
      }}
    >
      <button
        type="button"
        onClick={handleClose}
        aria-label="Close Smart Analytics"
        className="sa-close-btn"
      >
        ×
      </button>

      <div className="sa-page-container">
        {/* Header */}
        <header className="sa-page-header">
          <div>
            <div className="sa-page-title-row">
              <span className="profile-preview-icon">
                <Sparkles size={16} />
              </span>
              <h1 className="sa-page-title">Smart Analytics</h1>
            </div>
            <p className="sa-page-sub">
              Evidence-grounded autonomous analysis across your macrocycles, microcycles, and body composition.
            </p>
          </div>
          <div className="sa-header-actions">
            <button type="button" className="sa-pill-btn" onClick={() => setHistoryOpen(true)}>
              <Clock size={14} /> History ({reportIndex.length})
            </button>
          </div>
        </header>

        {/* Readiness Panel */}
        <ReadinessPanel
          dataset={dataset}
          loading={loadingDataset}
          error={datasetError}
          onOpenTimeline={() => setTimelineOpen(true)}
        />

        {/* Run Controls Card */}
        <section className="sa-card sa-controls-card">
          <div className="sa-controls-top">
            <div>
              <div className="sa-section-title">DeepSeek Agent Run</div>
              <div className="sa-muted" style={{ fontSize: '0.78rem', marginTop: '2px' }}>
                Model: <strong>{settings.model}</strong> • Est. {activePreset.estTokensRange} tokens ({activePreset.estCostRange})
              </div>
            </div>

            <div className="sa-depth-segment" role="group" aria-label="Analysis depth">
              {Object.values(DEPTH_PRESETS).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`sa-depth-btn${depth === preset.id ? ' active' : ''}`}
                  onClick={() => {
                    setDepth(preset.id);
                    updateSettings({ depth: preset.id });
                  }}
                  disabled={runState === 'running'}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {!hasKey && (
            <div className="sa-inline-alert info">
              <span>No DeepSeek API key configured yet.</span>
              <button type="button" className="sa-pill-btn primary" onClick={handleGoToSettings}>
                <Settings size={13} /> Add Key in Settings
              </button>
            </div>
          )}

          {!isOnline && (
            <div className="sa-inline-alert warn">
              <WifiOff size={14} />
              <span>You&apos;re offline. Cached reports and Local Computed Signals remain available.</span>
            </div>
          )}

          {runError && runState !== 'running' && (
            <div className="sa-inline-alert err">
              <AlertTriangle size={14} />
              <span>{runError}</span>
            </div>
          )}

          {/* Paused checkpoint resume bar */}
          {pausedCheckpoint && runState !== 'running' && (
            <div className="sa-inline-alert info">
              <RotateCcw size={14} />
              <span style={{ flex: 1 }}>
                Unfinished run checkpoint saved ({pausedCheckpoint.toolCallsUsed || 0} tool calls completed).
              </span>
              <button type="button" className="sa-pill-btn" onClick={discardCheckpoint}>
                Discard
              </button>
              <button
                type="button"
                className="sa-pill-btn primary"
                disabled={!canRun}
                onClick={() => handleTriggerRun(true)}
              >
                Resume
              </button>
            </div>
          )}

          <div className="sa-run-actions">
            <button
              type="button"
              className="sa-run-primary-btn"
              disabled={!canRun}
              onClick={() => handleTriggerRun(false)}
              title={runDisabledReason || 'Start autonomous analysis'}
            >
              <Play size={15} />
              <span>{runState === 'running' ? 'Running Analysis…' : `Run ${activePreset.label} Analysis`}</span>
            </button>

            <button
              type="button"
              className="sa-pill-btn"
              disabled={!dataset}
              onClick={runOfflineScan}
              title="Run deterministic local bottlenecks & correlation scan without calling DeepSeek"
            >
              <Cpu size={14} /> Local Signals (Offline)
            </button>
          </div>
        </section>

        {/* Live Run Console */}
        {runState === 'running' && (
          <RunConsole
            phase={runPhase}
            steps={runSteps}
            hypotheses={runHypotheses}
            earlyHighlights={earlyHighlights}
            reasoningChunks={reasoningChunks}
            usage={runUsage}
            elapsedMs={runElapsedMs}
            onCancel={cancelRun}
          />
        )}

        {/* Active Verified Report */}
        {activeReport && runState !== 'running' && (
          <ReportView
            report={activeReport}
            isOutdated={isReportOutdated}
            outdatedDiffs={outdatedDiffs}
            dateFormat={dateFormat}
            isMobile={isMobile}
            onOpenEvidence={(entry) => setActiveEvidence(entry)}
            onRerun={() => handleTriggerRun(false)}
            onDelete={removeReport}
            canRun={canRun}
          />
        )}

        {/* Deterministic Local Signals (No AI) */}
        {offlineSignals && (
          <section className="sa-card sa-offline-card">
            <div className="sa-card-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Cpu size={15} style={{ color: 'var(--accent-secondary, #06b6d4)' }} />
                <span className="sa-section-title">Local Computed Signals (No AI)</span>
              </div>
              <span className="sa-mini-badge info">Deterministic</span>
            </div>
            <p className="sa-muted" style={{ fontSize: '0.78rem', margin: '0 0 10px' }}>
              Computed locally using the statistical engine at zero API cost (raw signals without exercise-science synthesis).
            </p>

            {offlineSignals.bottlenecks.length > 0 && (
              <div className="sa-offline-group">
                <div className="sa-drawer-label">Top Bottleneck Candidates</div>
                {offlineSignals.bottlenecks.slice(0, 5).map((b, i) => (
                  <div key={i} className="sa-offline-row">
                    <span className="sa-mini-badge warn">{b.type.replace(/_/g, ' ')}</span>
                    <span>{b.detail}</span>
                  </div>
                ))}
              </div>
            )}

            {(offlineSignals.volumeCandidates.length > 0 || offlineSignals.fatigueCandidates.length > 0) && (
              <div className="sa-offline-group">
                <div className="sa-drawer-label">Top Detrended Spearman Candidates (FDR-controlled)</div>
                {[...offlineSignals.volumeCandidates.slice(0, 3), ...offlineSignals.fatigueCandidates.slice(0, 3)].map((c, i) => (
                  <div key={i} className="sa-offline-row">
                    <span className={`sa-mini-badge ${c.significant ? 'good' : 'muted'}`}>
                      ρ={roundNum(c.rho, 2)} (q={roundNum(c.qValue, 2)})
                    </span>
                    <span>{c.label} (n={c.n})</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Empty state when no report & not running */}
        {!activeReport && runState !== 'running' && !offlineSignals && (
          <div className="sa-empty-state">
            <Sparkles size={26} style={{ color: 'var(--accent-primary)', opacity: 0.7 }} />
            <div className="sa-empty-title">No Smart Analytics report yet</div>
            <p className="sa-muted" style={{ maxWidth: '460px', margin: 0, fontSize: '0.84rem' }}>
              Start a Quick or Deep run above for an autonomous, evidence-verified report, or run Local Signals offline to inspect deterministic bottlenecks right away.
            </p>
          </div>
        )}
      </div>

      {/* Inner Portaled Modals & Drawers */}
      {timelineOpen && dataset && (
        <ProgramTimelineSheet
          macrocycles={dataset.macrocycles}
          programMeta={dataset.programMeta}
          onSave={updateProgramMeta}
          onClose={() => setTimelineOpen(false)}
        />
      )}

      {historyOpen && (
        <ReportHistory
          reports={reportIndex}
          activeReportId={activeReport?.id}
          currentFingerprint={dataset?.fingerprint}
          dateFormat={dateFormat}
          onSelect={selectReport}
          onDelete={removeReport}
          onClose={() => setHistoryOpen(false)}
        />
      )}

      {consentOpen && (
        <ConsentModal
          anonymize={settings.anonymize}
          onToggleAnonymize={(val) => updateSettings({ anonymize: val })}
          onAccept={handleConsentAccept}
          onClose={() => setConsentOpen(false)}
        />
      )}

      {activeEvidence && (
        <EvidenceDrawer entry={activeEvidence} onClose={() => setActiveEvidence(null)} />
      )}
    </div>,
    document.body
  );
}

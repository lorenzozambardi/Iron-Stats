import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { loadAllPrograms } from '../dataset/loadAllPrograms.js';
import { loadProgramMeta, saveProgramMeta } from '../dataset/programMeta.js';
import { buildAnalyticsDataset } from '../dataset/buildAnalyticsDataset.js';
import { diffDatasetSummaries } from '../dataset/fingerprint.js';
import { runAnalyticsAgent } from '../agent/agentLoop.js';
import { getApiKey } from '../storage/secureStore.js';
import { resolveReportLanguage } from '../storage/analyticsSettings.js';
import {
  clearCheckpoint,
  deleteReport,
  getLatestReport,
  getReport,
  listReports,
  loadCheckpoint,
  saveCheckpoint,
  saveReport,
} from '../storage/reportStore.js';
import { EvidenceLedger } from '../grounding/evidenceLedger.js';
import { executeTool } from '../tools/registry.js';

export function useAnalyticsRun({ exercisesDb, profile, programs, settings }) {
  const [loadedPrograms, setLoadedPrograms] = useState([]);
  const [loadingDataset, setLoadingDataset] = useState(true);
  const [datasetError, setDatasetError] = useState(null);
  const [savedMeta, setSavedMeta] = useState(() => loadProgramMeta());

  const [reportIndex, setReportIndex] = useState([]);
  const [activeReport, setActiveReport] = useState(null);
  const [pausedCheckpoint, setPausedCheckpoint] = useState(null);
  const [offlineSignals, setOfflineSignals] = useState(null);

  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine !== false : true));

  // Live run state
  const [runState, setRunState] = useState('idle'); // 'idle' | 'running' | 'paused' | 'failed' | 'cancelled'
  const [runPhase, setRunPhase] = useState('orient');
  const [runSteps, setRunSteps] = useState([]);
  const [runHypotheses, setRunHypotheses] = useState([]);
  const [earlyHighlights, setEarlyHighlights] = useState([]);
  const [reasoningChunks, setReasoningChunks] = useState([]);
  const [runUsage, setRunUsage] = useState({ promptTokens: 0, completionTokens: 0, totalTokens: 0, cacheHitTokens: 0, costUsd: 0 });
  const [runElapsedMs, setRunElapsedMs] = useState(0);
  const [runError, setRunError] = useState(null);

  const abortRef = useRef(null);
  const runStartRef = useRef(0);

  // Track online/offline status
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Load all macrocycles when exercisesDb or programs list changes
  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();

    loadAllPrograms({
      exercisesDb: exercisesDb || [],
      programNames: Array.isArray(programs) && programs.length > 0 ? programs : null,
      signal: ac.signal,
    })
      .then((res) => {
        if (cancelled) return;
        setDatasetError(null);
        setLoadedPrograms(res);
        setLoadingDataset(false);
      })
      .catch((err) => {
        if (cancelled || err?.name === 'AbortError') return;
        setDatasetError(err?.message || 'Could not load logbooks.');
        setLoadingDataset(false);
      });

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [exercisesDb, programs]);

  // Build normalized dataset
  const dataset = useMemo(() => {
    if (!loadedPrograms || loadedPrograms.length === 0) return null;
    return buildAnalyticsDataset({
      loadedPrograms,
      profile,
      savedProgramMeta: savedMeta,
    });
  }, [loadedPrograms, profile, savedMeta]);

  // Load persisted reports and any active checkpoint
  const refreshReports = useCallback(async () => {
    const [idx, latest, cp] = await Promise.all([listReports(), getLatestReport(), loadCheckpoint()]);
    setReportIndex(idx);
    setActiveReport((prev) => prev || latest);
    setPausedCheckpoint(cp);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listReports(), getLatestReport(), loadCheckpoint()]).then(([idx, latest, cp]) => {
      if (cancelled) return;
      setReportIndex(idx);
      setActiveReport((prev) => prev || latest);
      setPausedCheckpoint(cp);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Refresh checkpoint indicator on Android app resume
  useEffect(() => {
    let listener;
    try {
      listener = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          loadCheckpoint().then((cp) => {
            if (cp) setPausedCheckpoint(cp);
          });
        }
      });
    } catch {
      // Non-Capacitor environment
    }
    return () => {
      if (listener && typeof listener.then === 'function') {
        listener.then((h) => h.remove()).catch(() => {});
      }
    };
  }, []);

  // Elapsed timer while running
  useEffect(() => {
    if (runState !== 'running') return undefined;
    const id = setInterval(() => {
      setRunElapsedMs(Date.now() - runStartRef.current);
    }, 500);
    return () => clearInterval(id);
  }, [runState]);

  const updateProgramMeta = useCallback((nextMetaMap) => {
    saveProgramMeta(nextMetaMap);
    setSavedMeta({ ...nextMetaMap });
  }, []);

  const isReportOutdated = useMemo(() => {
    if (!activeReport || !dataset) return false;
    return activeReport.datasetFingerprint !== dataset.fingerprint;
  }, [activeReport, dataset]);

  const outdatedDiffs = useMemo(() => {
    if (!isReportOutdated || !activeReport?.datasetSummary || !dataset?.summary) return [];
    return diffDatasetSummaries(activeReport.datasetSummary, dataset.summary);
  }, [isReportOutdated, activeReport, dataset]);

  const startRun = useCallback(
    async ({ depth = settings.depth || 'deep', resume = false } = {}) => {
      if (!dataset || !dataset.capabilities.ready) return;
      const apiKey = await getApiKey();
      if (!apiKey) {
        setRunError('Add your DeepSeek API key in Settings first.');
        setRunState('failed');
        return;
      }

      const ac = new AbortController();
      abortRef.current = ac;
      const cpToResume = resume ? pausedCheckpoint : null;

      runStartRef.current = cpToResume?.startedAt || Date.now();
      setRunState('running');
      setRunError(null);
      setRunPhase(cpToResume?.phase || 'orient');
      setRunSteps(cpToResume?.trace || []);
      setRunHypotheses(cpToResume?.ledger?.hypotheses || []);
      setEarlyHighlights([]);
      setReasoningChunks([]);
      setRunUsage(cpToResume?.totals || { promptTokens: 0, completionTokens: 0, totalTokens: 0, cacheHitTokens: 0, costUsd: 0 });
      setRunElapsedMs(Date.now() - runStartRef.current);

      const result = await runAnalyticsAgent({
        dataset,
        apiKey,
        model: settings.model || 'deepseek-chat',
        depth,
        language: resolveReportLanguage(settings.language),
        anonymize: Boolean(settings.anonymize),
        priceTable: settings.priceTable,
        signal: ac.signal,
        resumeFrom: cpToResume,
        onCheckpoint: (cp) => {
          saveCheckpoint(cp).catch(() => {});
          setPausedCheckpoint(cp);
        },
        onEvent: (ev) => {
          if (ev.type === 'phase') setRunPhase(ev.phase);
          else if (ev.type === 'step') setRunSteps((prev) => [...prev, ev.step]);
          else if (ev.type === 'hypothesis' && ev.hypothesis) {
            setRunHypotheses((prev) => {
              const filtered = prev.filter((h) => h.id !== ev.hypothesis.id);
              return [...filtered, { ...ev.hypothesis }];
            });
          } else if (ev.type === 'earlyHighlight') {
            setEarlyHighlights((prev) => [...prev.slice(-3), ev.highlight]);
          } else if (ev.type === 'reasoning') {
            setReasoningChunks((prev) => [...prev, ev.text]);
          } else if (ev.type === 'usage') {
            setRunUsage(ev.totals);
            setRunElapsedMs(ev.elapsedMs);
          }
        },
      });

      abortRef.current = null;

      if (result.status === 'done' && result.report) {
        await saveReport(result.report);
        await clearCheckpoint();
        setPausedCheckpoint(null);
        setActiveReport(result.report);
        const idx = await listReports();
        setReportIndex(idx);
        setRunState('idle');
      } else if (result.status === 'paused') {
        setRunState('paused');
        setRunError(result.error || 'Run paused. Resume when back online.');
      } else if (result.status === 'cancelled') {
        setRunState('cancelled');
      } else {
        setRunState('failed');
        setRunError(result.error || result.reason || 'Analysis failed.');
      }
    },
    [dataset, pausedCheckpoint, settings]
  );

  const cancelRun = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
  }, []);

  const discardCheckpoint = useCallback(async () => {
    await clearCheckpoint();
    setPausedCheckpoint(null);
    if (runState === 'paused') setRunState('idle');
  }, [runState]);

  const selectReport = useCallback(async (id) => {
    const rep = await getReport(id);
    if (rep) setActiveReport(rep);
  }, []);

  const removeReport = useCallback(async (id) => {
    await deleteReport(id);
    const idx = await listReports();
    setReportIndex(idx);
    setActiveReport((prev) => {
      if (prev && prev.id === id) return null;
      return prev;
    });
    if (idx.length > 0) {
      const next = await getReport(idx[0].id);
      setActiveReport((prev) => prev || next);
    }
  }, []);

  // Optional deterministic local quick scan (zero LLM calls, works offline)
  const runOfflineScan = useCallback(() => {
    if (!dataset) return;
    const ledger = new EvidenceLedger(0.1);
    const bnecks = executeTool('rank_bottlenecks', {}, dataset, ledger);
    const dist = executeTool('get_muscle_distribution', { metric: 'sets', level: 'macro' }, dataset, ledger);
    const volScan = executeTool('scan_relationships', { family: 'volume->strength', maxResults: 5 }, dataset, ledger);
    const fatScan = executeTool('scan_relationships', { family: 'fatigue->performance', maxResults: 5 }, dataset, ledger);
    setOfflineSignals({
      generatedAt: new Date().toISOString(),
      bottlenecks: bnecks.data?.bottlenecks || [],
      distribution: dist.data?.distribution || [],
      ratios: dist.data?.ratios || {},
      volumeCandidates: volScan.data?.candidates || [],
      fatigueCandidates: fatScan.data?.candidates || [],
    });
  }, [dataset]);

  return {
    dataset,
    loadingDataset,
    datasetError,
    savedMeta,
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
    refreshReports,
    runOfflineScan,
  };
}

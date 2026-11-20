import React, { useState, useMemo, useCallback, useRef, useEffect, useDeferredValue } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { MUSCLES, calculateMetricsByWeek, parseLogbook } from '../../parser';
const DETAIL_TO_SERIES_KEY = {
  'volume': 'Volume',
  'effective': 'EffectiveRepsCustom',
  'tonnage': 'Tonnage',
  'effective-tonnage': 'EffectiveTonnage',
  'weighted-tonnage': 'WeightedTonnage',
  'effective-weighted-tonnage': 'EffectiveWeightedTonnage',
  'tut': 'Tut',
  'effective-tut': 'EffectiveTut',
  'sets': 'Sets',
  'fatigue': 'Fatigue',
};

const MetricDetailsPage = React.lazy(() => import('../MetricDetails'));
const ProfilePage = React.lazy(() => import('../ProfilePage'));
import ProfilePreviewCard from '../ProfilePreviewCard';
import { MetricSparkline, MetricBarSparkline, TrendBadge } from '../Sparkline';
import { loadProfile, saveProfile } from '../../profileUtils';
import MuscleDonutChart from '../MuscleDonutChart';
import { bezierArea, solveBezierY } from '../helpers';
import { LockWheelPicker, DualWeekSlider, TensionRomSlider } from '../FilterControls';

const CURVE_RESOLUTION = 50;
const MAX_CURVE_CACHE_SIZE = 500;
const normalizedCurveCache = new Map();
const TENSION_SERIES_COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#a855f7', '#f43f5e'];
const MUSCLE_METRIC_OPTIONS = [
  { value: 'effective', label: 'Eff. Reps' },
  { value: 'sets', label: 'Volume' },
  { value: 'volume', label: 'Reps' },
];

const isWeekInRange = (weekNum, fromVal, toVal) => {
  if (fromVal !== 'all' && weekNum < parseInt(fromVal, 10)) return false;
  if (toVal !== 'all' && weekNum > parseInt(toVal, 10)) return false;
  return true;
};

const formatWeekRangeLabel = (fromVal, toVal) => {
  if (fromVal !== 'all' && toVal !== 'all') {
    return fromVal === toVal ? `m${fromVal}` : `m${fromVal}–m${toVal}`;
  }
  if (fromVal !== 'all') return `m${fromVal}+`;
  if (toVal !== 'all') return `≤m${toVal}`;
  return null;
};

const isoDateToUtcMs = (iso) => {
  if (typeof iso !== 'string') return null;
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const ms = Date.UTC(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10));
  return Number.isFinite(ms) ? ms : null;
};

const buildTimeSeries = (rows, metricKey) => {
  if (!rows || rows.length === 0) return [];
  const datedIdx = [];
  for (let i = 0; i < rows.length; i++) {
    if (Number.isFinite(rows[i].timestamp)) datedIdx.push(i);
  }
  if (datedIdx.length < 2) {
    return rows.map((m) => m[metricKey] || 0);
  }

  const resolvedTs = rows.map((m) => (Number.isFinite(m.timestamp) ? m.timestamp : null));
  const firstIdx = datedIdx[0];
  const lastIdx = datedIdx[datedIdx.length - 1];
  const avgStep = (resolvedTs[lastIdx] - resolvedTs[firstIdx]) / (lastIdx - firstIdx);

  if (!Number.isFinite(avgStep) || avgStep <= 0) {
    return rows.map((m) => m[metricKey] || 0);
  }

  // Linearly interpolate interior gaps and extrapolate leading/trailing gaps
  for (let p = 0; p < datedIdx.length - 1; p++) {
    const a = datedIdx[p];
    const b = datedIdx[p + 1];
    if (b - a > 1) {
      const step = (resolvedTs[b] - resolvedTs[a]) / (b - a);
      for (let i = a + 1; i < b; i++) {
        resolvedTs[i] = resolvedTs[a] + step * (i - a);
      }
    }
  }
  for (let i = firstIdx - 1; i >= 0; i--) {
    resolvedTs[i] = resolvedTs[firstIdx] - avgStep * (firstIdx - i);
  }
  for (let i = lastIdx + 1; i < rows.length; i++) {
    resolvedTs[i] = resolvedTs[lastIdx] + avgStep * (i - lastIdx);
  }

  const t0 = resolvedTs[0];
  let tMin = Infinity;
  let tMax = -Infinity;
  for (let i = 0; i < resolvedTs.length; i++) {
    if (resolvedTs[i] < tMin) tMin = resolvedTs[i];
    if (resolvedTs[i] > tMax) tMax = resolvedTs[i];
  }
  if (!(tMax > tMin)) {
    return rows.map((m) => m[metricKey] || 0);
  }

  return rows.map((m, i) => ({
    v: m[metricKey] || 0,
    t: resolvedTs[i] - t0,
    ts: resolvedTs[i],
  }));
};

const CardModeToggle = React.memo(({ cardId, mode, onToggle }) => {
  const nextMode = mode === 'total' ? 'effective' : 'total';
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle(cardId, nextMode);
      }}
      aria-label={`Switch to ${nextMode === 'total' ? 'Total' : 'Effective'}`}
      title={`Switch to ${nextMode === 'total' ? 'Total' : 'Effective'}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '5px',
        padding: '0 8px',
        height: '24px',
        margin: '-3px -4px -3px 0',
        borderRadius: '999px',
        border: '1px solid var(--border-color)',
        background: 'var(--bg-secondary)',
        boxShadow: 'var(--card-shadow)',
        color: '#ffffff',
        fontSize: '0.62rem',
        fontWeight: 500,
        letterSpacing: '0.03em',
        lineHeight: 1,
        cursor: 'pointer',
        flexShrink: 0,
        transition: 'background 0.15s ease, border-color 0.15s ease',
      }}
    >
      <span style={{ transform: 'translateY(0.5px)' }}>{mode === 'total' ? 'TOT.' : 'EFF.'}</span>
      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
        <path d="M11 2l3 3-3 3" />
        <path d="M14 5H3" />
        <path d="M5 14l-3-3 3-3" />
        <path d="M2 11h11" />
      </svg>
    </button>
  );
});

const computeMuscleDistribution = (dataSource, activeWeeksArr, targetMacro, targetSub, muscleMetric, weekOverride) => {
  if (!dataSource || dataSource.length === 0) return [];
  const distributions = {};
  const hasWeekOverride = weekOverride !== undefined && weekOverride !== 'all';
  const targetWeekNum = hasWeekOverride ? parseInt(weekOverride, 10) : null;
  const allowedWeeks = hasWeekOverride ? null : new Set(activeWeeksArr);

  dataSource.forEach(wEx => {
    const ex = wEx.exercise_obj;
    if (!ex) return;
    wEx.weeks.forEach(wData => {
      if (hasWeekOverride ? wData.week_num !== targetWeekNum : !allowedWeeks.has(wData.week_num)) return;
      wData.sets.forEach(s => {
        Object.entries(ex.muscles_distr).forEach(([subMuscle, distr]) => {
          if (targetMacro !== 'all' && MUSCLES[subMuscle] !== targetMacro) return;
          if (targetSub !== 'all' && subMuscle !== targetSub) return;
          const macro = MUSCLES[subMuscle] || 'Other';
          let metricValue = 0;
          if (muscleMetric === 'effective') {
            metricValue = s.effectiveReps || 0;
          } else if (muscleMetric === 'volume') {
            metricValue = s.totalReps !== undefined ? s.totalReps : (s.base_reps + (s.assisted_reps || 0) * 0.5 + (s.partial_reps || 0) * 0.33);
          } else if (muscleMetric === 'sets') {
            metricValue = 1.0;
          }
          const distrVal = typeof distr === 'number' ? distr : (distr?.magnitude || 0);
          const vol = metricValue * distrVal;
          if (!distributions[macro]) distributions[macro] = { total: 0, subMuscles: {} };
          distributions[macro].total += vol;
          if (!distributions[macro].subMuscles[subMuscle]) distributions[macro].subMuscles[subMuscle] = 0;
          distributions[macro].subMuscles[subMuscle] += vol;
        });
      });
    });
  });

  return Object.entries(distributions).map(([macro, data]) => ({
    name: macro,
    value: parseFloat(data.total.toFixed(1)),
    subMuscles: Object.entries(data.subMuscles).map(([sub, val]) => ({
      name: sub,
      value: parseFloat(val.toFixed(1))
    })).sort((a, b) => b.value - a.value)
  })).sort((a, b) => b.value - a.value);
};

/** Memoized Recharts line chart so mobile ROM slider scrubbing never re-renders SVG paths. */
const TensionLineChart = React.memo(({ isMobile, cumulativeCurveData, topMuscles }) => (
  <ResponsiveContainer width="99%" height="100%" minWidth={0} minHeight={0}>
    <LineChart
      data={cumulativeCurveData}
      margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
      style={isMobile ? { pointerEvents: 'none' } : undefined}
    >
      <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
      <XAxis
        dataKey="rom"
        type="number"
        domain={[0, 1]}
        ticks={[0, 0.25, 0.5, 0.75, 1]}
        axisLine={false}
        tickLine={false}
        tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
        tickFormatter={(val) => `${Math.round(val * 100)}%`}
      />
      <YAxis
        axisLine={false}
        tickLine={false}
        tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
        width={42}
      />
      {!isMobile && (
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--bg-glass-active)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            color: 'var(--text-primary)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
          }}
          labelFormatter={(val) => `ROM: ${Math.round(val * 100)}%`}
          formatter={(val) => parseFloat(val).toFixed(1)}
        />
      )}
      {topMuscles.map((m, idx) => (
        <Line
          key={m.name}
          type="monotone"
          dataKey={m.name}
          name={m.name}
          stroke={TENSION_SERIES_COLORS[idx % TENSION_SERIES_COLORS.length]}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
          isAnimationActive={false}
        />
      ))}
    </LineChart>
  </ResponsiveContainer>
));

/** Isolated Tension Profiles card so ROM scrubbing never re-renders the rest of the dashboard. */
const TensionProfilesCard = React.memo(({ isMobile, cumulativeCurveData, displayMuscleData, onOpenDetails }) => {
  const [tensionSliderPos, setTensionSliderPos] = useState(50);
  const topMuscles = useMemo(() => displayMuscleData.slice(0, 6), [displayMuscleData]);

  return (
    <div className="chart-container" style={{ gridColumn: '1 / -1' }}>
      <div
        className="chart-header"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
        onClick={onOpenDetails}
      >
        <span className="chart-title" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#fff', transition: 'color 0.2s' }}>
          Tension Profiles
        </span>
        {isMobile && cumulativeCurveData.length > 0 && (
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
            ROM <strong style={{ color: '#fff', fontWeight: 600 }}>{tensionSliderPos}%</strong>
          </span>
        )}
      </div>
      <div style={{ position: 'relative', height: isMobile ? '205px' : '290px', width: '100%', marginTop: '8px' }}>
        {cumulativeCurveData.length > 0 ? (
          <>
            <TensionLineChart
              isMobile={isMobile}
              cumulativeCurveData={cumulativeCurveData}
              topMuscles={topMuscles}
            />
            {isMobile && (
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: '8px',
                  bottom: '30px',
                  left: `calc(30px + (100% - 38px) * ${tensionSliderPos / 100})`,
                  borderLeft: '1.5px dashed rgba(255,255,255,0.35)',
                  pointerEvents: 'none',
                }}
              />
            )}
          </>
        ) : (
          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            No data available for the current selection.
          </div>
        )}
      </div>
      {cumulativeCurveData.length > 0 && (
        isMobile ? (
          <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px 18px' }}>
              {topMuscles.map((m, idx) => {
                const color = TENSION_SERIES_COLORS[idx % TENSION_SERIES_COLORS.length];
                const resolution = cumulativeCurveData.length - 1;
                const closestIdx = Math.round((tensionSliderPos / 100) * resolution);
                const closestPt = cumulativeCurveData[Math.min(closestIdx, resolution)];
                const val = closestPt ? (closestPt[m.name] ?? 0) : 0;
                return (
                  <div
                    key={m.name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      minWidth: 0,
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
                      <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: color, flexShrink: 0 }} />
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.name}
                      </span>
                    </span>
                    <span style={{ fontSize: '0.76rem', color: '#ffffff', fontWeight: 600, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                      {val.toFixed(1)}
                    </span>
                  </div>
                );
              })}
            </div>
            <TensionRomSlider value={tensionSliderPos} onChange={setTensionSliderPos} />
          </div>
        ) : (
          <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexWrap: 'wrap', gap: '14px', justifyContent: 'center' }}>
            {topMuscles.map((m, idx) => (
              <span key={m.name} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: TENSION_SERIES_COLORS[idx % TENSION_SERIES_COLORS.length] }} />
                {m.name}
              </span>
            ))}
          </div>
        )
      )}
    </div>
  );
});

const getNormalizedCurve = (distr) => {
  const x0 = typeof distr === 'object' ? (distr.x0 ?? 0.0) : 0.0;
  const y0 = typeof distr === 'object' ? (distr.y0 ?? 1.0) : 1.0;
  const x1 = typeof distr === 'object' ? (distr.x1 ?? 0.33) : 0.33;
  const y1 = typeof distr === 'object' ? (distr.y1 ?? 1.0) : 1.0;
  const x2 = typeof distr === 'object' ? (distr.x2 ?? 0.66) : 0.66;
  const y2 = typeof distr === 'object' ? (distr.y2 ?? 1.0) : 1.0;
  const x3 = typeof distr === 'object' ? (distr.x3 ?? 1.0) : 1.0;
  const y3 = typeof distr === 'object' ? (distr.y3 ?? 1.0) : 1.0;
  const magnitude = typeof distr === 'number' ? distr : (distr?.magnitude || 0);

  const area = bezierArea(x0, y0, x1, y1, x2, y2, x3, y3);
  const factor = area > 0 ? (magnitude / area) : 0;
  const rawY = new Float64Array(CURVE_RESOLUTION + 1);
  for (let i = 0; i <= CURVE_RESOLUTION; i++) {
    rawY[i] = solveBezierY(i / CURVE_RESOLUTION, x0, y0, x1, y1, x2, y2, x3, y3) * factor;
  }
  return rawY;
};

const getCachedNormalizedCurve = (cacheKey, distr) => {
  const existing = normalizedCurveCache.get(cacheKey);
  if (existing) {
    // Refresh insertion order for simple LRU eviction
    normalizedCurveCache.delete(cacheKey);
    normalizedCurveCache.set(cacheKey, existing);
    return existing;
  }
  const curve = getNormalizedCurve(distr);
  if (normalizedCurveCache.size >= MAX_CURVE_CACHE_SIZE) {
    const oldestKey = normalizedCurveCache.keys().next().value;
    if (oldestKey !== undefined) normalizedCurveCache.delete(oldestKey);
  }
  normalizedCurveCache.set(cacheKey, curve);
  return curve;
};

const getFullWeeksList = (weeksList, targetSession, sessionsList, workoutData) => {
  if (targetSession !== null || sessionsList.length === 0) return weeksList;
  const weekSessionsMap = new Map();
  for (let i = 0; i < workoutData.length; i++) {
    const d = workoutData[i];
    for (let j = 0; j < d.weeks.length; j++) {
      const w = d.weeks[j];
      if (w.sets.length === 0) continue;
      let sessSet = weekSessionsMap.get(w.week_num);
      if (!sessSet) {
        sessSet = new Set();
        weekSessionsMap.set(w.week_num, sessSet);
      }
      sessSet.add(d.session);
    }
  }
  const requiredCount = sessionsList.length;
  return weeksList.filter(week => {
    const sessSet = weekSessionsMap.get(week);
    if (!sessSet || sessSet.size < requiredCount) return false;
    for (let i = 0; i < requiredCount; i++) {
      if (!sessSet.has(sessionsList[i])) return false;
    }
    return true;
  });
};

const round1 = (n) => parseFloat(n.toFixed(1));

const buildWeeklyMetricsRows = (filteredData, targetSession, weeksList, targetMacro, targetSub, suffix = '') => {
  if (!weeksList || weeksList.length === 0) return [];
  const buckets = calculateMetricsByWeek(filteredData, targetSession, weeksList, targetMacro, targetSub);

  // Compute midpoint UTC timestamp per microcycle from dated sessions
  const weekDateBounds = new Map();
  for (let i = 0; i < filteredData.length; i++) {
    const wEx = filteredData[i];
    if (targetSession !== null && wEx.session !== targetSession) continue;
    for (let j = 0; j < wEx.weeks.length; j++) {
      const w = wEx.weeks[j];
      const ms = isoDateToUtcMs(w.date);
      if (ms === null) continue;
      const cur = weekDateBounds.get(w.week_num);
      if (!cur) {
        weekDateBounds.set(w.week_num, { min: ms, max: ms });
      } else {
        if (ms < cur.min) cur.min = ms;
        if (ms > cur.max) cur.max = ms;
      }
    }
  }

  return weeksList.map(week => {
    const b = buckets.get(week);
    const bounds = weekDateBounds.get(week);
    const timestamp = bounds ? (bounds.min + bounds.max) / 2 : null;
    return {
      weekNum: week,
      week: `m${week}`,
      timestamp,
      [`Volume${suffix}`]: round1(b.volume),
      [`Tonnage${suffix}`]: round1(b.tonnage),
      [`EffectiveTonnage${suffix}`]: round1(b.effectiveTonnage),
      [`WeightedTonnage${suffix}`]: round1(b.weightedTonnage),
      [`EffectiveWeightedTonnage${suffix}`]: round1(b.effectiveWeightedTonnage),
      [`Fatigue${suffix}`]: round1(b.fatigue),
      [`EffectiveRepsCustom${suffix}`]: round1(b.effectiveReps),
      [`Tut${suffix}`]: round1(b.totalTut),
      [`EffectiveTut${suffix}`]: round1(b.effectiveTut),
      [`Sets${suffix}`]: round1(b.sets)
    };
  });
};

const DashboardTab = ({
  isMobile,
  activeTab,
  workoutData,
  currentProgram,
  programs,
  exercisesDb,
  selectedMetricDetail,
  setSelectedMetricDetail,
  profileOpen,
  setProfileOpen,
  dateFormat,
}) => {
  const isDashboardActive = isMobile || activeTab === 'dashboard';
  const [profile, setProfile] = useState(() => loadProfile());
  useEffect(() => {
    saveProfile(profile);
  }, [profile]);
  const [muscleMetric, setMuscleMetric] = useState('sets');
  const [cardModes, setCardModes] = useState({
    reps: 'effective',
    tonnage: 'effective',
    weightedTonnage: 'effective',
    tut: 'effective',
  });
  const handleCardModeToggle = useCallback((cardId, nextMode) => {
    setCardModes(prev => ({ ...prev, [cardId]: nextMode }));
  }, []);

  // Dashboard filter state
  const [prevProgram, setPrevProgram] = useState(currentProgram);
  const [dashFilterSession, setDashFilterSession] = useState('all'); // 'all' or session number
  const [dashFilterWeekFrom, setDashFilterWeekFrom] = useState('all'); // 'all' or week number
  const [dashFilterWeekTo, setDashFilterWeekTo] = useState('all');     // 'all' or week number
  if (currentProgram !== prevProgram) {
    setPrevProgram(currentProgram);
    setDashFilterSession('all');
    setDashFilterWeekFrom('all');
    setDashFilterWeekTo('all');
  }
  const [compareMode, setCompareMode] = useState(false);
  const [compareProgram, setCompareProgram] = useState('');
  const [compareRawText, setCompareRawText] = useState('');
  const [compareLoading, setCompareLoading] = useState(false);
  const compareAbortRef = useRef(null);
  const compareWorkoutData = useMemo(() => {
    if (!compareRawText || !exercisesDb || exercisesDb.length === 0) return [];
    return parseLogbook(compareRawText, exercisesDb);
  }, [compareRawText, exercisesDb]);
  const isCompareActive = compareMode && Boolean(compareProgram);
  // Per-program filters in compare mode
  const [cmpFilterSession, setCmpFilterSession] = useState('all');
  const [cmpFilterWeekFrom, setCmpFilterWeekFrom] = useState('all');
  const [cmpFilterWeekTo, setCmpFilterWeekTo] = useState('all');
  // Shared muscle group/subgroup isolation filter
  const [dashMuscleMacro, setDashMuscleMacro] = useState('all');   // 'all' or macro name e.g. 'Back'
  const [dashMuscleSubgroup, setDashMuscleSubgroup] = useState('all'); // 'all' or sub-muscle name

  // Deferred filter values keep slider thumbs and lock-wheels at 60fps while heavy charts update smoothly
  const deferredSession = useDeferredValue(dashFilterSession);
  const deferredWeekFrom = useDeferredValue(dashFilterWeekFrom);
  const deferredWeekTo = useDeferredValue(dashFilterWeekTo);
  const deferredCmpSession = useDeferredValue(cmpFilterSession);
  const deferredCmpWeekFrom = useDeferredValue(cmpFilterWeekFrom);
  const deferredCmpWeekTo = useDeferredValue(cmpFilterWeekTo);
  const deferredMacro = useDeferredValue(dashMuscleMacro);
  const deferredSubgroup = useDeferredValue(dashMuscleSubgroup);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const filterContentRef = useRef(null);
  const [filterHeight, setFilterHeight] = useState(0);

  useEffect(() => {
    const el = filterContentRef.current;
    if (!el) return;
    const update = () => {
      const next = Math.ceil(el.getBoundingClientRect().height);
      setFilterHeight(prev => (prev === next ? prev : next));
    };
    update();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => ro.disconnect();
    }
  }, [isMobile, activeTab]);

  useEffect(() => () => {
    if (compareAbortRef.current) compareAbortRef.current.abort();
  }, []);

  // Calculated Metrics — memoized to avoid recomputing on every render
  const sessionsList = useMemo(
    () => (isDashboardActive ? Array.from(new Set(workoutData.map(d => d.session))).sort((a, b) => a - b) : []),
    [isDashboardActive, workoutData]
  );

  // Helper: load a comparison program and parse it (aborts in-flight requests)
  const loadCompareProgram = useCallback((progName) => {
    if (compareAbortRef.current) {
      compareAbortRef.current.abort();
      compareAbortRef.current = null;
    }
    if (!progName) {
      setCompareRawText('');
      setCompareLoading(false);
      return;
    }
    const controller = new AbortController();
    compareAbortRef.current = controller;
    setCompareLoading(true);
    fetch(`/api/logbook?program=${encodeURIComponent(progName)}`, { signal: controller.signal })
      .then(res => {
        if (!res.ok) throw new Error(`Failed to load ${progName}.md`);
        return res.text();
      })
      .then(text => {
        if (controller.signal.aborted) return;
        setCompareRawText(text);
        setCompareLoading(false);
      })
      .catch((err) => {
        if (err && err.name === 'AbortError') return;
        setCompareRawText('');
        setCompareLoading(false);
      });
  }, []);

  const disableCompareMode = useCallback(() => {
    if (compareAbortRef.current) {
      compareAbortRef.current.abort();
      compareAbortRef.current = null;
    }
    setCompareMode(false);
    setCompareLoading(false);
    setCompareRawText('');
    setCompareProgram('');
    setCmpFilterSession('all');
    setCmpFilterWeekFrom('all');
    setCmpFilterWeekTo('all');
  }, []);

  // Derived sessions lists for compare program B
  const compareSessionsList = useMemo(() =>
    (isDashboardActive && compareMode ? Array.from(new Set(compareWorkoutData.map(d => d.session))).sort((a, b) => a - b) : []),
  [isDashboardActive, compareMode, compareWorkoutData]);

  // All macro muscle groups and their sub-muscles (from MUSCLES map)
  const allMacros = useMemo(() => Array.from(new Set(Object.values(MUSCLES))).sort(), []);
  const subMusclesForMacro = useMemo(() => {
    if (dashMuscleMacro === 'all') return [];
    return Object.entries(MUSCLES).filter(([, macro]) => macro === dashMuscleMacro).map(([sub]) => sub).sort();
  }, [dashMuscleMacro]);

  // Derived: filtered data for the dashboard based on session/muscle selectors
  const dashFilteredData = useMemo(() => {
    if (!isDashboardActive) return [];
    let data = workoutData;
    if (deferredSession !== 'all') {
      const sNum = parseInt(deferredSession, 10);
      data = data.filter(d => d.session === sNum);
    }
    // Muscle group filter — keep only exercises that touch the selected macro/sub
    if (deferredMacro !== 'all') {
      data = data.filter(wEx => {
        const ex = wEx.exercise_obj;
        if (deferredSubgroup !== 'all') return deferredSubgroup in ex.muscles_distr;
        return Object.keys(ex.muscles_distr).some(sub => MUSCLES[sub] === deferredMacro);
      });
    }
    return data;
  }, [isDashboardActive, workoutData, deferredSession, deferredMacro, deferredSubgroup]);

  // Derived: filtered data for compare program B
  const cmpFilteredData = useMemo(() => {
    if (!isDashboardActive || !compareMode) return [];
    let data = compareWorkoutData;
    if (deferredCmpSession !== 'all') {
      const sNum = parseInt(deferredCmpSession, 10);
      data = data.filter(d => d.session === sNum);
    }
    if (deferredMacro !== 'all') {
      data = data.filter(wEx => {
        const ex = wEx.exercise_obj;
        if (deferredSubgroup !== 'all') return deferredSubgroup in ex.muscles_distr;
        return Object.keys(ex.muscles_distr).some(sub => MUSCLES[sub] === deferredMacro);
      });
    }
    return data;
  }, [isDashboardActive, compareMode, compareWorkoutData, deferredCmpSession, deferredMacro, deferredSubgroup]);

  // Weeks available after session filter (program A)
  const dashWeeksList = useMemo(() =>
    (isDashboardActive ? Array.from(new Set(dashFilteredData.flatMap(d => d.weeks.map(w => w.week_num)))).sort((a, b) => a - b) : []),
  [isDashboardActive, dashFilteredData]);

  // Weeks available for compare program B after its session filter
  const cmpWeeksList = useMemo(() =>
    (isDashboardActive && compareMode ? Array.from(new Set(cmpFilteredData.flatMap(d => d.weeks.map(w => w.week_num)))).sort((a, b) => a - b) : []),
  [isDashboardActive, compareMode, cmpFilteredData]);

  // Precompute complete weeks and metrics once per session/muscle change so week-slider drags are O(1)
  const allFullWeeksList = useMemo(() => {
    if (!isDashboardActive) return [];
    const targetSession = deferredSession !== 'all' ? parseInt(deferredSession, 10) : null;
    return getFullWeeksList(dashWeeksList, targetSession, sessionsList, workoutData);
  }, [isDashboardActive, dashWeeksList, deferredSession, sessionsList, workoutData]);

  const allWeeksMetrics = useMemo(() => {
    if (!isDashboardActive) return [];
    const targetSession = deferredSession !== 'all' ? parseInt(deferredSession, 10) : null;
    const targetMacro = deferredMacro !== 'all' ? deferredMacro : null;
    const targetSub = deferredSubgroup !== 'all' ? deferredSubgroup : null;
    return buildWeeklyMetricsRows(dashFilteredData, targetSession, allFullWeeksList, targetMacro, targetSub);
  }, [isDashboardActive, dashFilteredData, deferredSession, allFullWeeksList, deferredMacro, deferredSubgroup]);

  const activeWeeksList = useMemo(
    () => allFullWeeksList.filter(w => isWeekInRange(w, deferredWeekFrom, deferredWeekTo)),
    [allFullWeeksList, deferredWeekFrom, deferredWeekTo]
  );

  const metricsByWeek = useMemo(
    () => allWeeksMetrics.filter(m => isWeekInRange(m.weekNum, deferredWeekFrom, deferredWeekTo)),
    [allWeeksMetrics, deferredWeekFrom, deferredWeekTo]
  );

  const allCompareFullWeeksList = useMemo(() => {
    if (!isDashboardActive || !compareMode) return [];
    const targetSession = deferredCmpSession !== 'all' ? parseInt(deferredCmpSession, 10) : null;
    return getFullWeeksList(cmpWeeksList, targetSession, compareSessionsList, compareWorkoutData);
  }, [isDashboardActive, compareMode, cmpWeeksList, deferredCmpSession, compareSessionsList, compareWorkoutData]);

  const allCompareWeeksMetrics = useMemo(() => {
    if (!isDashboardActive || !compareMode) return [];
    const targetSession = deferredCmpSession !== 'all' ? parseInt(deferredCmpSession, 10) : null;
    const targetMacro = deferredMacro !== 'all' ? deferredMacro : null;
    const targetSub = deferredSubgroup !== 'all' ? deferredSubgroup : null;
    return buildWeeklyMetricsRows(cmpFilteredData, targetSession, allCompareFullWeeksList, targetMacro, targetSub, '_B');
  }, [isDashboardActive, compareMode, cmpFilteredData, deferredCmpSession, allCompareFullWeeksList, deferredMacro, deferredSubgroup]);

  const compareActiveWeeksList = useMemo(
    () => allCompareFullWeeksList.filter(w => isWeekInRange(w, deferredCmpWeekFrom, deferredCmpWeekTo)),
    [allCompareFullWeeksList, deferredCmpWeekFrom, deferredCmpWeekTo]
  );

  const compareMetricsByWeek = useMemo(
    () => allCompareWeeksMetrics.filter(m => isWeekInRange(m.weekNum, deferredCmpWeekFrom, deferredCmpWeekTo)),
    [allCompareWeeksMetrics, deferredCmpWeekFrom, deferredCmpWeekTo]
  );

  const lastFullWeekA = activeWeeksList.length > 0 ? activeWeeksList[activeWeeksList.length - 1] : null;
  const lastFullWeekB = compareActiveWeeksList.length > 0 ? compareActiveWeeksList[compareActiveWeeksList.length - 1] : null;

  const muscleData = useMemo(
    () => (isDashboardActive
      ? computeMuscleDistribution(
          dashFilteredData,
          activeWeeksList,
          deferredMacro,
          deferredSubgroup,
          muscleMetric,
          isCompareActive && lastFullWeekA !== null ? lastFullWeekA : undefined
        )
      : []),
    [isDashboardActive, dashFilteredData, activeWeeksList, deferredMacro, deferredSubgroup, muscleMetric, isCompareActive, lastFullWeekA]
  );
  const compareMuscleData = useMemo(
    () => (isDashboardActive && isCompareActive
      ? computeMuscleDistribution(
          cmpFilteredData,
          compareActiveWeeksList,
          deferredMacro,
          deferredSubgroup,
          muscleMetric,
          lastFullWeekB !== null ? lastFullWeekB : 'all'
        )
      : []),
    [isDashboardActive, isCompareActive, cmpFilteredData, compareActiveWeeksList, deferredMacro, deferredSubgroup, muscleMetric, lastFullWeekB]
  );

  const displayMuscleData = useMemo(() => {
    if (deferredMacro === 'all') return muscleData;
    const macroObj = muscleData.find(m => m.name === deferredMacro);
    if (!macroObj) return [];
    return macroObj.subMuscles;
  }, [muscleData, deferredMacro]);

  const displayCompareMuscleData = useMemo(() => {
    if (deferredMacro === 'all') return compareMuscleData;
    const macroObj = compareMuscleData.find(m => m.name === deferredMacro);
    if (!macroObj) return [];
    return macroObj.subMuscles;
  }, [compareMuscleData, deferredMacro]);

  // Pre-aggregate per-exercise, per-week (base, partial) totals so week-range slider drags don't re-scan every set
  const exerciseWeekRepTotals = useMemo(() => {
    if (!isDashboardActive) return [];
    return dashFilteredData.map(wEx => {
      const byWeek = new Map();
      for (let wi = 0; wi < wEx.weeks.length; wi++) {
        const wData = wEx.weeks[wi];
        let base = 0;
        let partial = 0;
        for (let si = 0; si < wData.sets.length; si++) {
          const s = wData.sets[si];
          if (muscleMetric === 'effective') {
            const rpe = s.rpe !== undefined ? s.rpe : 9.0;
            const effBase = Math.min(s.base_reps || 0, Math.max(0, rpe - 4.0));
            base += effBase + (s.assisted_reps || 0) * 0.5;
            partial += s.partial_reps || 0;
          } else if (muscleMetric === 'volume') {
            base += (s.base_reps || 0) + (s.assisted_reps || 0) * 0.5;
            partial += s.partial_reps || 0;
          } else if (muscleMetric === 'sets') {
            base += 1.0;
          }
        }
        if (base > 0 || partial > 0) {
          byWeek.set(wData.week_num, { base, partial });
        }
      }
      return { wEx, byWeek };
    });
  }, [isDashboardActive, dashFilteredData, muscleMetric]);

  const cumulativeCurveData = useMemo(() => {
    if (!isDashboardActive) return [];
    const topMuscles = displayMuscleData.slice(0, 6).map(m => m.name);
    if (topMuscles.length === 0) return [];

    const resolution = CURVE_RESOLUTION;
    const data = [];
    for (let i = 0; i <= resolution; i++) {
      const x = i / resolution;
      const pt = { rom: x };
      topMuscles.forEach(m => { pt[m] = 0; });
      data.push(pt);
    }

    const topMusclesSet = new Set(topMuscles);
    const allowedWeeks = new Set(activeWeeksList);
    const isMacroView = deferredMacro === 'all';
    const partialCutoffIdx = Math.floor(resolution * 0.3333);

    exerciseWeekRepTotals.forEach(({ wEx, byWeek }) => {
      const ex = wEx.exercise_obj;
      if (!ex) return;

      let sumBase = 0;
      let sumPartial = 0;
      allowedWeeks.forEach(weekNum => {
        const t = byWeek.get(weekNum);
        if (t) {
          sumBase += t.base;
          sumPartial += t.partial;
        }
      });

      if (sumBase === 0 && sumPartial === 0) return;

      Object.entries(ex.muscles_distr).forEach(([subMuscle, distr]) => {
        const targetMuscle = isMacroView ? (MUSCLES[subMuscle] || 'Other') : subMuscle;
        if (!topMusclesSet.has(targetMuscle)) return;

        const cacheKey = typeof distr === 'object'
          ? `${ex.name}_${subMuscle}_${distr.x0}_${distr.y0}_${distr.x1}_${distr.y1}_${distr.x2}_${distr.y2}_${distr.x3}_${distr.y3}_${distr.magnitude}`
          : `${ex.name}_${subMuscle}_${distr}`;
        const normCurve = getCachedNormalizedCurve(cacheKey, distr);

        const totalWithPartial = sumBase + sumPartial * 0.33;
        for (let i = 0; i <= partialCutoffIdx; i++) {
          data[i][targetMuscle] += normCurve[i] * totalWithPartial;
        }
        for (let i = partialCutoffIdx + 1; i <= resolution; i++) {
          data[i][targetMuscle] += normCurve[i] * sumBase;
        }
      });
    });

    data.forEach(pt => {
      topMuscles.forEach(m => {
        pt[m] = parseFloat(pt[m].toFixed(2));
      });
    });

    return data;
  }, [isDashboardActive, exerciseWeekRepTotals, activeWeeksList, deferredMacro, displayMuscleData]);

  // Overall totals (filtered; in compare mode, uses each selection's last full microcycle so programs of different lengths compare fairly)
  const mainTotals = useMemo(() => {
    const rows = isCompareActive && lastFullWeekA !== null
      ? metricsByWeek.filter(m => m.week === `m${lastFullWeekA}`)
      : metricsByWeek;
    const agg = (fn) => parseFloat(rows.reduce((acc, m) => acc + fn(m), 0).toFixed(1));
    return {
      totalVolume: agg(m => m.Volume),
      totalTonnage: agg(m => m.Tonnage),
      totalEffectiveTonnage: agg(m => m.EffectiveTonnage || 0),
      totalWeightedTonnage: agg(m => m.WeightedTonnage || 0),
      totalEffectiveWeightedTonnage: agg(m => m.EffectiveWeightedTonnage || 0),
      totalFatigue: agg(m => m.Fatigue),
      totalEffectiveReps: agg(m => m.EffectiveRepsCustom || 0),
      totalTut: agg(m => m.Tut || 0),
      totalEffectiveTut: agg(m => m.EffectiveTut || 0),
      totalSets: agg(m => m.Sets || 0),
    };
  }, [metricsByWeek, isCompareActive, lastFullWeekA]);

  const compareTotals = useMemo(() => {
    const rows = lastFullWeekB !== null
      ? compareMetricsByWeek.filter(m => m.week === `m${lastFullWeekB}`)
      : compareMetricsByWeek;
    const agg = (fn) => parseFloat(rows.reduce((acc, m) => acc + fn(m), 0).toFixed(1));
    return {
      compareTotalVolume: agg(m => m.Volume_B || 0),
      compareTotalTonnage: agg(m => m.Tonnage_B || 0),
      compareTotalEffectiveTonnage: agg(m => m.EffectiveTonnage_B || 0),
      compareTotalWeightedTonnage: agg(m => m.WeightedTonnage_B || 0),
      compareTotalEffectiveWeightedTonnage: agg(m => m.EffectiveWeightedTonnage_B || 0),
      compareTotalFatigue: agg(m => m.Fatigue_B || 0),
      compareTotalEffReps: agg(m => m.EffectiveRepsCustom_B || 0),
      compareTotalTut: agg(m => m.Tut_B || 0),
      compareTotalEffectiveTut: agg(m => m.EffectiveTut_B || 0),
      compareTotalSets: agg(m => m.Sets_B || 0),
    };
  }, [compareMetricsByWeek, lastFullWeekB]);

  const { totalVolume, totalTonnage, totalEffectiveTonnage, totalWeightedTonnage, totalEffectiveWeightedTonnage, totalFatigue,
    totalEffectiveReps, totalTut, totalEffectiveTut, totalSets } = mainTotals;
  const { compareTotalVolume, compareTotalTonnage, compareTotalEffectiveTonnage, compareTotalWeightedTonnage, compareTotalEffectiveWeightedTonnage, compareTotalFatigue,
    compareTotalEffReps, compareTotalTut, compareTotalEffectiveTut, compareTotalSets } = compareTotals;

  const sparkSeriesA = useMemo(() => {
    const keys = ['Volume', 'EffectiveRepsCustom', 'Tonnage', 'EffectiveTonnage', 'WeightedTonnage', 'EffectiveWeightedTonnage', 'Tut', 'EffectiveTut', 'Sets', 'Fatigue'];
    const map = {};
    keys.forEach(k => { map[k] = buildTimeSeries(metricsByWeek, k); });
    return map;
  }, [metricsByWeek]);

  const sparkSeriesB = useMemo(() => {
    if (!compareMode) return {};
    const keys = ['Volume', 'EffectiveRepsCustom', 'Tonnage', 'EffectiveTonnage', 'WeightedTonnage', 'EffectiveWeightedTonnage', 'Tut', 'EffectiveTut', 'Sets', 'Fatigue'];
    const map = {};
    keys.forEach(k => { map[k] = buildTimeSeries(compareMetricsByWeek, `${k}_B`); });
    return map;
  }, [compareMode, compareMetricsByWeek]);

  const handleOpenTensionDetails = useCallback(() => {
    setSelectedMetricDetail('tension-profiles');
  }, [setSelectedMetricDetail]);

  // Helper: delta label for compare mode
  const delta = (a, b) => {
    if (b === 0) return null;
    const d = ((a - b) / Math.abs(b)) * 100;
    return { val: d.toFixed(2), pos: d >= 0 };
  };

  // Helper: clear all dashboard filters
  const clearAllDashFilters = () => {
    setDashFilterSession('all'); setDashFilterWeekFrom('all'); setDashFilterWeekTo('all');
    setCmpFilterSession('all'); setCmpFilterWeekFrom('all'); setCmpFilterWeekTo('all');
    setDashMuscleMacro('all'); setDashMuscleSubgroup('all');
  };

  const dashWeekRangeLabel = formatWeekRangeLabel(dashFilterWeekFrom, dashFilterWeekTo);
  const cmpWeekRangeLabel = formatWeekRangeLabel(cmpFilterWeekFrom, cmpFilterWeekTo);

  const hasAnyFilter = dashFilterSession !== 'all' || dashWeekRangeLabel !== null ||
    cmpFilterSession !== 'all' || cmpWeekRangeLabel !== null ||
    dashMuscleMacro !== 'all';

  const sessionWheelOptions = useMemo(() => [
    { value: 'all', label: 'All' },
    ...sessionsList.map(s => ({ value: String(s), label: `S${s}` }))
  ], [sessionsList]);

  const cmpSessionWheelOptions = useMemo(() => [
    { value: 'all', label: 'All' },
    ...compareSessionsList.map(s => ({ value: String(s), label: `S${s}` }))
  ], [compareSessionsList]);

  const macroWheelOptions = useMemo(() => [
    { value: 'all', label: 'All' },
    ...allMacros.map(m => ({ value: m, label: m }))
  ], [allMacros]);

  const subWheelOptions = useMemo(() => [
    { value: 'all', label: `All ${dashMuscleMacro}` },
    ...subMusclesForMacro.map(s => ({ value: s, label: s }))
  ], [dashMuscleMacro, subMusclesForMacro]);

  const mobileFilterSummary = useMemo(() => {
    const parts = [];
    if (dashFilterSession !== 'all') parts.push(`S${dashFilterSession}`);
    if (dashWeekRangeLabel) parts.push(dashWeekRangeLabel);
    if (dashMuscleMacro !== 'all') parts.push(dashMuscleSubgroup !== 'all' ? dashMuscleSubgroup : dashMuscleMacro);
    return parts.length > 0 ? parts.join(' · ') : 'Filters';
  }, [dashFilterSession, dashWeekRangeLabel, dashMuscleMacro, dashMuscleSubgroup]);

  return (
    <>
        <div className={`swipe-view ${activeTab === 'dashboard' ? 'active-desktop' : ''}`} id="view-dashboard">
          {/* Mobile Floating Filter Pill next to Settings button */}
          {isMobile && !selectedMetricDetail && (
            <div
              id="mobile-header-dash-controls"
              style={{
                position: 'absolute',
                top: '18px',
                left: '70px',
                right: '12px',
                zIndex: 50,
                height: '44px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '0 6px',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '99px',
                boxShadow: '0 4px 10px rgba(0, 0, 0, 0.5)',
                overflowX: 'auto',
                scrollbarWidth: 'none',
              }}
            >
              <button
                id="dash-compare-toggle"
                className={`btn ${compareMode ? 'btn-secondary' : ''}`}
                style={{ padding: '5px 12px', fontSize: '0.75rem', borderRadius: '99px', whiteSpace: 'nowrap', flexShrink: 0 }}
                onClick={() => {
                  if (compareMode) {
                    disableCompareMode();
                  } else {
                    setCompareMode(true);
                    if (compareProgram) loadCompareProgram(compareProgram);
                  }
                }}
              >
                {compareMode ? 'Compare' : 'Compare Programs'}
              </button>
              {compareMode && (
                <>
                  <select
                    id="dash-compare-program"
                    className="select-control"
                    style={{ fontSize: '0.75rem', padding: '5px 10px', flexShrink: 0 }}
                    value={compareProgram}
                    onChange={e => {
                      const val = e.target.value;
                      setCompareProgram(val);
                      loadCompareProgram(val);
                      setCmpFilterSession('all');
                      setCmpFilterWeekFrom('all');
                      setCmpFilterWeekTo('all');
                      if (val) setMobileFiltersOpen(true);
                    }}
                  >
                    <option value="">— pick program —</option>
                    {programs.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  {compareLoading && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>Loading…</span>}
                </>
              )}
              <button
                id="mobile-filters-toggle"
                className={`btn ${mobileFiltersOpen || hasAnyFilter ? 'btn-secondary' : ''}`}
                style={{ marginLeft: 'auto', padding: '5px 12px', fontSize: '0.75rem', borderRadius: '99px', whiteSpace: 'nowrap', flexShrink: 0 }}
                onClick={() => setMobileFiltersOpen(prev => !prev)}
              >
                {mobileFilterSummary}
              </button>
            </div>
          )}

          {(isMobile || activeTab === 'dashboard') ? (
            <div className="main-content-card" style={{ overflow: 'hidden' }}>
                <div className="glass-card-body" style={{ padding: '4px 8px 20px 8px' }}>

                  {/* ── Dashboard Filter Bar (Desktop always visible; Mobile smoothly expands/collapses) ── */}
                  {(() => {
                    const isFilterPanelOpen = !isMobile || mobileFiltersOpen;
                    return (
                  <div style={{
                    height: !isMobile ? 'auto' : (isFilterPanelOpen ? `${filterHeight}px` : '0px'),
                    opacity: isFilterPanelOpen ? 1 : 0,
                    marginBottom: isFilterPanelOpen ? (isMobile ? '8px' : '16px') : '0px',
                    overflow: 'hidden',
                    borderRadius: 'var(--card-radius)',
                    willChange: 'height, opacity',
                    transition: 'height 350ms cubic-bezier(0.4, 0, 0.2, 1), opacity 280ms ease, margin-bottom 350ms cubic-bezier(0.4, 0, 0.2, 1)',
                    pointerEvents: isFilterPanelOpen ? 'auto' : 'none',
                  }}>
                  <div ref={filterContentRef} style={{
                    display: 'flex', flexDirection: 'column', gap: '12px',
                    padding: isMobile ? '12px' : '14px 16px',
                    background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                    borderRadius: 'var(--card-radius)', boxShadow: 'var(--card-shadow)'
                  }}>

                    {/* Top row (Desktop only): Compare toggle + program picker + clear */}
                    {!isMobile && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                      <button
                        id="dash-compare-toggle"
                        className={`btn ${compareMode ? 'btn-secondary' : ''}`}
                        style={{ padding: '6px 14px', fontSize: '0.8rem', borderRadius: '100px' }}
                        onClick={() => {
                          if (compareMode) {
                            disableCompareMode();
                          } else {
                            setCompareMode(true);
                            if (compareProgram) loadCompareProgram(compareProgram);
                          }
                        }}
                      >
                        Compare Programs
                      </button>
                      {compareMode && (
                        <>
                          <select
                            id="dash-compare-program"
                            className="select-control"
                            style={{ minWidth: '130px' }}
                            value={compareProgram}
                            onChange={e => { setCompareProgram(e.target.value); loadCompareProgram(e.target.value); setCmpFilterSession('all'); setCmpFilterWeekFrom('all'); setCmpFilterWeekTo('all'); }}
                          >
                            <option value="">— pick program —</option>
                            {programs.map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                          {compareLoading && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Loading…</span>}
                        </>
                      )}
                      {hasAnyFilter && (
                        <button
                          className="btn"
                          style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: '0.75rem', color: 'var(--color-fatigue)', borderColor: 'rgba(244,63,94,0.25)' }}
                          onClick={clearAllDashFilters}
                        >
                          ✕ Clear All Filters
                        </button>
                      )}
                    </div>
                    )}

                    {/* Filter rows */}
                    {compareMode && compareProgram ? (
                      // Compare mode: two columns, one per program
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px' }}>
                        {/* Program A filters */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '10px 12px', background: 'var(--accent-primary-subtle)', border: '1px solid var(--accent-primary-glow)', borderRadius: '12px' }}>
                          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-primary)', display: 'inline-block' }} />
                            {currentProgram === compareProgram ? `${currentProgram} (Selection A)` : currentProgram}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '18px' : '12px' }}>
                            <LockWheelPicker
                              label="Session"
                              options={sessionWheelOptions}
                              value={dashFilterSession}
                              onChange={val => { setDashFilterSession(val); setDashFilterWeekFrom('all'); setDashFilterWeekTo('all'); }}
                              itemWidth={38}
                            />
                            <DualWeekSlider
                              label="Microcycles"
                              weeks={allFullWeeksList}
                              fromVal={dashFilterWeekFrom}
                              toVal={dashFilterWeekTo}
                              onChange={(f, t) => { setDashFilterWeekFrom(f); setDashFilterWeekTo(t); }}
                              accentColor="var(--accent-primary)"
                            />
                          </div>
                        </div>

                        {/* Program B filters */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '10px 12px', background: 'var(--accent-secondary-subtle)', border: '1px solid var(--accent-secondary-glow)', borderRadius: '12px' }}>
                          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--accent-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-secondary)', display: 'inline-block' }} />
                            {currentProgram === compareProgram ? `${compareProgram} (Selection B)` : compareProgram}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '18px' : '12px' }}>
                            <LockWheelPicker
                              label="Session"
                              options={cmpSessionWheelOptions}
                              value={cmpFilterSession}
                              onChange={val => { setCmpFilterSession(val); setCmpFilterWeekFrom('all'); setCmpFilterWeekTo('all'); }}
                              itemWidth={38}
                            />
                            <DualWeekSlider
                              label="Microcycles"
                              weeks={allCompareFullWeeksList}
                              fromVal={cmpFilterWeekFrom}
                              toVal={cmpFilterWeekTo}
                              onChange={(f, t) => { setCmpFilterWeekFrom(f); setCmpFilterWeekTo(t); }}
                              accentColor="var(--accent-secondary)"
                            />
                          </div>
                        </div>

                        {/* Shared muscle lock wheels — full width row */}
                        <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: isMobile ? '18px' : '12px', paddingTop: '10px', borderTop: '1px solid var(--border-color)' }}>
                          <LockWheelPicker
                            label="Muscle Group"
                            options={macroWheelOptions}
                            value={dashMuscleMacro}
                            onChange={val => { setDashMuscleMacro(val); setDashMuscleSubgroup('all'); }}
                            itemWidth={62}
                          />
                          {dashMuscleMacro !== 'all' && subMusclesForMacro.length > 0 && (
                            <LockWheelPicker
                              label="Subgroup"
                              options={subWheelOptions}
                              value={dashMuscleSubgroup}
                              onChange={val => setDashMuscleSubgroup(val)}
                              itemWidth={78}
                            />
                          )}
                        </div>
                      </div>
                    ) : (
                      // Normal mode: minimal lateral lock-wheels + Dual-thumb Week slider
                      <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '18px' : '12px' }}>
                        <LockWheelPicker
                          label="Session"
                          options={sessionWheelOptions}
                          value={dashFilterSession}
                          onChange={val => { setDashFilterSession(val); setDashFilterWeekFrom('all'); setDashFilterWeekTo('all'); }}
                          itemWidth={38}
                        />
                        <LockWheelPicker
                          label="Muscle Group"
                          options={macroWheelOptions}
                          value={dashMuscleMacro}
                          onChange={val => { setDashMuscleMacro(val); setDashMuscleSubgroup('all'); }}
                          itemWidth={62}
                        />
                        {dashMuscleMacro !== 'all' && subMusclesForMacro.length > 0 && (
                          <LockWheelPicker
                            label="Subgroup"
                            options={subWheelOptions}
                            value={dashMuscleSubgroup}
                            onChange={val => setDashMuscleSubgroup(val)}
                            itemWidth={78}
                          />
                        )}
                        <DualWeekSlider
                          label="Microcycles"
                          weeks={allFullWeeksList}
                          fromVal={dashFilterWeekFrom}
                          toVal={dashFilterWeekTo}
                          onChange={(f, t) => { setDashFilterWeekFrom(f); setDashFilterWeekTo(t); }}
                        />
                      </div>
                    )}
                    {isMobile && hasAnyFilter && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '4px' }}>
                        <button
                          className="btn"
                          style={{ padding: '4px 10px', fontSize: '0.72rem', borderRadius: '99px', color: 'var(--color-fatigue)', borderColor: 'rgba(244,63,94,0.25)' }}
                          onClick={clearAllDashFilters}
                        >
                          ✕ Clear Filters
                        </button>
                      </div>
                    )}
                  </div>
                  </div>
                    );
                  })()}

                  {/* ── Full-Width Profile Preview Card ── */}
                  <ProfilePreviewCard
                    profile={profile}
                    onOpen={() => setProfileOpen(true)}
                  />

                  {/* ── Summary Cards ── */}
                  {compareMode && compareProgram && !compareLoading ? (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: isMobile ? '8px' : '16px', marginBottom: isMobile ? '8px' : '12px' }}>
                        <div style={{
                          padding: '8px 14px',
                          background: 'var(--accent-primary-subtle)', border: '1px solid var(--accent-primary-glow)',
                          borderRadius: '100px', fontSize: '0.8rem', fontWeight: 600,
                          color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0
                        }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-primary)', flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {currentProgram === compareProgram ? `${currentProgram} (A)` : currentProgram}
                          </span>
                          <span style={{ marginLeft: 'auto', fontSize: '0.72rem', opacity: 0.85, flexShrink: 0 }}>
                            {lastFullWeekA !== null ? `m${lastFullWeekA}` : '—'}
                          </span>
                        </div>
                        <div style={{
                          padding: '8px 14px',
                          background: 'var(--accent-secondary-subtle)', border: '1px solid var(--accent-secondary-glow)',
                          borderRadius: '100px', fontSize: '0.8rem', fontWeight: 600,
                          color: 'var(--accent-secondary)', display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0
                        }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-secondary)', flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {currentProgram === compareProgram ? `${compareProgram} (B)` : compareProgram}
                          </span>
                          <span style={{ marginLeft: 'auto', fontSize: '0.72rem', opacity: 0.85, flexShrink: 0 }}>
                            {lastFullWeekB !== null ? `m${lastFullWeekB}` : '—'}
                          </span>
                        </div>
                      </div>
                      <div className="metrics-summary-grid">
                        {[
                          {
                            id: 'reps',
                            variants: {
                              total: ['Reps', 'volume', 'Volume', `${totalVolume.toLocaleString()} reps`, `${compareTotalVolume.toLocaleString()} reps`, delta(compareTotalVolume, totalVolume)],
                              effective: ['Eff. Reps', 'effective', 'EffectiveRepsCustom', `${totalEffectiveReps.toLocaleString()} reps`, `${compareTotalEffReps.toLocaleString()} reps`, delta(compareTotalEffReps, totalEffectiveReps)],
                            },
                          },
                          {
                            id: 'tonnage',
                            variants: {
                              total: ['Tonnage', 'tonnage', 'Tonnage', `${totalTonnage.toLocaleString()} kg`, `${compareTotalTonnage.toLocaleString()} kg`, delta(compareTotalTonnage, totalTonnage)],
                              effective: ['Eff. Tonnage', 'effective-tonnage', 'EffectiveTonnage', `${totalEffectiveTonnage.toLocaleString()} kg`, `${compareTotalEffectiveTonnage.toLocaleString()} kg`, delta(compareTotalEffectiveTonnage, totalEffectiveTonnage)],
                            },
                          },
                          {
                            id: 'weightedTonnage',
                            variants: {
                              total: ['W. Tonnage', 'weighted-tonnage', 'WeightedTonnage', `${totalWeightedTonnage.toLocaleString()} kg`, `${compareTotalWeightedTonnage.toLocaleString()} kg`, delta(compareTotalWeightedTonnage, totalWeightedTonnage)],
                              effective: ['Eff. W. Tonnage', 'effective-weighted-tonnage', 'EffectiveWeightedTonnage', `${totalEffectiveWeightedTonnage.toLocaleString()} kg`, `${compareTotalEffectiveWeightedTonnage.toLocaleString()} kg`, delta(compareTotalEffectiveWeightedTonnage, totalEffectiveWeightedTonnage)],
                            },
                          },
                          {
                            id: 'tut',
                            variants: {
                              total: ['TUT', 'tut', 'Tut', `${totalTut.toLocaleString()}s`, `${compareTotalTut.toLocaleString()}s`, delta(compareTotalTut, totalTut)],
                              effective: ['Eff. TUT', 'effective-tut', 'EffectiveTut', `${totalEffectiveTut.toLocaleString()}s`, `${compareTotalEffectiveTut.toLocaleString()}s`, delta(compareTotalEffectiveTut, totalEffectiveTut)],
                            },
                          },
                          {
                            id: 'sets',
                            isBar: true,
                            variants: {
                              total: ['Volume', 'sets', 'Sets', `${totalSets.toLocaleString()} sets`, `${compareTotalSets.toLocaleString()} sets`, delta(compareTotalSets, totalSets)],
                            },
                          },
                          {
                            id: 'fatigue',
                            variants: {
                              total: ['Accumulated Fatigue', 'fatigue', 'Fatigue', `${totalFatigue.toLocaleString()}`, `${compareTotalFatigue.toLocaleString()}`, delta(compareTotalFatigue, totalFatigue)],
                            },
                          },
                        ].map((card) => {
                          const hasToggle = Boolean(card.variants.effective);
                          const mode = hasToggle ? (cardModes[card.id] || 'total') : 'total';
                          const [label, cls, metricKey, valA, valB, d] = card.variants[mode];
                          const valsA = sparkSeriesA[metricKey];
                          const valsB = sparkSeriesB[metricKey];
                          return (
                            <div key={card.id} className={`metric-summary-card ${cls}`} onClick={() => { setSelectedMetricDetail(cls); }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                                <span className="metric-label">{label}</span>
                                {hasToggle && (
                                  <CardModeToggle
                                    cardId={card.id}
                                    mode={mode}
                                    onToggle={handleCardModeToggle}
                                  />
                                )}
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--accent-primary)', flexShrink: 0 }} />
                                  <span className="metric-value" style={{ fontSize: isMobile ? '1.1rem' : '1.35rem' }}>{valA}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--accent-secondary)', flexShrink: 0 }} />
                                  <span className="metric-value" style={{ fontSize: isMobile ? '0.95rem' : '1.1rem', opacity: 0.85 }}>{valB}</span>
                                  {d && (
                                    <span style={{ marginLeft: 'auto', fontSize: '0.7rem', fontWeight: 600, color: (cls === 'fatigue' ? !d.pos : d.pos) ? '#10b981' : '#f43f5e' }}>
                                      {d.pos ? '▲' : '▼'} {Math.abs(d.val).toFixed(2)}%
                                    </span>
                                  )}
                                </div>
                              </div>
                              {card.isBar ? (
                                <MetricBarSparkline
                                  values={valsA}
                                  compareValues={valsB}
                                  color="var(--accent-primary)"
                                  compareColor="var(--accent-secondary)"
                                />
                              ) : (
                                <MetricSparkline
                                  values={valsA}
                                  compareValues={valsB}
                                  color="var(--accent-primary)"
                                  compareColor="var(--accent-secondary)"
                                  gradId={`spark-cmp-${card.id}`}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="metrics-summary-grid">
                      {[
                        {
                          id: 'reps',
                          variants: {
                            total: ['Reps', 'volume', 'Volume', 'var(--color-volume)', `${totalVolume.toLocaleString()} reps`],
                            effective: ['Eff. Reps', 'effective', 'EffectiveRepsCustom', 'var(--color-effective-volume)', `${totalEffectiveReps.toLocaleString()} reps`],
                          },
                        },
                        {
                          id: 'tonnage',
                          variants: {
                            total: ['Tonnage', 'tonnage', 'Tonnage', 'var(--color-tonnage)', `${totalTonnage.toLocaleString()} kg`],
                            effective: ['Eff. Tonnage', 'effective-tonnage', 'EffectiveTonnage', 'var(--color-effective-tonnage)', `${totalEffectiveTonnage.toLocaleString()} kg`],
                          },
                        },
                        {
                          id: 'weightedTonnage',
                          variants: {
                            total: ['W. Tonnage', 'weighted-tonnage', 'WeightedTonnage', 'var(--color-weighted-tonnage)', `${totalWeightedTonnage.toLocaleString()} kg`],
                            effective: ['Eff. W. Tonnage', 'effective-weighted-tonnage', 'EffectiveWeightedTonnage', 'var(--color-effective-weighted-tonnage)', `${totalEffectiveWeightedTonnage.toLocaleString()} kg`],
                          },
                        },
                        {
                          id: 'tut',
                          variants: {
                            total: ['TUT', 'tut', 'Tut', 'var(--color-tut)', `${totalTut.toLocaleString()}s`],
                            effective: ['Eff. TUT', 'effective-tut', 'EffectiveTut', 'var(--color-effective-tut)', `${totalEffectiveTut.toLocaleString()}s`],
                          },
                        },
                        {
                          id: 'sets',
                          isBar: true,
                          variants: {
                            total: ['Volume', 'sets', 'Sets', 'var(--color-sets)', `${totalSets.toLocaleString()} sets`],
                          },
                        },
                        {
                          id: 'fatigue',
                          variants: {
                            total: ['Accumulated Fatigue', 'fatigue', 'Fatigue', 'var(--color-fatigue)', `${totalFatigue.toLocaleString()}`],
                          },
                        },
                      ].map((card) => {
                        const hasToggle = Boolean(card.variants.effective);
                        const mode = hasToggle ? (cardModes[card.id] || 'total') : 'total';
                        const [label, cls, metricKey, color, formattedVal] = card.variants[mode];
                        const vals = sparkSeriesA[metricKey];
                        return (
                          <div key={card.id} className={`metric-summary-card ${cls}`} onClick={() => { setSelectedMetricDetail(cls); }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                              <span className="metric-label">{label}</span>
                              {hasToggle && (
                                <CardModeToggle
                                  cardId={card.id}
                                  mode={mode}
                                  onToggle={handleCardModeToggle}
                                />
                              )}
                            </div>
                            <span className="metric-value">{formattedVal}</span>
                            <TrendBadge values={vals} invertColor={cls === 'fatigue'} />
                            {card.isBar ? (
                              <MetricBarSparkline values={vals} color={color} />
                            ) : (
                              <MetricSparkline values={vals} color={color} gradId={`spark-${card.id}`} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* ── Progress Charts Grid ── */}
                  <div className="analytics-grid">

                    {/* Muscle Group Volume */}
                    <div className="chart-container">
                      <div className="chart-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span className="chart-title" style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
                          {dashMuscleMacro !== 'all' 
                            ? (muscleMetric === 'sets' ? `${dashMuscleMacro} Sub-group Volume` : `${dashMuscleMacro} Sub-group Reps`)
                            : (muscleMetric === 'sets' ? 'Muscle Group Volume' : 'Muscle Group Reps')}
                        </span>
                        <div
                          role="group"
                          aria-label="Muscle group metric"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '2px',
                            padding: '3px',
                            borderRadius: '999px',
                            background: 'rgba(255, 255, 255, 0.04)',
                            border: '1px solid var(--border-color)',
                            flexShrink: 0,
                          }}
                        >
                          {MUSCLE_METRIC_OPTIONS.map((opt) => {
                            const active = muscleMetric === opt.value;
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                aria-pressed={active}
                                onClick={() => setMuscleMetric(opt.value)}
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: '999px',
                                  border: 'none',
                                  background: active ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                                  color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                                  fontSize: '0.72rem',
                                  fontWeight: active ? 600 : 500,
                                  lineHeight: 1.2,
                                  cursor: 'pointer',
                                  whiteSpace: 'nowrap',
                                  transition: 'background 0.15s ease, color 0.15s ease',
                                }}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <MuscleDonutChart
                        data={displayMuscleData}
                        compareData={isCompareActive && !compareLoading ? displayCompareMuscleData : null}
                        currentProgram={currentProgram}
                        compareProgram={compareProgram}
                        weekA={lastFullWeekA}
                        weekB={lastFullWeekB}
                        metric={muscleMetric}
                        isMobile={isMobile}
                      />
                    </div>

                    {/* Cumulative Tension Curves Chart */}
                    <TensionProfilesCard
                      isMobile={isMobile}
                      cumulativeCurveData={cumulativeCurveData}
                      displayMuscleData={displayMuscleData}
                      onOpenDetails={handleOpenTensionDetails}
                    />

                  </div>

                </div>
              </div>
            ) : null}

          {/* Metric Detail Popup Overlay — copy of settings popup */}
          {selectedMetricDetail && (
            <React.Suspense fallback={<div className="loading-spinner">Loading details...</div>}>
              <MetricDetailsPage
                metric={selectedMetricDetail}
                series={sparkSeriesA[DETAIL_TO_SERIES_KEY[selectedMetricDetail]]}
                compareSeries={compareMode ? sparkSeriesB[DETAIL_TO_SERIES_KEY[selectedMetricDetail]] : undefined}
                weekNums={metricsByWeek.map((m) => m.weekNum)}
                onBack={() => setSelectedMetricDetail(null)}
              />
            </React.Suspense>
          )}

          {/* Full Athlete Profile Overlay */}
          {profileOpen && (
            <React.Suspense fallback={<div className="loading-spinner">Loading profile...</div>}>
              <ProfilePage
                profile={profile}
                setProfile={setProfile}
                dateFormat={dateFormat}
                onBack={() => setProfileOpen(false)}
              />
            </React.Suspense>
          )}
        </div>
    </>
  );
};

export default React.memo(DashboardTab);

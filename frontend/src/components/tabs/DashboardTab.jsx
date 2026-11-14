import React, { useState, useMemo, useCallback, useRef, useEffect, useDeferredValue } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { MUSCLES, calculateMetrics, parseLogbook } from '../../parser';
const MetricDetailsPage = React.lazy(() => import('../MetricDetails'));
import MuscleDonutChart from '../MuscleDonutChart';
import { bezierArea, solveBezierY } from '../helpers';
import { LockWheelPicker, DualWeekSlider } from '../FilterControls';

const CURVE_RESOLUTION = 50;
const normalizedCurveCache = new Map();
const TENSION_SERIES_COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#a855f7', '#f43f5e'];
const MUSCLE_METRIC_OPTIONS = [
  { value: 'effective', label: 'Eff. Reps' },
  { value: 'sets', label: 'Volume' },
  { value: 'volume', label: 'Reps' },
];

/** Pointer-draggable ROM scrubber styled to match DualWeekSlider. */
const TensionRomSlider = ({ value, onChange }) => {
  const trackRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const updateFromClientX = useCallback((clientX) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    onChange(Math.round(ratio * 100));
  }, [onChange]);

  const handlePointerDown = (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    updateFromClientX(e.clientX);
  };

  const handlePointerMove = (e) => {
    if (!dragging) return;
    updateFromClientX(e.clientX);
  };

  const handlePointerUp = () => {
    setDragging(false);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 500, userSelect: 'none' }}>
        Stretch
      </span>
      <div
        ref={trackRef}
        role="slider"
        aria-label="Range of motion percentage"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          position: 'relative',
          flex: 1,
          height: '26px',
          display: 'flex',
          alignItems: 'center',
          touchAction: 'none',
          cursor: 'pointer',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '4px',
            borderRadius: '999px',
            background: 'rgba(255, 255, 255, 0.14)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              height: '100%',
              width: `${value}%`,
              borderRadius: '999px',
              background: 'var(--accent-primary)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: `${value}%`,
              top: '50%',
              width: '15px',
              height: '15px',
              borderRadius: '50%',
              background: '#ffffff',
              border: '2px solid var(--accent-primary)',
              boxShadow: '0 1px 4px rgba(0, 0, 0, 0.45)',
              transform: `translate(-50%, -50%) scale(${dragging ? 1.15 : 1})`,
              transition: dragging ? 'none' : 'transform 0.12s ease',
            }}
          />
        </div>
      </div>
      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 500, userSelect: 'none' }}>
        Contract
      </span>
    </div>
  );
};

const isWeekInRange = (weekNum, fromVal, toVal) => {
  if (fromVal !== 'all' && weekNum < parseInt(fromVal, 10)) return false;
  if (toVal !== 'all' && weekNum > parseInt(toVal, 10)) return false;
  return true;
};

const formatWeekRangeLabel = (fromVal, toVal) => {
  if (fromVal !== 'all' && toVal !== 'all') {
    return fromVal === toVal ? `W${fromVal}` : `W${fromVal}–W${toVal}`;
  }
  if (fromVal !== 'all') return `W${fromVal}+`;
  if (toVal !== 'all') return `≤W${toVal}`;
  return null;
};

const TrendBadge = React.memo(({ values, invertColor = false }) => {
  if (!values || values.length < 2) return null;
  const first = values[0];
  const last = values[values.length - 1];
  if (first === 0) return null;
  const pct = ((last - first) / first) * 100;
  const pos = pct >= 0;
  const isGood = invertColor ? !pos : pos;
  return (
    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: isGood ? '#10b981' : '#f43f5e', lineHeight: 1.1 }}>
      {pos ? '▲' : '▼'} {Math.abs(pct).toFixed(2)}%
    </span>
  );
});

const buildSparklinePath = (vals, w, h, padY, min, range) => {
  const pts = vals.map((v, i) => {
    const x = vals.length > 1 ? (i / (vals.length - 1)) * w : w / 2;
    const y = range > 0
      ? h - padY - ((v - min) / range) * (h - padY * 2)
      : h / 2;
    return [x, y];
  });
  let linePath = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const cx = (x0 + x1) / 2;
    linePath += ` C${cx.toFixed(1)},${y0.toFixed(1)} ${cx.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return linePath;
};

const MetricSparkline = React.memo(({ values, compareValues, color, compareColor = 'var(--accent-secondary)', gradId }) => {
  const hasA = values && values.length >= 2;
  const hasB = compareValues && compareValues.length >= 2;
  if (!hasA && !hasB) return null;

  const w = 120;
  const h = 60;
  const padY = 2;
  const allVals = [...(hasA ? values : []), ...(hasB ? compareValues : [])];
  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  const range = max - min;

  const linePathA = hasA ? buildSparklinePath(values, w, h, padY, min, range) : null;
  const areaPathA = linePathA ? `${linePathA} L${w},${h} L0,${h} Z` : null;
  const linePathB = hasB ? buildSparklinePath(compareValues, w, h, padY, min, range) : null;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: '58px', display: 'block', marginTop: '4px', overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.26" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {areaPathA && <path d={areaPathA} fill={`url(#${gradId})`} />}
      {linePathB && (
        <path
          d={linePathB}
          fill="none"
          stroke={compareColor}
          strokeWidth="1.75"
          strokeDasharray="4 3"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {linePathA && (
        <path
          d={linePathA}
          fill="none"
          stroke={color}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
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
      <div style={{ height: isMobile ? '205px' : '290px', width: '100%', marginTop: '8px' }}>
        {cumulativeCurveData.length > 0 ? (
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
              {isMobile && (
                <ReferenceLine
                  x={tensionSliderPos / 100}
                  stroke="rgba(255,255,255,0.35)"
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
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

const DashboardTab = ({
  isMobile,
  activeTab,
  workoutData,
  currentProgram,
  programs,
  exercisesDb,
  selectedMetricDetail,
  setSelectedMetricDetail
}) => {
  const [muscleMetric, setMuscleMetric] = useState('sets');

  // Dashboard filter state
  const [dashFilterSession, setDashFilterSession] = useState('all'); // 'all' or session number
  const [dashFilterWeekFrom, setDashFilterWeekFrom] = useState('all'); // 'all' or week number
  const [dashFilterWeekTo, setDashFilterWeekTo] = useState('all');     // 'all' or week number
  const [compareMode, setCompareMode] = useState(false);
  const [compareProgram, setCompareProgram] = useState('');
  const [compareWorkoutData, setCompareWorkoutData] = useState([]);
  const [compareLoading, setCompareLoading] = useState(false);
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
  }, []);


  // Calculated Metrics — memoized to avoid recomputing on every render
  const sessionsList = useMemo(
    () => Array.from(new Set(workoutData.map(d => d.session))).sort((a, b) => a - b),
    [workoutData]
  );

  // Helper: load a comparison program and parse it
  const loadCompareProgram = (progName) => {
    if (!progName) { setCompareWorkoutData([]); return; }
    setCompareLoading(true);
    fetch(`/api/logbook?program=${progName}`)
      .then(res => res.text())
      .then(text => {
        const parsed = parseLogbook(text, exercisesDb);
        setCompareWorkoutData(parsed);
        setCompareLoading(false);
      })
      .catch(() => { setCompareWorkoutData([]); setCompareLoading(false); });
  };

  // Derived sessions lists for compare program B
  const compareSessionsList = useMemo(() =>
    Array.from(new Set(compareWorkoutData.map(d => d.session))).sort((a, b) => a - b),
  [compareWorkoutData]);

  // All macro muscle groups and their sub-muscles (from MUSCLES map)
  const allMacros = useMemo(() => Array.from(new Set(Object.values(MUSCLES))).sort(), []);
  const subMusclesForMacro = useMemo(() => {
    if (dashMuscleMacro === 'all') return [];
    return Object.entries(MUSCLES).filter(([, macro]) => macro === dashMuscleMacro).map(([sub]) => sub).sort();
  }, [dashMuscleMacro]);

  // Derived: filtered data for the dashboard based on session/muscle selectors
  const dashFilteredData = useMemo(() => {
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
  }, [workoutData, deferredSession, deferredMacro, deferredSubgroup]);

  // Derived: filtered data for compare program B
  const cmpFilteredData = useMemo(() => {
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
  }, [compareWorkoutData, deferredCmpSession, deferredMacro, deferredSubgroup]);

  // Weeks available after session filter (program A)
  const dashWeeksList = useMemo(() =>
    Array.from(new Set(dashFilteredData.flatMap(d => d.weeks.map(w => w.week_num)))).sort((a, b) => a - b),
  [dashFilteredData]);

  // Weeks available for compare program B after its session filter
  const cmpWeeksList = useMemo(() =>
    Array.from(new Set(cmpFilteredData.flatMap(d => d.weeks.map(w => w.week_num)))).sort((a, b) => a - b),
  [cmpFilteredData]);

  // Precompute complete weeks and metrics once per session/muscle change so week-slider drags are O(1)
  const allFullWeeksList = useMemo(() => {
    const targetSession = deferredSession !== 'all' ? parseInt(deferredSession, 10) : null;
    return dashWeeksList.filter(week => {
      if (targetSession !== null) return true;
      if (sessionsList.length === 0) return true;
      return sessionsList.every(sess =>
        workoutData.some(d => d.session === sess && d.weeks.some(w => w.week_num === week && w.sets.length > 0))
      );
    });
  }, [dashWeeksList, deferredSession, sessionsList, workoutData]);

  const allWeeksMetrics = useMemo(() => {
    const targetSession = deferredSession !== 'all' ? parseInt(deferredSession, 10) : null;
    const targetMacro = deferredMacro !== 'all' ? deferredMacro : null;
    const targetSub = deferredSubgroup !== 'all' ? deferredSubgroup : null;

    return allFullWeeksList.map(week => {
      const weeklyData = calculateMetrics(dashFilteredData, targetSession, week, targetMacro, targetSub);
      return {
        weekNum: week,
        week: `W${week}`,
        Volume: parseFloat(weeklyData.reduce((s, d) => s + d.volume, 0).toFixed(1)),
        Tonnage: parseFloat(weeklyData.reduce((s, d) => s + d.tonnage, 0).toFixed(1)),
        EffectiveTonnage: parseFloat(weeklyData.reduce((s, d) => s + (d.effectiveTonnage || 0), 0).toFixed(1)),
        WeightedTonnage: parseFloat(weeklyData.reduce((s, d) => s + (d.weightedTonnage || 0), 0).toFixed(1)),
        EffectiveWeightedTonnage: parseFloat(weeklyData.reduce((s, d) => s + (d.effectiveWeightedTonnage || 0), 0).toFixed(1)),
        Fatigue: parseFloat(weeklyData.reduce((s, d) => s + d.fatigue, 0).toFixed(1)),
        EffectiveRepsCustom: parseFloat(weeklyData.reduce((s, d) => s + (d.effectiveReps || 0), 0).toFixed(1)),
        Tut: parseFloat(weeklyData.reduce((s, d) => s + (d.totalTut || 0), 0).toFixed(1)),
        EffectiveTut: parseFloat(weeklyData.reduce((s, d) => s + (d.effectiveTut || 0), 0).toFixed(1)),
        Sets: parseFloat(weeklyData.reduce((s, d) => s + (d.sets || 0), 0).toFixed(1))
      };
    });
  }, [dashFilteredData, deferredSession, allFullWeeksList, deferredMacro, deferredSubgroup]);

  const activeWeeksList = useMemo(
    () => allFullWeeksList.filter(w => isWeekInRange(w, deferredWeekFrom, deferredWeekTo)),
    [allFullWeeksList, deferredWeekFrom, deferredWeekTo]
  );

  const metricsByWeek = useMemo(
    () => allWeeksMetrics.filter(m => isWeekInRange(m.weekNum, deferredWeekFrom, deferredWeekTo)),
    [allWeeksMetrics, deferredWeekFrom, deferredWeekTo]
  );

  const allCompareFullWeeksList = useMemo(() => {
    const targetSession = deferredCmpSession !== 'all' ? parseInt(deferredCmpSession, 10) : null;
    return cmpWeeksList.filter(week => {
      if (targetSession !== null) return true;
      if (compareSessionsList.length === 0) return true;
      return compareSessionsList.every(sess =>
        compareWorkoutData.some(d => d.session === sess && d.weeks.some(w => w.week_num === week && w.sets.length > 0))
      );
    });
  }, [cmpWeeksList, deferredCmpSession, compareSessionsList, compareWorkoutData]);

  const allCompareWeeksMetrics = useMemo(() => {
    const targetSession = deferredCmpSession !== 'all' ? parseInt(deferredCmpSession, 10) : null;
    const targetMacro = deferredMacro !== 'all' ? deferredMacro : null;
    const targetSub = deferredSubgroup !== 'all' ? deferredSubgroup : null;

    return allCompareFullWeeksList.map(week => {
      const weeklyData = calculateMetrics(cmpFilteredData, targetSession, week, targetMacro, targetSub);
      return {
        weekNum: week,
        week: `W${week}`,
        Volume_B: parseFloat(weeklyData.reduce((s, d) => s + d.volume, 0).toFixed(1)),
        Tonnage_B: parseFloat(weeklyData.reduce((s, d) => s + d.tonnage, 0).toFixed(1)),
        EffectiveTonnage_B: parseFloat(weeklyData.reduce((s, d) => s + (d.effectiveTonnage || 0), 0).toFixed(1)),
        WeightedTonnage_B: parseFloat(weeklyData.reduce((s, d) => s + (d.weightedTonnage || 0), 0).toFixed(1)),
        EffectiveWeightedTonnage_B: parseFloat(weeklyData.reduce((s, d) => s + (d.effectiveWeightedTonnage || 0), 0).toFixed(1)),
        Fatigue_B: parseFloat(weeklyData.reduce((s, d) => s + d.fatigue, 0).toFixed(1)),
        EffectiveRepsCustom_B: parseFloat(weeklyData.reduce((s, d) => s + (d.effectiveReps || 0), 0).toFixed(1)),
        Tut_B: parseFloat(weeklyData.reduce((s, d) => s + (d.totalTut || 0), 0).toFixed(1)),
        EffectiveTut_B: parseFloat(weeklyData.reduce((s, d) => s + (d.effectiveTut || 0), 0).toFixed(1)),
        Sets_B: parseFloat(weeklyData.reduce((s, d) => s + (d.sets || 0), 0).toFixed(1))
      };
    });
  }, [cmpFilteredData, deferredCmpSession, allCompareFullWeeksList, deferredMacro, deferredSubgroup]);

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
    () => computeMuscleDistribution(
      dashFilteredData,
      activeWeeksList,
      deferredMacro,
      deferredSubgroup,
      muscleMetric,
      compareMode && lastFullWeekA !== null ? lastFullWeekA : undefined
    ),
    [dashFilteredData, activeWeeksList, deferredMacro, deferredSubgroup, muscleMetric, compareMode, lastFullWeekA]
  );
  const compareMuscleData = useMemo(
    () => compareMode
      ? computeMuscleDistribution(
          cmpFilteredData,
          compareActiveWeeksList,
          deferredMacro,
          deferredSubgroup,
          muscleMetric,
          lastFullWeekB !== null ? lastFullWeekB : 'all'
        )
      : [],
    [compareMode, cmpFilteredData, compareActiveWeeksList, deferredMacro, deferredSubgroup, muscleMetric, lastFullWeekB]
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

  const cumulativeCurveData = useMemo(() => {
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

    dashFilteredData.forEach(wEx => {
      const ex = wEx.exercise_obj;
      if (!ex) return;

      // Accumulate base & partial totals across all allowed weeks/sets once per exercise
      let sumBase = 0;
      let sumPartial = 0;
      wEx.weeks.forEach(wData => {
        if (!allowedWeeks.has(wData.week_num)) return;
        wData.sets.forEach(s => {
          if (muscleMetric === 'effective') {
            const rpe = s.rpe !== undefined ? s.rpe : 9.0;
            const effBase = Math.min(s.base_reps || 0, Math.max(0, rpe - 4.0));
            sumBase += effBase + (s.assisted_reps || 0) * 0.5;
            sumPartial += s.partial_reps || 0;
          } else if (muscleMetric === 'volume') {
            sumBase += (s.base_reps || 0) + (s.assisted_reps || 0) * 0.5;
            sumPartial += s.partial_reps || 0;
          } else if (muscleMetric === 'sets') {
            sumBase += 1.0;
          }
        });
      });

      if (sumBase === 0 && sumPartial === 0) return;

      Object.entries(ex.muscles_distr).forEach(([subMuscle, distr]) => {
        const targetMuscle = isMacroView ? (MUSCLES[subMuscle] || 'Other') : subMuscle;
        if (!topMusclesSet.has(targetMuscle)) return;

        const cacheKey = typeof distr === 'object'
          ? `${ex.name}_${subMuscle}_${distr.x0}_${distr.y0}_${distr.x1}_${distr.y1}_${distr.x2}_${distr.y2}_${distr.x3}_${distr.y3}_${distr.magnitude}`
          : `${ex.name}_${subMuscle}_${distr}`;
        let normCurve = normalizedCurveCache.get(cacheKey);
        if (!normCurve) {
          normCurve = getNormalizedCurve(distr);
          normalizedCurveCache.set(cacheKey, normCurve);
        }

        const totalWithPartial = sumBase + sumPartial;
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
  }, [dashFilteredData, activeWeeksList, deferredMacro, muscleMetric, displayMuscleData]);

  // Overall totals (filtered; in compare mode, uses each selection's last full week so programs of different lengths compare fairly)
  const mainTotals = useMemo(() => {
    const rows = compareMode && lastFullWeekA !== null
      ? metricsByWeek.filter(m => m.week === `W${lastFullWeekA}`)
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
  }, [metricsByWeek, compareMode, lastFullWeekA]);

  const compareTotals = useMemo(() => {
    const rows = lastFullWeekB !== null
      ? compareMetricsByWeek.filter(m => m.week === `W${lastFullWeekB}`)
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
    keys.forEach(k => { map[k] = metricsByWeek.map(m => m[k] || 0); });
    return map;
  }, [metricsByWeek]);

  const sparkSeriesB = useMemo(() => {
    if (!compareMode) return {};
    const keys = ['Volume', 'EffectiveRepsCustom', 'Tonnage', 'EffectiveTonnage', 'WeightedTonnage', 'EffectiveWeightedTonnage', 'Tut', 'EffectiveTut', 'Sets', 'Fatigue'];
    const map = {};
    keys.forEach(k => { map[k] = compareMetricsByWeek.map(m => m[`${k}_B`] || 0); });
    return map;
  }, [compareMode, compareMetricsByWeek]);

  const handleOpenTensionDetails = useCallback(() => {
    setSelectedMetricDetail('tension-profiles');
  }, [setSelectedMetricDetail]);

  // Helper: delta label for compare mode
  const delta = (a, b) => {
    if (b === 0) return null;
    const d = ((a - b) / b) * 100;
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
        <div className={`swipe-view ${activeTab === 'dashboard' || activeTab === 'metric-details' ? 'active-desktop' : ''}`} id="view-dashboard">
          {/* Mobile Floating Filter Pill next to Settings button */}
          {isMobile && activeTab !== 'metric-details' && (
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
                  const next = !compareMode;
                  setCompareMode(next);
                  if (!next) { setCompareWorkoutData([]); setCompareProgram(''); setCmpFilterSession('all'); setCmpFilterWeekFrom('all'); setCmpFilterWeekTo('all'); }
                  else if (compareProgram) loadCompareProgram(compareProgram);
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
                    onChange={e => { setCompareProgram(e.target.value); loadCompareProgram(e.target.value); setCmpFilterSession('all'); setCmpFilterWeekFrom('all'); setCmpFilterWeekTo('all'); }}
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
                    const isFilterPanelOpen = !isMobile || mobileFiltersOpen || (compareMode && Boolean(compareProgram));
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
                          const next = !compareMode;
                          setCompareMode(next);
                          if (!next) { setCompareWorkoutData([]); setCompareProgram(''); setCmpFilterSession('all'); setCmpFilterWeekFrom('all'); setCmpFilterWeekTo('all'); }
                          else if (compareProgram) loadCompareProgram(compareProgram);
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
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <LockWheelPicker
                              label="Session"
                              options={sessionWheelOptions}
                              value={dashFilterSession}
                              onChange={val => { setDashFilterSession(val); setDashFilterWeekFrom('all'); setDashFilterWeekTo('all'); }}
                              itemWidth={38}
                            />
                            <DualWeekSlider
                              label="Weeks"
                              weeks={dashWeeksList}
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
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <LockWheelPicker
                              label="Session"
                              options={cmpSessionWheelOptions}
                              value={cmpFilterSession}
                              onChange={val => { setCmpFilterSession(val); setCmpFilterWeekFrom('all'); setCmpFilterWeekTo('all'); }}
                              itemWidth={38}
                            />
                            <DualWeekSlider
                              label="Weeks"
                              weeks={cmpWeeksList}
                              fromVal={cmpFilterWeekFrom}
                              toVal={cmpFilterWeekTo}
                              onChange={(f, t) => { setCmpFilterWeekFrom(f); setCmpFilterWeekTo(t); }}
                              accentColor="var(--accent-secondary)"
                            />
                          </div>
                        </div>

                        {/* Shared muscle lock wheels — full width row */}
                        <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
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
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
                          label="Weeks"
                          weeks={dashWeeksList}
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
                            {lastFullWeekA !== null ? `W${lastFullWeekA}` : '—'}
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
                            {lastFullWeekB !== null ? `W${lastFullWeekB}` : '—'}
                          </span>
                        </div>
                      </div>
                      <div className="metrics-summary-grid">
                        {[['Reps', 'volume', 'Volume', `${totalVolume.toLocaleString()} reps`, `${compareTotalVolume.toLocaleString()} reps`, delta(compareTotalVolume, totalVolume)],
                          ['Effective Reps', 'effective', 'EffectiveRepsCustom', `${totalEffectiveReps.toLocaleString()} reps`, `${compareTotalEffReps.toLocaleString()} reps`, delta(compareTotalEffReps, totalEffectiveReps)],
                          ['Tonnage', 'tonnage', 'Tonnage', `${totalTonnage.toLocaleString()} kg`, `${compareTotalTonnage.toLocaleString()} kg`, delta(compareTotalTonnage, totalTonnage)],
                          ['Effective Tonnage', 'effective-tonnage', 'EffectiveTonnage', `${totalEffectiveTonnage.toLocaleString()} kg`, `${compareTotalEffectiveTonnage.toLocaleString()} kg`, delta(compareTotalEffectiveTonnage, totalEffectiveTonnage)],
                          ['W. Tonnage', 'weighted-tonnage', 'WeightedTonnage', `${totalWeightedTonnage.toLocaleString()} kg`, `${compareTotalWeightedTonnage.toLocaleString()} kg`, delta(compareTotalWeightedTonnage, totalWeightedTonnage)],
                          ['Eff. W. Tonnage', 'effective-weighted-tonnage', 'EffectiveWeightedTonnage', `${totalEffectiveWeightedTonnage.toLocaleString()} kg`, `${compareTotalEffectiveWeightedTonnage.toLocaleString()} kg`, delta(compareTotalEffectiveWeightedTonnage, totalEffectiveWeightedTonnage)],
                          ['TUT', 'tut', 'Tut', `${totalTut.toLocaleString()}s`, `${compareTotalTut.toLocaleString()}s`, delta(compareTotalTut, totalTut)],
                          ['Effective TUT', 'effective-tut', 'EffectiveTut', `${totalEffectiveTut.toLocaleString()}s`, `${compareTotalEffectiveTut.toLocaleString()}s`, delta(compareTotalEffectiveTut, totalEffectiveTut)],
                          ['Volume', 'sets', 'Sets', `${totalSets.toLocaleString()} sets`, `${compareTotalSets.toLocaleString()} sets`, delta(compareTotalSets, totalSets)],
                          ['Accumulated Fatigue', 'fatigue', 'Fatigue', `${totalFatigue.toLocaleString()}`, `${compareTotalFatigue.toLocaleString()}`, delta(compareTotalFatigue, totalFatigue)]
                        ].map(([label, cls, metricKey, valA, valB, d]) => {
                          const valsA = sparkSeriesA[metricKey];
                          const valsB = sparkSeriesB[metricKey];
                          return (
                            <div key={cls} className={`metric-summary-card ${cls}`} onClick={() => { setSelectedMetricDetail(cls); }}>
                              <span className="metric-label">{label}</span>
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
                              <MetricSparkline
                                values={valsA}
                                compareValues={valsB}
                                color="var(--accent-primary)"
                                compareColor="var(--accent-secondary)"
                                gradId={`spark-cmp-${cls}`}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="metrics-summary-grid">
                      {[
                        ['Reps', 'volume', 'Volume', 'var(--color-volume)', `${totalVolume.toLocaleString()} reps`],
                        ['Effective Reps', 'effective', 'EffectiveRepsCustom', 'var(--color-effective-volume)', `${totalEffectiveReps.toLocaleString()} reps`],
                        ['Tonnage', 'tonnage', 'Tonnage', 'var(--color-tonnage)', `${totalTonnage.toLocaleString()} kg`],
                        ['Effective Tonnage', 'effective-tonnage', 'EffectiveTonnage', 'var(--color-effective-tonnage)', `${totalEffectiveTonnage.toLocaleString()} kg`],
                        ['W. Tonnage', 'weighted-tonnage', 'WeightedTonnage', 'var(--color-weighted-tonnage)', `${totalWeightedTonnage.toLocaleString()} kg`],
                        ['Eff. W. Tonnage', 'effective-weighted-tonnage', 'EffectiveWeightedTonnage', 'var(--color-effective-weighted-tonnage)', `${totalEffectiveWeightedTonnage.toLocaleString()} kg`],
                        ['TUT', 'tut', 'Tut', 'var(--color-tut)', `${totalTut.toLocaleString()}s`],
                        ['Effective TUT', 'effective-tut', 'EffectiveTut', 'var(--color-effective-tut)', `${totalEffectiveTut.toLocaleString()}s`],
                        ['Volume', 'sets', 'Sets', 'var(--color-sets)', `${totalSets.toLocaleString()} sets`],
                        ['Accumulated Fatigue', 'fatigue', 'Fatigue', 'var(--color-fatigue)', `${totalFatigue.toLocaleString()}`],
                      ].map(([label, cls, metricKey, color, formattedVal]) => {
                        const vals = sparkSeriesA[metricKey];
                        return (
                          <div key={cls} className={`metric-summary-card ${cls}`} onClick={() => { setSelectedMetricDetail(cls); }}>
                            <span className="metric-label">{label}</span>
                            <span className="metric-value">{formattedVal}</span>
                            <TrendBadge values={vals} invertColor={cls === 'fatigue'} />
                            <MetricSparkline values={vals} color={color} gradId={`spark-${cls}`} />
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* ── Progress Charts Grid ── */}
                  <div className="analytics-grid">

                    {/* Muscle Group Volume */}
                    <div className="chart-container">
                      <div className="chart-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                        <span className="chart-title" style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
                          {dashMuscleMacro !== 'all' 
                            ? (muscleMetric === 'sets' ? `${dashMuscleMacro} Sub-group Volume` : `${dashMuscleMacro} Sub-group Reps`)
                            : (muscleMetric === 'sets' ? 'Muscle Group Volume' : 'Muscle Group Reps')}
                        </span>
                        <LockWheelPicker
                          options={MUSCLE_METRIC_OPTIONS}
                          value={muscleMetric}
                          onChange={setMuscleMetric}
                          itemWidth={66}
                          circular={false}
                          style={{ width: isMobile ? '170px' : '200px', flexShrink: 0 }}
                        />
                      </div>
                      <MuscleDonutChart
                        data={displayMuscleData}
                        compareData={compareMode ? displayCompareMuscleData : null}
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
                onBack={() => setSelectedMetricDetail(null)}
              />
            </React.Suspense>
          )}
        </div>
    </>
  );
};

export default React.memo(DashboardTab);

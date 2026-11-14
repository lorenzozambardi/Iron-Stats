import React, { useState, useMemo, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine } from 'recharts';
import { MUSCLES, calculateMetrics, parseLogbook } from '../../parser';
const MetricDetailsPage = React.lazy(() => import('../MetricDetails'));
import MuscleDonutChart from '../MuscleDonutChart';
import { bezierArea, solveBezierY } from '../helpers';

const CURVE_RESOLUTION = 50;
const normalizedCurveCache = new Map();

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
  const [muscleMetric, setMuscleMetric] = useState('effective');
  const [progressionExercise, setProgressionExercise] = useState('all_metrics');
  const [overallChartMetric, setOverallChartMetric] = useState('Volume');

  // Dashboard filter state
  const [dashFilterSession, setDashFilterSession] = useState('all'); // 'all' or session number
  const [dashFilterWeek, setDashFilterWeek] = useState('all');     // 'all' or week number
  const [compareMode, setCompareMode] = useState(false);
  const [compareProgram, setCompareProgram] = useState('');
  const [compareWorkoutData, setCompareWorkoutData] = useState([]);
  const [compareLoading, setCompareLoading] = useState(false);
  // Per-program filters in compare mode
  const [cmpFilterSession, setCmpFilterSession] = useState('all');
  const [cmpFilterWeek, setCmpFilterWeek] = useState('all');
  // Shared muscle group/subgroup isolation filter
  const [dashMuscleMacro, setDashMuscleMacro] = useState('all');   // 'all' or macro name e.g. 'Back'
  const [dashMuscleSubgroup, setDashMuscleSubgroup] = useState('all'); // 'all' or sub-muscle name
  const [tensionSliderPos, setTensionSliderPos] = useState(50); // 0-100 ROM % for mobile scrubber
  const [weekSliderIdx, setWeekSliderIdx] = useState(0); // week index for mobile scrubber


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

  // Derived: filtered data for the dashboard based on session/week selectors
  const dashFilteredData = useMemo(() => {
    let data = workoutData;
    if (dashFilterSession !== 'all') {
      const sNum = parseInt(dashFilterSession, 10);
      data = data.filter(d => d.session === sNum);
    }
    // Muscle group filter — keep only exercises that touch the selected macro/sub
    if (dashMuscleMacro !== 'all') {
      data = data.filter(wEx => {
        const ex = wEx.exercise_obj;
        if (dashMuscleSubgroup !== 'all') return dashMuscleSubgroup in ex.muscles_distr;
        return Object.keys(ex.muscles_distr).some(sub => MUSCLES[sub] === dashMuscleMacro);
      });
    }
    return data;
  }, [workoutData, dashFilterSession, dashMuscleMacro, dashMuscleSubgroup]);

  // Derived: filtered data for compare program B
  const cmpFilteredData = useMemo(() => {
    let data = compareWorkoutData;
    if (cmpFilterSession !== 'all') {
      const sNum = parseInt(cmpFilterSession, 10);
      data = data.filter(d => d.session === sNum);
    }
    if (dashMuscleMacro !== 'all') {
      data = data.filter(wEx => {
        const ex = wEx.exercise_obj;
        if (dashMuscleSubgroup !== 'all') return dashMuscleSubgroup in ex.muscles_distr;
        return Object.keys(ex.muscles_distr).some(sub => MUSCLES[sub] === dashMuscleMacro);
      });
    }
    return data;
  }, [compareWorkoutData, cmpFilterSession, dashMuscleMacro, dashMuscleSubgroup]);

  // Weeks available after session filter (program A)
  const dashWeeksList = useMemo(() =>
    Array.from(new Set(dashFilteredData.flatMap(d => d.weeks.map(w => w.week_num)))).sort((a, b) => a - b),
  [dashFilteredData]);

  // Weeks available for compare program B after its session filter
  const cmpWeeksList = useMemo(() =>
    Array.from(new Set(cmpFilteredData.flatMap(d => d.weeks.map(w => w.week_num)))).sort((a, b) => a - b),
  [cmpFilteredData]);

  const activeWeeksList = useMemo(() => {
    const weeksToUse = dashFilterWeek === 'all' ? dashWeeksList : dashWeeksList.filter(w => w === parseInt(dashFilterWeek, 10));
    const targetSession = dashFilterSession !== 'all' ? parseInt(dashFilterSession, 10) : null;
    return weeksToUse.filter(week => {
      if (targetSession !== null) return true;
      if (sessionsList.length === 0) return true;
      return sessionsList.every(sess =>
        workoutData.some(d => d.session === sess && d.weeks.some(w => w.week_num === week && w.sets.length > 0))
      );
    });
  }, [dashFilterWeek, dashWeeksList, dashFilterSession, sessionsList, workoutData]);

  // Overall Progression Metrics (by Week) — respects session + muscle filters
  const metricsByWeek = useMemo(() => {
    const targetSession = dashFilterSession !== 'all' ? parseInt(dashFilterSession, 10) : null;
    const targetMacro = dashMuscleMacro !== 'all' ? dashMuscleMacro : null;
    const targetSub = dashMuscleSubgroup !== 'all' ? dashMuscleSubgroup : null;

    return activeWeeksList.map(week => {
      const weeklyData = calculateMetrics(dashFilteredData, targetSession, week, targetMacro, targetSub);
      return {
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
  }, [dashFilteredData, dashFilterSession, activeWeeksList, dashMuscleMacro, dashMuscleSubgroup]);


  const compareActiveWeeksList = useMemo(() => {
    const weeksToUse = cmpFilterWeek === 'all' ? cmpWeeksList : cmpWeeksList.filter(w => w === parseInt(cmpFilterWeek, 10));
    const targetSession = cmpFilterSession !== 'all' ? parseInt(cmpFilterSession, 10) : null;
    return weeksToUse.filter(week => {
      if (targetSession !== null) return true;
      if (compareSessionsList.length === 0) return true;
      return compareSessionsList.every(sess =>
        compareWorkoutData.some(d => d.session === sess && d.weeks.some(w => w.week_num === week && w.sets.length > 0))
      );
    });
  }, [cmpFilterWeek, cmpWeeksList, cmpFilterSession, compareSessionsList, compareWorkoutData]);

  // Compare program B metrics by week — respects its own session/week + shared muscle filters
  const compareMetricsByWeek = useMemo(() => {
    const targetSession = cmpFilterSession !== 'all' ? parseInt(cmpFilterSession, 10) : null;
    const targetMacro = dashMuscleMacro !== 'all' ? dashMuscleMacro : null;
    const targetSub = dashMuscleSubgroup !== 'all' ? dashMuscleSubgroup : null;

    return compareActiveWeeksList.map(week => {
      const weeklyData = calculateMetrics(cmpFilteredData, targetSession, week, targetMacro, targetSub);
      return {
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
  }, [cmpFilteredData, cmpFilterSession, compareActiveWeeksList, dashMuscleMacro, dashMuscleSubgroup]);

  // Merged chart data for compare mode
  const mergedChartData = useMemo(() => {
    if (!compareMode || compareMetricsByWeek.length === 0) return metricsByWeek;
    const allWeeks = Array.from(new Set([...metricsByWeek.map(m => m.week), ...compareMetricsByWeek.map(m => m.week)]))
      .sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10));
    return allWeeks.map(w => ({
      week: w,
      ...((metricsByWeek.find(m => m.week === w)) || {}),
      ...((compareMetricsByWeek.find(m => m.week === w)) || {}),
    }));
  }, [compareMode, metricsByWeek, compareMetricsByWeek]);

  // Calculate Muscle distribution breakdown — respects all filters
  const calculateMuscleDistribution = useCallback((dataSource, weekOverride, activeWeeksOverride, weekDivisor = 1) => {
    const distributions = {};
    const src = dataSource;
    if (!src) return [];
    const effectiveWeekFilter = weekOverride !== undefined ? weekOverride : dashFilterWeek;
    const allowedWeeks = new Set(activeWeeksOverride !== undefined ? activeWeeksOverride : activeWeeksList);
    src.forEach(wEx => {
      const ex = wEx.exercise_obj;
      if (!ex) return;
      wEx.weeks.forEach(wData => {
        if (effectiveWeekFilter !== 'all' && wData.week_num !== parseInt(effectiveWeekFilter, 10)) return;
        if (effectiveWeekFilter === 'all' && !allowedWeeks.has(wData.week_num)) return;
        wData.sets.forEach(s => {
          Object.entries(ex.muscles_distr).forEach(([subMuscle, distr]) => {
            // Muscle group filter
            if (dashMuscleMacro !== 'all' && MUSCLES[subMuscle] !== dashMuscleMacro) return;
            if (dashMuscleSubgroup !== 'all' && subMuscle !== dashMuscleSubgroup) return;
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
    const div = Math.max(1, weekDivisor);
    return Object.entries(distributions).map(([macro, data]) => ({
      name: macro,
      value: parseFloat((data.total / div).toFixed(1)),
      subMuscles: Object.entries(data.subMuscles).map(([sub, val]) => ({
        name: sub,
        value: parseFloat((val / div).toFixed(1))
      })).sort((a,b) => b.value - a.value)
    })).sort((a,b) => b.value - a.value);
  }, [dashFilterWeek, activeWeeksList, dashMuscleMacro, dashMuscleSubgroup, muscleMetric]);

  const lastFullWeekA = activeWeeksList.length > 0 ? activeWeeksList[activeWeeksList.length - 1] : null;
  const lastFullWeekB = compareActiveWeeksList.length > 0 ? compareActiveWeeksList[compareActiveWeeksList.length - 1] : null;

  const muscleData = useMemo(
    () => calculateMuscleDistribution(
      dashFilteredData,
      compareMode && lastFullWeekA !== null ? lastFullWeekA : undefined,
      undefined,
      1
    ),
    [dashFilteredData, calculateMuscleDistribution, compareMode, lastFullWeekA]
  );
  const compareMuscleData = useMemo(
    () => compareMode
      ? calculateMuscleDistribution(
          cmpFilteredData,
          lastFullWeekB !== null ? lastFullWeekB : (cmpFilterWeek !== 'all' ? cmpFilterWeek : 'all'),
          compareActiveWeeksList,
          1
        )
      : [],
    [compareMode, cmpFilteredData, cmpFilterWeek, compareActiveWeeksList, calculateMuscleDistribution, lastFullWeekB]
  );

  const displayMuscleData = useMemo(() => {
    if (dashMuscleMacro === 'all') return muscleData;
    const macroObj = muscleData.find(m => m.name === dashMuscleMacro);
    if (!macroObj) return [];
    return macroObj.subMuscles;
  }, [muscleData, dashMuscleMacro]);

  const displayCompareMuscleData = useMemo(() => {
    if (dashMuscleMacro === 'all') return compareMuscleData;
    const macroObj = compareMuscleData.find(m => m.name === dashMuscleMacro);
    if (!macroObj) return [];
    return macroObj.subMuscles;
  }, [compareMuscleData, dashMuscleMacro]);

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

    dashFilteredData.forEach(wEx => {
      const ex = wEx.exercise_obj;
      if (!ex) return;

      wEx.weeks.forEach(wData => {
        if (dashFilterWeek !== 'all' && wData.week_num !== parseInt(dashFilterWeek, 10)) return;
        if (dashFilterWeek === 'all' && !allowedWeeks.has(wData.week_num)) return;
        
        wData.sets.forEach(s => {
          Object.entries(ex.muscles_distr).forEach(([subMuscle, distr]) => {
            const macro = MUSCLES[subMuscle] || 'Other';
            const isMacroView = dashMuscleMacro === 'all';
            const targetMuscle = isMacroView ? macro : subMuscle;
            
            if (topMusclesSet.has(targetMuscle)) {
              let baseMetricValue = 0;
              let partialMetricValue = 0;
              
              if (muscleMetric === 'effective') {
                const rpe = s.rpe !== undefined ? s.rpe : 9.0;
                const effBase = Math.min(s.base_reps || 0, Math.max(0, rpe - 4.0));
                baseMetricValue = effBase + (s.assisted_reps || 0) * 0.5;
                partialMetricValue = (s.partial_reps || 0) * 0.33;
              } else if (muscleMetric === 'volume') {
                baseMetricValue = (s.base_reps || 0) + (s.assisted_reps || 0) * 0.5;
                partialMetricValue = (s.partial_reps || 0) * 0.33;
              } else if (muscleMetric === 'sets') {
                baseMetricValue = 1.0;
                partialMetricValue = 0;
              }
              
              const cacheKey = typeof distr === 'object'
                ? `${ex.name}_${subMuscle}_${distr.x0}_${distr.y0}_${distr.x1}_${distr.y1}_${distr.x2}_${distr.y2}_${distr.x3}_${distr.y3}_${distr.magnitude}`
                : `${ex.name}_${subMuscle}_${distr}`;
              let normCurve = normalizedCurveCache.get(cacheKey);
              if (!normCurve) {
                normCurve = getNormalizedCurve(distr);
                normalizedCurveCache.set(cacheKey, normCurve);
              }
              
              for (let i = 0; i <= resolution; i++) {
                const x = i / resolution;
                const activeMetricValue = x <= 0.3333 ? (baseMetricValue + partialMetricValue) : baseMetricValue;
                data[i][targetMuscle] += normCurve[i] * activeMetricValue;
              }
            }
          });
        });
      });
    });

    data.forEach(pt => {
      topMuscles.forEach(m => {
        pt[m] = parseFloat(pt[m].toFixed(2));
      });
    });

    return data;
  }, [dashFilteredData, dashFilterWeek, activeWeeksList, dashMuscleMacro, muscleMetric, displayMuscleData]);

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

  const getMetricLabelAndUnit = (metric) => {
    switch (metric) {
      case 'Volume': return { name: 'Reps', unit: 'reps' };
      case 'Tonnage': return { name: 'Tonnage', unit: 'kg' };
      case 'EffectiveTonnage': return { name: 'Effective Tonnage', unit: 'kg' };
      case 'WeightedTonnage': return { name: 'Weighted Tonnage', unit: 'kg' };
      case 'EffectiveWeightedTonnage': return { name: 'Effective Weighted Tonnage', unit: 'kg' };
      case 'Fatigue': return { name: 'Neuromuscular Fatigue', unit: 'units' };
      case 'EffectiveRepsCustom': return { name: 'Effective Reps', unit: 'reps' };
      case 'EffectiveTut': return { name: 'Effective TUT', unit: 's' };
      case 'Tut': return { name: 'TUT', unit: 's' };
      case 'Sets': return { name: 'Volume', unit: '' };
      default: return { name: metric, unit: '' };
    }
  };

  const getMetricColor = (metric) => {
    switch (metric) {
      case 'Volume': return 'var(--color-volume)';
      case 'Tonnage': return 'var(--color-tonnage)';
      case 'EffectiveTonnage': return 'var(--color-effective-tonnage)';
      case 'WeightedTonnage': return 'var(--color-weighted-tonnage)';
      case 'EffectiveWeightedTonnage': return 'var(--color-effective-weighted-tonnage)';
      case 'Fatigue': return 'var(--color-fatigue)';
      case 'EffectiveRepsCustom': return 'var(--accent-secondary)';
      case 'EffectiveTut': return 'var(--color-effective-tut)';
      case 'Tut': return 'var(--color-tut)';
      case 'Sets': return 'var(--color-sets)';
      default: return 'var(--accent-primary)';
    }
  };

  const getMetricColorB = (metric) => {
    switch (metric) {
      case 'Volume': return '#a855f7'; // Purple
      case 'Tonnage': return 'var(--accent-secondary)'; // Lavender/Secondary Accent
      case 'EffectiveTonnage': return '#fda4af'; // Rose/Light pink
      case 'WeightedTonnage': return 'var(--accent-secondary)';
      case 'EffectiveWeightedTonnage': return '#fda4af';
      case 'Fatigue': return 'var(--color-tut)'; // Violet
      case 'EffectiveRepsCustom': return 'var(--color-effective-tut)'; // Pink
      case 'EffectiveTut': return 'var(--color-volume)'; // Amber
      case 'Tut': return 'var(--color-tonnage)'; // Emerald
      case 'Sets': return 'var(--color-fatigue)'; // Rose
      default: return 'var(--accent-secondary)';
    }
  };

  const renderOverallChartTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div style={{
          backgroundColor: 'var(--bg-glass-active)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          padding: '8px 12px',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          color: 'var(--text-primary)',
          fontSize: '0.8rem',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
        }}>
          <div style={{ fontWeight: 600, marginBottom: '4px', color: 'var(--text-secondary)' }}>{label}</div>
          {payload.map((entry, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: entry.color || 'var(--text-primary)', marginTop: '2px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: entry.color }} />
              <span>{entry.name}: <strong>{typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}</strong></span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  // Bounds calculations to scale the selected metric dynamically
  const overallChartBoundsSelected = useMemo(() => {
    const data = compareMode ? mergedChartData : metricsByWeek;
    if (!data || data.length === 0) {
      return ['auto', 'auto'];
    }
    const keyA = overallChartMetric;
    const keyB = `${overallChartMetric}_B`;
    const values = [];
    data.forEach(d => {
      if (d[keyA] !== undefined && !isNaN(d[keyA])) values.push(d[keyA]);
      if (d[keyB] !== undefined && !isNaN(d[keyB])) values.push(d[keyB]);
    });
    if (values.length === 0) return ['auto', 'auto'];
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal;
    
    // Provide a small margin (15% of range, or at least 1)
    const margin = range > 0 ? range * 0.15 : Math.max(minVal * 0.1, 1.0);
    const calculatedMin = Math.max(0, minVal - margin);
    const calculatedMax = maxVal + margin;
    return [parseFloat(calculatedMin.toFixed(1)), parseFloat(calculatedMax.toFixed(1))];
  }, [compareMode, mergedChartData, metricsByWeek, overallChartMetric]);

  // Derived: unique exercises list across current and compared programs
  const uniqueExerciseNames = useMemo(() => {
    const names = new Set();
    workoutData.forEach(d => {
      if (d.exercise_obj) names.add(d.exercise_obj.name);
      else if (d.raw_name) names.add(d.raw_name);
    });
    if (compareMode && compareWorkoutData) {
      compareWorkoutData.forEach(d => {
        if (d.exercise_obj) names.add(d.exercise_obj.name);
        else if (d.raw_name) names.add(d.raw_name);
      });
    }
    return Array.from(names).sort();
  }, [workoutData, compareWorkoutData, compareMode]);

  // Derived: chart data for a selected specific exercise over weeks (plots exercise-specific Volume and Tonnage)
  const exerciseChartData = useMemo(() => {
    if (progressionExercise === 'all_metrics') return [];
    
    const weeksSet = new Set();
    
    const getProgData = (dataSrc, suffix = '') => {
      const match = dataSrc.find(d => 
        (d.exercise_obj && d.exercise_obj.name === progressionExercise) || 
        (d.raw_name === progressionExercise)
      );
      if (!match) return {};
      
      const ex = match.exercise_obj || { load_multiplier: 1.0, load_offset: 0.0 };
      const loadMult = ex.load_multiplier !== undefined ? ex.load_multiplier : 1.0;
      const loadOffset = ex.load_offset !== undefined ? ex.load_offset : 0.0;
      
      const res = {};
      match.weeks.forEach(w => {
        weeksSet.add(w.week_num);
        let totalVol = 0;
        let totalTon = 0;
        w.sets.forEach(s => {
          const reps = s.totalReps !== undefined ? s.totalReps : (s.base_reps + (s.assisted_reps || 0) * 0.5 + (s.partial_reps || 0) * 0.33);
          totalVol += reps;
          const actualLoad = (s.load * loadMult) + loadOffset;
          totalTon += actualLoad * reps;
        });
        res[`W${w.week_num}`] = {
          [`Tonnage${suffix}`]: parseFloat(totalTon.toFixed(1)),
          [`Volume${suffix}`]: parseFloat(totalVol.toFixed(1))
        };
      });
      return res;
    };

    const progA = getProgData(workoutData, '');
    const progB = compareMode && compareWorkoutData ? getProgData(compareWorkoutData, '_B') : {};
    
    const sortedWeeks = Array.from(weeksSet).sort((a, b) => a - b);
    return sortedWeeks.map(wNum => {
      const wKey = `W${wNum}`;
      return {
        week: wKey,
        ...(progA[wKey] || {}),
        ...(progB[wKey] || {})
      };
    });
  }, [progressionExercise, workoutData, compareWorkoutData, compareMode]);

  // Bounds calculations to separate exercise Tonnage (upper half) and Volume (lower half) in the exercise trend chart
  const exerciseChartBounds = useMemo(() => {
    if (progressionExercise === 'all_metrics' || exerciseChartData.length === 0) {
      return { tonnageDomain: ['auto', 'auto'], volumeDomain: ['auto', 'auto'] };
    }

    let tValues = [];
    let vValues = [];

    exerciseChartData.forEach(d => {
      if (d.Tonnage !== undefined && !isNaN(d.Tonnage)) tValues.push(d.Tonnage);
      if (d.Tonnage_B !== undefined && !isNaN(d.Tonnage_B)) tValues.push(d.Tonnage_B);
      if (d.Volume !== undefined && !isNaN(d.Volume)) vValues.push(d.Volume);
      if (d.Volume_B !== undefined && !isNaN(d.Volume_B)) vValues.push(d.Volume_B);
    });

    const tMin = tValues.length > 0 ? Math.min(...tValues) : 0;
    const tMax = tValues.length > 0 ? Math.max(...tValues) : 100;
    const vMin = vValues.length > 0 ? Math.min(...vValues) : 0;
    const vMax = vValues.length > 0 ? Math.max(...vValues) : 100;

    // Tonnage stays in upper half:
    const tRange = tMax - tMin;
    const tDelta = tRange > 0 ? tRange : Math.max(tMin * 0.1, 10);
    const tonnageMinDomain = tMin - tDelta - tDelta * 0.15;
    const tonnageMaxDomain = tMax + tDelta * 0.15;

    // Volume stays in lower half:
    const vRange = vMax - vMin;
    const vDelta = vRange > 0 ? vRange : Math.max(vMin * 0.1, 10);
    const volumeMinDomain = Math.max(0, vMin - vDelta * 0.15);
    const volumeMaxDomain = vMax + vDelta + vDelta * 0.15;

    return {
      tonnageDomain: [parseFloat(tonnageMinDomain.toFixed(1)), parseFloat(tonnageMaxDomain.toFixed(1))],
      volumeDomain: [parseFloat(volumeMinDomain.toFixed(1)), parseFloat(volumeMaxDomain.toFixed(1))]
    };
  }, [progressionExercise, exerciseChartData]);

  // Helper: delta label for compare mode
  const delta = (a, b) => {
    if (b === 0) return null;
    const d = ((a - b) / b) * 100;
    return { val: d.toFixed(1), pos: d >= 0 };
  };

  // Helper: clear all dashboard filters
  const clearAllDashFilters = () => {
    setDashFilterSession('all'); setDashFilterWeek('all');
    setCmpFilterSession('all'); setCmpFilterWeek('all');
    setDashMuscleMacro('all'); setDashMuscleSubgroup('all');
  };

  const hasAnyFilter = dashFilterSession !== 'all' || dashFilterWeek !== 'all' ||
    cmpFilterSession !== 'all' || cmpFilterWeek !== 'all' ||
    dashMuscleMacro !== 'all';

  return (
    <>
        <div className={`swipe-view ${activeTab === 'dashboard' || activeTab === 'metric-details' ? 'active-desktop' : ''}`} id="view-dashboard">
          {(isMobile || activeTab === 'dashboard') ? (
            <div className="main-content-card" style={{ overflow: 'hidden' }}>
                <div className="glass-card-body" style={{ padding: '4px 8px 20px 8px' }}>

                  {/* ── Dashboard Filter Bar ── */}
                  <div style={{
                    display: 'flex', flexDirection: 'column', gap: '10px',
                    padding: '14px 16px', marginBottom: '20px',
                    background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)',
                    borderRadius: '12px', boxShadow: '0 10px 30px rgba(0, 0, 0, 0.8)'
                  }}>

                    {/* Top row: Compare toggle + program picker + clear */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                      <button
                        id="dash-compare-toggle"
                        className={`btn ${compareMode ? 'btn-secondary' : ''}`}
                        style={{ padding: '6px 14px', fontSize: '0.8rem', borderRadius: '100px' }}
                        onClick={() => {
                          const next = !compareMode;
                          setCompareMode(next);
                          if (!next) { setCompareWorkoutData([]); setCompareProgram(''); setCmpFilterSession('all'); setCmpFilterWeek('all'); }
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
                            onChange={e => { setCompareProgram(e.target.value); loadCompareProgram(e.target.value); setCmpFilterSession('all'); setCmpFilterWeek('all'); }}
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

                    {/* Filter rows */}
                    {compareMode && compareProgram ? (
                      // Compare mode: two columns, one per program
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        {/* Program A filters */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 12px', background: 'var(--accent-primary-subtle)', border: '1px solid var(--accent-primary-glow)', borderRadius: '8px' }}>
                          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-primary)', display: 'inline-block' }} />
                            {currentProgram === compareProgram ? `${currentProgram} (Selection A)` : currentProgram}
                          </div>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                              <select id="dash-session-filter" className="select-control" style={{ minWidth: '110px', fontSize: '0.78rem' }}
                                value={dashFilterSession}
                                onChange={e => { setDashFilterSession(e.target.value); setDashFilterWeek('all'); }}
                              >
                                <option value="all">All sessions</option>
                                {sessionsList.map(s => <option key={s} value={s}>S{s}</option>)}
                              </select>
                              <select id="dash-week-filter" className="select-control" style={{ minWidth: '110px', fontSize: '0.78rem' }}
                                value={dashFilterWeek}
                                onChange={e => setDashFilterWeek(e.target.value)}
                              >
                                <option value="all">All weeks</option>
                                {dashWeeksList.map(w => <option key={w} value={w}>W{w}</option>)}
                              </select>
                          </div>
                        </div>

                        {/* Program B filters */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 12px', background: 'var(--accent-secondary-subtle)', border: '1px solid var(--accent-secondary-glow)', borderRadius: '8px' }}>
                          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--accent-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-secondary)', display: 'inline-block' }} />
                            {currentProgram === compareProgram ? `${compareProgram} (Selection B)` : compareProgram}
                          </div>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                              <select id="cmp-session-filter" className="select-control" style={{ minWidth: '110px', fontSize: '0.78rem' }}
                                value={cmpFilterSession}
                                onChange={e => { setCmpFilterSession(e.target.value); setCmpFilterWeek('all'); }}
                              >
                                <option value="all">All sessions</option>
                                {compareSessionsList.map(s => <option key={s} value={s}>S{s}</option>)}
                              </select>
                              <select id="cmp-week-filter" className="select-control" style={{ minWidth: '110px', fontSize: '0.78rem' }}
                                value={cmpFilterWeek}
                                onChange={e => setCmpFilterWeek(e.target.value)}
                              >
                                <option value="all">All weeks</option>
                                {cmpWeeksList.map(w => <option key={w} value={w}>W{w}</option>)}
                              </select>
                          </div>
                        </div>

                        {/* Shared muscle filter — full width row */}
                        <div style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', paddingTop: '6px', borderTop: '1px solid var(--border-color)' }}>
                          <select id="dash-muscle-macro" className="select-control" style={{ minWidth: '130px', fontSize: '0.78rem' }}
                            value={dashMuscleMacro}
                            onChange={e => { setDashMuscleMacro(e.target.value); setDashMuscleSubgroup('all'); }}
                          >
                            <option value="all">All Groups</option>
                            {allMacros.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                          {dashMuscleMacro !== 'all' && subMusclesForMacro.length > 0 && (
                            <>
                              <span style={{ color: 'var(--border-color)' }}>›</span>
                              <select id="dash-muscle-sub" className="select-control" style={{ minWidth: '160px', fontSize: '0.78rem' }}
                                value={dashMuscleSubgroup}
                                onChange={e => setDashMuscleSubgroup(e.target.value)}
                              >
                                <option value="all">All {dashMuscleMacro}</option>
                                {subMusclesForMacro.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            </>
                          )}
                          {dashMuscleMacro !== 'all' && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>(shared across both programs)</span>}
                        </div>
                      </div>
                    ) : (
                      // Normal mode: single row of filters
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                        <select id="dash-session-filter" className="select-control" style={{ minWidth: '120px' }}
                          value={dashFilterSession}
                          onChange={e => { setDashFilterSession(e.target.value); setDashFilterWeek('all'); }}
                        >
                          <option value="all">All Sessions</option>
                          {sessionsList.map(s => <option key={s} value={s}>Session {s}</option>)}
                        </select>
                        <select id="dash-week-filter" className="select-control" style={{ minWidth: '120px' }}
                          value={dashFilterWeek}
                          onChange={e => setDashFilterWeek(e.target.value)}
                        >
                          <option value="all">All Weeks</option>
                          {dashWeeksList.map(w => <option key={w} value={w}>Week {w}</option>)}
                        </select>
                        <select id="dash-muscle-macro" className="select-control" style={{ minWidth: '130px' }}
                            value={dashMuscleMacro}
                            onChange={e => { setDashMuscleMacro(e.target.value); setDashMuscleSubgroup('all'); }}
                          >
                            <option value="all">All Groups</option>
                            {allMacros.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                        {dashMuscleMacro !== 'all' && subMusclesForMacro.length > 0 && (
                          <select id="dash-muscle-sub" className="select-control" style={{ minWidth: '160px' }}
                              value={dashMuscleSubgroup}
                              onChange={e => setDashMuscleSubgroup(e.target.value)}
                            >
                              <option value="all">All {dashMuscleMacro}</option>
                              {subMusclesForMacro.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Active filter pills */}
                  {hasAnyFilter && (
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '16px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Filters:</span>
                      {dashFilterSession !== 'all' && <span style={{ background: 'var(--bg-secondary)', border: '1px solid var(--accent-primary)', borderRadius: '100px', padding: '2px 10px', color: 'var(--accent-primary)' }}>{currentProgram} · S{dashFilterSession}</span>}
                      {dashFilterWeek !== 'all' && <span style={{ background: 'var(--bg-secondary)', border: '1px solid var(--accent-primary)', borderRadius: '100px', padding: '2px 10px', color: 'var(--accent-primary)' }}>{currentProgram} · W{dashFilterWeek}</span>}
                      {cmpFilterSession !== 'all' && <span style={{ background: 'var(--bg-secondary)', border: '1px solid var(--accent-primary)', borderRadius: '100px', padding: '2px 10px', color: 'var(--accent-primary)' }}>{compareProgram} · S{cmpFilterSession}</span>}
                      {cmpFilterWeek !== 'all' && <span style={{ background: 'var(--bg-secondary)', border: '1px solid var(--accent-primary)', borderRadius: '100px', padding: '2px 10px', color: 'var(--accent-primary)' }}>{compareProgram} · W{cmpFilterWeek}</span>}
                      {dashMuscleMacro !== 'all' && <span style={{ background: 'var(--bg-secondary)', border: '1px solid var(--accent-primary)', borderRadius: '100px', padding: '2px 10px', color: 'var(--accent-primary)' }}>{dashMuscleSubgroup !== 'all' ? dashMuscleSubgroup : dashMuscleMacro}</span>}
                    </div>
                  )}

                  {/* ── Summary Cards ── */}
                  {compareMode && compareProgram && !compareLoading ? (
                    // Compare mode: 2-column layout with A vs B
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: isMobile ? '8px' : '16px', marginBottom: isMobile ? '8px' : '16px' }}>
                      {/* Column headers */}
                      <div style={{
                        gridColumn: '1', padding: '8px 16px',
                        background: 'var(--accent-primary-subtle)', border: '1px solid var(--accent-primary-glow)',
                        borderRadius: '100px', fontSize: '0.85rem', fontWeight: 600,
                        color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '8px'
                      }}>
                        <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--accent-primary)', display: 'inline-block' }} />
                        {currentProgram === compareProgram ? `${currentProgram} (Selection A)` : currentProgram}
                        <span style={{ marginLeft: 'auto', fontSize: '0.72rem', opacity: 0.85 }}>
                          {lastFullWeekA !== null ? `W${lastFullWeekA}` : '—'}
                        </span>
                      </div>
                      <div style={{
                        gridColumn: '2', padding: '8px 16px',
                        background: 'var(--accent-secondary-subtle)', border: '1px solid var(--accent-secondary-glow)',
                        borderRadius: '100px', fontSize: '0.85rem', fontWeight: 600,
                        color: 'var(--accent-secondary)', display: 'flex', alignItems: 'center', gap: '8px'
                      }}>
                        <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--accent-secondary)', display: 'inline-block' }} />
                        {currentProgram === compareProgram ? `${compareProgram} (Selection B)` : compareProgram}
                        <span style={{ marginLeft: 'auto', fontSize: '0.72rem', opacity: 0.85 }}>
                          {lastFullWeekB !== null ? `W${lastFullWeekB}` : '—'}
                        </span>
                      </div>

                      {[['Tonnage', 'tonnage', `${totalTonnage.toLocaleString()} kg`, `${compareTotalTonnage.toLocaleString()} kg`, delta(compareTotalTonnage, totalTonnage)],
                        ['Effective Tonnage', 'effective-tonnage', `${totalEffectiveTonnage.toLocaleString()} kg`, `${compareTotalEffectiveTonnage.toLocaleString()} kg`, delta(compareTotalEffectiveTonnage, totalEffectiveTonnage)],
                        ['Reps', 'volume', `${totalVolume.toLocaleString()} reps`, `${compareTotalVolume.toLocaleString()} reps`, delta(compareTotalVolume, totalVolume)],
                        ['Effective Reps', 'effective', `${totalEffectiveReps.toLocaleString()} reps`, `${compareTotalEffReps.toLocaleString()} reps`, delta(compareTotalEffReps, totalEffectiveReps)],
                        ['W. Tonnage', 'weighted-tonnage', `${totalWeightedTonnage.toLocaleString()} kg`, `${compareTotalWeightedTonnage.toLocaleString()} kg`, delta(compareTotalWeightedTonnage, totalWeightedTonnage)],
                        ['Eff. W. Tonnage', 'effective-weighted-tonnage', `${totalEffectiveWeightedTonnage.toLocaleString()} kg`, `${compareTotalEffectiveWeightedTonnage.toLocaleString()} kg`, delta(compareTotalEffectiveWeightedTonnage, totalEffectiveWeightedTonnage)],
                        ['Volume', 'sets', `${totalSets.toLocaleString()} sets`, `${compareTotalSets.toLocaleString()} sets`, delta(compareTotalSets, totalSets)],
                        ['TUT', 'tut', `${totalTut.toLocaleString()}s`, `${compareTotalTut.toLocaleString()}s`, delta(compareTotalTut, totalTut)],
                        ['Effective TUT', 'effective-tut', `${totalEffectiveTut.toLocaleString()}s`, `${compareTotalEffectiveTut.toLocaleString()}s`, delta(compareTotalEffectiveTut, totalEffectiveTut)],
                        ['Accumulated Fatigue', 'fatigue', `${totalFatigue.toLocaleString()}`, `${compareTotalFatigue.toLocaleString()}`, delta(compareTotalFatigue, totalFatigue)]
                      ].map(([label, cls, valA, valB, d]) => (
                        <React.Fragment key={label}>
                          <div className={`metric-summary-card ${cls}`} style={{ margin: 0 }} onClick={() => { setSelectedMetricDetail(cls); }}>
                            <span className="metric-label">
                              {label}
                            </span>
                            <span className="metric-value" style={{ fontSize: '1.4rem' }}>{valA}</span>
                            <span className="metric-trend">{currentProgram === compareProgram ? `${currentProgram} (Selection A)` : currentProgram}</span>
                          </div>
                          <div className={`metric-summary-card ${cls}`} style={{ margin: 0, opacity: 0.75 }} onClick={() => { setSelectedMetricDetail(cls); }}>
                            <span className="metric-label">
                              {label}
                            </span>
                            <span className="metric-value" style={{ fontSize: '1.4rem' }}>{valB}</span>
                            {d ? (
                              <span style={{ fontSize: '0.75rem', color: d.pos ? '#10b981' : '#f43f5e' }}>{d.pos ? '▲' : '▼'} {Math.abs(d.val)}% vs {currentProgram === compareProgram ? 'Selection A' : currentProgram}</span>
                            ) : (
                              <span className="metric-trend">{currentProgram === compareProgram ? `${compareProgram} (Selection B)` : compareProgram}</span>
                            )}
                          </div>
                        </React.Fragment>
                      ))}
                    </div>
                  ) : (
                    <div className="metrics-summary-grid">
                      <div className="metric-summary-card volume" onClick={() => { setSelectedMetricDetail('volume'); }}>
                        <span className="metric-label">Reps</span>
                        <span className="metric-value">{totalVolume.toLocaleString()} reps</span>
                      </div>
                      <div className="metric-summary-card effective" onClick={() => { setSelectedMetricDetail('effective'); }}>
                        <span className="metric-label">Effective Reps</span>
                        <span className="metric-value">{totalEffectiveReps.toLocaleString()} reps</span>
                      </div>
                      <div className="metric-summary-card tonnage" onClick={() => { setSelectedMetricDetail('tonnage'); }}>
                        <span className="metric-label">Tonnage</span>
                        <span className="metric-value">{totalTonnage.toLocaleString()} kg</span>
                      </div>
                      <div className="metric-summary-card effective-tonnage" onClick={() => { setSelectedMetricDetail('effective-tonnage'); }}>
                        <span className="metric-label">Effective Tonnage</span>
                        <span className="metric-value">{totalEffectiveTonnage.toLocaleString()} kg</span>
                      </div>
                      <div className="metric-summary-card weighted-tonnage" onClick={() => { setSelectedMetricDetail('weighted-tonnage'); }}>
                        <span className="metric-label">W. Tonnage</span>
                        <span className="metric-value">{totalWeightedTonnage.toLocaleString()} kg</span>
                      </div>
                      <div className="metric-summary-card effective-weighted-tonnage" onClick={() => { setSelectedMetricDetail('effective-weighted-tonnage'); }}>
                        <span className="metric-label">Eff. W. Tonnage</span>
                        <span className="metric-value">{totalEffectiveWeightedTonnage.toLocaleString()} kg</span>
                      </div>
                      <div className="metric-summary-card tut" onClick={() => { setSelectedMetricDetail('tut'); }}>
                        <span className="metric-label">TUT</span>
                        <span className="metric-value">{totalTut.toLocaleString()}s</span>
                      </div>
                      <div className="metric-summary-card effective-tut" onClick={() => { setSelectedMetricDetail('effective-tut'); }}>
                        <span className="metric-label">Effective TUT</span>
                        <span className="metric-value">{totalEffectiveTut.toLocaleString()}s</span>
                      </div>
                      <div className="metric-summary-card sets" onClick={() => { setSelectedMetricDetail('sets'); }}>
                        <span className="metric-label">Volume</span>
                        <span className="metric-value">{totalSets.toLocaleString()} sets</span>
                      </div>
                      <div className="metric-summary-card fatigue" onClick={() => { setSelectedMetricDetail('fatigue'); }}>
                        <span className="metric-label">Accumulated Fatigue</span>
                        <span className="metric-value">{totalFatigue.toLocaleString()}</span>
                      </div>
                    </div>
                  )}

                  {/* ── Progress Charts Grid ── */}
                  <div className="analytics-grid">

                    {/* Volume & Tonnage Trends */}
                    <div className="chart-container">
                      <div className="chart-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <span className="chart-title" style={{ fontSize: '0.92rem' }}>
                          {progressionExercise === 'all_metrics'
                            ? (compareMode && compareProgram
                              ? `Weekly Progression Comparison`
                              : 'Weekly Progression')
                            : `Exercise Strength Trend — ${progressionExercise}`}
                        </span>
                        <div className="chart-controls-wrapper">
                          <span className="control-label">Analyze:</span>
                          <select 
                            className="select-control select-small"
                            value={progressionExercise}
                            onChange={(e) => setProgressionExercise(e.target.value)}
                            style={{ minWidth: '160px', padding: '4px 24px 4px 10px', fontSize: '0.75rem', height: '28px' }}
                          >
                            <option value="all_metrics">Overall Program Metrics</option>
                            <optgroup label="Exercises">
                              {uniqueExerciseNames.map(ex => (
                                <option key={ex} value={ex}>{ex}</option>
                              ))}
                            </optgroup>
                          </select>
                          {progressionExercise === 'all_metrics' && (
                            <>
                              <span className="control-label">Metric:</span>
                              <select
                                className="select-control select-small"
                                value={overallChartMetric}
                                onChange={(e) => setOverallChartMetric(e.target.value)}
                                style={{ minWidth: '120px', padding: '4px 24px 4px 10px', fontSize: '0.75rem', height: '28px' }}
                              >
                                <option value="Volume">Reps</option>
                                <option value="Tonnage">Tonnage</option>
                                <option value="EffectiveTonnage">Effective Tonnage</option>
                                <option value="WeightedTonnage">Weighted Tonnage</option>
                                <option value="EffectiveWeightedTonnage">Effective Weighted Tonnage</option>
                                <option value="Fatigue">Fatigue</option>
                                <option value="EffectiveRepsCustom">Effective Reps</option>
                                <option value="EffectiveTut">Effective TUT</option>
                                <option value="Tut">TUT</option>
                                <option value="Sets">Volume</option>
                              </select>
                            </>
                          )}

                        </div>
                      </div>
                      <div className="dashboard-chart-wrapper" style={{ width: '100%', height: 260 }}>
                        {progressionExercise === 'all_metrics' && metricsByWeek.length === 0 && !compareMode ? (
                          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            No data available for the current selection.
                          </div>
                        ) : (
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} style={isMobile ? { pointerEvents: 'none' } : undefined}>
                          {progressionExercise === 'all_metrics' ? (() => {
                            const overallMetricInfo = getMetricLabelAndUnit(overallChartMetric);
                            const nameStr = `${overallMetricInfo.name}${overallMetricInfo.unit ? ` (${overallMetricInfo.unit})` : ''}`;
                            return (
                              <LineChart data={compareMode ? mergedChartData : metricsByWeek} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                {isMobile && metricsByWeek.length > 0 && (
                                  <ReferenceLine x={metricsByWeek[Math.min(weekSliderIdx, metricsByWeek.length - 1)]?.week} stroke="rgba(255,255,255,0.5)" strokeWidth={1.5} strokeDasharray="4 4" />
                                )}
                                <XAxis dataKey="week" stroke="var(--text-muted)" fontSize={10} />
                                <YAxis 
                                  yAxisId="main"
                                  stroke="var(--text-muted)" 
                                  fontSize={10} 
                                  domain={overallChartBoundsSelected}
                                  tickFormatter={(val) => Math.round(val)}
                                  label={{ 
                                    value: nameStr, 
                                    angle: -90, 
                                    position: 'insideLeft', 
                                    style: { fill: 'var(--text-muted)', fontSize: '10px', textAnchor: 'middle' } 
                                  }}
                                />
                                <Tooltip content={renderOverallChartTooltip} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 2 }} />
                                {compareMode && <Legend wrapperStyle={{ fontSize: '11px' }} />}
                                
                                <Line 
                                  yAxisId="main"
                                  type="monotone" 
                                  dataKey={overallChartMetric} 
                                  stroke={getMetricColor(overallChartMetric)} 
                                  strokeWidth={3}
                                  dot={{ fill: 'var(--bg-secondary)', stroke: getMetricColor(overallChartMetric), strokeWidth: 2, r: 4 }}
                                  activeDot={{ r: 6, fill: getMetricColor(overallChartMetric), stroke: '#fff', strokeWidth: 2 }}
                                  name={compareMode ? `${overallMetricInfo.name} — Selection A` : nameStr} 
                                  connectNulls={true}
                                  isAnimationActive={false}
                                />
                                
                                {compareMode && (
                                  <Line 
                                    yAxisId="main"
                                    type="monotone" 
                                    dataKey={`${overallChartMetric}_B`} 
                                    stroke={getMetricColorB(overallChartMetric)} 
                                    strokeWidth={3}
                                    strokeDasharray="4 4"
                                    dot={{ fill: 'var(--bg-secondary)', stroke: getMetricColorB(overallChartMetric), strokeWidth: 2, r: 4 }}
                                    activeDot={{ r: 6, fill: getMetricColorB(overallChartMetric), stroke: '#fff', strokeWidth: 2 }}
                                    name={`${overallMetricInfo.name} — Selection B`} 
                                    connectNulls={true}
                                    isAnimationActive={false}
                                  />
                                )}
                              </LineChart>
                            );
                          })() : (
                            <LineChart data={exerciseChartData}>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                              <XAxis dataKey="week" stroke="var(--text-muted)" fontSize={11} />
                              <YAxis 
                                yAxisId="left" 
                                stroke="var(--accent-primary)" 
                                fontSize={11} 
                                domain={exerciseChartBounds.tonnageDomain}
                                tickFormatter={(val) => Math.round(val).toLocaleString()}
                                label={{ value: 'Tonnage (kg)', angle: -90, position: 'insideLeft', style: { fill: 'var(--text-muted)', fontSize: 9 } }} 
                              />
                              <YAxis 
                                yAxisId="right" 
                                orientation="right" 
                                stroke="var(--accent-secondary)" 
                                fontSize={11} 
                                domain={exerciseChartBounds.volumeDomain}
                                tickFormatter={(val) => Math.round(val).toLocaleString()}
                                label={{ value: 'Reps', angle: 90, position: 'insideRight', style: { fill: 'var(--text-muted)', fontSize: 9 } }} 
                              />
                              <Tooltip contentStyle={{ backgroundColor: 'var(--bg-glass-active)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }} />
                              <Legend fontSize={10} />
                              <Line isAnimationActive={false} yAxisId="left" type="monotone" dataKey="Tonnage" stroke="var(--accent-primary)" strokeWidth={3} activeDot={{ r: 6 }} name={compareMode ? 'Tonnage — Selection A' : 'Tonnage (kg)'} />
                              <Line isAnimationActive={false} yAxisId="right" type="monotone" dataKey="Volume" stroke="var(--accent-secondary)" strokeWidth={2.5} name={compareMode ? 'Reps — Selection A' : 'Reps'} />
                              {compareMode && compareProgram && (
                                <>
                                  <Line isAnimationActive={false} yAxisId="left" type="monotone" dataKey="Tonnage_B" stroke="#fda4af" strokeWidth={2} strokeDasharray="6 3" activeDot={{ r: 5 }} name="Tonnage — Selection B" />
                                  <Line isAnimationActive={false} yAxisId="right" type="monotone" dataKey="Volume_B" stroke="#a855f7" strokeWidth={1.5} strokeDasharray="4 2" name="Reps — Selection B" />
                                </>
                              )}
                            </LineChart>
                          )}
                        </ResponsiveContainer>
                        )}
                      </div>
                      {/* Mobile week scrubber */}
                      {isMobile && progressionExercise === 'all_metrics' && metricsByWeek.length > 0 && (
                        <div style={{ padding: '4px 8px 0 8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {/* Per-metric values at selected week */}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center' }}>
                            {(() => {
                              const idx = Math.min(weekSliderIdx, metricsByWeek.length - 1);
                              const pt = metricsByWeek[idx];
                              if (!pt) return null;
                              const metrics = [
                                { key: 'Volume', label: 'Reps', color: 'var(--color-volume)' },
                                { key: 'Tonnage', color: 'var(--color-tonnage)' },
                                { key: 'EffectiveRepsCustom', label: 'Eff. Reps', color: 'var(--color-effective-volume)' },
                                { key: 'Fatigue', color: 'var(--color-fatigue)' },
                              ];
                              return metrics.map(m => (
                                <span key={m.key} style={{
                                  fontSize: '0.68rem',
                                  color: m.color,
                                  background: 'rgba(0,0,0,0.35)',
                                  padding: '2px 8px',
                                  borderRadius: '100px',
                                  border: `1px solid ${m.color}33`,
                                  whiteSpace: 'nowrap'
                                }}>
                                  {m.label || m.key}: {typeof pt[m.key] === 'number' ? pt[m.key].toFixed(1) : '—'}
                                </span>
                              ));
                            })()}
                          </div>
                          <div style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                            {metricsByWeek[Math.min(weekSliderIdx, metricsByWeek.length - 1)]?.week || '—'}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', minWidth: '36px', textAlign: 'right' }}>Start</span>
                            <input
                              type="range"
                              min="0"
                              max={Math.max(0, metricsByWeek.length - 1)}
                              value={weekSliderIdx}
                              onChange={(e) => setWeekSliderIdx(parseInt(e.target.value))}
                              className="tension-scrubber-slider"
                              style={{ flex: 1, accentColor: 'var(--accent-primary)' }}
                            />
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', minWidth: '36px' }}>End</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Muscle Group Volume */}
                    <div className="chart-container">
                      <div className="chart-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="chart-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {dashMuscleMacro !== 'all' 
                            ? (muscleMetric === 'sets' ? `${dashMuscleMacro} Sub-group Volume` : `${dashMuscleMacro} Sub-group Reps`)
                            : (muscleMetric === 'sets' ? 'Muscle Group Volume' : 'Muscle Group Reps')}
                        </span>
                        <select
                          className="select-control select-small"
                          value={muscleMetric}
                          onChange={(e) => setMuscleMetric(e.target.value)}
                        >
                          <option value="effective">Effective Reps</option>
                          <option value="volume">Reps</option>
                          <option value="sets">Volume</option>
                        </select>
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
                    <div className="chart-container" style={{ gridColumn: '1 / -1' }}>
                      <div className="chart-header" style={{ cursor: 'pointer' }} onClick={() => { setSelectedMetricDetail('tension-profiles'); }}>
                        <span className="chart-title" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#fff', transition: 'color 0.2s' }}>
                          Tension Profiles
                        </span>
                      </div>
                      <div style={{ height: isMobile ? '220px' : '300px', width: '100%', marginTop: '10px' }}>
                        {cumulativeCurveData.length > 0 ? (
                          <ResponsiveContainer width="99%" height="100%" minWidth={0} minHeight={0}>
                            <LineChart data={cumulativeCurveData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} style={isMobile ? { pointerEvents: 'none' } : undefined}>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                              <XAxis
                                dataKey="rom"
                                stroke="var(--text-muted)"
                                fontSize={10}
                                tickFormatter={(val) => `${Math.round(val * 100)}%`}
                              />
                              <YAxis stroke="var(--text-muted)" fontSize={10} />
                              {!isMobile && <Tooltip
                                contentStyle={{ backgroundColor: 'var(--bg-glass-active)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}
                                labelFormatter={(val) => `ROM: ${Math.round(val * 100)}%`}
                                formatter={(val) => parseFloat(val).toFixed(1)}
                              />}
                              {isMobile && <ReferenceLine x={tensionSliderPos / 100} stroke="rgba(255,255,255,0.5)" strokeWidth={1.5} strokeDasharray="4 4" />}
                              {displayMuscleData.slice(0, 6).map((m, idx) => {
                                const colors = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#a855f7', '#f43f5e'];
                                return (
                                  <Line
                                    key={m.name}
                                    type="monotone"
                                    dataKey={m.name}
                                    name={m.name}
                                    stroke={colors[idx % colors.length]}
                                    strokeWidth={2.5}
                                    dot={false}
                                    activeDot={{ r: 4 }}
                                    isAnimationActive={false}
                                  />
                                );
                              })}
                            </LineChart>
                          </ResponsiveContainer>
                        ) : (
                          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            No data available for the current selection.
                          </div>
                        )}
                      </div>
                      {/* Mobile ROM scrubber */}
                      {isMobile && cumulativeCurveData.length > 0 && (
                        <div style={{ padding: '4px 8px 0 8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {/* Per-muscle values — above slider so finger doesn't cover */}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center' }}>
                            {displayMuscleData.slice(0, 6).map((m, idx) => {
                              const colors = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#a855f7', '#f43f5e'];
                              const color = colors[idx % colors.length];
                              const resolution = cumulativeCurveData.length - 1;
                              const closestIdx = Math.round((tensionSliderPos / 100) * resolution);
                              const closestPt = cumulativeCurveData[Math.min(closestIdx, resolution)];
                              const val = closestPt ? (closestPt[m.name] ?? 0) : 0;
                              return (
                                <span key={m.name} style={{
                                  fontSize: '0.68rem',
                                  color: color,
                                  background: 'rgba(0,0,0,0.35)',
                                  padding: '2px 8px',
                                  borderRadius: '100px',
                                  border: `1px solid ${color}33`,
                                  whiteSpace: 'nowrap'
                                }}>
                                  {m.name}: {val.toFixed(1)}
                                </span>
                              );
                            })}
                          </div>
                          <div style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                            ROM: {tensionSliderPos}%
                          </div>
                          {/* Slider at the bottom so finger doesn't cover labels */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', minWidth: '36px', textAlign: 'right' }}>Stretch</span>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={tensionSliderPos}
                              onChange={(e) => setTensionSliderPos(parseInt(e.target.value))}
                              className="tension-scrubber-slider"
                              style={{ flex: 1, accentColor: 'var(--accent-primary)' }}
                            />
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', minWidth: '44px' }}>Contract</span>
                          </div>
                        </div>
                      )}
                    </div>

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

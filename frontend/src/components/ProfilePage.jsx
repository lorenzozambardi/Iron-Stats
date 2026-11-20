import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, Plus, Trash2 } from 'lucide-react';
import { MetricSparkline, TrendBadge } from './Sparkline';
import { LockWheelPicker } from './FilterControls';
import { Latex } from './MathComponents';
import {
  CIRCUMFERENCE_FIELDS,
  CIRCUMFERENCE_LOG_KEYS,
  PROFILE_LOG_META,
  buildDerivedMetricSeries,
  calcAge,
  calcBMI,
  calcLeanMass,
  calcFatMass,
  calcFFMI,
  calcKatchMcArdleBMR,
  calcTDEEFromSteps,
  formatDisplayDate,
  formatProfileLogValue,
} from '../profileUtils';

const cardStyle = {
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border-color)',
  borderRadius: 'var(--card-radius)',
  boxShadow: 'var(--card-shadow)',
  padding: '18px 20px',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
};

const sectionTitleStyle = {
  fontSize: '0.75rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--text-secondary)',
  margin: 0,
};

const inputStyle = {
  width: '100%',
  background: 'rgba(255, 255, 255, 0.04)',
  border: '1px solid var(--border-color)',
  borderRadius: '10px',
  padding: '8px 10px',
  color: 'var(--text-primary)',
  fontSize: '0.9rem',
  fontFamily: 'var(--font-display)',
  fontWeight: 600,
  fontVariantNumeric: 'tabular-nums',
  outline: 'none',
};

const TIME_RANGES = [
  { value: '7d', label: '7D', days: 7 },
  { value: '30d', label: '1M', days: 30 },
  { value: '90d', label: '3M', days: 90 },
  { value: '180d', label: '6M', days: 180 },
  { value: '365d', label: '1Y', days: 365 },
  { value: 'all', label: 'All', days: null },
];

function FormattedDateInput({ value, max, dateFormat, onChange, ariaLabel, style }) {
  return (
    <div
      style={{
        ...inputStyle,
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        cursor: 'pointer',
        ...style,
      }}
    >
      <span>{value ? formatDisplayDate(value, dateFormat) : '—'}</span>
      <Calendar size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      <input
        type="date"
        value={value}
        max={max}
        aria-label={ariaLabel}
        onChange={onChange}
        onClick={(e) => {
          try {
            e.currentTarget.showPicker?.();
          } catch {
            // Ignore browsers where showPicker is restricted
          }
        }}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: 0,
          cursor: 'pointer',
        }}
      />
    </div>
  );
}

const formatLocalYMD = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export default function ProfilePage({ profile, setProfile, dateFormat = 'dd/mm/yyyy', onBack }) {
  const [visible, setVisible] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const pendingConfirmRef = useRef(null);
  const [selectedDerivedMetric, setSelectedDerivedMetric] = useState(null);
  const selectedDerivedMetricRef = useRef(null);
  const closeTimeoutRef = useRef(null);
  const todayStr = useMemo(() => formatLocalYMD(), []);
  const [logDate, setLogDate] = useState(() => formatLocalYMD());
  const [timeRange, setTimeRange] = useState('all');
  const [logFilter, setLogFilter] = useState('all');

  useEffect(() => {
    pendingConfirmRef.current = pendingConfirm;
  }, [pendingConfirm]);

  useEffect(() => {
    selectedDerivedMetricRef.current = selectedDerivedMetric;
  }, [selectedDerivedMetric]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => {
      cancelAnimationFrame(raf);
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
    };
  }, []);

  const handleClose = () => {
    setVisible(false);
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = setTimeout(() => {
      closeTimeoutRef.current = null;
      onBack();
    }, 200);
  };

  useEffect(() => {
    const handleHardwareBack = () => {
      if (pendingConfirmRef.current) {
        setPendingConfirm(null);
        return;
      }
      if (selectedDerivedMetricRef.current) {
        setSelectedDerivedMetric(null);
        return;
      }
      setVisible(false);
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = setTimeout(() => {
        closeTimeoutRef.current = null;
        onBack();
      }, 200);
    };
    window.addEventListener('close-profile-page', handleHardwareBack);
    return () => window.removeEventListener('close-profile-page', handleHardwareBack);
  }, [onBack]);

  const { current, logs = [] } = profile;

  const updateCurrent = (key, rawVal) => {
    const isStringField = key === 'birthDate' || key === 'sex';
    if (isStringField) {
      setProfile((prev) => ({
        ...prev,
        current: { ...prev.current, [key]: rawVal },
      }));
      return;
    }
    if (rawVal === '') {
      setProfile((prev) => ({
        ...prev,
        current: { ...prev.current, [key]: '' },
      }));
      return;
    }
    const val = parseFloat(rawVal);
    setProfile((prev) => ({
      ...prev,
      current: {
        ...prev.current,
        [key]: Number.isFinite(val) ? val : 0,
      },
    }));
  };

  const getTypesToLog = (typeOrTypes) => {
    let candidates;
    if (typeOrTypes === 'all') {
      candidates = ['weight', 'bodyFat', ...CIRCUMFERENCE_LOG_KEYS];
    } else if (typeOrTypes === 'circumferences') {
      candidates = CIRCUMFERENCE_LOG_KEYS;
    } else if (Array.isArray(typeOrTypes)) {
      candidates = typeOrTypes;
    } else {
      candidates = [typeOrTypes];
    }
    return candidates.filter((t) => {
      const raw = current[t];
      if (raw === '' || raw === null || raw === undefined) return false;
      const num = Number(raw);
      return Number.isFinite(num) && num > 0;
    });
  };

  const applyLogStat = (typesToWrite) => {
    const targetDate = logDate || todayStr;
    const targetTs = Date.parse(`${targetDate}T12:00:00`) || Date.now();
    const now = Date.now();

    setProfile((prev) => {
      const existing = Array.isArray(prev.logs) ? prev.logs : [];
      const filtered = existing.filter(
        (item) => !(item.date === targetDate && typesToWrite.includes(item.type))
      );
      const newEntries = typesToWrite.map((t) => ({
        id: `${now}-${t}`,
        date: targetDate,
        ts: targetTs,
        type: t,
        value: Number(prev.current?.[t] ?? current[t]) || 0,
      }));
      const merged = [...newEntries, ...filtered].sort(
        (a, b) => b.date.localeCompare(a.date) || (b.ts || 0) - (a.ts || 0)
      );
      return {
        ...prev,
        logs: merged.slice(0, 2000),
      };
    });
  };

  const handleLogStat = (typeOrTypes) => {
    const typesToWrite = getTypesToLog(typeOrTypes);
    if (typesToWrite.length === 0) return;

    const targetDate = logDate || todayStr;
    const conflicts = logs.filter(
      (item) => item.date === targetDate && typesToWrite.includes(item.type)
    );

    if (conflicts.length > 0) {
      const displayDate = formatDisplayDate(targetDate, dateFormat);
      const formattedConflicts = conflicts.map((c) => {
        const label = PROFILE_LOG_META[c.type]?.label || c.type;
        return `${label} (${formatProfileLogValue(c.type, c.value)})`;
      });
      const details = formattedConflicts.length <= 3
        ? formattedConflicts.join(', ')
        : `${formattedConflicts.slice(0, 2).join(', ')} and ${formattedConflicts.length - 2} more`;
      setPendingConfirm({
        title: `Overwrite log for ${displayDate}?`,
        message: `You already logged ${details} for ${displayDate}. Continuing will overwrite that day's entry.`,
        confirmLabel: 'Overwrite',
        accentColor: 'var(--color-volume)',
        onConfirm: () => applyLogStat(typesToWrite),
      });
      return;
    }

    applyLogStat(typesToWrite);
  };

  const handleDeleteLog = (entry) => {
    const label = PROFILE_LOG_META[entry.type]?.label || entry.type;
    const formatted = formatProfileLogValue(entry.type, entry.value);
    const displayDate = formatDisplayDate(entry.date, dateFormat);
    setPendingConfirm({
      title: 'Delete log?',
      message: `Remove ${label} (${formatted}) for ${displayDate}?`,
      confirmLabel: 'Delete',
      accentColor: 'var(--color-fatigue)',
      onConfirm: () => {
        setProfile((prev) => ({
          ...prev,
          logs: (prev.logs || []).filter((item) => item.id !== entry.id),
        }));
      },
    });
  };

  const { seriesByType, hasAnyTrends, allWeightCount, allBfCount, weightSeries, bodyFatSeries } = useMemo(() => {
    const toPoint = (item) => ({
      t: Number.isFinite(item.ts) ? item.ts : (Date.parse(item.date) || 0),
      v: Number(item.value) || 0,
    });
    const byTime = (a, b) => a.t - b.t;

    const rangeDef = TIME_RANGES.find((r) => r.value === timeRange);
    const cutoff = rangeDef?.days
      ? Date.parse(`${todayStr}T23:59:59`) - rangeDef.days * 86400000
      : null;

    const grouped = {};
    for (const item of logs) {
      if (!item || !item.type) continue;
      if (!grouped[item.type]) grouped[item.type] = [];
      grouped[item.type].push(toPoint(item));
    }

    const map = {};
    let anyTrends = false;
    for (const key of Object.keys(PROFILE_LOG_META)) {
      const allPts = (grouped[key] || []).sort(byTime);
      if (allPts.length >= 2) anyTrends = true;
      map[key] = {
        allCount: allPts.length,
        series: cutoff ? allPts.filter((p) => p.t >= cutoff) : allPts,
      };
    }

    return {
      seriesByType: map,
      hasAnyTrends: anyTrends,
      allWeightCount: map.weight.allCount,
      allBfCount: map.bodyFat.allCount,
      weightSeries: map.weight.series,
      bodyFatSeries: map.bodyFat.series,
    };
  }, [logs, timeRange, todayStr]);

  const filteredLogs = useMemo(() => {
    if (logFilter === 'all') return logs;
    return logs.filter((entry) => PROFILE_LOG_META[entry.type]?.category === logFilter);
  }, [logs, logFilter]);

  const age = useMemo(() => calcAge(current.birthDate), [current.birthDate]);

  const derived = useMemo(() => {
    const bmi = calcBMI(current.weight, current.height);
    const lbm = calcLeanMass(current.weight, current.bodyFat);
    const fm = calcFatMass(current.weight, current.bodyFat);
    const ffmiData = calcFFMI(current.weight, current.height, current.bodyFat);
    const bmr = calcKatchMcArdleBMR(lbm);
    const tdeeData = calcTDEEFromSteps({
      bmr,
      weightKg: current.weight,
      avgSteps: current.avgSteps,
    });

    return {
      bmi,
      lbm,
      fm,
      ffmiData,
      bmr,
      tdeeData,
    };
  }, [current]);

  const selectedMetricDetail = useMemo(() => {
    if (!selectedDerivedMetric) return null;
    const rangeDef = TIME_RANGES.find((r) => r.value === timeRange);
    const cutoff = rangeDef?.days
      ? Date.parse(`${todayStr}T23:59:59`) - rangeDef.days * 86400000
      : null;

    const series = buildDerivedMetricSeries(logs, current, selectedDerivedMetric, cutoff)
      .map((pt) => ({ ...pt, label: formatDisplayDate(pt.date, dateFormat) }));
    const totalCount = buildDerivedMetricSeries(logs, current, selectedDerivedMetric, null).length;

    const w = Number(current.weight) || 0;
    const hCm = Number(current.height) || 0;
    const hM = hCm / 100;
    const bf = Math.min(Math.max(Number(current.bodyFat) || 0, 0), 75);

    const configs = {
      bmi: {
        title: 'Body Mass Index (BMI)',
        valueText: derived.bmi.toFixed(1),
        unit: '',
        invertColor: false,
        math: String.raw`\text{BMI} = \frac{W}{h^2} = \frac{${w.toFixed(1)}}{${hM.toFixed(2)}^2} = ${derived.bmi.toFixed(1)}`,
      },
      ffmi: {
        title: 'Normalized FFMI',
        valueText: derived.ffmiData.normalizedFfmi.toFixed(1),
        unit: '',
        invertColor: false,
        math: String.raw`\text{FFMI}_{\text{norm}} = \frac{\text{LBM}}{h^2} + 6.1(1.8 - h) = \frac{${derived.lbm.toFixed(1)}}{${hM.toFixed(2)}^2} + 6.1(1.8 - ${hM.toFixed(2)}) = ${derived.ffmiData.normalizedFfmi.toFixed(1)}`,
      },
      lbm: {
        title: 'Lean Body Mass (LBM)',
        valueText: `${derived.lbm.toFixed(1)} kg`,
        unit: ' kg',
        invertColor: false,
        math: String.raw`\text{LBM} = W\left(1 - \frac{\text{BF}\%}{100}\right) = ${w.toFixed(1)}\left(1 - \frac{${bf.toFixed(1)}}{100}\right) = ${derived.lbm.toFixed(1)}\text{ kg}`,
      },
      fm: {
        title: 'Fat Mass',
        valueText: `${derived.fm.toFixed(1)} kg`,
        unit: ' kg',
        invertColor: true,
        math: String.raw`\text{FM} = W \cdot \frac{\text{BF}\%}{100} = ${w.toFixed(1)} \cdot \frac{${bf.toFixed(1)}}{100} = ${derived.fm.toFixed(1)}\text{ kg}`,
      },
    };

    return {
      key: selectedDerivedMetric,
      ...configs[selectedDerivedMetric],
      series,
      totalCount,
    };
  }, [selectedDerivedMetric, logs, current, derived, timeRange, todayStr, dateFormat]);

  return createPortal(
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100dvh',
      background: 'var(--bg-primary)',
      zIndex: 10000,
      overflowY: 'auto',
      padding: '80px 16px 80px 16px',
      opacity: visible ? 1 : 0,
      transform: visible ? 'none' : 'translateY(16px)',
      transition: 'opacity 0.2s ease, transform 0.2s ease',
    }}>
      <button
        type="button"
        onClick={handleClose}
        aria-label="Close profile"
        style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          background: 'transparent',
          border: 'none',
          color: 'var(--text-primary)',
          fontSize: '2rem',
          cursor: 'pointer',
          lineHeight: 1,
        }}
      >×</button>

      <div style={{
        maxWidth: '860px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}>
        {/* Header Card */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <h2 style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.5rem',
              fontWeight: 700,
              margin: 0,
              color: 'var(--text-primary)',
              lineHeight: 1.2,
            }}>
              Profile
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <FormattedDateInput
                value={logDate}
                max={todayStr}
                dateFormat={dateFormat}
                ariaLabel="Log date"
                onChange={(e) => setLogDate(e.target.value || todayStr)}
                style={{ width: 'auto', padding: '6px 10px', fontSize: '0.8rem' }}
              />
              <button
                type="button"
                className="btn btn-primary"
                style={{ padding: '7px 14px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                onClick={() => handleLogStat('all')}
              >
                <Plus size={14} /> Log All
              </button>
            </div>
          </div>
          {hasAnyTrends && (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              paddingTop: '12px',
              borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            }}>
              <LockWheelPicker
                label="Trends"
                options={TIME_RANGES}
                value={timeRange}
                onChange={setTimeRange}
                itemWidth={44}
                gap={10}
                circular={false}
                style={{ width: '240px', flexShrink: 0 }}
              />
            </div>
          )}
        </div>

        {/* Weight & Body Fat Trend Cards (shown once >= 2 logs exist for a metric) */}
        {(allWeightCount >= 2 || allBfCount >= 2) && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: allWeightCount >= 2 && allBfCount >= 2
              ? 'repeat(2, minmax(0, 1fr))'
              : '1fr',
            gap: '12px',
          }}>
              {allWeightCount >= 2 && (
                <div className="metric-summary-card">
                  <span className="metric-label" style={{ color: 'var(--text-secondary)' }}>Weight</span>
                  <span className="metric-value">{Number(current.weight).toFixed(1)} kg</span>
                  {weightSeries.length >= 2 ? (
                    <>
                      <TrendBadge values={weightSeries} />
                      <MetricSparkline
                        values={weightSeries}
                        color="#a3a3a3"
                        gradId="profile-spark-weight"
                      />
                    </>
                  ) : (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Not enough logs in range
                    </span>
                  )}
                </div>
              )}
              {allBfCount >= 2 && (
                <div className="metric-summary-card">
                  <span className="metric-label" style={{ color: 'var(--text-secondary)' }}>Body Fat</span>
                  <span className="metric-value">{Number(current.bodyFat).toFixed(1)}%</span>
                  {bodyFatSeries.length >= 2 ? (
                    <>
                      <TrendBadge values={bodyFatSeries} invertColor />
                      <MetricSparkline
                        values={bodyFatSeries}
                        color="#a3a3a3"
                        gradId="profile-spark-bf"
                      />
                    </>
                  ) : (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Not enough logs in range
                    </span>
                  )}
                </div>
              )}
          </div>
        )}

        {/* Derived Composition */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
            <h3 style={sectionTitleStyle}>Derived Metrics</h3>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Tap for graph &amp; math</span>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '10px',
          }}>
            {[
              { key: 'bmi', label: 'BMI', value: derived.bmi.toFixed(1) },
              { key: 'ffmi', label: 'Norm. FFMI', value: derived.ffmiData.normalizedFfmi.toFixed(1) },
              { key: 'lbm', label: 'Lean Mass (LBM)', value: `${derived.lbm.toFixed(1)} kg` },
              { key: 'fm', label: 'Fat Mass', value: `${derived.fm.toFixed(1)} kg` },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                className="profile-derived-box"
                onClick={() => setSelectedDerivedMetric(item.key)}
                style={{
                  textAlign: 'left',
                  cursor: 'pointer',
                  width: '100%',
                  font: 'inherit',
                }}
              >
                <span className="profile-stat-label">{item.label}</span>
                <span className="profile-derived-val">{item.value}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Core Biometrics + Metabolic Estimates */}
        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}>Core Biometrics &amp; Energy Expenditure</h3>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '12px',
          }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <span className="profile-stat-label">
                Birth Date{age !== null ? ` · ${age} yrs` : ''}
              </span>
              <FormattedDateInput
                value={current.birthDate || ''}
                max={todayStr}
                dateFormat={dateFormat}
                ariaLabel="Birth Date"
                onChange={(e) => updateCurrent('birthDate', e.target.value)}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <span className="profile-stat-label">Sex</span>
              <select
                style={inputStyle}
                value={current.sex || 'M'}
                onChange={(e) => updateCurrent('sex', e.target.value)}
              >
                <option value="M">M</option>
                <option value="F">F</option>
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <span className="profile-stat-label">Height (cm)</span>
              <input
                type="number"
                step="1"
                min="100"
                max="250"
                style={inputStyle}
                value={current.height}
                onChange={(e) => updateCurrent('height', e.target.value)}
              />
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <span className="profile-stat-label">Weight (kg)</span>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="number"
                  step="0.1"
                  min="20"
                  max="300"
                  style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                  value={current.weight}
                  onChange={(e) => updateCurrent('weight', e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ padding: '7px 14px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}
                  onClick={() => handleLogStat('weight')}
                >
                  <Plus size={14} /> Log
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <span className="profile-stat-label">Body Fat (%)</span>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="number"
                  step="0.1"
                  min="3"
                  max="60"
                  style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                  value={current.bodyFat}
                  onChange={(e) => updateCurrent('bodyFat', e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ padding: '7px 14px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}
                  onClick={() => handleLogStat('bodyFat')}
                >
                  <Plus size={14} /> Log
                </button>
              </div>
            </div>
          </div>

          {/* BMR & TDEE Bar */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '10px',
            paddingTop: '8px',
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            alignItems: 'center',
          }}>
            <div className="profile-derived-box">
              <span className="profile-stat-label">BMR (Katch-McArdle)</span>
              <span className="profile-derived-val">{Math.round(derived.bmr).toLocaleString()} kcal</span>
              <span className="profile-stat-sub">Resting expenditure</span>
            </div>
            <div className="profile-derived-box">
              <span className="profile-stat-label">Estimated TDEE</span>
              <span className="profile-derived-val">
                {Math.round(derived.tdeeData.tdee).toLocaleString()} kcal
              </span>
              <span className="profile-stat-sub">
                Base {Math.round(derived.tdeeData.baseline)} + Steps {Math.round(derived.tdeeData.stepsKcal)} kcal
              </span>
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <span className="profile-stat-label">Avg. Steps / Day</span>
              <input
                type="number"
                step="500"
                min="0"
                max="100000"
                style={inputStyle}
                value={current.avgSteps ?? 8000}
                onChange={(e) => updateCurrent('avgSteps', e.target.value)}
              />
            </label>
          </div>
        </div>

        {/* Circumferences Table/Grid */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <h3 style={sectionTitleStyle}>Circumferences (cm)</h3>
            <button
              type="button"
              className="btn btn-primary"
              style={{ padding: '5px 12px', fontSize: '0.74rem', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
              onClick={() => handleLogStat('circumferences')}
            >
              <Plus size={13} /> Log Circumferences
            </button>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '10px',
          }}>
            {CIRCUMFERENCE_FIELDS.map((field) => {
              const singleData = !field.bilateral ? seriesByType[field.key] : null;
              const leftData = field.bilateral ? seriesByType[field.leftKey] : null;
              const rightData = field.bilateral ? seriesByType[field.rightKey] : null;
              const hasAnyCircumferenceLogs = field.bilateral
                ? (leftData.allCount >= 2 || rightData.allCount >= 2)
                : singleData.allCount >= 2;
              const hasInRange = field.bilateral
                ? (leftData.series.length >= 2 || rightData.series.length >= 2)
                : singleData.series.length >= 2;

              return (
                <div
                  key={field.key}
                  style={{
                    background: 'rgba(255, 255, 255, 0.025)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '12px',
                    padding: '10px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                    <span className="profile-stat-label">{field.label} (cm)</span>
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{
                        padding: '3px 8px',
                        fontSize: '0.68rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                        flexShrink: 0,
                      }}
                      onClick={() => handleLogStat(field.bilateral ? [field.leftKey, field.rightKey] : field.key)}
                    >
                      <Plus size={11} /> Log
                    </button>
                  </div>
                  {field.bilateral ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)', fontWeight: 600 }}>L</span>
                        <input
                          type="number"
                          step="0.5"
                          min="10"
                          max="250"
                          style={inputStyle}
                          value={current[field.leftKey] ?? ''}
                          onChange={(e) => updateCurrent(field.leftKey, e.target.value)}
                        />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)', fontWeight: 600 }}>R</span>
                        <input
                          type="number"
                          step="0.5"
                          min="10"
                          max="250"
                          style={inputStyle}
                          value={current[field.rightKey] ?? ''}
                          onChange={(e) => updateCurrent(field.rightKey, e.target.value)}
                        />
                      </label>
                    </div>
                  ) : (
                    <input
                      type="number"
                      step="0.5"
                      min="10"
                      max="250"
                      style={inputStyle}
                      value={current[field.key] ?? ''}
                      onChange={(e) => updateCurrent(field.key, e.target.value)}
                    />
                  )}
                  {hasAnyCircumferenceLogs && (
                    <div style={{ paddingTop: '4px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {hasInRange ? (
                        <>
                          {field.bilateral ? (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              {leftData.series.length >= 2 && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                  <span style={{ width: '8px', height: '2px', background: '#a3a3a3', display: 'inline-block' }} />
                                  L <TrendBadge values={leftData.series} />
                                </span>
                              )}
                              {rightData.series.length >= 2 && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                  <span style={{ width: '8px', height: '0', borderTop: '2px dashed var(--accent-secondary)', display: 'inline-block' }} />
                                  R <TrendBadge values={rightData.series} />
                                </span>
                              )}
                            </div>
                          ) : (
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                              <TrendBadge values={singleData.series} invertColor={field.key === 'waist'} />
                            </div>
                          )}
                          <MetricSparkline
                            values={field.bilateral ? leftData.series : singleData.series}
                            compareValues={field.bilateral ? rightData.series : undefined}
                            color="#a3a3a3"
                            compareColor="var(--accent-secondary)"
                            gradId={`profile-spark-${field.key}`}
                          />
                        </>
                      ) : (
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          Not enough logs in range
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Logs History */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <h3 style={sectionTitleStyle}>Logs</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {logs.length > 0 && (
                <div style={{ display: 'inline-flex', gap: '4px' }}>
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'core', label: 'Core' },
                    { id: 'circumference', label: 'Circumferences' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      className={logFilter === tab.id ? 'btn btn-primary' : 'btn'}
                      style={{ padding: '3px 9px', fontSize: '0.7rem' }}
                      onClick={() => setLogFilter(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              )}
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                {filteredLogs.length} {filteredLogs.length === 1 ? 'entry' : 'entries'}
              </span>
            </div>
          </div>

          {logs.length === 0 ? (
            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', margin: 0 }}>
              No logs yet. Press &ldquo;Log All&rdquo; at the top or &ldquo;+ Log&rdquo; on any measurement.
            </p>
          ) : filteredLogs.length === 0 ? (
            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', margin: 0 }}>
              No logs in this category yet.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filteredLogs.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    padding: '10px 12px',
                    background: 'rgba(255, 255, 255, 0.025)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '10px',
                    flexWrap: 'wrap',
                  }}
                >
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', minWidth: '88px' }}>
                    {formatDisplayDate(entry.date, dateFormat)}
                  </span>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '0.82rem', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                    <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
                      {PROFILE_LOG_META[entry.type]?.label || entry.type}
                    </span>
                    <strong style={{ color: 'var(--text-primary)' }}>
                      {formatProfileLogValue(entry.type, entry.value)}
                    </strong>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteLog(entry)}
                    aria-label={`Delete log ${entry.date}`}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      padding: '4px',
                      display: 'inline-flex',
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {pendingConfirm && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="profile-confirm-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(4px)',
            zIndex: 10010,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setPendingConfirm(null)}
        >
          <div
            style={{
              ...cardStyle,
              maxWidth: '400px',
              width: '100%',
              borderColor: pendingConfirm.accentColor,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              id="profile-confirm-title"
              style={{
                margin: 0,
                fontFamily: 'var(--font-display)',
                fontSize: '1.05rem',
                fontWeight: 700,
                color: pendingConfirm.accentColor,
              }}
            >
              {pendingConfirm.title}
            </h3>
            <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {pendingConfirm.message}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
              <button
                type="button"
                className="btn"
                style={{ padding: '7px 14px', fontSize: '0.8rem' }}
                onClick={() => setPendingConfirm(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ padding: '7px 14px', fontSize: '0.8rem' }}
                onClick={() => {
                  pendingConfirm.onConfirm();
                  setPendingConfirm(null);
                }}
              >
                {pendingConfirm.confirmLabel}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {selectedMetricDetail && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="derived-metric-modal-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.72)',
            backdropFilter: 'blur(4px)',
            zIndex: 10005,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setSelectedDerivedMetric(null)}
        >
          <div
            style={{
              ...cardStyle,
              maxWidth: '440px',
              width: '100%',
              maxHeight: '90dvh',
              overflowY: 'auto',
              padding: '14px 16px',
              gap: '10px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
                <h3
                  id="derived-metric-modal-title"
                  style={{
                    margin: 0,
                    fontFamily: 'var(--font-display)',
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                  }}
                >
                  {selectedMetricDetail.title}
                </h3>
                <span style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.05rem',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {selectedMetricDetail.valueText}
                </span>
                {selectedMetricDetail.series.length >= 2 && (
                  <TrendBadge
                    values={selectedMetricDetail.series}
                    invertColor={selectedMetricDetail.invertColor}
                  />
                )}
              </div>
              <button
                type="button"
                aria-label="Close metric details"
                onClick={() => setSelectedDerivedMetric(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  fontSize: '1.35rem',
                  lineHeight: 1,
                  cursor: 'pointer',
                  padding: '0 4px',
                }}
              >
                ×
              </button>
            </div>

            <div style={{
              background: 'rgba(255, 255, 255, 0.025)',
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
              padding: '12px',
            }}>
              {selectedMetricDetail.series.length >= 2 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <MetricSparkline
                    values={selectedMetricDetail.series}
                    color="#a3a3a3"
                    gradId={`profile-spark-derived-${selectedMetricDetail.key}`}
                    height={92}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                    <span>{selectedMetricDetail.series[0].label}</span>
                    <span>{selectedMetricDetail.series[selectedMetricDetail.series.length - 1].label}</span>
                  </div>
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', padding: '12px 6px' }}>
                  {selectedMetricDetail.totalCount >= 2
                    ? 'Not enough logs in the selected time range.'
                    : `Log at least 2 ${selectedMetricDetail.key === 'bmi' ? 'Weight' : 'Weight / Body Fat'} entries to plot this graph.`}
                </p>
              )}
            </div>

            <div style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-color)',
              padding: '10px 12px',
              borderRadius: '10px',
              color: 'var(--text-primary)',
              overflowX: 'auto',
              textAlign: 'center',
            }}>
              <Latex math={selectedMetricDetail.math} block />
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>,
    document.body
  );
}

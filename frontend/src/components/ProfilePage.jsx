import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, Plus, Trash2 } from 'lucide-react';
import { MetricSparkline, TrendBadge } from './Sparkline';
import {
  CIRCUMFERENCE_FIELDS,
  calcAge,
  calcBMI,
  calcLeanMass,
  calcFatMass,
  calcFFMI,
  calcKatchMcArdleBMR,
  calcTDEEFromSteps,
  formatDisplayDate,
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

export default function ProfilePage({ profile, setProfile, dateFormat = 'dd/mm/yyyy', onBack }) {
  const [visible, setVisible] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [logDate, setLogDate] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const handleHardwareBack = () => {
      setVisible(false);
      setTimeout(() => onBack(), 200);
    };
    window.addEventListener('close-profile-page', handleHardwareBack);
    return () => window.removeEventListener('close-profile-page', handleHardwareBack);
  }, [onBack]);

  const handleClose = () => {
    setVisible(false);
    setTimeout(() => onBack(), 200);
  };

  const { current, logs = [] } = profile;

  const updateCurrent = (key, rawVal) => {
    const isStringField = key === 'birthDate' || key === 'sex';
    const val = isStringField ? rawVal : parseFloat(rawVal);
    setProfile((prev) => ({
      ...prev,
      current: {
        ...prev.current,
        [key]: isStringField ? rawVal : (Number.isFinite(val) ? val : 0),
      },
    }));
  };

  const applyLogStat = (type) => {
    const targetDate = logDate || todayStr;
    const targetTs = Date.parse(`${targetDate}T12:00:00`) || Date.now();
    const typesToWrite = type === 'all' ? ['weight', 'bodyFat'] : [type];

    setProfile((prev) => {
      const existing = Array.isArray(prev.logs) ? prev.logs : [];
      const filtered = existing.filter(
        (item) => !(item.date === targetDate && typesToWrite.includes(item.type))
      );
      const newEntries = typesToWrite.map((t) => ({
        id: `${Date.now()}-${t === 'weight' ? 'w' : 'bf'}`,
        date: targetDate,
        ts: targetTs,
        type: t,
        value: Number(t === 'weight' ? current.weight : current.bodyFat) || 0,
      }));
      const merged = [...newEntries, ...filtered].sort(
        (a, b) => b.date.localeCompare(a.date) || (b.ts || 0) - (a.ts || 0)
      );
      return {
        ...prev,
        logs: merged.slice(0, 150),
      };
    });
  };

  const handleLogStat = (type) => {
    const targetDate = logDate || todayStr;
    const typesToCheck = type === 'all' ? ['weight', 'bodyFat'] : [type];
    const conflicts = logs.filter(
      (item) => item.date === targetDate && typesToCheck.includes(item.type)
    );

    if (conflicts.length > 0) {
      const displayDate = formatDisplayDate(targetDate, dateFormat);
      const details = conflicts
        .map((c) => (
          c.type === 'weight'
            ? `Weight (${Number(c.value).toFixed(1)} kg)`
            : `Body Fat (${Number(c.value).toFixed(1)}%)`
        ))
        .join(' and ');
      setPendingConfirm({
        title: `Overwrite log for ${displayDate}?`,
        message: `You already logged ${details} for ${displayDate}. Continuing will overwrite that day's entry.`,
        confirmLabel: 'Overwrite',
        accentColor: 'var(--color-volume)',
        onConfirm: () => applyLogStat(type),
      });
      return;
    }

    applyLogStat(type);
  };

  const handleDeleteLog = (entry) => {
    const label = entry.type === 'weight' ? 'Weight' : 'Body Fat';
    const formatted = entry.type === 'weight'
      ? `${Number(entry.value).toFixed(1)} kg`
      : `${Number(entry.value).toFixed(1)}%`;
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

  const { weightSeries, bodyFatSeries } = useMemo(() => {
    const toPoint = (item) => ({
      t: Number.isFinite(item.ts) ? item.ts : (Date.parse(item.date) || 0),
      v: Number(item.value) || 0,
    });
    const byTime = (a, b) => a.t - b.t;
    return {
      weightSeries: logs.filter((item) => item.type === 'weight').map(toPoint).sort(byTime),
      bodyFatSeries: logs.filter((item) => item.type === 'bodyFat').map(toPoint).sort(byTime),
    };
  }, [logs]);

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
      transform: visible ? 'translateY(0)' : 'translateY(16px)',
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
        </div>

        {/* Weight & Body Fat Trend Cards (shown once >= 2 logs exist for a metric) */}
        {(weightSeries.length >= 2 || bodyFatSeries.length >= 2) && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: weightSeries.length >= 2 && bodyFatSeries.length >= 2
              ? 'repeat(2, minmax(0, 1fr))'
              : '1fr',
            gap: '12px',
          }}>
            {weightSeries.length >= 2 && (
              <div className="metric-summary-card">
                <span className="metric-label" style={{ color: 'var(--text-secondary)' }}>Weight</span>
                <span className="metric-value">{Number(current.weight).toFixed(1)} kg</span>
                <TrendBadge values={weightSeries} />
                <MetricSparkline
                  values={weightSeries}
                  color="#a3a3a3"
                  gradId="profile-spark-weight"
                />
              </div>
            )}
            {bodyFatSeries.length >= 2 && (
              <div className="metric-summary-card">
                <span className="metric-label" style={{ color: 'var(--text-secondary)' }}>Body Fat</span>
                <span className="metric-value">{Number(current.bodyFat).toFixed(1)}%</span>
                <TrendBadge values={bodyFatSeries} invertColor />
                <MetricSparkline
                  values={bodyFatSeries}
                  color="#a3a3a3"
                  gradId="profile-spark-bf"
                />
              </div>
            )}
          </div>
        )}

        {/* Derived Composition */}
        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}>Derived Metrics</h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '10px',
          }}>
            <div className="profile-derived-box">
              <span className="profile-stat-label">BMI</span>
              <span className="profile-derived-val">{derived.bmi.toFixed(1)}</span>
            </div>
            <div className="profile-derived-box">
              <span className="profile-stat-label">Norm. FFMI</span>
              <span className="profile-derived-val">
                {derived.ffmiData.normalizedFfmi.toFixed(1)}
              </span>
            </div>
            <div className="profile-derived-box">
              <span className="profile-stat-label">Lean Mass (LBM)</span>
              <span className="profile-derived-val">{derived.lbm.toFixed(1)} kg</span>
            </div>
            <div className="profile-derived-box">
              <span className="profile-stat-label">Fat Mass</span>
              <span className="profile-derived-val">
                {derived.fm.toFixed(1)} kg
              </span>
            </div>
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
          <h3 style={sectionTitleStyle}>Circumferences (cm)</h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '10px',
          }}>
            {CIRCUMFERENCE_FIELDS.map((field) => (
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
                <span className="profile-stat-label">{field.label} (cm)</span>
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
              </div>
            ))}
          </div>
        </div>

        {/* Logs History */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={sectionTitleStyle}>Logs</h3>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
              {logs.length} {logs.length === 1 ? 'entry' : 'entries'}
            </span>
          </div>

          {logs.length === 0 ? (
            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', margin: 0 }}>
              No logs yet. Press &ldquo;Log All&rdquo; at the top or &ldquo;+ Log&rdquo; on Weight / Body Fat.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {logs.map((entry) => (
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
                      {entry.type === 'weight' ? 'Weight' : 'Body Fat'}
                    </span>
                    <strong style={{ color: 'var(--text-primary)' }}>
                      {entry.type === 'weight'
                        ? `${Number(entry.value).toFixed(1)} kg`
                        : `${Number(entry.value).toFixed(1)}%`}
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

      {pendingConfirm && (
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
        </div>
      )}
    </div>,
    document.body
  );
}

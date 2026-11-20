import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MetricSparkline, TrendBadge } from './Sparkline';
import { sampleSparklineAtTime } from './helpers';
import { LockWheelPicker, TensionRomSlider } from './FilterControls';
import { Latex } from './MathComponents';
import {
  CIRCUMFERENCE_FIELDS,
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

const TIME_RANGES = [
  { value: '7d', label: '7D', days: 7 },
  { value: '30d', label: '1M', days: 30 },
  { value: '90d', label: '3M', days: 90 },
  { value: '180d', label: '6M', days: 180 },
  { value: '365d', label: '1Y', days: 365 },
  { value: 'all', label: 'All', days: null },
];

const formatLocalYMD = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export default function ProfilePage({ profile, dateFormat = 'dd/mm/yyyy', onBack }) {
  const [visible, setVisible] = useState(false);
  const [selectedDerivedMetric, setSelectedDerivedMetric] = useState(null);
  const selectedDerivedMetricRef = useRef(null);
  const [derivedModalVisible, setDerivedModalVisible] = useState(false);
  const derivedCloseTimeoutRef = useRef(null);
  const [metricSliderPos, setMetricSliderPos] = useState(100);
  const [bilateralSide, setBilateralSide] = useState('left');
  const closeTimeoutRef = useRef(null);
  const todayStr = useMemo(() => formatLocalYMD(), []);
  const [timeRange, setTimeRange] = useState('all');

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
      if (derivedCloseTimeoutRef.current) {
        clearTimeout(derivedCloseTimeoutRef.current);
        derivedCloseTimeoutRef.current = null;
      }
    };
  }, []);

  const openDerivedMetric = (key) => {
    if (derivedCloseTimeoutRef.current) {
      clearTimeout(derivedCloseTimeoutRef.current);
      derivedCloseTimeoutRef.current = null;
    }
    setMetricSliderPos(100);
    setBilateralSide('left');
    setDerivedModalVisible(false);
    setSelectedDerivedMetric(key);
    requestAnimationFrame(() => setDerivedModalVisible(true));
  };

  const closeDerivedMetric = () => {
    setDerivedModalVisible(false);
    if (derivedCloseTimeoutRef.current) clearTimeout(derivedCloseTimeoutRef.current);
    derivedCloseTimeoutRef.current = setTimeout(() => {
      derivedCloseTimeoutRef.current = null;
      setSelectedDerivedMetric(null);
    }, 200);
  };

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
      if (selectedDerivedMetricRef.current) {
        closeDerivedMetric();
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

  const { seriesByType, hasAnyTrends, allWeightCount, allBfCount, weightSeries, bodyFatSeries } = useMemo(() => {
    const toPoint = (item) => ({
      t: Number.isFinite(item.ts) ? item.ts : (Date.parse(item.date) || 0),
      v: Number(item.value) || 0,
      date: item.date,
      label: formatDisplayDate(item.date, dateFormat),
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
  }, [logs, timeRange, todayStr, dateFormat]);

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

  const derivedCards = useMemo(() => {
    const rangeDef = TIME_RANGES.find((r) => r.value === timeRange);
    const cutoff = rangeDef?.days
      ? Date.parse(`${todayStr}T23:59:59`) - rangeDef.days * 86400000
      : null;
    return [
      { key: 'bmi', label: 'BMI', value: derived.bmi.toFixed(1), invertColor: false },
      { key: 'ffmi', label: 'Norm. FFMI', value: derived.ffmiData.normalizedFfmi.toFixed(1), invertColor: false },
      { key: 'lbm', label: 'Lean Mass (LBM)', value: `${derived.lbm.toFixed(1)} kg`, invertColor: false },
      { key: 'fm', label: 'Fat Mass', value: `${derived.fm.toFixed(1)} kg`, invertColor: true },
    ].map((item) => {
      const totalSeries = buildDerivedMetricSeries(logs, current, item.key, null);
      const rangeSeries = cutoff ? buildDerivedMetricSeries(logs, current, item.key, cutoff) : totalSeries;
      return { ...item, totalSeries, rangeSeries };
    });
  }, [logs, current, derived, timeRange, todayStr]);

  const selectedMetricDetail = useMemo(() => {
    if (!selectedDerivedMetric) return null;
    const rangeDef = TIME_RANGES.find((r) => r.value === timeRange);
    const cutoff = rangeDef?.days
      ? Date.parse(`${todayStr}T23:59:59`) - rangeDef.days * 86400000
      : null;

    const derivedConfigs = {
      bmi: {
        title: 'Body Mass Index (BMI)',
        subtitle: 'Weight (kg) relative to height squared (m²).',
        valueText: derived.bmi.toFixed(1),
        unit: '',
        invertColor: false,
        emptyHint: 'Weight',
        math: String.raw`\text{BMI} = \frac{W}{h^2}`,
      },
      ffmi: {
        title: 'Normalized FFMI',
        subtitle: 'Fat-free mass relative to height, normalized to 1.80 m.',
        valueText: derived.ffmiData.normalizedFfmi.toFixed(1),
        unit: '',
        invertColor: false,
        emptyHint: 'Weight / Body Fat',
        math: String.raw`\text{FFMI}_{\text{norm}} = \frac{\text{LBM}}{h^2} + 6.1(1.8 - h)`,
      },
      lbm: {
        title: 'Lean Body Mass (LBM)',
        subtitle: 'Estimated non-fat body mass from weight and body fat %.',
        valueText: `${derived.lbm.toFixed(1)} kg`,
        unit: ' kg',
        invertColor: false,
        emptyHint: 'Weight / Body Fat',
        math: String.raw`\text{LBM} = W\left(1 - \frac{\text{BF}\%}{100}\right)`,
      },
      fm: {
        title: 'Fat Mass',
        subtitle: 'Estimated adipose mass from weight and body fat %.',
        valueText: `${derived.fm.toFixed(1)} kg`,
        unit: ' kg',
        invertColor: true,
        emptyHint: 'Weight / Body Fat',
        math: String.raw`\text{FM} = W \cdot \frac{\text{BF}\%}{100}`,
      },
    };

    if (Object.hasOwn(derivedConfigs, selectedDerivedMetric)) {
      const series = buildDerivedMetricSeries(logs, current, selectedDerivedMetric, cutoff)
        .map((pt) => ({ ...pt, label: formatDisplayDate(pt.date, dateFormat) }));
      const totalCount = buildDerivedMetricSeries(logs, current, selectedDerivedMetric, null).length;
      return {
        key: selectedDerivedMetric,
        ...derivedConfigs[selectedDerivedMetric],
        series,
        totalCount,
      };
    }

    if (selectedDerivedMetric === 'weight') {
      const data = seriesByType.weight;
      return {
        key: 'weight',
        title: 'Weight',
        subtitle: 'Body weight tracked over time.',
        valueText: `${Number(current.weight).toFixed(1)} kg`,
        unit: ' kg',
        invertColor: false,
        emptyHint: 'Weight',
        series: data.series,
        totalCount: data.allCount,
      };
    }

    if (selectedDerivedMetric === 'bodyFat') {
      const data = seriesByType.bodyFat;
      return {
        key: 'bodyFat',
        title: 'Body Fat',
        subtitle: 'Estimated body fat percentage tracked over time.',
        valueText: `${Number(current.bodyFat).toFixed(1)}%`,
        unit: '%',
        invertColor: true,
        emptyHint: 'Body Fat',
        series: data.series,
        totalCount: data.allCount,
      };
    }

    const circField = CIRCUMFERENCE_FIELDS.find((f) => f.key === selectedDerivedMetric);
    if (circField) {
      if (circField.bilateral) {
        const leftData = seriesByType[circField.leftKey];
        const rightData = seriesByType[circField.rightKey];
        const activeData = bilateralSide === 'right' ? rightData : leftData;
        return {
          key: circField.key,
          title: circField.label,
          subtitle: `Left and right ${circField.label.toLowerCase()} circumference tracked over time.`,
          valueText: `${Number(current[circField.leftKey] || 0).toFixed(1)} / ${Number(current[circField.rightKey] || 0).toFixed(1)} cm`,
          unit: ' cm',
          invertColor: false,
          isBilateral: true,
          emptyHint: `${circField.label} (${bilateralSide === 'right' ? 'R' : 'L'})`,
          series: activeData.series,
          totalCount: activeData.allCount,
          leftSeries: leftData.series,
          rightSeries: rightData.series,
        };
      }
      const data = seriesByType[circField.key];
      return {
        key: circField.key,
        title: circField.label,
        subtitle: `${circField.label} circumference tracked over time.`,
        valueText: `${Number(current[circField.key] || 0).toFixed(1)} cm`,
        unit: ' cm',
        invertColor: circField.key === 'waist',
        emptyHint: circField.label,
        series: data.series,
        totalCount: data.allCount,
      };
    }

    return null;
  }, [selectedDerivedMetric, bilateralSide, logs, current, derived, seriesByType, timeRange, todayStr, dateFormat]);

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
      padding: '12px 10px 48px 10px',
      opacity: visible ? 1 : 0,
      transform: visible ? 'none' : 'translateY(16px)',
      transition: 'opacity 0.2s ease, transform 0.2s ease',
    }}>
      <div style={{
        maxWidth: '860px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}>
        {/* Header Card */}
        <div style={{ ...cardStyle, padding: '12px 14px', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
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
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close profile"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-primary)',
                fontSize: '1.75rem',
                padding: '4px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                lineHeight: 1,
                flexShrink: 0,
              }}
            >×</button>
          </div>
          {hasAnyTrends && (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              paddingTop: '8px',
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

        {/* Body Composition (Weight & Body Fat) */}
        <section className="profile-section">
          <h3 style={sectionTitleStyle}>Body Composition</h3>
          <div className="profile-metric-grid-2">
            <button
              type="button"
              className="metric-summary-card"
              onClick={() => openDerivedMetric('weight')}
              style={{ textAlign: 'left', cursor: 'pointer', width: '100%', font: 'inherit' }}
            >
              <span className="metric-label" style={{ color: 'var(--text-secondary)' }}>Weight</span>
              <span className="metric-value">{Number(current.weight).toFixed(1)} kg</span>
              {allWeightCount >= 2 && (
                weightSeries.length >= 2 ? (
                  <>
                    <TrendBadge values={weightSeries} />
                    <MetricSparkline
                      values={weightSeries}
                      color="#a3a3a3"
                      gradId="profile-spark-weight"
                    />
                  </>
                ) : (
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    Not enough logs in range
                  </span>
                )
              )}
            </button>
            <button
              type="button"
              className="metric-summary-card"
              onClick={() => openDerivedMetric('bodyFat')}
              style={{ textAlign: 'left', cursor: 'pointer', width: '100%', font: 'inherit' }}
            >
              <span className="metric-label" style={{ color: 'var(--text-secondary)' }}>Body Fat</span>
              <span className="metric-value">{Number(current.bodyFat).toFixed(1)}%</span>
              {allBfCount >= 2 && (
                bodyFatSeries.length >= 2 ? (
                  <>
                    <TrendBadge values={bodyFatSeries} invertColor />
                    <MetricSparkline
                      values={bodyFatSeries}
                      color="#a3a3a3"
                      gradId="profile-spark-bf"
                    />
                  </>
                ) : (
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    Not enough logs in range
                  </span>
                )
              )}
            </button>
          </div>
        </section>

        {/* Derived Composition */}
        <section className="profile-section">
          <h3 style={sectionTitleStyle}>Derived Metrics</h3>
          <div className="profile-metric-grid-2">
            {derivedCards.map((item) => (
              <button
                key={item.key}
                type="button"
                className="metric-summary-card"
                onClick={() => openDerivedMetric(item.key)}
                style={{
                  textAlign: 'left',
                  cursor: 'pointer',
                  width: '100%',
                  font: 'inherit',
                }}
              >
                <span className="metric-label" style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
                <span className="metric-value">{item.value}</span>
                {item.totalSeries.length >= 2 && (
                  item.rangeSeries.length >= 2 ? (
                    <>
                      <TrendBadge values={item.rangeSeries} invertColor={item.invertColor} />
                      <MetricSparkline
                        values={item.rangeSeries}
                        color="#a3a3a3"
                        gradId={`profile-spark-derived-card-${item.key}`}
                      />
                    </>
                  ) : (
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Not enough logs in range
                    </span>
                  )
                )}
              </button>
            ))}
          </div>
        </section>

        {/* Core Biometrics + Metabolic Estimates */}
        <section className="profile-section">
          <h3 style={sectionTitleStyle}>Core Biometrics &amp; Energy Expenditure</h3>
          <div className="profile-metric-grid-3">
            <div className="metric-summary-card profile-static-card">
              <span className="metric-label" style={{ color: 'var(--text-secondary)' }}>Age</span>
              <span className="metric-value">{age !== null ? `${age} yrs` : '—'}</span>
            </div>
            <div className="metric-summary-card profile-static-card">
              <span className="metric-label" style={{ color: 'var(--text-secondary)' }}>Sex</span>
              <span className="metric-value">{current.sex || 'M'}</span>
            </div>
            <div className="metric-summary-card profile-static-card">
              <span className="metric-label" style={{ color: 'var(--text-secondary)' }}>Height</span>
              <span className="metric-value">{current.height || 0} cm</span>
            </div>
            <div className="metric-summary-card profile-static-card">
              <span className="metric-label" style={{ color: 'var(--text-secondary)' }}>Avg. Steps / Day</span>
              <span className="metric-value">{Number(current.avgSteps ?? 8000).toLocaleString()}</span>
            </div>
            <div className="metric-summary-card profile-static-card">
              <span className="metric-label" style={{ color: 'var(--text-secondary)' }}>BMR (Katch-McArdle)</span>
              <span className="metric-value">{Math.round(derived.bmr).toLocaleString()} kcal</span>
            </div>
            <div className="metric-summary-card profile-static-card">
              <span className="metric-label" style={{ color: 'var(--text-secondary)' }}>Estimated TDEE</span>
              <span className="metric-value">
                {Math.round(derived.tdeeData.tdee).toLocaleString()} kcal
              </span>
            </div>
          </div>
        </section>

        {/* Circumferences Mini Graph Cards */}
        <section className="profile-section">
          <h3 style={sectionTitleStyle}>Circumferences (cm)</h3>
          <div className="profile-metric-grid-3">
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

              const valText = field.bilateral
                ? `${Number(current[field.leftKey] || 0).toFixed(1)} / ${Number(current[field.rightKey] || 0).toFixed(1)} cm`
                : `${Number(current[field.key] || 0).toFixed(1)} cm`;

              return (
                <button
                  key={field.key}
                  type="button"
                  className="metric-summary-card"
                  onClick={() => openDerivedMetric(field.key)}
                  style={{ textAlign: 'left', cursor: 'pointer', width: '100%', font: 'inherit' }}
                >
                  <span className="metric-label" style={{ color: 'var(--text-secondary)' }}>{field.label}</span>
                  <span className="metric-value" style={{ fontSize: field.bilateral ? '1.1rem' : undefined }}>{valText}</span>
                  {hasAnyCircumferenceLogs && (
                    hasInRange ? (
                      <>
                        {field.bilateral ? (
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                            gap: '10px',
                            marginTop: '2px',
                          }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                              {leftData.series.length >= 2 && (
                                <>
                                  <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    fontSize: '0.68rem',
                                    fontWeight: 600,
                                    color: 'var(--text-muted)',
                                    whiteSpace: 'nowrap',
                                  }}>
                                    L <TrendBadge values={leftData.series} />
                                  </span>
                                  <MetricSparkline
                                    values={leftData.series}
                                    color="#a3a3a3"
                                    gradId={`profile-spark-${field.key}-left`}
                                    height={46}
                                  />
                                </>
                              )}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                              {rightData.series.length >= 2 && (
                                <>
                                  <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    fontSize: '0.68rem',
                                    fontWeight: 600,
                                    color: 'var(--text-muted)',
                                    whiteSpace: 'nowrap',
                                  }}>
                                    R <TrendBadge values={rightData.series} />
                                  </span>
                                  <MetricSparkline
                                    values={rightData.series}
                                    color="#a3a3a3"
                                    gradId={`profile-spark-${field.key}-right`}
                                    height={46}
                                  />
                                </>
                              )}
                            </div>
                          </div>
                        ) : (
                          <>
                            <TrendBadge values={singleData.series} invertColor={field.key === 'waist'} />
                            <MetricSparkline
                              values={singleData.series}
                              color="#a3a3a3"
                              gradId={`profile-spark-${field.key}`}
                            />
                          </>
                        )}
                      </>
                    ) : (
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        Not enough logs in range
                      </span>
                    )
                  )}
                </button>
              );
            })}
          </div>
        </section>
      </div>

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
            opacity: derivedModalVisible ? 1 : 0,
            transition: 'opacity 0.2s ease',
          }}
          onClick={closeDerivedMetric}
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
              transform: derivedModalVisible ? 'none' : 'translateY(16px)',
              transition: 'transform 0.2s ease',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
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
                <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>
                  {selectedMetricDetail.subtitle}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close metric details"
                onClick={closeDerivedMetric}
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
              {selectedMetricDetail.isBilateral && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setBilateralSide((prev) => (prev === 'left' ? 'right' : 'left'));
                      setMetricSliderPos(100);
                    }}
                    aria-label={`Switch to ${bilateralSide === 'left' ? 'Right' : 'Left'}`}
                    title={`Switch to ${bilateralSide === 'left' ? 'Right' : 'Left'}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '5px',
                      padding: '0 8px',
                      height: '24px',
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
                    <span style={{ transform: 'translateY(0.5px)' }}>{bilateralSide === 'left' ? 'LEFT' : 'RIGHT'}</span>
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
                      <path d="M11 2l3 3-3 3" />
                      <path d="M14 5H3" />
                      <path d="M5 14l-3-3 3-3" />
                      <path d="M2 11h11" />
                    </svg>
                  </button>
                </div>
              )}
              {selectedMetricDetail.series.length >= 2 ? (() => {
                const pts = selectedMetricDetail.series;
                const tMin = pts[0].t;
                const tMax = pts[pts.length - 1].t;
                const tRange = tMax - tMin;
                const targetT = tMin + (metricSliderPos / 100) * tRange;
                const sampledVal = sampleSparklineAtTime(pts, targetT);
                const sampledDate = formatDisplayDate(formatLocalYMD(new Date(targetT)), dateFormat);
                const xPct = tRange > 0 ? metricSliderPos : 100;

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '0.76rem',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '999px',
                        background: 'rgba(255, 255, 255, 0.06)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-secondary)',
                        fontWeight: 600,
                      }}>
                        {sampledDate}
                      </span>
                      <strong style={{ color: 'var(--text-primary)', fontSize: '0.84rem' }}>
                        {sampledVal.toFixed(1)}{selectedMetricDetail.unit}
                      </strong>
                    </div>
                    <div style={{ position: 'relative' }}>
                      <MetricSparkline
                        values={pts}
                        color="#a3a3a3"
                        gradId={`profile-spark-modal-${selectedMetricDetail.key}-${bilateralSide}`}
                        height={92}
                      />
                      <div
                        aria-hidden="true"
                        style={{
                          position: 'absolute',
                          top: 0,
                          bottom: 0,
                          left: `${xPct}%`,
                          borderLeft: '1.5px dashed rgba(255, 255, 255, 0.4)',
                          pointerEvents: 'none',
                        }}
                      />
                    </div>
                    <TensionRomSlider
                      value={metricSliderPos}
                      onChange={setMetricSliderPos}
                      leftLabel={pts[0].label}
                      rightLabel={pts[pts.length - 1].label}
                      ariaLabel="Metric timeline"
                    />
                  </div>
                );
              })() : (
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', padding: '12px 6px' }}>
                  {selectedMetricDetail.totalCount >= 2
                    ? 'Not enough logs in the selected time range.'
                    : `Log at least 2 ${selectedMetricDetail.emptyHint || selectedMetricDetail.title} entries to plot this graph.`}
                </p>
              )}
            </div>

            {selectedMetricDetail.math && (
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
            )}
          </div>
        </div>,
        document.body
      )}
    </div>,
    document.body
  );
}

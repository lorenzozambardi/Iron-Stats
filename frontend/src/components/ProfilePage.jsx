import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight } from 'lucide-react';
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

    const series = buildDerivedMetricSeries(logs, current, selectedDerivedMetric, cutoff)
      .map((pt) => ({ ...pt, label: formatDisplayDate(pt.date, dateFormat) }));
    const totalCount = buildDerivedMetricSeries(logs, current, selectedDerivedMetric, null).length;

    const configs = {
      bmi: {
        title: 'Body Mass Index (BMI)',
        subtitle: 'Weight (kg) relative to height squared (m²).',
        valueText: derived.bmi.toFixed(1),
        unit: '',
        invertColor: false,
        math: String.raw`\text{BMI} = \frac{W}{h^2}`,
      },
      ffmi: {
        title: 'Normalized FFMI',
        subtitle: 'Fat-free mass relative to height, normalized to 1.80 m.',
        valueText: derived.ffmiData.normalizedFfmi.toFixed(1),
        unit: '',
        invertColor: false,
        math: String.raw`\text{FFMI}_{\text{norm}} = \frac{\text{LBM}}{h^2} + 6.1(1.8 - h)`,
      },
      lbm: {
        title: 'Lean Body Mass (LBM)',
        subtitle: 'Estimated non-fat body mass from weight and body fat %.',
        valueText: `${derived.lbm.toFixed(1)} kg`,
        unit: ' kg',
        invertColor: false,
        math: String.raw`\text{LBM} = W\left(1 - \frac{\text{BF}\%}{100}\right)`,
      },
      fm: {
        title: 'Fat Mass',
        subtitle: 'Estimated adipose mass from weight and body fat %.',
        valueText: `${derived.fm.toFixed(1)} kg`,
        unit: ' kg',
        invertColor: true,
        math: String.raw`\text{FM} = W \cdot \frac{\text{BF}\%}{100}`,
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
          <h3 style={sectionTitleStyle}>Derived Metrics</h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '10px',
          }}>
            {derivedCards.map((item) => (
              <button
                key={item.key}
                type="button"
                className="metric-summary-card"
                onClick={() => openDerivedMetric(item.key)}
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  width: '100%',
                  font: 'inherit',
                }}
              >
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
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
                </div>
                <ChevronRight size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              </button>
            ))}
          </div>
        </div>

        {/* Core Biometrics + Metabolic Estimates */}
        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}>Core Biometrics &amp; Energy Expenditure</h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '10px',
          }}>
            <div className="profile-derived-box">
              <span className="profile-stat-label">Age</span>
              <span className="profile-derived-val">{age !== null ? `${age} yrs` : '—'}</span>
            </div>
            <div className="profile-derived-box">
              <span className="profile-stat-label">Sex</span>
              <span className="profile-derived-val">{current.sex || 'M'}</span>
            </div>
            <div className="profile-derived-box">
              <span className="profile-stat-label">Height</span>
              <span className="profile-derived-val">{current.height || 0} cm</span>
            </div>
            <div className="profile-derived-box">
              <span className="profile-stat-label">Avg. Steps / Day</span>
              <span className="profile-derived-val">{Number(current.avgSteps ?? 8000).toLocaleString()}</span>
            </div>
            <div className="profile-derived-box">
              <span className="profile-stat-label">BMR (Katch-McArdle)</span>
              <span className="profile-derived-val">{Math.round(derived.bmr).toLocaleString()} kcal</span>
            </div>
            <div className="profile-derived-box">
              <span className="profile-stat-label">Estimated TDEE</span>
              <span className="profile-derived-val">
                {Math.round(derived.tdeeData.tdee).toLocaleString()} kcal
              </span>
            </div>
          </div>
        </div>

        {/* Circumferences Mini Graph Cards */}
        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}>Circumferences (cm)</h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
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

              const valText = field.bilateral
                ? `${Number(current[field.leftKey] || 0).toFixed(1)} / ${Number(current[field.rightKey] || 0).toFixed(1)} cm`
                : `${Number(current[field.key] || 0).toFixed(1)} cm`;

              return (
                <div key={field.key} className="metric-summary-card">
                  <span className="metric-label" style={{ color: 'var(--text-secondary)' }}>{field.label}</span>
                  <span className="metric-value" style={{ fontSize: field.bilateral ? '1.05rem' : undefined }}>{valText}</span>
                  {hasAnyCircumferenceLogs && (
                    hasInRange ? (
                      <>
                        {field.bilateral ? (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            {leftData.series.length >= 2 && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                L <TrendBadge values={leftData.series} />
                              </span>
                            )}
                            {rightData.series.length >= 2 && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                R <TrendBadge values={rightData.series} />
                              </span>
                            )}
                          </div>
                        ) : (
                          <TrendBadge values={singleData.series} invertColor={field.key === 'waist'} />
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
                    )
                  )}
                </div>
              );
            })}
          </div>
        </div>
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
                        gradId={`profile-spark-derived-${selectedMetricDetail.key}`}
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

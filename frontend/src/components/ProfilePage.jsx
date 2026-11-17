import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { History, Plus, RotateCcw, Trash2 } from 'lucide-react';
import ProfileRadarChart from './ProfileRadarChart';
import {
  ACTIVITY_LEVELS,
  CIRCUMFERENCE_FIELDS,
  DEFAULT_PROFILE,
  calcBMI,
  getBMICategory,
  calcLeanMass,
  calcFatMass,
  calcFFMI,
  calcKatchMcArdleBMR,
  calcWaistToHeight,
  calcVTaper,
  calcChestToWaist,
  computeRadarAxes,
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

export default function ProfilePage({ profile, setProfile, onBack }) {
  const [visible, setVisible] = useState(false);
  const [compareMode, setCompareMode] = useState('target'); // 'target' | 'previous'

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

  const { current, targets, history } = profile;

  const updateCurrent = (key, rawVal) => {
    const val = parseFloat(rawVal);
    setProfile((prev) => ({
      ...prev,
      current: {
        ...prev.current,
        [key]: Number.isFinite(val) ? val : 0,
      },
    }));
  };

  const updateTarget = (key, rawVal) => {
    const val = parseFloat(rawVal);
    setProfile((prev) => ({
      ...prev,
      targets: {
        ...prev.targets,
        [key]: Number.isFinite(val) ? val : 0,
      },
    }));
  };

  const handleSaveCheckin = () => {
    const entry = {
      id: `${Date.now()}`,
      date: new Date().toISOString().slice(0, 10),
      ...current,
    };
    setProfile((prev) => ({
      ...prev,
      history: [entry, ...(prev.history || [])].slice(0, 50),
    }));
  };

  const handleDeleteHistory = (id) => {
    setProfile((prev) => ({
      ...prev,
      history: (prev.history || []).filter((item) => item.id !== id),
    }));
  };

  const handleResetDefaults = () => {
    setProfile(structuredClone(DEFAULT_PROFILE));
  };

  const derived = useMemo(() => {
    const bmi = calcBMI(current.weight, current.height);
    const bmiCategory = getBMICategory(bmi);
    const lbm = calcLeanMass(current.weight, current.bodyFat);
    const fm = calcFatMass(current.weight, current.bodyFat);
    const ffmiData = calcFFMI(current.weight, current.height, current.bodyFat);
    const bmr = calcKatchMcArdleBMR(lbm);
    const tdee = bmr * (Number(current.activityFactor) || 1.55);
    const whtr = calcWaistToHeight(current.waist, current.height);
    const vTaper = calcVTaper(current.shoulders, current.waist);
    const chestWaist = calcChestToWaist(current.chest, current.waist);
    const armCalfRatio = current.calf > 0 ? current.arm / current.calf : 0;

    return {
      bmi,
      bmiCategory,
      lbm,
      fm,
      ffmiData,
      bmr,
      tdee,
      whtr,
      vTaper,
      chestWaist,
      armCalfRatio,
    };
  }, [current]);

  const hasPrevious = history && history.length > 0;
  const activeCompare = compareMode === 'previous' && hasPrevious ? history[0] : targets;
  const compareLabel = compareMode === 'previous' && hasPrevious
    ? `Prev (${history[0].date})`
    : 'Target';

  const radarAxes = useMemo(
    () => computeRadarAxes(current, activeCompare),
    [current, activeCompare]
  );

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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <span style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--accent-primary)',
              }}>
                Athlete Profile
              </span>
              <h2 style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.6rem',
                fontWeight: 700,
                margin: '2px 0 4px 0',
                color: 'var(--text-primary)',
                lineHeight: 1.2,
              }}>
                Body Composition &amp; Proportions
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.84rem', margin: 0 }}>
                Track biometrics, circumferences, FFMI, metabolic estimates, and aesthetic ratios.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{ padding: '7px 14px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                onClick={handleSaveCheckin}
              >
                <Plus size={14} /> Save Check-in
              </button>
              <button
                type="button"
                className="btn"
                style={{ padding: '7px 12px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                onClick={handleResetDefaults}
                title="Reset to default sample values"
              >
                <RotateCcw size={13} /> Reset
              </button>
            </div>
          </div>
        </div>

        {/* Radar + Ratios Card */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '14px',
        }}>
          {/* Polygon Radar Card */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h3 style={sectionTitleStyle}>Physique Radar</h3>
              {hasPrevious && (
                <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.04)', padding: '3px', borderRadius: '99px', border: '1px solid var(--border-color)' }}>
                  <button
                    type="button"
                    onClick={() => setCompareMode('target')}
                    style={{
                      padding: '3px 10px',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      borderRadius: '99px',
                      border: 'none',
                      cursor: 'pointer',
                      background: compareMode === 'target' ? 'var(--accent-primary)' : 'transparent',
                      color: compareMode === 'target' ? '#fff' : 'var(--text-secondary)',
                    }}
                  >
                    vs Target
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompareMode('previous')}
                    style={{
                      padding: '3px 10px',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      borderRadius: '99px',
                      border: 'none',
                      cursor: 'pointer',
                      background: compareMode === 'previous' ? 'var(--accent-primary)' : 'transparent',
                      color: compareMode === 'previous' ? '#fff' : 'var(--text-secondary)',
                    }}
                  >
                    vs Previous
                  </button>
                </div>
              )}
            </div>
            <ProfileRadarChart
              axes={radarAxes}
              labelA="Current"
              labelB={compareLabel}
              showLegend
            />
          </div>

          {/* Derived Composition & Aesthetic Ratios */}
          <div style={cardStyle}>
            <h3 style={sectionTitleStyle}>Derived Metrics &amp; Ratios</h3>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '10px',
            }}>
              <div className="profile-derived-box">
                <span className="profile-stat-label">BMI</span>
                <span className="profile-derived-val">{derived.bmi.toFixed(1)}</span>
                <span className="profile-stat-sub">{derived.bmiCategory}</span>
              </div>
              <div className="profile-derived-box">
                <span className="profile-stat-label">Norm. FFMI</span>
                <span className="profile-derived-val" style={{ color: 'var(--accent-primary)' }}>
                  {derived.ffmiData.normalizedFfmi.toFixed(1)}
                </span>
                <span className="profile-stat-sub">
                  Raw {derived.ffmiData.ffmi.toFixed(1)} · {derived.ffmiData.category}
                </span>
              </div>
              <div className="profile-derived-box">
                <span className="profile-stat-label">Lean Mass (LBM)</span>
                <span className="profile-derived-val">{derived.lbm.toFixed(1)} kg</span>
                <span className="profile-stat-sub">{(100 - current.bodyFat).toFixed(1)}% of weight</span>
              </div>
              <div className="profile-derived-box">
                <span className="profile-stat-label">Fat Mass</span>
                <span className="profile-derived-val" style={{ color: 'var(--accent-secondary)' }}>
                  {derived.fm.toFixed(1)} kg
                </span>
                <span className="profile-stat-sub">{Number(current.bodyFat).toFixed(1)}% BF</span>
              </div>
              <div className="profile-derived-box">
                <span className="profile-stat-label">V-Taper (Sh / Waist)</span>
                <span className="profile-derived-val">{derived.vTaper.toFixed(2)}</span>
                <span className="profile-stat-sub">Ideal ≈ 1.62</span>
              </div>
              <div className="profile-derived-box">
                <span className="profile-stat-label">Waist / Height</span>
                <span className="profile-derived-val">{derived.whtr.toFixed(2)}</span>
                <span className="profile-stat-sub">{derived.whtr < 0.5 ? 'Optimal (<0.50)' : 'Above 0.50'}</span>
              </div>
              <div className="profile-derived-box">
                <span className="profile-stat-label">Chest / Waist</span>
                <span className="profile-derived-val">{derived.chestWaist.toFixed(2)}</span>
                <span className="profile-stat-sub">Ideal ≈ 1.40</span>
              </div>
              <div className="profile-derived-box">
                <span className="profile-stat-label">Arm / Calf Ratio</span>
                <span className="profile-derived-val">{derived.armCalfRatio.toFixed(2)}</span>
                <span className="profile-stat-sub">Symmetry ≈ 1.00</span>
              </div>
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
              <span className="profile-stat-label">Weight (kg)</span>
              <input
                type="number"
                step="0.1"
                min="20"
                max="300"
                style={inputStyle}
                value={current.weight}
                onChange={(e) => updateCurrent('weight', e.target.value)}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <span className="profile-stat-label">Target Weight (kg)</span>
              <input
                type="number"
                step="0.1"
                min="20"
                max="300"
                style={inputStyle}
                value={targets.weight}
                onChange={(e) => updateTarget('weight', e.target.value)}
              />
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
            <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <span className="profile-stat-label">Body Fat (%)</span>
              <input
                type="number"
                step="0.1"
                min="3"
                max="60"
                style={inputStyle}
                value={current.bodyFat}
                onChange={(e) => updateCurrent('bodyFat', e.target.value)}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <span className="profile-stat-label">Target BF (%)</span>
              <input
                type="number"
                step="0.1"
                min="3"
                max="60"
                style={inputStyle}
                value={targets.bodyFat}
                onChange={(e) => updateTarget('bodyFat', e.target.value)}
              />
            </label>
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
              <span className="profile-derived-val" style={{ color: 'var(--color-tonnage)' }}>
                {Math.round(derived.tdee).toLocaleString()} kcal
              </span>
              <span className="profile-stat-sub">Daily maintenance</span>
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <span className="profile-stat-label">Activity Multiplier</span>
              <select
                style={inputStyle}
                value={current.activityFactor || 1.55}
                onChange={(e) => updateCurrent('activityFactor', e.target.value)}
              >
                {ACTIVITY_LEVELS.map((lvl) => (
                  <option key={lvl.value} value={lvl.value}>
                    {lvl.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* Circumferences Table/Grid */}
        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}>Circumferences (cm)</h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '10px',
          }}>
            {CIRCUMFERENCE_FIELDS.map((field) => {
              const curVal = Number(current[field.key] || 0);
              const tgtVal = field.hasTarget ? Number(targets[field.key] || 0) : null;
              const diff = tgtVal !== null ? curVal - tgtVal : null;
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
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {field.label}
                    </span>
                    {diff !== null && (
                      <span style={{
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        color: field.key === 'waist'
                          ? (diff <= 0 ? '#10b981' : 'var(--text-muted)')
                          : (diff >= 0 ? '#10b981' : 'var(--accent-secondary)'),
                      }}>
                        {diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)} cm vs goal
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: field.hasTarget ? '1fr 1fr' : '1fr', gap: '8px' }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                        Current
                      </span>
                      <input
                        type="number"
                        step="0.5"
                        min="10"
                        max="250"
                        style={inputStyle}
                        value={current[field.key] ?? ''}
                        onChange={(e) => updateCurrent(field.key, e.target.value)}
                      />
                    </label>
                    {field.hasTarget && (
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                          Target
                        </span>
                        <input
                          type="number"
                          step="0.5"
                          min="10"
                          max="250"
                          style={inputStyle}
                          value={targets[field.key] ?? ''}
                          onChange={(e) => updateTarget(field.key, e.target.value)}
                        />
                      </label>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Check-in History */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ ...sectionTitleStyle, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <History size={14} /> Check-in History
            </h3>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
              {history?.length || 0} saved
            </span>
          </div>

          {!history || history.length === 0 ? (
            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', margin: 0 }}>
              No check-ins recorded yet. Click &ldquo;Save Check-in&rdquo; above to log a snapshot and unlock &ldquo;vs Previous&rdquo; radar comparisons.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {history.map((entry) => {
                const entryLbm = calcLeanMass(entry.weight, entry.bodyFat);
                const entryFfmi = calcFFMI(entry.weight, entry.height, entry.bodyFat).normalizedFfmi;
                return (
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
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-primary)', minWidth: '88px' }}>
                      {entry.date}
                    </span>
                    <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', fontSize: '0.82rem', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                      <span><strong style={{ color: 'var(--text-primary)' }}>{Number(entry.weight).toFixed(1)}</strong> kg</span>
                      <span><strong style={{ color: 'var(--text-primary)' }}>{Number(entry.bodyFat).toFixed(1)}%</strong> BF</span>
                      <span>LBM <strong style={{ color: 'var(--text-primary)' }}>{entryLbm.toFixed(1)}</strong> kg</span>
                      <span>FFMI <strong style={{ color: 'var(--text-primary)' }}>{entryFfmi.toFixed(1)}</strong></span>
                      <span>Waist <strong style={{ color: 'var(--text-primary)' }}>{Number(entry.waist).toFixed(1)}</strong> cm</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteHistory(entry.id)}
                      aria-label={`Delete check-in ${entry.date}`}
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
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

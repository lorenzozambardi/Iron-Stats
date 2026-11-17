import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  CIRCUMFERENCE_FIELDS,
  calcBMI,
  getBMICategory,
  calcLeanMass,
  calcFatMass,
  calcFFMI,
  calcKatchMcArdleBMR,
  calcTDEEFromSteps,
  calcWaistToHeight,
  calcVTaper,
  calcChestToWaist,
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

  const { current } = profile;

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

  const derived = useMemo(() => {
    const bmi = calcBMI(current.weight, current.height);
    const bmiCategory = getBMICategory(bmi);
    const lbm = calcLeanMass(current.weight, current.bodyFat);
    const fm = calcFatMass(current.weight, current.bodyFat);
    const ffmiData = calcFFMI(current.weight, current.height, current.bodyFat);
    const bmr = calcKatchMcArdleBMR(lbm);
    const tdeeData = calcTDEEFromSteps({
      bmr,
      weightKg: current.weight,
      avgSteps: current.avgSteps,
    });
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
      tdeeData,
      whtr,
      vTaper,
      chestWaist,
      armCalfRatio,
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

        {/* Derived Composition & Aesthetic Ratios */}
        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}>Derived Metrics &amp; Ratios</h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '10px',
          }}>
              <div className="profile-derived-box">
                <span className="profile-stat-label">BMI</span>
                <span className="profile-derived-val">{derived.bmi.toFixed(1)}</span>
                <span className="profile-stat-sub">{derived.bmiCategory}</span>
              </div>
              <div className="profile-derived-box">
                <span className="profile-stat-label">Norm. FFMI</span>
                <span className="profile-derived-val">
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
                <span className="profile-derived-val">
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

        {/* Core Biometrics + Metabolic Estimates */}
        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}>Core Biometrics &amp; Energy Expenditure</h3>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '12px',
          }}>
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
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '10px',
          }}>
            {CIRCUMFERENCE_FIELDS.map((field) => (
              <label
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
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

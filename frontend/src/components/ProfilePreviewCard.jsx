import React, { useMemo } from 'react';
import { ChevronRight, User } from 'lucide-react';
import ProfileRadarChart from './ProfileRadarChart';
import {
  calcBMI,
  calcFFMI,
  computeRadarAxes,
} from '../profileUtils';

const PREVIEW_CIRCUMFERENCES = [
  { key: 'shoulders', label: 'Shoulders' },
  { key: 'chest', label: 'Chest' },
  { key: 'waist', label: 'Waist' },
  { key: 'arm', label: 'Arms' },
  { key: 'thigh', label: 'Thighs' },
  { key: 'calf', label: 'Calves' },
];

const ProfilePreviewCard = React.memo(({ profile, isMobile, onOpen }) => {
  const { current, targets } = profile;

  const { bmi, ffmiData, radarAxes } = useMemo(() => {
    const bmiVal = calcBMI(current.weight, current.height);
    const ffmi = calcFFMI(current.weight, current.height, current.bodyFat);
    const axes = computeRadarAxes(current, targets);
    return { bmi: bmiVal, ffmiData: ffmi, radarAxes: axes };
  }, [current, targets]);

  const primaryStats = [
    { label: 'Weight', value: `${Number(current.weight).toFixed(1)} kg`, accent: 'var(--text-primary)' },
    { label: 'Height', value: `${Math.round(current.height)} cm`, accent: 'var(--text-primary)' },
    { label: 'Body Fat', value: `${Number(current.bodyFat).toFixed(1)}%`, accent: 'var(--accent-secondary)' },
    { label: 'BMI', value: bmi ? bmi.toFixed(1) : '—', accent: 'var(--text-primary)' },
    {
      label: 'FFMI',
      value: ffmiData.normalizedFfmi ? ffmiData.normalizedFfmi.toFixed(1) : '—',
      sub: ffmiData.category,
      accent: 'var(--accent-primary)',
    },
  ];

  return (
    <div
      className="profile-preview-card"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label="Open full athlete profile"
    >
      {/* Header Row */}
      <div className="profile-preview-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="profile-preview-icon">
            <User size={15} />
          </span>
          <span className="metric-label" style={{ color: 'var(--accent-primary)', margin: 0 }}>
            Profile
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>
            · Biometrics &amp; Proportions
          </span>
        </div>
        <span className="profile-preview-cta">
          Full Profile <ChevronRight size={14} />
        </span>
      </div>

      {/* Main Content: Stats + Circumferences on Left, Radar Polygon on Right */}
      <div
        className="profile-preview-body"
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1.15fr 0.85fr',
          gap: isMobile ? '14px' : '20px',
          alignItems: 'center',
        }}
      >
        {/* Left column: Primary Stats + Circumferences */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>
          {/* 5 Primary Stats */}
          <div className="profile-stats-row">
            {primaryStats.map((stat) => (
              <div key={stat.label} className="profile-stat-pill">
                <span className="profile-stat-label">{stat.label}</span>
                <span className="profile-stat-value" style={{ color: stat.accent }}>
                  {stat.value}
                </span>
                {stat.sub && (
                  <span className="profile-stat-sub">{stat.sub}</span>
                )}
              </div>
            ))}
          </div>

          {/* Circumferences Summary */}
          <div className="profile-circ-section">
            <div className="profile-circ-title">Circumferences</div>
            <div className="profile-circ-grid">
              {PREVIEW_CIRCUMFERENCES.map((item) => (
                <div key={item.key} className="profile-circ-chip">
                  <span className="profile-circ-chip-label">{item.label}</span>
                  <span className="profile-circ-chip-val">
                    {Number(current[item.key] || 0).toFixed(1)} <small>cm</small>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column: Hexagonal Radar Chart */}
        <div className="profile-preview-chart-wrap">
          <ProfileRadarChart
            axes={radarAxes}
            compact
            labelA="Current"
            labelB="Target"
            showLegend
          />
        </div>
      </div>
    </div>
  );
});

export default ProfilePreviewCard;

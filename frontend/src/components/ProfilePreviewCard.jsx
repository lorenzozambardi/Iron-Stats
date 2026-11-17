import React, { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
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
    { label: 'BF', value: `${Number(current.bodyFat).toFixed(1)}%`, accent: 'var(--accent-secondary)' },
    { label: 'BMI', value: bmi ? bmi.toFixed(1) : '—', accent: 'var(--text-primary)' },
    { label: 'FFMI', value: ffmiData.normalizedFfmi ? ffmiData.normalizedFfmi.toFixed(1) : '—', accent: 'var(--accent-primary)' },
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
      <div className="profile-preview-header">
        <span className="metric-label" style={{ color: 'var(--accent-primary)', margin: 0 }}>
          Profile
        </span>
        <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1.2fr 0.8fr',
          gap: isMobile ? '10px' : '16px',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>
          <div className="profile-stats-row">
            {primaryStats.map((stat) => (
              <div key={stat.label} className="profile-stat-compact">
                <span className="profile-stat-label">{stat.label}</span>
                <span className="profile-stat-value" style={{ color: stat.accent }}>
                  {stat.value}
                </span>
              </div>
            ))}
          </div>

          <div className="profile-circ-inline">
            {PREVIEW_CIRCUMFERENCES.map((item) => (
              <span key={item.key} className="profile-circ-inline-item">
                <span className="profile-circ-chip-label">{item.label}</span>{' '}
                <strong className="profile-circ-chip-val">
                  {Number(current[item.key] || 0).toFixed(1)}
                </strong>
                <small>cm</small>
              </span>
            ))}
          </div>
        </div>

        <div className="profile-preview-chart-wrap">
          <ProfileRadarChart
            axes={radarAxes}
            compact
            showLegend={false}
          />
        </div>
      </div>
    </div>
  );
});

export default ProfilePreviewCard;

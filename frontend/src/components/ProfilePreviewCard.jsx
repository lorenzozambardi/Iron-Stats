import React, { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { CIRCUMFERENCE_FIELDS, calcBMI, calcFFMI, getLimbAverage } from '../profileUtils';

const PREVIEW_CIRCUMFERENCES = [
  { key: 'shoulders', label: 'Shoulders' },
  { key: 'chest', label: 'Chest' },
  { key: 'waist', label: 'Waist' },
  { key: 'arm', label: 'Arms' },
  { key: 'thigh', label: 'Thighs' },
  { key: 'calf', label: 'Calves' },
];

const fmtNum = (val, decimals = 1, fallback = '—') => {
  const n = Number(val);
  return Number.isFinite(n) ? n.toFixed(decimals) : fallback;
};

const ProfilePreviewCard = React.memo(({ profile, onOpen }) => {
  const { current } = profile;

  const { bmi, ffmiVal } = useMemo(() => {
    const bmiNum = calcBMI(current.weight, current.height);
    const ffmi = calcFFMI(current.weight, current.height, current.bodyFat);
    return {
      bmi: bmiNum ? bmiNum.toFixed(1) : '—',
      ffmiVal: ffmi.normalizedFfmi ? ffmi.normalizedFfmi.toFixed(1) : '—',
    };
  }, [current]);

  const heightNum = Number(current.height);
  const primaryStats = [
    { label: 'Height', value: Number.isFinite(heightNum) && heightNum > 0 ? `${Math.round(heightNum)}` : '—', unit: 'cm' },
    { label: 'Weight', value: fmtNum(current.weight, 1), unit: 'kg' },
    { label: 'BMI', value: bmi, unit: '' },
    { label: 'BF', value: fmtNum(current.bodyFat, 1), unit: '%' },
    { label: 'FFMI', value: ffmiVal, unit: '' },
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
        <span className="metric-label" style={{ color: 'var(--text-primary)', margin: 0 }}>
          Profile
        </span>
        <ChevronRight size={16} style={{ color: 'var(--text-secondary)' }} />
      </div>

      {/* Single-row 5-column primary stats */}
      <div className="profile-stats-row">
        {primaryStats.map((stat) => (
          <div key={stat.label} className="profile-stat-compact">
            <span className="profile-stat-label">{stat.label}</span>
            <span className="profile-stat-value">
              {stat.value}
              {stat.unit && <small className="profile-stat-unit">{stat.unit}</small>}
            </span>
          </div>
        ))}
      </div>

      {/* Symmetric 3x2 circumferences grid */}
      <div className="profile-circ-summary-grid">
        {PREVIEW_CIRCUMFERENCES.map((item) => {
          const field = CIRCUMFERENCE_FIELDS.find((f) => f.key === item.key);
          const val = field ? getLimbAverage(current, field) : Number(current[item.key] || 0);
          return (
            <div key={item.key} className="profile-circ-summary-item">
              <span className="profile-circ-chip-label">{item.label}</span>
              <span className="profile-circ-chip-val">
                {fmtNum(val, 1, '0.0')}
                <small> cm</small>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default ProfilePreviewCard;

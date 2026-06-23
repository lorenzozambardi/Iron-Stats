import React from 'react';

const renderVolumeTooltip = () => (
  <div className="info-tooltip" style={{ textAlign: 'left' }}>
    <div style={{ fontWeight: 'bold', marginBottom: '4px', color: 'var(--color-volume)', fontSize: '0.8rem' }}>Volume</div>
    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
      Sums the repetitions of all sets
    </div>
  </div>
);

const renderTonnageTooltip = () => (
  <div className="info-tooltip" style={{ textAlign: 'left' }}>
    <div style={{ fontWeight: 'bold', marginBottom: '4px', color: 'var(--color-tonnage)', fontSize: '0.8rem' }}>Tonnage</div>
    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
      Sums the weight lifted per set adjusted for leverage and distribution
    </div>
  </div>
);

const renderEffectiveTonnageTooltip = () => (
  <div className="info-tooltip" style={{ textAlign: 'left' }}>
    <div style={{ fontWeight: 'bold', marginBottom: '4px', color: 'var(--color-effective-tonnage)', fontSize: '0.8rem' }}>Effective Tonnage</div>
    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
      Sums the weight lifted adjusted for leverage, distribution, and hypertrophy-stimulative effective repetitions
    </div>
  </div>
);

const renderEffectiveRepsTooltip = () => (
  <div className="info-tooltip" style={{ textAlign: 'left' }}>
    <div style={{ fontWeight: 'bold', marginBottom: '4px', color: 'var(--accent-secondary)', fontSize: '0.8rem' }}>Effective Reps</div>
    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
      Sums the final, most stimulative repetitions of each set
    </div>
  </div>
);

const renderTutTooltip = () => (
  <div className="info-tooltip" style={{ textAlign: 'left' }}>
    <div style={{ fontWeight: 'bold', marginBottom: '4px', color: 'var(--color-tut)', fontSize: '0.8rem' }}>TUT</div>
    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
      Cumulative time under tension for all repetitions
    </div>
  </div>
);

const renderEffectiveTutTooltip = () => (
  <div className="info-tooltip" style={{ textAlign: 'left' }}>
    <div style={{ fontWeight: 'bold', marginBottom: '4px', color: 'var(--color-effective-tut)', fontSize: '0.8rem' }}>Effective TUT</div>
    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
      Sums the time under tension for the effective repetitions of each set
    </div>
  </div>
);

const renderFatigueTooltip = () => (
  <div className="info-tooltip" style={{ textAlign: 'left' }}>
    <div style={{ fontWeight: 'bold', marginBottom: '4px', color: 'var(--color-fatigue)', fontSize: '0.8rem' }}>Accumulated Fatigue</div>
    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
      Tracks cumulative neuromuscular fatigue per repetition
    </div>
  </div>
);

const renderSetsTooltip = () => (
  <div className="info-tooltip" style={{ textAlign: 'left' }}>
    <div style={{ fontWeight: 'bold', marginBottom: '4px', color: 'var(--color-sets)', fontSize: '0.8rem' }}>Sets</div>
    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
      Sums the total number of sets performed
    </div>
  </div>
);

const renderMetricTooltip = (cls) => {
  switch (cls) {
    case 'volume':
      return renderVolumeTooltip();
    case 'tonnage':
      return renderTonnageTooltip();
    case 'effective-tonnage':
      return renderEffectiveTonnageTooltip();
    case 'effective':
      return renderEffectiveRepsTooltip();
    case 'tut':
      return renderTutTooltip();
    case 'effective-tut':
      return renderEffectiveTutTooltip();
    case 'fatigue':
      return renderFatigueTooltip();
    case 'sets':
      return renderSetsTooltip();
    default:
      return null;
  }
};


export { renderMetricTooltip };

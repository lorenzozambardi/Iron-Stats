import React, { useEffect, useState } from 'react';
import { ChevronRight, Sparkles } from 'lucide-react';
import { useAnalyticsSettings } from './useAnalyticsSettings.js';
import { getLatestReport } from '../storage/reportStore.js';
import { formatDisplayDate } from '../../profileUtils.js';

const SmartAnalyticsPreviewCard = React.memo(({ onOpen, programsCount = 0, dateFormat = 'dd/mm/yyyy' }) => {
  const { hasKey, keyLoaded } = useAnalyticsSettings();
  const [latest, setLatest] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getLatestReport()
      .then((rep) => {
        if (!cancelled) setLatest(rep);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [programsCount]);

  let badgeText = 'Ready';
  let badgeClass = 'info';
  let subtitle = 'Autonomous DeepSeek agent to uncover hidden trends, correlations & bottlenecks across your macrocycles.';

  if (keyLoaded && !hasKey) {
    badgeText = 'Set up';
    badgeClass = 'warn';
    subtitle = 'Connect your DeepSeek API key in Settings or inspect local computed signals offline.';
  } else if (latest) {
    const dt = latest.generatedAt ? formatDisplayDate(latest.generatedAt.slice(0, 10), dateFormat) : '';
    const count = Array.isArray(latest.insights) ? latest.insights.length : 0;
    badgeText = `${count} insight${count === 1 ? '' : 's'} • ${dt}`;
    badgeClass = 'good';
    subtitle = latest.summary?.headline?.replace(/\{\{[^}]+\}\}/g, '•••') || subtitle;
  }

  return (
    <div
      className="profile-preview-card sa-preview-card"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label="Open Smart Analytics"
    >
      <div className="profile-preview-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <span className="profile-preview-icon">
            <Sparkles size={15} />
          </span>
          <span className="card-title" style={{ margin: 0, fontSize: '0.88rem', letterSpacing: '0.04em' }}>
            SMART ANALYTICS
          </span>
          <span className={`sa-mini-badge ${badgeClass}`}>{badgeText}</span>
        </div>
        <span className="profile-preview-cta">
          Open <ChevronRight size={14} />
        </span>
      </div>

      <div className="sa-preview-subtitle">{subtitle}</div>
    </div>
  );
});

SmartAnalyticsPreviewCard.displayName = 'SmartAnalyticsPreviewCard';

export default SmartAnalyticsPreviewCard;

import React from 'react';
import { getMinMax } from './helpers';

const getVal = (item) => (typeof item === 'number' ? item : item?.v ?? 0);

export const TrendBadge = React.memo(({ values, invertColor = false }) => {
  if (!values || values.length < 2) return null;
  const first = getVal(values[0]);
  const last = getVal(values[values.length - 1]);
  if (first === 0) return null;
  const pct = ((last - first) / Math.abs(first)) * 100;
  const pos = pct >= 0;
  const isGood = invertColor ? !pos : pos;
  return (
    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: isGood ? '#10b981' : '#f43f5e', lineHeight: 1.1 }}>
      {pos ? '▲' : '▼'} {Math.abs(pct).toFixed(2)}%
    </span>
  );
});

const buildSparklinePath = (vals, w, h, padY, min, range, linear = false) => {
  const hasTimestamps =
    vals.length >= 2 &&
    vals.every((item) => typeof item === 'object' && item !== null && Number.isFinite(item.t));
  let tMin = 0;
  let tRange = 0;
  if (hasTimestamps) {
    tMin = vals[0].t;
    let tMax = vals[0].t;
    for (let i = 1; i < vals.length; i++) {
      if (vals[i].t < tMin) tMin = vals[i].t;
      if (vals[i].t > tMax) tMax = vals[i].t;
    }
    tRange = tMax - tMin;
  }

  const pts = vals.map((item, i) => {
    const v = getVal(item);
    const x = hasTimestamps && tRange > 0
      ? ((item.t - tMin) / tRange) * w
      : (vals.length > 1 ? (i / (vals.length - 1)) * w : w / 2);
    const y = range > 0
      ? h - padY - ((v - min) / range) * (h - padY * 2)
      : h / 2;
    return [x, y];
  });
  let linePath = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    if (linear) {
      linePath += ` L${x1.toFixed(1)},${y1.toFixed(1)}`;
    } else {
      const cx = (x0 + x1) / 2;
      linePath += ` C${cx.toFixed(1)},${y0.toFixed(1)} ${cx.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
    }
  }
  return linePath;
};

export const MetricSparkline = React.memo(({ values, compareValues, color, compareColor = 'var(--accent-secondary)', gradId, height = 58, linear = false }) => {
  const hasA = values && values.length >= 2;
  const hasB = compareValues && compareValues.length >= 2;
  if (!hasA && !hasB) return null;

  const w = 120;
  const h = 60;
  const padY = 2;
  const { min, range } = getMinMax(values, compareValues, hasA, hasB);

  const linePathA = hasA ? buildSparklinePath(values, w, h, padY, min, range, linear) : null;
  const areaPathA = linePathA ? `${linePathA} L${w},${h} L0,${h} Z` : null;
  const linePathB = hasB ? buildSparklinePath(compareValues, w, h, padY, min, range, linear) : null;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: `${height}px`, display: 'block', marginTop: '4px', overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.26" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {areaPathA && <path d={areaPathA} fill={`url(#${gradId})`} />}
      {linePathB && (
        <path
          d={linePathB}
          fill="none"
          stroke={compareColor}
          strokeWidth="1.75"
          strokeDasharray="4 3"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {linePathA && (
        <path
          d={linePathA}
          fill="none"
          stroke={color}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
});

export const MetricBarSparkline = React.memo(({
  values,
  compareValues,
  color,
  compareColor = 'var(--accent-secondary)',
  height = 58,
  activeIndex = null,
}) => {
  const hasB = compareValues && compareValues.length >= 1;
  const hasA = values && (hasB ? values.length >= 1 : values.length >= 2);
  if (!hasA && !hasB) return null;

  const len = Math.max(hasA ? values.length : 0, hasB ? compareValues.length : 0);
  const { min: minVal, range } = getMinMax(values, compareValues, hasA, hasB);
  const maxBarH = Math.max(16, height - 18);
  const minBarH = Math.round(height * 0.24);

  const barHeight = (v) => {
    if (v <= 0) return 0;
    if (range <= 0) return Math.round(height * 0.5);
    return minBarH + ((v - minVal) / range) * (maxBarH - minBarH);
  };

  const hasActive = Number.isInteger(activeIndex);
  const bars = [];
  for (let i = 0; i < len; i++) {
    const vA = hasA && i < values.length ? getVal(values[i]) : 0;
    const vB = hasB && i < compareValues.length ? getVal(compareValues[i]) : 0;
    const hA = barHeight(vA);
    const hB = barHeight(vB);
    const isActive = hasActive && i === activeIndex;
    const opacityA = hasActive ? (isActive ? 1 : 0.35) : 0.85;
    const opacityB = hasActive ? (isActive ? 0.95 : 0.28) : 0.72;
    bars.push(
      <div key={i} style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '2px' }}>
        {hasA && (
          <div style={{ flex: 1, maxWidth: hasActive ? '14px' : '8px', height: `${hA}px`, background: color, borderRadius: '3px 3px 1px 1px', opacity: opacityA, transition: 'opacity 0.1s ease' }} />
        )}
        {hasB && (
          <div style={{ flex: 1, maxWidth: hasActive ? '14px' : '8px', height: `${hB}px`, background: compareColor, borderRadius: '3px 3px 1px 1px', opacity: opacityB, transition: 'opacity 0.1s ease' }} />
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: len > 10 ? '4px' : '5px', width: '100%', height: `${height}px`, marginTop: '4px' }}>
      {bars}
    </div>
  );
});

import React from 'react';
import { getMinMax } from './helpers';

const getVal = (item) => (typeof item === 'number' ? item : item?.v ?? 0);

export const TrendBadge = React.memo(({ values, invertColor = false }) => {
  if (!values || values.length < 2) return null;
  const first = getVal(values[0]);
  const last = getVal(values[values.length - 1]);
  if (first === 0) return null;
  const pct = ((last - first) / first) * 100;
  const pos = pct >= 0;
  const isGood = invertColor ? !pos : pos;
  return (
    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: isGood ? '#10b981' : '#f43f5e', lineHeight: 1.1 }}>
      {pos ? '▲' : '▼'} {Math.abs(pct).toFixed(2)}%
    </span>
  );
});

const buildSparklinePath = (vals, w, h, padY, min, range) => {
  const hasTimestamps = typeof vals[0] === 'object' && vals[0] !== null && Number.isFinite(vals[0].t);
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
    const cx = (x0 + x1) / 2;
    linePath += ` C${cx.toFixed(1)},${y0.toFixed(1)} ${cx.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return linePath;
};

export const MetricSparkline = React.memo(({ values, compareValues, color, compareColor = 'var(--accent-secondary)', gradId }) => {
  const hasA = values && values.length >= 2;
  const hasB = compareValues && compareValues.length >= 2;
  if (!hasA && !hasB) return null;

  const w = 120;
  const h = 60;
  const padY = 2;
  const { min, range } = getMinMax(values, compareValues, hasA, hasB);

  const linePathA = hasA ? buildSparklinePath(values, w, h, padY, min, range) : null;
  const areaPathA = linePathA ? `${linePathA} L${w},${h} L0,${h} Z` : null;
  const linePathB = hasB ? buildSparklinePath(compareValues, w, h, padY, min, range) : null;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: '58px', display: 'block', marginTop: '4px', overflow: 'visible' }}
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

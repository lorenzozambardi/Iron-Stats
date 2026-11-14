import { useState, useMemo } from 'react';

const SLICE_COLORS = [
  '#6366f1', // Indigo (accent-primary)
  '#06b6d4', // Cyan
  '#10b981', // Emerald (color-tonnage)
  '#f59e0b', // Amber (color-volume)
  '#a855f7', // Purple
  '#f43f5e', // Rose (color-fatigue)
  '#3b82f6', // Blue
  '#84cc16', // Lime
  '#ec4899', // Pink
  '#14b8a6', // Teal
];

const getContrastTextColor = (hex) => {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.32 ? '#0b0d12' : '#f8fafc';
};

const polarToCartesian = (cx, cy, r, angleRad) => ({
  x: cx + r * Math.cos(angleRad),
  y: cy + r * Math.sin(angleRad),
});

/**
 * Builds an SVG path for an annular sector with rounded corners.
 */
const describeRoundedArc = (cx, cy, rIn, rOut, startAngle, endAngle, cornerRadius) => {
  const sweep = endAngle - startAngle;
  if (sweep <= 0.001) return '';

  const maxCorner = Math.min(
    cornerRadius,
    (rOut - rIn) / 2 - 0.5,
    (rIn * sweep) / 2 - 0.2,
    (rOut * sweep) / 2 - 0.2
  );
  const c = Math.max(0, maxCorner);

  if (c < 0.5) {
    const p1 = polarToCartesian(cx, cy, rOut, startAngle);
    const p2 = polarToCartesian(cx, cy, rOut, endAngle);
    const p3 = polarToCartesian(cx, cy, rIn, endAngle);
    const p4 = polarToCartesian(cx, cy, rIn, startAngle);
    const largeArc = sweep > Math.PI ? 1 : 0;
    return [
      `M ${p1.x} ${p1.y}`,
      `A ${rOut} ${rOut} 0 ${largeArc} 1 ${p2.x} ${p2.y}`,
      `L ${p3.x} ${p3.y}`,
      `A ${rIn} ${rIn} 0 ${largeArc} 0 ${p4.x} ${p4.y}`,
      'Z',
    ].join(' ');
  }

  const dOut = Math.asin(Math.min(0.99, c / (rOut - c)));
  const dIn = Math.asin(Math.min(0.99, c / (rIn + c)));

  const aOutStart = startAngle + dOut;
  const aOutEnd = endAngle - dOut;
  const aInStart = startAngle + dIn;
  const aInEnd = endAngle - dIn;

  const pOutCorner1Start = polarToCartesian(cx, cy, rOut - c, startAngle);
  const pOutArcStart = polarToCartesian(cx, cy, rOut, aOutStart);
  const pOutArcEnd = polarToCartesian(cx, cy, rOut, aOutEnd);
  const pOutCorner2End = polarToCartesian(cx, cy, rOut - c, endAngle);

  const pInCorner1Start = polarToCartesian(cx, cy, rIn + c, endAngle);
  const pInArcEnd = polarToCartesian(cx, cy, rIn, aInEnd);
  const pInArcStart = polarToCartesian(cx, cy, rIn, aInStart);
  const pInCorner2End = polarToCartesian(cx, cy, rIn + c, startAngle);

  const largeOut = aOutEnd - aOutStart > Math.PI ? 1 : 0;
  const largeIn = aInEnd - aInStart > Math.PI ? 1 : 0;

  return [
    `M ${pOutCorner1Start.x} ${pOutCorner1Start.y}`,
    `A ${c} ${c} 0 0 1 ${pOutArcStart.x} ${pOutArcStart.y}`,
    `A ${rOut} ${rOut} 0 ${largeOut} 1 ${pOutArcEnd.x} ${pOutArcEnd.y}`,
    `A ${c} ${c} 0 0 1 ${pOutCorner2End.x} ${pOutCorner2End.y}`,
    `L ${pInCorner1Start.x} ${pInCorner1Start.y}`,
    `A ${c} ${c} 0 0 1 ${pInArcEnd.x} ${pInArcEnd.y}`,
    `A ${rIn} ${rIn} 0 ${largeIn} 0 ${pInArcStart.x} ${pInArcStart.y}`,
    `A ${c} ${c} 0 0 1 ${pInCorner2End.x} ${pInCorner2End.y}`,
    'Z',
  ].join(' ');
};

const nudgeVerticalCollisions = (items, minGap = 22) => {
  const sorted = [...items].sort((a, b) => a.y - b.y);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].y - sorted[i - 1].y < minGap) {
      sorted[i].y = sorted[i - 1].y + minGap;
    }
  }
  return sorted;
};

const MuscleDonutChart = ({
  data,
  compareData,
  currentProgram,
  compareProgram,
  metric,
  isMobile,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState(null);

  const { slices, total } = useMemo(() => {
    const valid = (data || []).filter((d) => d.value > 0);
    const sum = valid.reduce((acc, d) => acc + d.value, 0);
    if (sum <= 0 || valid.length === 0) {
      return { slices: [], total: 0 };
    }

    const cx = 230;
    const cy = 165;
    const rIn = 58;
    const rOut = 108;
    const padAngle = valid.length > 1 ? 0.055 : 0;
    const totalPad = padAngle * valid.length;
    const availableAngle = Math.PI * 2 - totalPad;

    let currentAngle = -Math.PI / 2; // Start at 12 o'clock
    const rawSlices = valid.map((item, idx) => {
      const share = item.value / sum;
      const sweep = Math.max(0.02, share * availableAngle);
      const startAngle = currentAngle;
      const endAngle = currentAngle + sweep;
      const midAngle = (startAngle + endAngle) / 2;
      currentAngle = endAngle + padAngle;

      const color = SLICE_COLORS[idx % SLICE_COLORS.length];
      const pct = share * 100;
      const pctText = pct < 1 ? '<1%' : `${Math.round(pct)}%`;
      const fitsInside = sweep >= 0.30; // ~17 deg

      const rMid = (rIn + rOut) / 2;
      const innerPos = polarToCartesian(cx, cy, rMid, midAngle);
      const outerPos = polarToCartesian(cx, cy, rOut + 18, midAngle);
      const cos = Math.cos(midAngle);

      let textAnchor = 'start';
      if (cos < -0.22) textAnchor = 'end';
      else if (Math.abs(cos) <= 0.22) textAnchor = 'middle';

      const compareEntry = compareData ? compareData.find((c) => c.name === item.name) : null;

      return {
        idx,
        name: item.name,
        value: item.value,
        compareValue: compareEntry ? compareEntry.value : null,
        pct,
        pctText,
        color,
        textColor: getContrastTextColor(color),
        fitsInside,
        innerPos,
        labelX: outerPos.x,
        labelY: outerPos.y,
        textAnchor,
        side: cos >= 0 ? 'right' : 'left',
        path: describeRoundedArc(cx, cy, rIn, rOut, startAngle, endAngle, 8),
      };
    });

    const leftLabels = nudgeVerticalCollisions(
      rawSlices.filter((s) => s.side === 'left').map((s) => ({ idx: s.idx, y: s.labelY }))
    );
    const rightLabels = nudgeVerticalCollisions(
      rawSlices.filter((s) => s.side === 'right').map((s) => ({ idx: s.idx, y: s.labelY }))
    );
    const yMap = new Map([...leftLabels, ...rightLabels].map((item) => [item.idx, item.y]));

    const finalSlices = rawSlices.map((s) => ({
      ...s,
      labelY: yMap.get(s.idx) ?? s.labelY,
    }));

    return { slices: finalSlices, total: sum };
  }, [data, compareData]);

  const metricUnitLabel = metric === 'sets' ? 'VOLUME' : metric === 'effective' ? 'EFF. REPS' : 'REPS';
  const activeSlice = hoveredIdx !== null ? slices[hoveredIdx] : null;

  if (slices.length === 0) {
    return (
      <div style={{ display: 'flex', height: 260, alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        No muscle data available for the current selection.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
      <svg
        viewBox="0 0 460 330"
        style={{
          width: '100%',
          maxWidth: isMobile ? '360px' : '460px',
          height: 'auto',
          overflow: 'visible',
          userSelect: 'none',
        }}
        onMouseLeave={() => setHoveredIdx(null)}
      >
        {/* Donut Slices */}
        <g>
          {slices.map((s) => {
            const isHovered = hoveredIdx === s.idx;
            const isDimmed = hoveredIdx !== null && !isHovered;
            return (
              <g
                key={s.name}
                style={{
                  cursor: 'pointer',
                  opacity: isDimmed ? 0.42 : 1,
                  transform: isHovered ? 'scale(1.03)' : 'scale(1)',
                  transformOrigin: '230px 165px',
                  transition: 'opacity 0.18s ease, transform 0.18s ease',
                }}
                onMouseEnter={() => setHoveredIdx(s.idx)}
                onClick={() => setHoveredIdx(isHovered ? null : s.idx)}
              >
                <path
                  d={s.path}
                  fill={s.color}
                  style={{
                    filter: isHovered ? `drop-shadow(0 0 10px ${s.color}66)` : 'none',
                  }}
                />
                {s.fitsInside && (
                  <text
                    x={s.innerPos.x}
                    y={s.innerPos.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={s.textColor}
                    fontSize="12"
                    fontWeight="700"
                    style={{ pointerEvents: 'none' }}
                  >
                    {s.pctText}
                  </text>
                )}
              </g>
            );
          })}
        </g>

        {/* Outside Category Labels */}
        <g style={{ pointerEvents: 'none' }}>
          {slices.map((s) => {
            const isHovered = hoveredIdx === s.idx;
            const isDimmed = hoveredIdx !== null && !isHovered;
            return (
              <g
                key={`label-${s.name}`}
                style={{
                  opacity: isDimmed ? 0.45 : 1,
                  transition: 'opacity 0.18s ease',
                }}
              >
                <text
                  x={s.labelX}
                  y={s.labelY}
                  textAnchor={s.textAnchor}
                  dominantBaseline="central"
                  fill={s.color}
                  fontSize="12.5"
                  fontWeight="600"
                >
                  {s.name}
                </text>
                {!s.fitsInside && (
                  <text
                    x={s.labelX}
                    y={s.labelY + 14}
                    textAnchor={s.textAnchor}
                    dominantBaseline="central"
                    fill="var(--text-secondary)"
                    fontSize="11"
                    fontWeight="600"
                  >
                    {s.pctText}
                  </text>
                )}
              </g>
            );
          })}
        </g>

        {/* Center Readout */}
        <g
          style={{ cursor: activeSlice ? 'pointer' : 'default' }}
          onClick={() => setHoveredIdx(null)}
        >
          {activeSlice ? (
            <>
              <text
                x={230}
                y={146}
                textAnchor="middle"
                fill={activeSlice.color}
                fontSize="11.5"
                fontWeight="700"
              >
                {activeSlice.name}
              </text>
              <text
                x={230}
                y={168}
                textAnchor="middle"
                fill="var(--text-primary)"
                fontSize="20"
                fontWeight="700"
                fontFamily="var(--font-display)"
              >
                {activeSlice.value.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              </text>
              <text
                x={230}
                y={186}
                textAnchor="middle"
                fill="var(--text-muted)"
                fontSize="10"
                fontWeight="600"
              >
                {activeSlice.compareValue !== null
                  ? `vs ${activeSlice.compareValue.toLocaleString(undefined, { maximumFractionDigits: 1 })}`
                  : `${activeSlice.pct.toFixed(1)}% · ${metricUnitLabel}`}
              </text>
            </>
          ) : (
            <>
              <text
                x={230}
                y={159}
                textAnchor="middle"
                fill="var(--text-primary)"
                fontSize="20"
                fontWeight="700"
                fontFamily="var(--font-display)"
              >
                {total.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              </text>
              <text
                x={230}
                y={179}
                textAnchor="middle"
                fill="var(--text-muted)"
                fontSize="10"
                fontWeight="600"
                letterSpacing="0.06em"
              >
                TOTAL {metricUnitLabel}
              </text>
            </>
          )}
        </g>
      </svg>

      {/* Compact Compare Legend when compareMode is active */}
      {compareData && compareData.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '8px 14px',
            marginTop: '4px',
            paddingTop: '8px',
            borderTop: '1px solid var(--border-color)',
            width: '100%',
            fontSize: '0.72rem',
            color: 'var(--text-secondary)',
          }}
        >
          {slices.map((s) => (
            <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: s.color }} />
              <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{s.name}:</span>
              <span>{s.value}</span>
              {s.compareValue !== null && (
                <span style={{ color: 'var(--accent-secondary)' }}>
                  vs {s.compareValue}
                </span>
              )}
            </div>
          ))}
          <div style={{ width: '100%', textAlign: 'center', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
            Ring: {currentProgram} · Compare: {compareProgram}
          </div>
        </div>
      )}
    </div>
  );
};

export default MuscleDonutChart;

import React, { useState, useMemo } from 'react';

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
  return lum > 0.32 ? '#090909' : '#fafafa';
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

const getLabelXSpan = (x, anchor, width) => {
  if (anchor === 'end') return [x - width, x];
  if (anchor === 'middle') return [x - width / 2, x + width / 2];
  return [x, x + width];
};

const resolveLabelCollisions = (items, minGap = 28) => {
  const sorted = items.map((item) => ({ ...item })).sort((a, b) => a.y - b.y);
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const yOverlap = minGap - (curr.y - prev.y);
      if (yOverlap <= 0) continue;

      const [pMin, pMax] = getLabelXSpan(prev.x, prev.anchor, prev.width);
      const [cMin, cMax] = getLabelXSpan(curr.x, curr.anchor, curr.width);
      const xOverlaps = Math.min(pMax, cMax) - Math.max(pMin, cMin) > 0;
      if (!xOverlaps) continue;

      const shift = yOverlap / 2;
      prev.y -= shift;
      curr.y += shift;
      changed = true;
    }
    if (!changed) break;
  }
  return sorted;
};

const describeFullAnnulus = (cx, cy, rIn, rOut) => {
  return [
    `M ${(cx).toFixed(2)} ${(cy - rOut).toFixed(2)}`,
    `A ${rOut} ${rOut} 0 1 1 ${(cx).toFixed(2)} ${(cy + rOut).toFixed(2)}`,
    `A ${rOut} ${rOut} 0 1 1 ${(cx).toFixed(2)} ${(cy - rOut).toFixed(2)}`,
    'Z',
    `M ${(cx).toFixed(2)} ${(cy - rIn).toFixed(2)}`,
    `A ${rIn} ${rIn} 0 1 0 ${(cx).toFixed(2)} ${(cy + rIn).toFixed(2)}`,
    `A ${rIn} ${rIn} 0 1 0 ${(cx).toFixed(2)} ${(cy - rIn).toFixed(2)}`,
    'Z',
  ].join(' ');
};

const SingleDonut = ({
  data,
  colorMap,
  metricUnitLabel,
  centerSubLabel,
  isMobile,
  compact,
  headerLabel,
  dotColor,
}) => {
  const [hoveredName, setHoveredName] = useState(null);

  const cx = 195;
  const cy = 152;
  const rIn = 58;
  const rOut = 112;

  const { slices, total } = useMemo(() => {
    const valid = (data || []).filter((d) => d.value > 0);
    const sum = valid.reduce((acc, d) => acc + d.value, 0);
    if (sum <= 0 || valid.length === 0) {
      return { slices: [], total: 0 };
    }

    const padAngle = valid.length > 1 ? 0.055 : 0;
    const totalPad = padAngle * valid.length;
    const availableAngle = Math.max(0.01, Math.PI * 2 - totalPad);
    const minSweep = valid.length > 1 ? Math.min(0.02, availableAngle / valid.length) : availableAngle;
    const rawSweeps = valid.map((item) => Math.max(minSweep, (item.value / sum) * availableAngle));
    const sweepSum = rawSweeps.reduce((acc, s) => acc + s, 0);
    const sweepScale = sweepSum > availableAngle ? availableAngle / sweepSum : 1;

    let currentAngle = -Math.PI / 2;
    const rawSlices = valid.map((item, idx) => {
      const share = item.value / sum;
      const sweep = rawSweeps[idx] * sweepScale;
      const startAngle = currentAngle;
      const endAngle = currentAngle + sweep;
      const midAngle = (startAngle + endAngle) / 2;
      currentAngle = endAngle + padAngle;

      const color = colorMap.get(item.name) || SLICE_COLORS[idx % SLICE_COLORS.length];
      const pct = share * 100;
      const pctText = pct < 1 ? '<1%' : `${Math.round(pct)}%`;
      const fitsInside = sweep >= 0.30;

      const rMid = (rIn + rOut) / 2;
      const innerPos = polarToCartesian(cx, cy, rMid, midAngle);
      const outerPos = polarToCartesian(cx, cy, rOut + 15, midAngle);
      const cos = Math.cos(midAngle);

      let textAnchor = 'start';
      if (cos < -0.22) textAnchor = 'end';
      else if (Math.abs(cos) <= 0.22) textAnchor = 'middle';

      const formattedVal = item.value.toLocaleString(undefined, { maximumFractionDigits: 1 });
      const subText = fitsInside ? formattedVal : `${formattedVal} · ${pctText}`;
      const labelWidth = Math.max(item.name.length * 7.2, subText.length * 6.2) + 6;

      return {
        idx,
        name: item.name,
        value: item.value,
        pct,
        pctText,
        color,
        textColor: getContrastTextColor(color),
        fitsInside,
        innerPos,
        labelX: outerPos.x,
        labelY: outerPos.y,
        labelWidth,
        textAnchor,
        side: cos >= 0 ? 'right' : 'left',
        path: valid.length === 1
          ? describeFullAnnulus(cx, cy, rIn, rOut)
          : describeRoundedArc(cx, cy, rIn, rOut, startAngle, endAngle, 8),
      };
    });

    const rSafe = rOut + 6;
    const clearArc = (x, y, anchor) => {
      let outX = x;
      let outY = y;
      const closestDy = outY < cy ? (outY + 15) - cy : (outY - 12) - cy;
      if (Math.abs(closestDy) < rSafe) {
        if (anchor === 'middle') {
          outY = outY < cy ? cy - rSafe - 15 : cy + rSafe + 12;
        } else {
          const minDx = Math.sqrt(rSafe * rSafe - closestDy * closestDy);
          outX = anchor === 'end'
            ? Math.min(outX, cx - minDx)
            : Math.max(outX, cx + minDx);
        }
      }
      return { x: outX, y: outY };
    };

    const arcClearedSlices = rawSlices.map((s) => {
      const cleared = clearArc(s.labelX, s.labelY, s.textAnchor);
      return { ...s, labelX: cleared.x, labelY: cleared.y };
    });

    const toCollisionItem = (s) => ({
      idx: s.idx,
      x: s.labelX,
      y: s.labelY,
      anchor: s.textAnchor,
      width: s.labelWidth,
    });
    const leftLabels = resolveLabelCollisions(arcClearedSlices.filter((s) => s.side === 'left').map(toCollisionItem));
    const rightLabels = resolveLabelCollisions(arcClearedSlices.filter((s) => s.side === 'right').map(toCollisionItem));
    const yMap = new Map([...leftLabels, ...rightLabels].map((item) => [item.idx, item.y]));

    const finalSlices = arcClearedSlices.map((s) => {
      const newY = yMap.get(s.idx) ?? s.labelY;
      let newX = s.labelX;
      let newAnchor = s.textAnchor;
      if (newY !== s.labelY) {
        if (Math.abs(newX - cx) > 18) {
          newAnchor = s.side === 'left' ? 'end' : 'start';
        }
        const cleared = clearArc(newX, newY, newAnchor);
        newX = cleared.x;
        return { ...s, labelX: newX, labelY: cleared.y, textAnchor: newAnchor };
      }
      return {
        ...s,
        labelX: newX,
        labelY: newY,
        textAnchor: newAnchor,
      };
    });

    return { slices: finalSlices, total: sum };
  }, [data, colorMap]);

  const activeSlice = hoveredName !== null ? (slices.find((s) => s.name === hoveredName) || null) : null;

  if (slices.length === 0) {
    return (
      <div style={{ display: 'flex', height: 220, alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', flex: 1 }}>
        No muscle data available.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: 0, width: '100%' }}>
      {headerLabel && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.75rem',
            fontWeight: 600,
            color: 'var(--text-secondary)',
            marginBottom: '2px',
          }}
        >
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: dotColor }} />
          <span>{headerLabel}</span>
        </div>
      )}
      <svg
        viewBox="0 0 390 304"
        style={{
          width: '100%',
          maxWidth: compact ? (isMobile ? '340px' : '380px') : (isMobile ? '360px' : '440px'),
          height: 'auto',
          overflow: 'visible',
          userSelect: 'none',
        }}
        onMouseLeave={() => setHoveredName(null)}
      >
        <g>
          {slices.map((s) => {
            const isHovered = activeSlice?.name === s.name;
            const isDimmed = activeSlice !== null && !isHovered;
            return (
              <g
                key={s.name}
                style={{
                  cursor: 'pointer',
                  opacity: isDimmed ? 0.42 : 1,
                  transform: isHovered ? 'scale(1.03)' : 'scale(1)',
                  transformOrigin: `${cx}px ${cy}px`,
                  transition: 'opacity 0.18s ease, transform 0.18s ease',
                }}
                onMouseEnter={() => setHoveredName(s.name)}
                onClick={() => setHoveredName(isHovered ? null : s.name)}
              >
                <path
                  d={s.path}
                  fill={s.color}
                  fillRule="evenodd"
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

        {/* Outside Category + Quantity Labels */}
        <g style={{ pointerEvents: 'none' }}>
          {slices.map((s) => {
            const isHovered = activeSlice?.name === s.name;
            const isDimmed = activeSlice !== null && !isHovered;
            const formattedVal = s.value.toLocaleString(undefined, { maximumFractionDigits: 1 });
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
                  y={s.labelY - 6}
                  textAnchor={s.textAnchor}
                  dominantBaseline="central"
                  fill={s.color}
                  fontSize="12.5"
                  fontWeight="600"
                >
                  {s.name}
                </text>
                <text
                  x={s.labelX}
                  y={s.labelY + 9}
                  textAnchor={s.textAnchor}
                  dominantBaseline="central"
                  fill="var(--text-secondary)"
                  fontSize="11"
                  fontWeight="600"
                >
                  {s.fitsInside ? formattedVal : `${formattedVal} · ${s.pctText}`}
                </text>
              </g>
            );
          })}
        </g>

        {/* Center Readout */}
        <g
          style={{ cursor: activeSlice ? 'pointer' : 'default' }}
          onClick={() => setHoveredName(null)}
        >
          {activeSlice ? (
            <>
              <text
                x={cx}
                y={cy - 18}
                textAnchor="middle"
                fill={activeSlice.color}
                fontSize="11.5"
                fontWeight="700"
              >
                {activeSlice.name}
              </text>
              <text
                x={cx}
                y={cy + 3}
                textAnchor="middle"
                fill="var(--text-primary)"
                fontSize="20"
                fontWeight="700"
                fontFamily="var(--font-display)"
              >
                {activeSlice.value.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              </text>
              <text
                x={cx}
                y={cy + 21}
                textAnchor="middle"
                fill="var(--text-muted)"
                fontSize="10"
                fontWeight="600"
              >
                {`${activeSlice.pct.toFixed(1)}% · ${metricUnitLabel}`}
              </text>
            </>
          ) : (
            <>
              <text
                x={cx}
                y={cy - 5}
                textAnchor="middle"
                fill="var(--text-primary)"
                fontSize="20"
                fontWeight="700"
                fontFamily="var(--font-display)"
              >
                {total.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              </text>
              <text
                x={cx}
                y={cy + 14}
                textAnchor="middle"
                fill="var(--text-muted)"
                fontSize="10"
                fontWeight="600"
                letterSpacing="0.06em"
              >
                {centerSubLabel || `TOTAL ${metricUnitLabel}`}
              </text>
            </>
          )}
        </g>
      </svg>
    </div>
  );
};

const MuscleDonutChart = ({
  data,
  compareData,
  currentProgram,
  compareProgram,
  weekA = null,
  weekB = null,
  metric,
  isMobile,
}) => {
  const isComparing = compareData !== null && compareData !== undefined;

  const colorMap = useMemo(() => {
    const map = new Map();
    let idx = 0;
    (data || []).forEach((d) => {
      if (!map.has(d.name)) {
        map.set(d.name, SLICE_COLORS[idx % SLICE_COLORS.length]);
        idx++;
      }
    });
    (compareData || []).forEach((d) => {
      if (!map.has(d.name)) {
        map.set(d.name, SLICE_COLORS[idx % SLICE_COLORS.length]);
        idx++;
      }
    });
    return map;
  }, [data, compareData]);

  // Align compareData to follow the exact muscle order of data so positions match across both donuts
  const alignedCompareData = useMemo(() => {
    if (!compareData || compareData.length === 0) return [];
    const orderIndex = new Map((data || []).map((d, i) => [d.name, i]));
    return [...compareData].sort((a, b) => {
      const ia = orderIndex.has(a.name) ? orderIndex.get(a.name) : Number.MAX_SAFE_INTEGER;
      const ib = orderIndex.has(b.name) ? orderIndex.get(b.name) : Number.MAX_SAFE_INTEGER;
      return ia - ib;
    });
  }, [data, compareData]);

  const metricUnitLabel = metric === 'sets' ? 'VOLUME' : metric === 'effective' ? 'EFF. REPS' : 'REPS';

  if (!isComparing) {
    return (
      <SingleDonut
        data={data}
        colorMap={colorMap}
        metricUnitLabel={metricUnitLabel}
        isMobile={isMobile}
      />
    );
  }

  const baseA = currentProgram === compareProgram ? `${currentProgram} (Selection A)` : currentProgram;
  const baseB = currentProgram === compareProgram ? `${compareProgram} (Selection B)` : compareProgram;
  const labelA = weekA !== null ? `${baseA} · m${weekA}` : baseA;
  const labelB = weekB !== null ? `${baseB} · m${weekB}` : baseB;
  const subLabelA = weekA !== null ? `m${weekA} ${metricUnitLabel}` : metricUnitLabel;
  const subLabelB = weekB !== null ? `m${weekB} ${metricUnitLabel}` : metricUnitLabel;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
        gap: isMobile ? '16px' : '12px',
        width: '100%',
        alignItems: 'start',
      }}
    >
      <SingleDonut
        data={data}
        colorMap={colorMap}
        metricUnitLabel={metricUnitLabel}
        centerSubLabel={subLabelA}
        isMobile={isMobile}
        compact
        headerLabel={labelA}
        dotColor="var(--accent-primary)"
      />
      <SingleDonut
        data={alignedCompareData}
        colorMap={colorMap}
        metricUnitLabel={metricUnitLabel}
        centerSubLabel={subLabelB}
        isMobile={isMobile}
        compact
        headerLabel={labelB}
        dotColor="var(--accent-secondary)"
      />
    </div>
  );
};

export default React.memo(MuscleDonutChart);

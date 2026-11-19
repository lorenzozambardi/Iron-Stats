import React, { useMemo } from 'react';

const HEX_ANGLES_DEG = [-120, -60, 0, 60, 120, 180];
const GRID_LEVELS = [1.0, 0.78, 0.56, 0.34, 0.16];

function getHexPoint(cx, cy, radius, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad),
  };
}

function buildRoundedPolygonPath(points, cornerRadius = 8) {
  if (!points || points.length < 3) return '';
  const n = points.length;
  const segments = [];

  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];

    const dx1 = prev.x - curr.x;
    const dy1 = prev.y - curr.y;
    const len1 = Math.hypot(dx1, dy1);

    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;
    const len2 = Math.hypot(dx2, dy2);

    const r1 = len1 > 0 ? Math.min(cornerRadius, len1 * 0.35) : 0;
    const r2 = len2 > 0 ? Math.min(cornerRadius, len2 * 0.35) : 0;

    const p1 = {
      x: curr.x + (len1 > 0 ? (dx1 / len1) * r1 : 0),
      y: curr.y + (len1 > 0 ? (dy1 / len1) * r1 : 0),
    };
    const p2 = {
      x: curr.x + (len2 > 0 ? (dx2 / len2) * r2 : 0),
      y: curr.y + (len2 > 0 ? (dy2 / len2) * r2 : 0),
    };

    segments.push({ p1, curr, p2 });
  }

  let d = `M ${segments[0].p1.x.toFixed(2)} ${segments[0].p1.y.toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const { curr, p2 } = segments[i];
    const nextSeg = segments[(i + 1) % n];
    d += ` Q ${curr.x.toFixed(2)} ${curr.y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
    d += ` L ${nextSeg.p1.x.toFixed(2)} ${nextSeg.p1.y.toFixed(2)}`;
  }
  return `${d} Z`;
}

// Offsets for each vertex label relative to the hexagon center
const LABEL_OFFSETS = [
  { x: -64, y: -102, anchor: 'middle' }, // Top-left (-120 deg)
  { x: 64, y: -102, anchor: 'middle' },  // Top-right (-60 deg)
  { x: 118, y: -4, anchor: 'middle' },   // Right (0 deg)
  { x: 64, y: 98, anchor: 'middle' },    // Bottom-right (60 deg)
  { x: -64, y: 98, anchor: 'middle' },   // Bottom-left (120 deg)
  { x: -118, y: -4, anchor: 'middle' },  // Left (180 deg)
];

const ProfileRadarChart = React.memo(({
  axes = [],
  compact = false,
  labelA = 'Current',
  labelB = 'Previous',
  showLegend = true,
}) => {
  const vbWidth = 370;
  const vbHeight = 258;
  const cx = vbWidth / 2;
  const cy = vbHeight / 2 + 2;
  const maxRadius = 74;

  const hasSeriesB = useMemo(
    () => axes.some((a) => a.scoreB !== null && a.scoreB !== undefined),
    [axes]
  );

  const { gridPaths, pathA, pathB } = useMemo(() => {
    const grids = GRID_LEVELS.map((lvl) => {
      const pts = HEX_ANGLES_DEG.map((ang) => getHexPoint(cx, cy, maxRadius * lvl, ang));
      return buildRoundedPolygonPath(pts, Math.max(3, 9 * lvl));
    });

    const ptsA = HEX_ANGLES_DEG.map((ang, idx) => {
      const rawScore = Number(axes[idx]?.scoreA);
      const score = Number.isFinite(rawScore) ? rawScore : 50;
      const r = maxRadius * (Math.min(100, Math.max(10, score)) / 100);
      return getHexPoint(cx, cy, r, ang);
    });

    let computedPathB = null;
    if (hasSeriesB) {
      const ptsB = HEX_ANGLES_DEG.map((ang, idx) => {
        const rawScore = Number(axes[idx]?.scoreB);
        const score = Number.isFinite(rawScore) ? rawScore : 50;
        const r = maxRadius * (Math.min(100, Math.max(10, score)) / 100);
        return getHexPoint(cx, cy, r, ang);
      });
      computedPathB = buildRoundedPolygonPath(ptsB, 6);
    }

    return {
      gridPaths: grids,
      pathA: buildRoundedPolygonPath(ptsA, 6),
      pathB: computedPathB,
    };
  }, [axes, cx, cy, hasSeriesB]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
      <svg
        viewBox={`0 0 ${vbWidth} ${vbHeight}`}
        style={{
          width: '100%',
          maxWidth: compact ? '310px' : '420px',
          height: 'auto',
          display: 'block',
          overflow: 'visible',
        }}
        role="img"
        aria-label="Body proportions radar chart"
      >
        {/* Concentric stepped hexagon grid */}
        {gridPaths.map((d, idx) => (
          <path
            key={idx}
            d={d}
            fill={`rgba(255, 255, 255, ${(0.02 + idx * 0.012).toFixed(3)})`}
            stroke={idx === 0 ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.04)'}
            strokeWidth={1}
          />
        ))}

        {/* Previous / Compare polygon (Series B) */}
        {pathB && (
          <path
            d={pathB}
            fill="var(--accent-secondary)"
            fillOpacity={0.14}
            stroke="var(--accent-secondary)"
            strokeWidth={2.1}
            strokeLinejoin="round"
          />
        )}

        {/* Current polygon (Series A) */}
        <path
          d={pathA}
          fill="var(--accent-primary)"
          fillOpacity={0.18}
          stroke="var(--accent-primary)"
          strokeWidth={2.4}
          strokeLinejoin="round"
        />

        {/* Vertex score callouts */}
        {axes.slice(0, 6).map((axis, idx) => {
          const offset = LABEL_OFFSETS[idx];
          const lx = cx + offset.x;
          const ly = cy + offset.y;
          return (
            <g key={axis.key} transform={`translate(${lx}, ${ly})`}>
              <text
                x={0}
                y={0}
                textAnchor={offset.anchor}
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '15px',
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                <tspan fill="var(--accent-primary)">{axis.scoreA}</tspan>
                {axis.scoreB !== null && axis.scoreB !== undefined && (
                  <>
                    <tspan fill="var(--text-muted)" fontWeight={500}> / </tspan>
                    <tspan fill="var(--accent-secondary)">{axis.scoreB}</tspan>
                  </>
                )}
              </text>
              <text
                x={0}
                y={14}
                textAnchor={offset.anchor}
                fill="var(--text-muted)"
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '8.5px',
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                {axis.label}
              </text>
            </g>
          );
        })}
      </svg>

      {showLegend && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          marginTop: compact ? '2px' : '6px',
          fontSize: '0.72rem',
          color: 'var(--text-secondary)',
          fontWeight: 500,
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-primary)' }} />
            {labelA}
          </span>
          {hasSeriesB && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-secondary)' }} />
              {labelB}
            </span>
          )}
        </div>
      )}
    </div>
  );
});

export default ProfileRadarChart;

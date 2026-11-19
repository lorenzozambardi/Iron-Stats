import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ZAxis,
} from 'recharts';

const TOOLTIP_STYLE = {
  background: 'rgba(15, 17, 26, 0.96)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '10px',
  fontSize: '0.75rem',
  color: '#e5e7eb',
};

function resolveChartData(entry, chart) {
  if (!entry || !entry.data) return [];
  const d = entry.data;
  if (chart.type === 'scatter') {
    if (Array.isArray(d.points)) return d.points;
    if (Array.isArray(d.series)) return d.series;
    return [];
  }
  if (chart.type === 'distribution' || chart.type === 'bar') {
    if (Array.isArray(d.distribution)) return d.distribution.slice(0, 10);
    if (Array.isArray(d.items)) return d.items.slice(0, 10);
    if (Array.isArray(d.bottlenecks)) return d.bottlenecks.slice(0, 8).map((b) => ({ name: b.target, y: b.severity }));
    if (Array.isArray(d.series)) return d.series;
    return [];
  }
  if (Array.isArray(d.series)) return d.series;
  if (Array.isArray(d.points)) return d.points;
  return [];
}

export const InsightChart = React.memo(({ chart, evidenceLedger, isMobile }) => {
  const entry = chart?.evidenceId ? evidenceLedger?.[chart.evidenceId] : null;
  const data = useMemo(() => resolveChartData(entry, chart), [entry, chart]);

  if (!chart || !entry || data.length === 0) return null;

  const xKey = chart.x || (data[0]?.label !== undefined ? 'label' : data[0]?.name !== undefined ? 'name' : 'x');
  const yKey = chart.y || (data[0]?.y !== undefined ? 'y' : data[0]?.sharePct !== undefined ? 'sharePct' : 'value');
  const tickFontSize = isMobile ? 10 : 11;

  return (
    <div className="sa-chart-box">
      {chart.title && <div className="sa-chart-title">{chart.title}</div>}
      <div style={{ width: '100%', height: isMobile ? 185 : 210 }}>
        <ResponsiveContainer width="100%" height="100%">
          {chart.type === 'scatter' ? (
            <ScatterChart margin={{ top: 8, right: 14, left: -12, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                type="number"
                dataKey="x"
                name={entry.data?.xMetric || 'X'}
                tick={{ fill: '#9ca3af', fontSize: tickFontSize }}
                stroke="rgba(255,255,255,0.12)"
              />
              <YAxis
                type="number"
                dataKey="y"
                name={entry.data?.yMetric || 'Y'}
                tick={{ fill: '#9ca3af', fontSize: tickFontSize }}
                stroke="rgba(255,255,255,0.12)"
              />
              <ZAxis range={[45, 45]} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ strokeDasharray: '3 3' }} />
              <Scatter data={data} fill="var(--accent-primary, #6366f1)" fillOpacity={0.85} />
            </ScatterChart>
          ) : chart.type === 'bar' || chart.type === 'distribution' ? (
            <BarChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey={xKey}
                tick={{ fill: '#9ca3af', fontSize: tickFontSize }}
                stroke="rgba(255,255,255,0.12)"
                interval={isMobile ? 'preserveStartEnd' : 0}
              />
              <YAxis tick={{ fill: '#9ca3af', fontSize: tickFontSize }} stroke="rgba(255,255,255,0.12)" />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey={yKey} fill="var(--accent-primary, #6366f1)" radius={[6, 6, 0, 0]} />
            </BarChart>
          ) : (
            <LineChart data={data} margin={{ top: 8, right: 14, left: -12, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey={xKey}
                tick={{ fill: '#9ca3af', fontSize: tickFontSize }}
                stroke="rgba(255,255,255,0.12)"
                minTickGap={isMobile ? 28 : 16}
              />
              <YAxis
                tick={{ fill: '#9ca3af', fontSize: tickFontSize }}
                stroke="rgba(255,255,255,0.12)"
                domain={['auto', 'auto']}
              />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Line
                type="monotone"
                dataKey={yKey}
                stroke="var(--accent-primary, #6366f1)"
                strokeWidth={2.2}
                dot={{ r: 3, fill: 'var(--accent-primary, #6366f1)' }}
                activeDot={{ r: 5 }}
              />
              {chart.y2 && (
                <Line
                  type="monotone"
                  dataKey={chart.y2}
                  stroke="var(--accent-secondary, #06b6d4)"
                  strokeWidth={2}
                  dot={false}
                />
              )}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
});

InsightChart.displayName = 'InsightChart';

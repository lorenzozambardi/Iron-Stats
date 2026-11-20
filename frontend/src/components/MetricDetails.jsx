import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Latex, MathBlock } from './MathComponents';
import { MetricSparkline, MetricBarSparkline, TrendBadge } from './Sparkline';
import { sampleSparklineAtTime } from './helpers';
import { TensionRomSlider } from './FilterControls';

const METRIC_UNITS = {
  'volume': ' reps',
  'effective': ' reps',
  'tonnage': ' kg',
  'effective-tonnage': ' kg',
  'weighted-tonnage': ' kg',
  'effective-weighted-tonnage': ' kg',
  'tut': ' s',
  'effective-tut': ' s',
  'sets': ' sets',
  'fatigue': '',
};

const dashboardCardStyle = {
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border-color)',
  borderRadius: 'var(--card-radius)',
  boxShadow: 'var(--card-shadow)',
  padding: '18px 20px',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
};

const sectionLabelStyle = {
  fontSize: '0.75rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--text-muted)',
  margin: 0,
};

const proseStyle = {
  color: 'var(--text-secondary)',
  fontSize: '0.88rem',
  lineHeight: 1.6,
  margin: 0,
};

const TensionProfileExplainer = () => {
  const [tVal, setTVal] = useState(0.5);

  const P0 = { x: 0, y: 1 };
  const P1 = { x: 0.33, y: 0.8 };
  const P2 = { x: 0.66, y: 0.2 };
  const P3 = { x: 1, y: 0.2 };

  // Generate curve points
  const points = useMemo(() => {
    const pts = [];
    for (let i = 0; i <= 50; i++) {
      const t = i / 50;
      const x = Math.pow(1 - t, 3) * P0.x + 3 * Math.pow(1 - t, 2) * t * P1.x + 3 * (1 - t) * Math.pow(t, 2) * P2.x + Math.pow(t, 3) * P3.x;
      const y = Math.pow(1 - t, 3) * P0.y + 3 * Math.pow(1 - t, 2) * t * P1.y + 3 * (1 - t) * Math.pow(t, 2) * P2.y + Math.pow(t, 3) * P3.y;
      pts.push(`${x * 100},${(1 - y) * 100}`);
    }
    return pts.join(' ');
  }, [P0.x, P0.y, P1.x, P1.y, P2.x, P2.y, P3.x, P3.y]);

  const currentX = Math.pow(1 - tVal, 3) * P0.x + 3 * Math.pow(1 - tVal, 2) * tVal * P1.x + 3 * (1 - tVal) * Math.pow(tVal, 2) * P2.x + Math.pow(tVal, 3) * P3.x;
  const currentY = Math.pow(1 - tVal, 3) * P0.y + 3 * Math.pow(1 - tVal, 2) * tVal * P1.y + 3 * (1 - tVal) * Math.pow(tVal, 2) * P2.y + Math.pow(tVal, 3) * P3.y;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <p style={proseStyle}>
        The cumulative tension profile shown in the chart above is the mathematical sum of the individual tension curves for all exercises performed for this muscle group, scaled by their respective volumes. Below is the formal derivation of how each individual exercise curve is modeled and evaluated.
      </p>

      <div style={dashboardCardStyle}>
        <h3 style={sectionLabelStyle}>1. Parametric Cubic Bézier Definition</h3>
        <p style={proseStyle}>
          The tension curve for a given exercise is modeled mathematically as a Parametric Cubic Bézier Curve. The generic vector function <Latex math={String.raw`\mathbf{P}(t)`} /> is defined as the weighted sum of four control vectors <Latex math={String.raw`\mathbf{P}_i`} />, governed by the Bernstein basis polynomials for <Latex math={String.raw`t \in [0, 1]`} />:
        </p>
        <MathBlock>
          <Latex block math={String.raw`\mathbf{P}(t) = \sum_{i=0}^{3} \binom{3}{i} (1-t)^{3-i} t^i \mathbf{P}_i`} />
        </MathBlock>
        <p style={proseStyle}>
          Expanding the summation yields the explicit parametric equation:
        </p>
        <MathBlock>
          <Latex block math={String.raw`\mathbf{P}(t) = (1-t)^3\mathbf{P}_0 + 3(1-t)^2t\mathbf{P}_1 + 3(1-t)t^2\mathbf{P}_2 + t^3\mathbf{P}_3`} />
        </MathBlock>
        <p style={proseStyle}>
          Decomposing the vector function into its Cartesian components yields the system of equations that dictates the Range of Motion <Latex math={String.raw`x(t)`} /> and the resulting Tension <Latex math={String.raw`y(t)`} />:
        </p>
        <MathBlock>
          <Latex block math={String.raw`x(t) = (1-t)^3 x_0 + 3(1-t)^2 t x_1 + 3(1-t) t^2 x_2 + t^3 x_3`} />
          <Latex block math={String.raw`y(t) = (1-t)^3 y_0 + 3(1-t)^2 t y_1 + 3(1-t) t^2 y_2 + t^3 y_3`} />
        </MathBlock>
      </div>

      <div style={dashboardCardStyle}>
        <h3 style={sectionLabelStyle}>2. Differential Constraints (Derivatives)</h3>
        <p style={proseStyle}>
          The intermediate vectors <Latex math={String.raw`\mathbf{P}_1`} /> and <Latex math={String.raw`\mathbf{P}_2`} /> serve as tangent and acceleration handles. Their position is determined by enforcing differential constraints at the boundary limits. Differentiating <Latex math={String.raw`\mathbf{P}(t)`} /> gives the first derivative (parametric tangent vector):
        </p>
        <MathBlock>
          <Latex block math={String.raw`\begin{aligned} \mathbf{P}'(t) &= 3(1-t)^2(\mathbf{P}_1 - \mathbf{P}_0) \\ &\quad + 6(1-t)t(\mathbf{P}_2 - \mathbf{P}_1) + 3t^2(\mathbf{P}_3 - \mathbf{P}_2) \end{aligned}`} />
        </MathBlock>
        <p style={proseStyle}>
          Evaluating the limits at the anchors <Latex math={String.raw`t=0`} /> and <Latex math={String.raw`t=1`} /> proves that the initial and final tangents are strictly collinear with the difference vectors:
        </p>
        <MathBlock>
          <Latex block math={String.raw`\mathbf{P}'(0) = 3(\mathbf{P}_1 - \mathbf{P}_0)`} />
          <Latex block math={String.raw`\mathbf{P}'(1) = 3(\mathbf{P}_3 - \mathbf{P}_2)`} />
        </MathBlock>
        <p style={proseStyle}>
          Similarly, the second derivative evaluated at <Latex math={String.raw`t=0`} /> defines the initial parametric curvature term:
        </p>
        <MathBlock>
          <Latex block math={String.raw`\mathbf{P}''(0) = 6(\mathbf{P}_2 - 2\mathbf{P}_1 + \mathbf{P}_0)`} />
        </MathBlock>
      </div>

      {/* Interactive Graph */}
      <style>{`
        .minimal-slider {
          -webkit-appearance: none;
          width: 100%;
          height: 2px;
          background: rgba(255, 255, 255, 0.14);
          border-radius: 99px;
          outline: none;
        }
        .minimal-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: var(--accent-primary, #6366f1);
          border: 2px solid var(--text-primary, #fafafa);
          cursor: pointer;
        }
      `}</style>
      <div style={dashboardCardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={sectionLabelStyle}>Interactive Bézier Curve</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            t = {tVal.toFixed(2)}
          </span>
        </div>
        <div style={{ width: '100%', maxWidth: '460px', margin: '0 auto' }}>
          <svg viewBox="-10 -10 120 125" style={{ width: '100%', overflow: 'visible', fontFamily: 'var(--font-mono, monospace)' }}>
            {/* Grid */}
            {[25, 50, 75, 100].map(val => (
              <g key={val}>
                <line x1="0" y1={100 - val} x2="100" y2={100 - val} stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
                <line x1={val} y1="0" x2={val} y2="100" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
              </g>
            ))}

            {/* Axes */}
            <line x1="0" y1="100" x2="102" y2="100" stroke="rgba(163,163,163,0.5)" strokeWidth="0.5" />
            <line x1="0" y1="-2" x2="0" y2="100" stroke="rgba(163,163,163,0.5)" strokeWidth="0.5" />
            <text x="50" y="110" fill="rgba(163,163,163,0.75)" fontSize="4" textAnchor="middle">x (ROM)</text>
            <text x="-8" y="50" fill="rgba(163,163,163,0.75)" fontSize="4" textAnchor="middle" transform="rotate(-90, -8, 50)">y (Tension)</text>

            {/* Tangent Lines */}
            <line x1={P0.x * 100} y1={(1 - P0.y) * 100} x2={P1.x * 100} y2={(1 - P1.y) * 100} stroke="rgba(163,163,163,0.35)" strokeWidth="0.5" strokeDasharray="1.5,1.5" />
            <line x1={P2.x * 100} y1={(1 - P2.y) * 100} x2={P3.x * 100} y2={(1 - P3.y) * 100} stroke="rgba(163,163,163,0.35)" strokeWidth="0.5" strokeDasharray="1.5,1.5" />

            {/* Main Curve */}
            <polyline points={points} fill="none" stroke="var(--accent-primary, #6366f1)" strokeWidth="1.3" strokeLinecap="round" />

            {/* Tangent Control Points */}
            <circle cx={P1.x * 100} cy={(1 - P1.y) * 100} r="1.1" fill="var(--bg-secondary)" stroke="rgba(163,163,163,0.8)" strokeWidth="0.5" />
            <text x={P1.x * 100 + 2} y={(1 - P1.y) * 100 + 1} fill="rgba(163,163,163,0.85)" fontSize="3.5">P1</text>

            <circle cx={P2.x * 100} cy={(1 - P2.y) * 100} r="1.1" fill="var(--bg-secondary)" stroke="rgba(163,163,163,0.8)" strokeWidth="0.5" />
            <text x={P2.x * 100 + 2} y={(1 - P2.y) * 100 + 1} fill="rgba(163,163,163,0.85)" fontSize="3.5">P2</text>

            {/* Anchor Points */}
            <circle cx={P0.x * 100} cy={(1 - P0.y) * 100} r="1.5" fill="var(--text-primary, #fff)" />
            <text x={P0.x * 100 - 2} y={(1 - P0.y) * 100 + 1} fill="var(--text-primary, #fff)" fontSize="3.5" textAnchor="end">P0</text>

            <circle cx={P3.x * 100} cy={(1 - P3.y) * 100} r="1.5" fill="var(--text-primary, #fff)" />
            <text x={P3.x * 100 + 2} y={(1 - P3.y) * 100 + 1} fill="var(--text-primary, #fff)" fontSize="3.5">P3</text>

            {/* Moving Point */}
            <circle cx={currentX * 100} cy={(1 - currentY) * 100} r="2" fill="var(--bg-secondary)" stroke="var(--text-primary, #fff)" strokeWidth="0.7" />
            <text x={(currentX * 100) + 4} y={((1 - currentY) * 100) - 3} fill="var(--text-primary, #fff)" fontSize="3.5">t={tVal.toFixed(2)}</text>
          </svg>
        </div>
        <div style={{ paddingTop: '4px', maxWidth: '460px', width: '100%', margin: '0 auto' }}>
          <input type="range" min="0" max="1" step="0.01" value={tVal} onChange={e => setTVal(parseFloat(e.target.value))} className="minimal-slider" />
        </div>
      </div>

      <div style={dashboardCardStyle}>
        <h3 style={sectionLabelStyle}>3. Analytical System Resolution (Root-Finding)</h3>
        <p style={proseStyle}>
          The equations above define the tension <Latex math={String.raw`y`} /> as a function of the parameter <Latex math={String.raw`t`} />. But in practice, we need to evaluate the tension at a specific degree of joint flexion (the Range of Motion coordinate <Latex math={String.raw`X \in [0, 1]`} />). To find <Latex math={String.raw`Y`} /> given <Latex math={String.raw`X`} />, we must mathematically invert the system. We set our parametric equation <Latex math={String.raw`x(t)`} /> equal to our known coordinate <Latex math={String.raw`X`} />:
        </p>
        <MathBlock>
          <Latex block math={String.raw`x(t) - X = 0`} />
        </MathBlock>
        <p style={proseStyle}>
          Expanding the <Latex math={String.raw`x(t)`} /> polynomial algebraically, this equality formulates a non-linear cubic equation in standard form:
        </p>
        <MathBlock>
          <Latex block math={String.raw`\begin{aligned} (-x_0 + 3x_1 - 3x_2 + x_3)t^3 &+ (3x_0 - 6x_1 + 3x_2)t^2 \\ &+ (-3x_0 + 3x_1)t + (x_0 - X) = 0 \end{aligned}`} />
        </MathBlock>
        <p style={proseStyle}>
          This simplifies to <Latex math={String.raw`at^3 + bt^2 + ct + d = 0`} />. While one could mathematically apply Cardano&apos;s analytical method, doing so in software introduces floating-point instability and complex numbers. Instead, the backend algorithms explicitly implement a <strong>Binary Search approximation</strong> to isolate the principal real root <Latex math={String.raw`t^*`} /> strictly within the valid domain <Latex math={String.raw`[0, 1]`} />.
        </p>
        <p style={proseStyle}>
          Because the horizontal range <Latex math={String.raw`x(t)`} /> is monotonically increasing (the movement strictly goes forward), the algorithm guesses a midpoint (e.g., <Latex math={String.raw`t = 0.5`} />). If <Latex math={String.raw`x(0.5) < X`} />, the true root must be in the upper half <Latex math={String.raw`[0.5, 1.0]`} />. If <Latex math={String.raw`x(0.5) > X`} />, it must be in the lower half <Latex math={String.raw`[0.0, 0.5]`} />. By iteratively halving this interval, the engine rapidly converges on the exact <Latex math={String.raw`t^*`} />. Finally, we substitute this <Latex math={String.raw`t^*`} /> back into the tension polynomial to extract the formal solution <Latex math={String.raw`Y = y(t^*)`} />.
        </p>
      </div>

      <div style={dashboardCardStyle}>
        <h3 style={sectionLabelStyle}>4. Formal Exercise Modeling</h3>
        <p style={proseStyle}>
          Let&apos;s apply this algorithm to mathematically model the tension of a Barbell Bicep Curl within the normalized control domain <Latex math={String.raw`[0, 1]^2`} />. We want zero tension at the extremes and symmetric curvature peaking at the middle of the ROM.
        </p>
        <p style={proseStyle}>
          <strong style={{ color: 'var(--text-primary)' }}>Step 1: Choosing the 4 Control Points</strong><br />
          We lock the boundary anchors at zero tension: <Latex math={String.raw`\mathbf{P}_0 = (0, 0)`} /> and <Latex math={String.raw`\mathbf{P}_3 = (1, 0)`} />. To ensure a constant horizontal progression within <Latex math={String.raw`[0, 1]^2`} />, we set <Latex math={String.raw`x_1 = 1/3, x_2 = 2/3`} /> and maximal control height <Latex math={String.raw`y_1 = y_2 = 1`} />.
        </p>
        <MathBlock>
          <Latex block math={String.raw`\begin{aligned} \mathbf{P}_0(0, 0), &\quad \mathbf{P}_1(1/3, 1) \\ \mathbf{P}_2(2/3, 1), &\quad \mathbf{P}_3(1, 0) \end{aligned}`} />
        </MathBlock>
        <p style={proseStyle}>
          <strong style={{ color: 'var(--text-primary)' }}>Step 2: Formulating x(t) and y(t)</strong><br />
          Substituting these points into the generic Bernstein polynomials yields two remarkably clean parametric equations:
        </p>
        <MathBlock>
          <Latex block math={String.raw`x(t) = t \left[ (1-t)^2 + 2(1-t)t + t^2 \right] = t`} />
          <Latex block math={String.raw`y(t) = 3t(1-t) \left[ (1-t) + t \right] = 3t(1-t)`} />
        </MathBlock>
        <p style={proseStyle}>
          Notice how the horizontal equation elegantly collapses into a linear mapping <Latex math={String.raw`x(t) = t`} />, proving that our parameter perfectly traces the ROM.
        </p>
        <p style={proseStyle}>
          <strong style={{ color: 'var(--text-primary)' }}>Step 3: Extracting t from x(t)</strong><br />
          Suppose the user&apos;s joint is exactly halfway through the movement (<Latex math={String.raw`X = 0.5`} />). We must find the hidden <Latex math={String.raw`t`} /> using the root-finding logic:
        </p>
        <MathBlock>
          <Latex block math={String.raw`x(t) - X = 0 \implies t - 0.5 = 0`} />
        </MathBlock>
        <p style={proseStyle}>
          The Binary Search engine evaluates this and instantly converges on <Latex math={String.raw`t = 0.5`} />.
        </p>
        <p style={proseStyle}>
          <strong style={{ color: 'var(--text-primary)' }}>Step 4: Calculating y(t)</strong><br />
          Finally, we plug our discovered <Latex math={String.raw`t = 0.5`} /> into the tension polynomial to find the raw curve height at that joint angle:
        </p>
        <MathBlock>
          <Latex block math={String.raw`Y = y(0.5) = 3(0.5)(1 - 0.5) = 3(0.25) = 0.75`} />
        </MathBlock>
        <p style={proseStyle}>
          After UI peak normalization (<Latex math={String.raw`y(t)/\max y = 0.75/0.75 = 1.0`} />) or solver GL3 area normalization (<Latex math={String.raw`M_{e,m}/I_{\mathrm{GL3}}`} />), the midpoint achieves its peak tension while keeping every control point inside <Latex math={String.raw`[0, 1]^2`} />!
        </p>
      </div>
    </div>
  );
};

export default function MetricDetailsPage({ metric, series, compareSeries, weekNums, onBack }) {
  const [lastValidMetric, setLastValidMetric] = useState(metric);
  const [sliderPos, setSliderPos] = useState(100);
  useEffect(() => {
    if (metric) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLastValidMetric(metric);
      setSliderPos(100);
    }
  }, [metric]);

  // Fade in/out animation — matches settings popup
  const [visible, setVisible] = useState(false);
  const closeTimeoutRef = useRef(null);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => {
      cancelAnimationFrame(raf);
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
    };
  }, []);

  const handleClose = useCallback(() => {
    setVisible(false);
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = setTimeout(() => {
      closeTimeoutRef.current = null;
      onBack();
    }, 200); // match CSS transition duration
  }, [onBack]);

  useEffect(() => {
    const handleHardwareBack = () => {
      handleClose();
    };
    window.addEventListener('close-metric-detail', handleHardwareBack);
    return () => window.removeEventListener('close-metric-detail', handleHardwareBack);
  }, [handleClose]);

  const activeMetric = metric || lastValidMetric;

  const getMetricData = () => {
    switch (activeMetric) {
      case 'volume':
        return {
          title: 'Total Reps',
          subtitle: 'Weighted effective repetitions',
          color: 'var(--color-volume)',
          description: 'Reps measures the total stimulative muscular workload of your exercises. It sums your base repetitions alongside weighted contributions from assisted and partial repetitions, scaled by the target muscle group distribution.',
          formulas: [
            '\\text{Reps} = \\sum_{s \\in \\text{Sets}} \\text{TotReps}_s \\cdot D_m',
            '\\text{TotReps}_s = R_{\\text{base}, s} + 0.5 \\cdot R_{\\text{assisted}, s} + 0.33 \\cdot R_{\\text{partial}, s}'
          ],
          variables: [
            { symbol: '\\text{Reps}', desc: 'The accumulated workload credit assigned to a target muscle group.' },
            { symbol: '\\text{TotReps}_s', desc: 'The total weighted rep count of set s, combining base, assisted, and partial repetitions.' },
            { symbol: 'R_{\\text{base}, s}', desc: 'Base repetitions in set s (full range of motion, unassisted).' },
            { symbol: 'R_{\\text{assisted}, s}', desc: 'Assisted repetitions in set s (spotter-helped, weighted at 0.5).' },
            { symbol: 'R_{\\text{partial}, s}', desc: 'Partial range of motion repetitions in set s (weighted at 0.33).' },
            { symbol: 'D_m', desc: 'Target muscle group distribution coefficient.' }
          ],
          example: 'If you perform a set of 10 base reps (where 2 are assisted, leaving 8 unassisted base reps) and 3 partial reps, targeting Quads (Dm = 1.0):\nBase reps = 8.0 reps.\nAssisted reps = 2 (weighted at 0.5) = 1.0 rep.\nPartial reps = 3 (weighted at 0.33) = 0.99 rep.\nTotal Reps for that set is (8.0 + 1.0 + 0.99) * 1.0 = 9.99 reps.'
        };
      case 'tonnage':
        return {
          title: 'Total Tonnage',
          subtitle: 'Load and leverage adjusted volume',
          color: 'var(--color-tonnage)',
          description: 'Tonnage measures the absolute workload moved, adjusted for machine leverage, mechanical offset, repetition type weightings, and muscle load distribution.',
          formulas: [
            '\\text{Tonnage} = \\sum_{s \\in \\text{Sets}} L_{\\text{adj}, s} \\cdot \\text{TotReps}_s \\cdot D_m',
            'L_{\\text{adj}, s} = L_{\\text{raw}, s} \\cdot M_{\\text{leverage}} + O_{\\text{offset}}',
            '\\text{TotReps}_s = R_{\\text{base}, s} + 0.5 \\cdot R_{\\text{assisted}, s} + 0.33 \\cdot R_{\\text{partial}, s}'
          ],
          variables: [
            { symbol: '\\text{Tonnage}', desc: 'The total kilograms moved, scaled by target muscle distribution.' },
            { symbol: 'L_{\\text{adj}, s}', desc: 'The adjusted load for set s, accounting for machine leverage and offsets.' },
            { symbol: 'L_{\\text{raw}, s}', desc: 'The raw weight entered in the logbook (e.g. 100 kg).' },
            { symbol: 'M_{\\text{leverage}}', desc: 'Machine leverage multiplier (default 1.0 in defaultExercises.json; customizable via exercise settings or override: e.g. 0.7 for an angled sled).' },
            { symbol: 'O_{\\text{offset}}', desc: 'Bodyweight offset or platform weight adjustment.' },
            { symbol: '\\text{TotReps}_s', desc: 'Weighted repetitions count of set s: R_base + 0.5 * R_assisted + 0.33 * R_partial.' },
            { symbol: 'D_m', desc: 'Target muscle group distribution coefficient.' }
          ],
          example: 'If you configure an angled sled with leverage = 0.7 (offset = 0; note defaultExercises.json uses load_multiplier = 1.0 and load_coeff = 0.3 on Leg Press 45) with 200 kg for 10 total reps (e.g. 8 base reps + 4 partial reps = 9.32 reps), targeting Quads at 80% (Dm = 0.8):\n Ladj = 200 * 0.7 = 140 kg\nTonnage = 140 kg * 9.32 reps * 0.8 = 1,043.8 kg for Quads.'
        };
      case 'effective-tonnage':
        return {
          title: 'Effective Tonnage',
          subtitle: 'Stimulative load and leverage adjusted volume',
          color: 'var(--color-effective-tonnage)',
          description: 'Effective Tonnage measures the total hypertrophy-stimulative workload moved, adjusted for machine leverage, mechanical offset, repetition type weightings, and muscle distribution.',
          formulas: [
            '\\text{EffTonnage} = \\sum_{s \\in \\text{Sets}} L_{\\text{adj}, s} \\cdot \\text{effReps}_s \\cdot D_m',
            'L_{\\text{adj}, s} = L_{\\text{raw}, s} \\cdot M_{\\text{leverage}} + O_{\\text{offset}}',
            '\\begin{aligned} \\text{effReps}_s &= \\min(R_{\\text{base}, s}, \\max(0, \\text{RPE}_s - 4.0)) \\\\ &\\quad + 0.5 \\cdot R_{\\text{assisted}, s} + 0.33 \\cdot R_{\\text{partial}, s} \\end{aligned}'
          ],
          variables: [
            { symbol: '\\text{EffTonnage}', desc: 'The stimulative kilograms moved, scaled by target muscle distribution.' },
            { symbol: 'L_{\\text{adj}, s}', desc: 'The adjusted load for set s, accounting for machine leverage and offsets.' },
            { symbol: 'L_{\\text{raw}, s}', desc: 'The raw weight entered in the logbook (e.g. 100 kg).' },
            { symbol: 'M_{\\text{leverage}}', desc: 'Machine leverage multiplier (default 1.0 in defaultExercises.json; customizable via exercise settings or override: e.g. 0.7 for an angled sled).' },
            { symbol: 'O_{\\text{offset}}', desc: 'Bodyweight offset or platform weight adjustment.' },
            { symbol: '\\text{effReps}_s', desc: 'Weighted effective repetitions: min(R_base, max(0, RPE - 4.0)) + 0.5 * R_assisted + 0.33 * R_partial.' },
            { symbol: 'D_m', desc: 'Target muscle group distribution coefficient.' }
          ],
          example: 'If you configure an angled sled with leverage = 0.7 (offset = 0) with 200 kg for 10 reps, where 2 are assisted (leaving 8 unassisted base reps) and 3 are partial reps, at RPE 9.0 (logged as 10(2)+3@9), targeting Quads at 80% (Dm = 0.8):\n Ladj = 200 * 0.7 = 140 kg\nEffective reps = min(8, 9.0 - 4.0) + (2 * 0.5) + (3 * 0.33) = 5.0 + 1.0 + 0.99 = 6.99 reps.\nEffective Tonnage = 140 kg * 6.99 reps * 0.8 = 782.88 kg for Quads.'
        };
      case 'weighted-tonnage':
        return {
          title: 'Weighted Tonnage',
          subtitle: 'Exercise load profile weighted tonnage',
          color: 'var(--color-weighted-tonnage)',
          description: 'Weighted Tonnage is identical to regular Tonnage, except it is further multiplied by the load_coeff of the exercise, reflecting its intensity weighting profile.',
          formulas: [
            '\\text{WTonnage} = \\sum_{s \\in \\text{Sets}} L_{\\text{adj}, s} \\cdot \\text{TotReps}_s \\cdot D_m \\cdot C_{\\text{load}}',
            'L_{\\text{adj}, s} = L_{\\text{raw}, s} \\cdot M_{\\text{leverage}} + O_{\\text{offset}}',
            '\\text{TotReps}_s = R_{\\text{base}, s} + 0.5 \\cdot R_{\\text{assisted}, s} + 0.33 \\cdot R_{\\text{partial}, s}'
          ],
          variables: [
            { symbol: '\\text{WTonnage}', desc: 'The total kilograms moved, scaled by target muscle distribution and load coefficient.' },
            { symbol: 'L_{\\text{adj}, s}', desc: 'The adjusted load for set s, accounting for machine leverage and offsets.' },
            { symbol: '\\text{TotReps}_s', desc: 'Weighted repetitions count of set s: R_base + 0.5 * R_assisted + 0.33 * R_partial.' },
            { symbol: 'D_m', desc: 'Target muscle group distribution coefficient.' },
            { symbol: 'C_{\\text{load}}', desc: 'Exercise-specific load coefficient.' }
          ],
          example: 'Same as Tonnage, but multiplied by the exercise load_coeff (e.g., 0.85).'
        };
      case 'effective-weighted-tonnage':
        return {
          title: 'Effective Weighted Tonnage',
          subtitle: 'Stimulative exercise load profile weighted tonnage',
          color: 'var(--color-effective-weighted-tonnage)',
          description: 'Effective Weighted Tonnage is identical to regular Effective Tonnage, except it is further multiplied by the load_coeff of the exercise.',
          formulas: [
            '\\text{EffWTonnage} = \\sum_{s \\in \\text{Sets}} L_{\\text{adj}, s} \\cdot \\text{effReps}_s \\cdot D_m \\cdot C_{\\text{load}}',
            'L_{\\text{adj}, s} = L_{\\text{raw}, s} \\cdot M_{\\text{leverage}} + O_{\\text{offset}}',
            '\\begin{aligned} \\text{effReps}_s &= \\min(R_{\\text{base}, s}, \\max(0, \\text{RPE}_s - 4.0)) \\\\ &\\quad + 0.5 \\cdot R_{\\text{assisted}, s} + 0.33 \\cdot R_{\\text{partial}, s} \\end{aligned}'
          ],
          variables: [
            { symbol: '\\text{EffWTonnage}', desc: 'The stimulative kilograms moved, scaled by target muscle distribution and load coefficient.' },
            { symbol: 'L_{\\text{adj}, s}', desc: 'The adjusted load for set s, accounting for machine leverage and offsets.' },
            { symbol: '\\text{effReps}_s', desc: 'Weighted effective repetitions: min(R_base, max(0, RPE - 4.0)) + 0.5 * R_assisted + 0.33 * R_partial.' },
            { symbol: 'D_m', desc: 'Target muscle group distribution coefficient.' },
            { symbol: 'C_{\\text{load}}', desc: 'Exercise-specific load coefficient.' }
          ],
          example: 'Same as Effective Tonnage, but multiplied by the exercise load_coeff.'
        };
      case 'effective':
        return {
          title: 'Effective Reps',
          subtitle: 'Hypertrophy-stimulative repetitions',
          color: 'var(--color-effective-volume)',
          description: 'Effective reps count stimulative repetitions in a set. The base reps are determined by proximity to failure (measured by RPE), where base effective reps = RPE - 4. Assisted and partial reps are also included and weighted (assisted reps at 0.5, partial reps at 0.33).',
          formulas: [
            '\\text{EffReps} = \\sum_{s \\in \\text{Sets}} \\text{effReps}_s \\cdot D_m',
            '\\begin{aligned} \\text{effReps}_s &= \\min(R_{\\text{base}, s}, \\max(0, \\text{RPE}_s - 4.0)) \\\\ &\\quad + 0.5 \\cdot R_{\\text{assisted}, s} + 0.33 \\cdot R_{\\text{partial}, s} \\end{aligned}'
          ],
          variables: [
            { symbol: '\\text{EffReps}', desc: 'Total hypertrophy-stimulative repetitions for a target muscle group.' },
            { symbol: '\\text{effReps}_s', desc: 'Effective repetitions count of set s.' },
            { symbol: 'R_{\\text{base}, s}', desc: 'Base repetitions in set s (full range of motion, unassisted).' },
            { symbol: '\\text{RPE}_s', desc: 'Rate of Perceived Exertion of set s (representing proximity to failure).' },
            { symbol: 'R_{\\text{assisted}, s}', desc: 'Assisted repetitions in set s (spotter-helped, weighted at 0.5).' },
            { symbol: 'R_{\\text{partial}, s}', desc: 'Partial range of motion repetitions in set s (weighted at 0.33).' },
            { symbol: 'D_m', desc: 'Target muscle group distribution coefficient.' }
          ],
          example: 'If you perform a set of 10 base reps (where 2 are assisted, leaving 8 unassisted base reps) and 3 partial reps, taken to RPE 9.0 (logged as 10(2)+3@9) targeting Quads (Dm = 1.0):\nBase reps = 8. Base effective reps = min(8, 9.0 - 4.0) = 5.0 reps.\nAssisted reps = 2 (weighted at 0.5) = 1.0 rep.\nPartial reps = 3 (weighted at 0.33) = 0.99 rep.\nTotal Effective Reps for that set = 5.0 + 1.0 + 0.99 = 6.99 reps.'
        };
      case 'tut':
        return {
          title: 'Time Under Tension (TUT)',
          subtitle: 'Total duration under load',
          color: 'var(--color-tut)',
          description: 'Measures the cumulative time (in seconds) the muscle spends contracting against load, accounting for tempo-specific phases and physiological velocity slowdown under fatigue.',
          formulas: [
            '\\text{TUT} = \\sum_{s \\in \\text{Sets}} T_{\\text{set}, s} \\cdot D_m',
            '\\begin{aligned} T_{\\text{set}, s} &= \\sum_{i=1}^{R_{\\text{base}, s}} T_{\\text{base}, i} + R_{\\text{assisted}, s} \\cdot T_{\\text{assist}} \\\\ &\\quad + R_{\\text{partial}, s} \\cdot T_{\\text{partial}} \\end{aligned}',
            'T_{\\text{base}, i} = C + \\text{slowdown}_i + P_{\\text{short}} + E + P_{\\text{long}}',
            'T_{\\text{assist}} = C + P_{\\text{short}} + E + P_{\\text{long}}',
            'T_{\\text{partial}} = 0.5 \\cdot T_{\\text{assist}}'
          ],
          variables: [
            { symbol: '\\text{TUT}', desc: 'Total accumulated duration in seconds for target muscle.' },
            { symbol: 'T_{\\text{set}, s}', desc: 'Total time in seconds calculated for set s.' },
            { symbol: 'T_{\\text{base}, i}', desc: 'Calculated duration for base repetition index i.' },
            { symbol: 'C, E', desc: 'Concentric and Eccentric tempo durations (e.g. 2s concentric, 4s eccentric).' },
            { symbol: 'P_{\\text{short}}, P_{\\text{long}}', desc: 'Pause durations at maximum shortening (peak contraction) and maximum lengthening (stretch).' },
            { symbol: '\\text{slowdown}_i', desc: 'Physiological slowdown added to concentric phase as reps approach failure (scales strictly with per-rep RIR / proximity to failure).' },
            { symbol: 'T_{\\text{assist}}, T_{\\text{partial}}', desc: 'Time assigned to assisted repetitions (standard tempo, no slowdown) and partial repetitions (50% of assisted tempo).' }
          ],
          example: 'A set of 6 base reps at 2-0-4-0 tempo (2s concentric, 0s pause, 4s eccentric, 0s pause) taken to RPE 9.0 (1 RIR):\nEach base rep takes C (2s) + E (4s) + slowdown. At RPE 9.0, the 6 reps have RIR 6, 5, 4, 3, 2, 1 with concentric slowdowns 0.00 + 0.00 + 0.15 + 0.35 + 0.60 + 1.00 = 2.10s, giving a set TUT of (6 * 6s) + 2.10s = 38.1 seconds.'
        };
      case 'effective-tut':
        return {
          title: 'Effective TUT',
          subtitle: 'Duration under stimulative tension',
          color: 'var(--color-effective-tut)',
          description: 'Isolates and aggregates the time under tension specifically for the effective repetitions of each set. Unassisted base reps are counted continuously based on proximity to failure (RPE - 4), while all assisted and partial reps are fully included.',
          formulas: [
            '\\begin{aligned} \\text{TUT}_{\\text{eff}} &= \\sum_{s \\in \\text{Sets}} \\Big( \\sum_{i = \\max(0, R_{\\text{base}, s} - \\lfloor N_s \\rfloor)}^{R_{\\text{base}, s} - 1} T_{\\text{base}, i} \\\\ &\\quad + \\{N_s\\}\\,T_{\\text{base}, \\text{frac}} + T_{\\text{extended}, s} \\Big) \\cdot D_m \\end{aligned}',
            'N_s = \\min(R_{\\text{base}, s}, \\max(0.0, \\text{RPE}_s - 4.0))',
            'T_{\\text{extended}, s} = R_{\\text{assisted}, s} \\cdot T_{\\text{assist}} + R_{\\text{partial}, s} \\cdot T_{\\text{partial}}'
          ],
          variables: [
            { symbol: '\\text{TUT}_{\\text{eff}}', desc: 'Total duration in seconds spent under high mechanical tension.' },
            { symbol: 'N_s', desc: 'Continuous count of effective unassisted base repetitions in set s (integer part plus fractional remainder).' },
            { symbol: 'T_{\\text{base}, i}', desc: 'Duration of 0-indexed base repetition i (from max(0, R_{base,s} - floor(N_s)) to R_{base,s} - 1), including fatigue slowdown.' },
            { symbol: 'T_{\\text{base}, \\text{frac}}', desc: 'Duration of the boundary base repetition at index R_{base,s} - floor(N_s) - 1 when {N_s} > 0.' },
            { symbol: 'T_{\\text{extended}, s}', desc: 'Total duration of assisted and partial reps in set s.' },
            { symbol: 'D_m', desc: 'Target muscle group distribution coefficient.' }
          ],
          example: 'If a set has 8 base reps, 2 assisted reps, and 3 partial reps taken to RPE 8.5:\nEffective base reps count (Ns) = min(8, 8.5 - 4.0) = 4.5 reps. Thus, the final 4 full base reps plus 0.5x of the 5th-from-last base rep contribute to the base TUT, and 100% of all assisted and partial reps contribute to the extended TUT.'
        };
      case 'fatigue':
        return {
          title: 'Accumulated Fatigue',
          subtitle: 'Rep-level neuromuscular fatigue model',
          color: 'var(--color-fatigue)',
          description: 'An advanced model tracking accumulated fatigue per repetition. Fatigue scales exponentially with proximity to failure (RPE) and linearly with repetition duration (TUT), accounting for exercise fatigue rating and rep types.',
          formulas: [
            '\\text{Fatigue} = \\sum_{s \\in \\text{Sets}} \\left( \\sum_{i} T_i \\cdot 1.1^{R_i - 7.5} \\cdot F_e \\cdot K_i \\right) \\cdot D_m',
            '\\text{Base Rep } i: \\; R_i = \\max(0, 10 - \\text{rir}_i), \\; K_i = 1.0',
            '\\begin{aligned} \\text{Assisted Rep } i: \\; R_i &= 10.0 \\implies 1.1^{2.5} \\approx 1.27, \\\\ K_i &= 0.5 \\end{aligned}',
            '\\begin{aligned} \\text{Partial Rep } i: \\; R_i &= 10.0 \\implies 1.1^{2.5} \\approx 1.27, \\\\ K_i &= 0.33, \\; T_i = 0.5\\,T_{\\text{assist}} \\end{aligned}'
          ],
          variables: [
            { symbol: '\\text{Fatigue}', desc: 'Accumulated fatigue units for the targeted muscles.' },
            { symbol: 'T_i', desc: 'Duration of repetition i (seconds).' },
            { symbol: '\\text{rir}_i', desc: 'Instantaneous Reps in Reserve on base repetition i: (10 - RPE_s) + (R_{base,s} - 1 - i) for 0-indexed i.' },
            { symbol: 'R_i', desc: 'RPE equivalent score for rep i (max(0, 10 - rir_i) for base reps; 10.0 for past-failure assisted and partial reps).' },
            { symbol: '1.1^{R_i - 7.5}', desc: 'Exponential multiplier penalizing high-intensity reps close to failure.' },
            { symbol: 'F_e', desc: 'Exercise-specific fatigue rating (F_e >= 0; UI editor bounds 0 to 10) representing systemic and joint stress.' },
            { symbol: 'K_i', desc: 'Repetition type penalty factor: base = 1.0, assisted = 0.5, partial = 0.33.' },
            { symbol: 'D_m', desc: 'Target muscle group distribution coefficient.' }
          ],
          example: 'A high-fatigue movement like Squats (Fe = 9.5) taken to failure (RPE 10) will generate exponentially higher fatigue values on its final repetitions compared to a low-fatigue movement like Lateral Raises (Fe = 3.0) done with 2 reps in reserve.'
        };
      case 'sets':
        return {
          title: 'Total Volume',
          subtitle: 'Set count scaled by muscle distribution',
          color: 'var(--color-sets)',
          description: 'Volume calculates the cumulative number of sets performed. Rather than treating all sets equally across all muscle groups, it weights each set based on the target muscle distribution coefficient (D_m) of the exercise. For example, a set targeting a primary muscle group counts as 1.0 sets, while targeting a secondary muscle group counts proportionally (e.g. 0.5 sets).',
          formulas: [
            '\\text{Volume} = \\sum_{s \\in \\text{Sets}} 1.0 \\cdot D_m'
          ],
          variables: [
            { symbol: '\\text{Volume}', desc: 'The accumulated sets credit assigned to a target muscle group.' },
            { symbol: 'D_m', desc: 'Target muscle group distribution coefficient (from 0.0 to 1.0).' }
          ],
          example: 'If you perform 4 sets of Squats targeting Quads at 45% (D_m = 0.45) and Glutes at 35% (D_m = 0.35):\n- Quads: 4 sets * 0.45 = 1.8 sets\n- Glutes: 4 sets * 0.35 = 1.4 sets'
        };
      case 'tension-profiles':
        return {
          title: 'Cumulative Tension Profiles',
          subtitle: '4-Point Cubic Bézier Tension Modeling',
          color: 'var(--accent-primary)',
          customRender: <TensionProfileExplainer />
        };
      default:
        return null;
    }
  };

  const data = getMetricData();
  if (!data) return null;

  const overlay = (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100dvh',
      background: 'var(--bg-primary)',
      zIndex: 10000,
      overflowY: 'auto',
      padding: '80px 16px 80px 16px',
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(16px)',
      transition: 'opacity 0.2s ease, transform 0.2s ease',
    }}>
      {/* Close Button — exact copy of settings popup mobile-close-btn */}
      <button
        type="button"
        onClick={handleClose}
        aria-label="Close"
        style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          background: 'transparent',
          border: 'none',
          color: 'var(--text-primary)',
          fontSize: '2rem',
          cursor: 'pointer',
          lineHeight: 1,
        }}
      >×</button>

      <div style={{
        maxWidth: '760px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}>
        {/* Header Card */}
        <div style={dashboardCardStyle}>
          <div>
            <span style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: data.color,
            }}>
              Math Details
            </span>
          </div>

          <div>
            <h2 style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.6rem',
              fontWeight: 700,
              margin: '0 0 4px 0',
              color: 'var(--text-primary)',
              lineHeight: 1.2,
            }}>
              {data.title}
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.84rem', margin: 0 }}>
              {data.subtitle}
            </p>
          </div>

          {!data.customRender && (
            <p style={proseStyle}>
              {data.description}
            </p>
          )}
        </div>

        {data.customRender ? (
          data.customRender
        ) : (
          <>
            {/* Trend Card */}
            {Array.isArray(series) && series.length >= 2 && (() => {
              const hasTs = typeof series[0] === 'object' && series[0] !== null && Number.isFinite(series[0].t);
              const pts = hasTs
                ? series
                : series.map((v, i) => ({ t: i, v: Number(v) || 0 }));
              const comparePts = Array.isArray(compareSeries) && compareSeries.length >= 2
                ? (typeof compareSeries[0] === 'object' && compareSeries[0] !== null && Number.isFinite(compareSeries[0].t)
                  ? compareSeries
                  : compareSeries.map((v, i) => ({ t: i, v: Number(v) || 0 })))
                : undefined;

              const weeks = Array.isArray(weekNums) && weekNums.length === pts.length
                ? weekNums
                : pts.map((_, i) => i + 1);
              const tMin = pts[0].t;
              const tMax = pts[pts.length - 1].t;
              const tRange = tMax - tMin;
              const targetT = tMin + (sliderPos / 100) * tRange;
              const sampledVal = sampleSparklineAtTime(pts, targetT, true);

              let currentWeek = weeks[weeks.length - 1];
              if (targetT <= tMin) {
                currentWeek = weeks[0];
              } else if (targetT < tMax) {
                for (let i = 0; i < pts.length - 1; i++) {
                  if (targetT >= pts[i].t && targetT <= pts[i + 1].t) {
                    const dt = pts[i + 1].t - pts[i].t;
                    const frac = dt > 0 ? (targetT - pts[i].t) / dt : 0;
                    currentWeek = weeks[i] + (weeks[i + 1] - weeks[i]) * frac;
                    break;
                  }
                }
              }
              const isHistogram = activeMetric === 'sets';
              const activeBarIdx = isHistogram
                ? Math.min(pts.length - 1, Math.max(0, Math.round((sliderPos / 100) * (pts.length - 1))))
                : null;
              const displayWeek = isHistogram ? weeks[activeBarIdx] : currentWeek;
              const displayVal = isHistogram ? pts[activeBarIdx].v : sampledVal;

              const formatMicrocycle = (w) => (
                Math.abs(w - Math.round(w)) < 0.05 ? `m${Math.round(w)}` : `m${w.toFixed(1)}`
              );
              const unit = METRIC_UNITS[activeMetric] ?? '';
              const formattedVal = displayVal.toLocaleString(undefined, { maximumFractionDigits: 1 });
              const xPct = tRange > 0 ? sliderPos : 100;

              return (
                <div style={dashboardCardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <h3 style={sectionLabelStyle}>Trend</h3>
                    <TrendBadge values={pts} invertColor={activeMetric === 'fatigue'} />
                  </div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.78rem',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '999px',
                      background: 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-secondary)',
                      fontWeight: 600,
                    }}>
                      {formatMicrocycle(displayWeek)}
                    </span>
                    <strong style={{ color: 'var(--text-primary)', fontSize: '0.86rem' }}>
                      {formattedVal}{unit}
                    </strong>
                  </div>
                  {isHistogram ? (
                    <MetricBarSparkline
                      values={pts}
                      compareValues={comparePts}
                      color={data.color}
                      height={92}
                      activeIndex={activeBarIdx}
                    />
                  ) : (
                    <div style={{ position: 'relative' }}>
                      <MetricSparkline
                        values={pts}
                        compareValues={comparePts}
                        color={data.color}
                        gradId={`detail-spark-${activeMetric}`}
                        height={92}
                        linear
                      />
                      <div
                        aria-hidden="true"
                        style={{
                          position: 'absolute',
                          top: 0,
                          bottom: 0,
                          left: `${xPct}%`,
                          borderLeft: '1.5px dashed rgba(255, 255, 255, 0.4)',
                          pointerEvents: 'none',
                        }}
                      />
                    </div>
                  )}
                  <TensionRomSlider
                    value={sliderPos}
                    onChange={setSliderPos}
                    leftLabel={`m${weeks[0]}`}
                    rightLabel={`m${weeks[weeks.length - 1]}`}
                    ariaLabel="Metric microcycle timeline"
                  />
                </div>
              );
            })()}

            {/* Formula Card */}
            <div style={dashboardCardStyle}>
              <h3 style={sectionLabelStyle}>Formula</h3>
              <MathBlock>
                {data.formulas.map((f, idx) => (
                  <div
                    key={idx}
                    style={idx > 0 ? { borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '10px' } : undefined}
                  >
                    <Latex block math={f} />
                  </div>
                ))}
              </MathBlock>
            </div>

            {/* Variables Card */}
            <div style={dashboardCardStyle}>
              <h3 style={sectionLabelStyle}>Variables</h3>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {data.variables.map((v, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(90px, 24%) 1fr',
                      gap: '12px',
                      alignItems: 'baseline',
                      padding: '10px 0',
                      borderTop: idx > 0 ? '1px solid rgba(255, 255, 255, 0.06)' : 'none',
                      fontSize: '0.84rem',
                    }}
                  >
                    <div style={{ fontWeight: 600, color: data.color, overflowX: 'auto' }}>
                      <Latex math={v.symbol} />
                    </div>
                    <div style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      {v.desc}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Example Card */}
            <div style={dashboardCardStyle}>
              <h3 style={sectionLabelStyle}>Example</h3>
              {(() => {
                const lines = data.example.split('\n').map(l => l.trim()).filter(Boolean);
                if (lines.length <= 1) {
                  return <p style={proseStyle}>{data.example}</p>;
                }
                const [intro, ...steps] = lines;
                return (
                  <>
                    <p style={proseStyle}>{intro}</p>
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      paddingTop: '10px',
                      borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {steps.map((step, idx) => {
                        const isFinal = idx === steps.length - 1 && !step.startsWith('-');
                        return (
                          <div
                            key={idx}
                            style={{
                              fontSize: '0.85rem',
                              lineHeight: 1.55,
                              color: isFinal ? 'var(--text-primary)' : 'var(--text-secondary)',
                              fontWeight: isFinal ? 500 : 400,
                            }}
                          >
                            {step}
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </div>
          </>
        )}
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(overlay, document.body) : overlay;
};


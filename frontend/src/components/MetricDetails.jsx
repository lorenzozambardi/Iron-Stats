import React from 'react';
import { Latex, MathBlock } from './MathComponents';

const MetricDetailsPage = ({ metric, onBack }) => {
  const getMetricData = () => {
    switch (metric) {
      case 'volume':
        return {
          title: 'Total Volume',
          subtitle: 'Weighted effective repetitions',
          color: 'var(--color-volume)',
          description: 'Volume measures the total stimulative muscular workload of your exercises. It sums your base repetitions alongside weighted contributions from assisted and partial repetitions, scaled by the target muscle group distribution.',
          formulas: [
            '\\text{Volume} = \\sum_{s \\in \\text{Sets}} \\text{TotReps}_s \\cdot D_m',
            '\\text{TotReps}_s = R_{\\text{base}, s} + 0.5 \\cdot R_{\\text{assisted}, s} + 0.33 \\cdot R_{\\text{partial}, s}'
          ],
          variables: [
            { symbol: '\\text{Volume}', desc: 'The accumulated workload credit assigned to a target muscle group.' },
            { symbol: '\\text{TotReps}_s', desc: 'The effective rep count of set s, combining base, assisted, and partial repetitions.' },
            { symbol: 'R_{\\text{base}, s}', desc: 'Base repetitions in set s (full range of motion, unassisted).' },
            { symbol: 'R_{\\text{assisted}, s}', desc: 'Assisted repetitions in set s (spotter-helped, weighted at 0.5).' },
            { symbol: 'R_{\\text{partial}, s}', desc: 'Partial range of motion repetitions in set s (weighted at 0.33).' },
            { symbol: 'D_m', desc: 'Target muscle group distribution coefficient.' }
          ],
          example: 'If you perform a set of 10 base reps (where 2 are assisted, leaving 8 unassisted base reps) and 3 partial reps, targeting Quads (Dm = 1.0):\nBase reps = 8.0 reps.\nAssisted reps = 2 (weighted at 0.5) = 1.0 rep.\nPartial reps = 3 (weighted at 0.33) = 0.99 rep.\nTotal Volume for that set is (8.0 + 1.0 + 0.99) * 1.0 = 9.99 reps.'
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
            { symbol: 'M_{\\text{leverage}}', desc: 'Machine leverage multiplier (e.g., 1.0 for free weights, 0.7 for leg press).' },
            { symbol: 'O_{\\text{offset}}', desc: 'Bodyweight offset or platform weight adjustment.' },
            { symbol: '\\text{TotReps}_s', desc: 'Weighted repetitions count of set s: R_base + 0.5 * R_assisted + 0.33 * R_partial.' },
            { symbol: 'D_m', desc: 'Target muscle group distribution coefficient.' }
          ],
          example: 'If you perform Incline Leg Press (leverage = 0.7, offset = 0) with 200 kg for 10 total reps (e.g. 8 base reps + 4 partial reps = 9.32 reps), targeting Quads at 80% (Dm = 0.8):\n Ladj = 200 * 0.7 = 140 kg\nTonnage = 140 kg * 9.32 reps * 0.8 = 1,043.8 kg for Quads.'
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
            '\\text{effReps}_s = \\min(R_{\\text{base}, s}, \\max(0, \\text{RPE}_s - 4.0)) + 0.5 \\cdot R_{\\text{assisted}, s} + 0.33 \\cdot R_{\\text{partial}, s}'
          ],
          variables: [
            { symbol: '\\text{EffTonnage}', desc: 'The stimulative kilograms moved, scaled by target muscle distribution.' },
            { symbol: 'L_{\\text{adj}, s}', desc: 'The adjusted load for set s, accounting for machine leverage and offsets.' },
            { symbol: 'L_{\\text{raw}, s}', desc: 'The raw weight entered in the logbook (e.g. 100 kg).' },
            { symbol: 'M_{\\text{leverage}}', desc: 'Machine leverage multiplier (e.g., 1.0 for free weights, 0.7 for leg press).' },
            { symbol: 'O_{\\text{offset}}', desc: 'Bodyweight offset or platform weight adjustment.' },
            { symbol: '\\text{effReps}_s', desc: 'Weighted effective repetitions: min(R_base, max(0, RPE - 4.0)) + 0.5 * R_assisted + 0.33 * R_partial.' },
            { symbol: 'D_m', desc: 'Target muscle group distribution coefficient.' }
          ],
          example: 'If you perform Incline Leg Press (leverage = 0.7, offset = 0) with 200 kg for 10 reps, where 2 are assisted (leaving 8 unassisted base reps) and 3 are partial reps, at RPE 9.0 (logged as 10(2)+3@9), targeting Quads at 80% (Dm = 0.8):\n Ladj = 200 * 0.7 = 140 kg\nEffective reps = min(8, 9.0 - 4.0) + (2 * 0.5) + (3 * 0.33) = 5.0 + 1.0 + 0.99 = 6.99 reps.\nEffective Tonnage = 140 kg * 6.99 reps * 0.8 = 782.88 kg for Quads.'
        };
      case 'effective':
        return {
          title: 'Effective Reps',
          subtitle: 'Hypertrophy-stimulative repetitions',
          color: 'var(--accent-secondary)',
          description: 'Effective reps count stimulative repetitions in a set. The base reps are determined by proximity to failure (measured by RPE), where base effective reps = RPE - 4. Assisted and partial reps are also included and weighted (assisted reps at 0.5, partial reps at 0.33).',
          formulas: [
            '\\text{EffReps} = \\sum_{s \\in \\text{Sets}} \\text{effReps}_s \\cdot D_m',
            '\\text{effReps}_s = \\min(R_{\\text{base}, s}, \\max(0, \\text{RPE}_s - 4.0)) + 0.5 \\cdot R_{\\text{assisted}, s} + 0.33 \\cdot R_{\\text{partial}, s}'
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
            'T_{\\text{set}, s} = \\sum_{i=1}^{R_{\\text{base}, s}} T_{\\text{base}, i} + R_{\\text{assisted}, s} \\cdot T_{\\text{assist}} + R_{\\text{partial}, s} \\cdot T_{\\text{partial}}',
            'T_{\\text{base}, i} = C + \\text{slowdown}_i + P_{\\text{short}} + E + P_{\\text{long}}',
            'T_{\\text{assist}} = C + P_{\\text{short}} + E + P_{\\text{long}} \\quad T_{\\text{partial}} = 0.5 \\cdot T_{\\text{assist}}'
          ],
          variables: [
            { symbol: '\\text{TUT}', desc: 'Total accumulated duration in seconds for target muscle.' },
            { symbol: 'T_{\\text{set}, s}', desc: 'Total time in seconds calculated for set s.' },
            { symbol: 'T_{\\text{base}, i}', desc: 'Calculated duration for base repetition index i.' },
            { symbol: 'C, E', desc: 'Concentric and Eccentric tempo durations (e.g. 2s concentric, 4s eccentric).' },
            { symbol: 'P_{\\text{short}}, P_{\\text{long}}', desc: 'Pause durations at maximum shortening (peak contraction) and maximum lengthening (stretch).' },
            { symbol: '\\text{slowdown}_i', desc: 'Physiological slowdown added to concentric phase as reps approach failure (scales based on set fatigue and RPE).' },
            { symbol: 'T_{\\text{assist}}, T_{\\text{partial}}', desc: 'Time assigned to assisted repetitions (standard tempo, no slowdown) and partial repetitions (50% of assisted tempo).' }
          ],
          example: 'A set of 6 reps at 2-0-4-0 tempo (2s concentric, 0s pause, 4s eccentric, 0s pause):\nEach base rep takes: C (2) + E (4) + slowdown. Assuming a moderate RPE (slowdown aggregates ~2s over the set), the set TUT is approximately: (6 * 6s) + 2s = 38 seconds.'
        };
      case 'effective-tut':
        return {
          title: 'Effective TUT',
          subtitle: 'Duration under stimulative tension',
          color: 'var(--color-effective-tut)',
          description: 'Isolates and aggregates the time under tension specifically for the effective repetitions of each set. Unassisted base reps are counted based on proximity to failure (RPE - 4), while all assisted and partial reps are fully included.',
          formulas: [
            '\\text{TUT}_{\\text{eff}} = \\sum_{s \\in \\text{Sets}} \\left( \\sum_{i = \\max(0, R_{\\text{base}, s} - N_s)}^{R_{\\text{base}, s} - 1} T_{\\text{base}, i} + T_{\\text{extended}, s} \\right) \\cdot D_m',
            'N_s = \\text{round}(\\min(R_{\\text{base}, s}, \\max(0.0, \\text{RPE}_s - 4.0)))',
            'T_{\\text{extended}, s} = R_{\\text{assisted}, s} \\cdot T_{\\text{assist}} + R_{\\text{partial}, s} \\cdot T_{\\text{partial}}'
          ],
          variables: [
            { symbol: '\\text{TUT}_{\\text{eff}}', desc: 'Total duration in seconds spent under high mechanical tension.' },
            { symbol: 'N_s', desc: 'The rounded count of effective unassisted base repetitions in set s.' },
            { symbol: 'T_{\\text{base}, i}', desc: 'Duration of base repetition i, including the fatigue slowdown.' },
            { symbol: 'T_{\\text{extended}, s}', desc: 'Total duration of assisted and partial reps in set s.' },
            { symbol: 'D_m', desc: 'Target muscle group distribution coefficient.' }
          ],
          example: 'If a set has 8 base reps, 2 assisted reps, and 3 partial reps taken to RPE 9.0:\nEffective base reps count (N) = round(min(8, 9.0 - 4.0)) = 5 reps. Thus, only the final 5 base reps (reps 4 to 8) contribute to the base TUT, and 100% of all assisted and partial reps contribute to the extended TUT.\nEffective TUT = (sum of last 5 base reps TUT) + (all assisted reps TUT) + (all partial reps TUT).'
        };
      case 'fatigue':
        return {
          title: 'Accumulated Fatigue',
          subtitle: 'Rep-level neuromuscular fatigue model',
          color: 'var(--color-fatigue)',
          description: 'An advanced model tracking accumulated fatigue per repetition. Fatigue scales exponentially with proximity to failure (RPE) and linearly with repetition duration (TUT), accounting for exercise profile and rep types.',
          formulas: [
            '\\text{Fatigue} = \\sum_{s \\in \\text{Sets}} \\left( \\sum_{i} T_i \\cdot 1.1^{R_i - 7.5} \\cdot F_e \\cdot L_c \\cdot K_i \\right) \\cdot D_m',
            '\\text{Base Rep } i: R_i = \\max(0, 10 - \\text{rir}_i), \\; K_i = 1.0',
            '\\text{Assisted Rep } i: R_i = 7.0 \\implies 1.1^{R_i - 7.5} \\approx 0.95, \\; K_i = 0.5',
            '\\text{Partial Rep } i: R_i = 7.5 \\implies 1.1^{R_i - 7.5} = 1.0, \\; K_i = 0.66'
          ],
          variables: [
            { symbol: '\\text{Fatigue}', desc: 'Accumulated fatigue units for the targeted muscles.' },
            { symbol: 'T_i', desc: 'Duration of repetition i (seconds).' },
            { symbol: 'R_i', desc: 'RPE equivalent score for rep i (increases from early reps to the final rep).' },
            { symbol: '1.1^{R_i - 7.5}', desc: 'Exponential multiplier penalizing high-intensity reps close to failure.' },
            { symbol: 'F_e', desc: 'Exercise-specific fatigue rating (0 to 10) representing systemic and joint stress.' },
            { symbol: 'L_c', desc: 'Load coefficient representing intensity weight profile.' },
            { symbol: 'K_i', desc: 'Repetition type penalty factor: base = 1.0, assisted = 0.5, partial = 0.66.' },
            { symbol: 'D_m', desc: 'Target muscle group distribution coefficient.' }
          ],
          example: 'A high-fatigue movement like Squats (Fe = 8.5) taken to failure (RPE 10) will generate exponentially higher fatigue values on its final repetitions compared to a low-fatigue movement like Tricep Pushdowns (Fe = 2.0) done with 2 reps in reserve.'
        };
      case 'sets':
        return {
          title: 'Total Sets',
          subtitle: 'Set count scaled by muscle distribution',
          color: 'var(--color-sets)',
          description: 'Sets calculates the cumulative number of sets performed. Rather than treating all sets equally across all muscle groups, it weights each set based on the target muscle distribution coefficient (D_m) of the exercise. For example, a set targeting a primary muscle group counts as 1.0 sets, while targeting a secondary muscle group counts proportionally (e.g. 0.5 sets).',
          formulas: [
            '\\text{Sets} = \\sum_{s \\in \\text{Sets}} 1.0 \\cdot D_m'
          ],
          variables: [
            { symbol: '\\text{Sets}', desc: 'The accumulated sets credit assigned to a target muscle group.' },
            { symbol: 'D_m', desc: 'Target muscle group distribution coefficient (from 0.0 to 1.0).' }
          ],
          example: 'If you perform 4 sets of Squats targeting Quads at 100% (D_m = 1.0) and Glutes at 50% (D_m = 0.5):\n- Quads: 4 sets * 1.0 = 4.0 sets\n- Glutes: 4 sets * 0.5 = 2.0 sets'
        };
      default:
        return null;
    }
  };

  const data = getMetricData();
  if (!data) return <div>Metric not found</div>;

  return (
    <div style={{ padding: '8px 16px', color: 'var(--text-primary)' }}>
      {/* Back Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <button 
          onClick={onBack}
          className="btn btn-secondary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '8px' }}
        >
          &larr; Back to Dashboard
        </button>
      </div>

      {/* Main card */}
      <div className="glass-card" style={{ borderLeft: `4px solid ${data.color}`, padding: '24px', borderRadius: '16px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ marginBottom: '20px' }}>
          <span className="badge" style={{ backgroundColor: `${data.color}15`, color: data.color, fontWeight: '600', textTransform: 'uppercase', fontSize: '0.7rem', padding: '4px 8px', borderRadius: '4px', border: `1px solid ${data.color}30` }}>
            Math Calculation details
          </span>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: '700', margin: '12px 0 4px 0', color: 'var(--text-primary)' }}>
            {data.title}
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            {data.subtitle}
          </p>
        </div>

        <p style={{ lineHeight: '1.6', color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '24px' }}>
          {data.description}
        </p>

        {/* Formulas Block */}
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: '600', marginBottom: '10px', color: data.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Mathematical Formula
          </h3>
          <MathBlock color={data.color}>
            {data.formulas.map((f, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <div style={{ margin: '12px 0' }} />}
                <Latex block math={f} />
              </React.Fragment>
            ))}
          </MathBlock>
        </div>

        {/* Variables Table */}
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: '600', marginBottom: '10px', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Variables Breakdown
          </h3>
          <div style={{ overflowX: 'auto', background: 'rgba(0,0,0,0.15)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.02)' }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px', width: '25%', color: 'var(--text-muted)', fontWeight: '600' }}>Symbol</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: '600' }}>Description</th>
                </tr>
              </thead>
              <tbody>
                {data.variables.map((v, idx) => (
                  <tr key={idx} style={{ borderBottom: idx === data.variables.length - 1 ? 'none' : '1px solid var(--border-color)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: '600', color: data.color }}>
                      <Latex math={v.symbol} />
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                      {v.desc}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Practical Example */}
        <div>
          <h3 style={{ fontSize: '0.95rem', fontWeight: '600', marginBottom: '10px', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Step-by-Step Example
          </h3>
          <div style={{ padding: '14px 16px', background: 'rgba(0, 0, 0, 0.2)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.82rem', lineHeight: '1.5', color: 'var(--text-secondary)', whiteSpace: 'pre-line', fontFamily: 'var(--font-mono)' }}>
            {data.example}
          </div>
        </div>
      </div>
    </div>
  );
};


export default MetricDetailsPage;

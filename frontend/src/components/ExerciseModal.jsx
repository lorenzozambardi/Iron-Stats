import { useMemo } from 'react';
import { Trash2, Sliders } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine
} from 'recharts';
import { MUSCLES } from '../parser';
import { solveBezierY, getBezierCurveData } from './helpers';
import BezierEditor from '../BezierEditor';

export const ExerciseModal = ({
  showExerciseModal,
  setShowExerciseModal,
  editingExercise,
  handleDeleteExercise,
  exerciseForm,
  setExerciseForm,
  exerciseError,
  setExerciseError,
  isMobile,
  tensionSliderPos,
  setTensionSliderPos,
  editingCurveIndex,
  setEditingCurveIndex,
  muscleSearch,
  setMuscleSearch,
  currentHasOverride,
  handleRemoveOverride,
  handleSaveExerciseForProgramOnly,
  handleSaveExercise,
  currentProgram,
  chartColors
}) => {
  const chartData = useMemo(() => {
    return getBezierCurveData(exerciseForm?.muscles || []);
  }, [exerciseForm]);

  const muscleSum = useMemo(() => {
    return (exerciseForm?.muscles || []).reduce((sum, m) => sum + m.percentage, 0);
  }, [exerciseForm]);

  if (!showExerciseModal) return null;

  const isInvalid = muscleSum !== 100;
  const disabledStyle = { opacity: isInvalid ? 0.6 : 1, cursor: isInvalid ? 'not-allowed' : 'pointer' };

  return (
    <div className="modal-overlay" style={{ background: 'var(--bg-primary)', backdropFilter: 'none' }} onClick={() => setShowExerciseModal(false)}>
      <div className="modal-card" style={{ width: '100vw', height: '100vh', maxWidth: '100vw', maxHeight: '100vh', borderRadius: 0, border: 'none', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingRight: '20px' }}>
          <h3 className="modal-title" style={{ borderBottom: 'none' }}>{editingExercise ? 'Edit Exercise' : 'Add Exercise'}</h3>
          {editingExercise && (
            <button
              className="btn btn-danger"
              style={{ padding: '6px 12px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              onClick={() => handleDeleteExercise(editingExercise.name)}
            >
              <Trash2 size={13} /> Delete Exercise
            </button>
          )}
        </div>
        <div className="modal-body" style={{ overflowY: 'auto', flex: 1, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          
          <div>
            <label className="modal-label">Exercise Name</label>
            <input
              type="text"
              className="modal-input"
              placeholder="e.g. Incline Bench Press"
              value={exerciseForm.name}
              onChange={(e) => {
                setExerciseForm({ ...exerciseForm, name: e.target.value });
                setExerciseError('');
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label className="modal-label">Fatigue (0.0 - 10.0)</label>
              <input
                type="number"
                className="modal-input"
                min="0"
                max="10"
                step="0.1"
                value={exerciseForm.fatigue}
                onChange={(e) => setExerciseForm({ ...exerciseForm, fatigue: e.target.value })}
              />
            </div>
            <div>
              <label className="modal-label">Load Coefficient</label>
              <input
                type="number"
                className="modal-input"
                min="0"
                max="2"
                step="0.01"
                value={exerciseForm.load_coeff}
                onChange={(e) => setExerciseForm({ ...exerciseForm, load_coeff: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label className="modal-label">Load Multiplier</label>
              <input
                type="number"
                className="modal-input"
                min="0.1"
                max="10"
                step="0.1"
                value={exerciseForm.load_multiplier}
                onChange={(e) => setExerciseForm({ ...exerciseForm, load_multiplier: e.target.value })}
              />
            </div>
            <div>
              <label className="modal-label">Load Offset (kg)</label>
              <input
                type="number"
                className="modal-input"
                min="-100"
                max="100"
                step="0.5"
                value={exerciseForm.load_offset}
                onChange={(e) => setExerciseForm({ ...exerciseForm, load_offset: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '4px 0' }}>
            <input
              type="checkbox"
              id="is-isolation-checkbox"
              checked={exerciseForm.is_isolation}
              onChange={(e) => setExerciseForm({ ...exerciseForm, is_isolation: e.target.checked })}
              style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
            />
            <label htmlFor="is-isolation-checkbox" className="modal-label" style={{ margin: 0, cursor: 'pointer', fontSize: '0.85rem' }}>
              Isolation Exercise
            </label>
          </div>

          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '14px', marginTop: '4px' }}>
            <span className="modal-label" style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 600 }}>
              Muscle Distribution
            </span>
            
            {exerciseForm.muscles.length > 0 && (
              <div style={{ width: '100%', marginBottom: isMobile ? '8px' : '16px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '10px 10px 0 0' }}>
                <ResponsiveContainer width="99%" height={isMobile ? 140 : 160} minWidth={0} minHeight={0}>
                  <LineChart data={chartData} style={isMobile ? { pointerEvents: 'none' } : undefined}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="x" type="number" domain={[0, 1]} tickCount={5} stroke="var(--text-muted)" fontSize={10} tickFormatter={(val) => val === 0 ? 'Stretch' : val === 1 ? 'Contract' : val} />
                    <YAxis stroke="var(--text-muted)" fontSize={10} width={30} domain={[0, 1]} tickFormatter={(v) => Math.round(v*100)} />
                    {!isMobile && <Tooltip contentStyle={{ backgroundColor: 'var(--bg-glass-active)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }} labelFormatter={(l) => `ROM: ${(l*100).toFixed(0)}%`} formatter={(val) => [(val*100).toFixed(1)+'%', 'Tension']} />}
                    {isMobile && <ReferenceLine x={tensionSliderPos / 100} stroke="rgba(255,255,255,0.5)" strokeWidth={1.5} strokeDasharray="4 4" />}
                    {exerciseForm.muscles.map((m, i) => {
                       return <Line key={m.name} type="monotone" dataKey={m.name} stroke={chartColors[i % chartColors.length]} dot={false} strokeWidth={2} name={m.name} />;
                    })}
                  </LineChart>
                </ResponsiveContainer>
                {isMobile && (
                  <div style={{ padding: '4px 8px 10px 8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {/* Per-muscle tension values at current ROM */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center' }}>
                      {exerciseForm.muscles.map((m, i) => {
                        const y = solveBezierY(
                          tensionSliderPos / 100,
                          m.x0 ?? 0.0, m.y0 ?? 1.0,
                          m.x1 ?? 0.33, m.y1 ?? 1.0,
                          m.x2 ?? 0.66, m.y2 ?? 1.0,
                          m.x3 ?? 1.0, m.y3 ?? 1.0
                        );
                        const magnitude = parseFloat(m.percentage) / 100.0;
                        let maxY = 0;
                        for (let r = 0; r <= 50; r++) {
                          const my = solveBezierY(r / 50, m.x0 ?? 0.0, m.y0 ?? 1.0, m.x1 ?? 0.33, m.y1 ?? 1.0, m.x2 ?? 0.66, m.y2 ?? 1.0, m.x3 ?? 1.0, m.y3 ?? 1.0);
                          if (my > maxY) maxY = my;
                        }
                        const normalizedY = maxY > 0 ? (y / maxY) * magnitude : 0;
                        const color = chartColors[i % chartColors.length];
                        return (
                          <span key={m.name} style={{
                            fontSize: '0.68rem',
                            color: color,
                            background: 'rgba(0,0,0,0.35)',
                            padding: '2px 8px',
                            borderRadius: '100px',
                            border: `1px solid ${color}33`,
                            whiteSpace: 'nowrap'
                          }}>
                            {m.name}: {(normalizedY * 100).toFixed(1)}%
                          </span>
                        );
                      })}
                    </div>
                    <div style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                      ROM: {tensionSliderPos}%
                    </div>
                    {/* ROM scrubber slider */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', minWidth: '36px', textAlign: 'right' }}>Stretch</span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={tensionSliderPos}
                        onChange={(e) => setTensionSliderPos(parseInt(e.target.value))}
                        className="tension-scrubber-slider"
                        style={{
                          flex: 1,
                          accentColor: 'var(--accent-primary)'
                        }}
                      />
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', minWidth: '44px' }}>Contract</span>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {exerciseForm.muscles.length === 0 ? (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', margin: '8px 0' }}>
                No muscle groups assigned yet. Select a muscle below to add it.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {exerciseForm.muscles.map((m, index) => {
                  const dotColor = chartColors[index % chartColors.length];
                  return (
                  <div key={m.name} style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: dotColor }}></span>
                        {m.name}
                      </span>
                      <button
                        type="button"
                        className="btn-icon-small"
                        style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        onClick={() => {
                          const updated = exerciseForm.muscles.filter((_, i) => i !== index);
                          setExerciseForm({ ...exerciseForm, muscles: updated });
                          setExerciseError('');
                        }}
                      >
                        ×
                      </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                      <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'flex-end' }}>
                        <button 
                          type="button" 
                          className="btn btn-outline" 
                          style={{ width: '100%', padding: '4px 8px', fontSize: '0.8rem', height: '32px' }}
                          onClick={() => setEditingCurveIndex(index)}
                        >
                          <Sliders size={14} style={{ marginRight: '6px' }} />
                          Sculpt Curve
                        </button>
                      </div>
                      <div>
                        <label className="modal-label" style={{ fontSize: '0.7rem' }}>Magnitude (%)</label>
                        <input type="number" className="modal-input" min="0" max="100" step="1" value={m.percentage} onChange={(e) => {
                          const updated = [...exerciseForm.muscles];
                          updated[index] = { ...m, percentage: parseInt(e.target.value) || 0 };
                          setExerciseForm({ ...exerciseForm, muscles: updated });
                        }} style={{ padding: '4px 8px', fontSize: '0.8rem' }} />
                      </div>
                    </div>
                  </div>
                )})}
              </div>
            )}
            
            {editingCurveIndex !== null && (
              <div style={{ marginTop: '20px', padding: '16px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                    Curva di Tensione: {exerciseForm.muscles[editingCurveIndex]?.name}
                  </h4>
                  <button 
                    type="button"
                    className="btn btn-primary"
                    style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                    onClick={() => setEditingCurveIndex(null)}
                  >
                    Fatto
                  </button>
                </div>
                <BezierEditor 
                  value={exerciseForm.muscles[editingCurveIndex] || {}}
                  onChange={(newCurve) => {
                    const updated = [...exerciseForm.muscles];
                    updated[editingCurveIndex] = { ...updated[editingCurveIndex], ...newCurve };
                    setExerciseForm({ ...exerciseForm, muscles: updated });
                  }}
                />
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '12px', textAlign: 'center' }}>
                  Trascina i punti arancioni per impostare la tensione iniziale e finale.<br/>
                  Trascina le maniglie blu per modificare l'accelerazione della resistenza.
                </p>
              </div>
            )}

            {editingCurveIndex === null && Object.keys(MUSCLES).filter(m => !exerciseForm.muscles.some(added => added.name === m)).length > 0 && (() => {
              const available = Object.keys(MUSCLES).filter(m => !exerciseForm.muscles.some(added => added.name === m));
              const scored = muscleSearch
                ? available
                    .map(m => {
                      const n = muscleSearch.toLowerCase();
                      const h = (m + ' ' + MUSCLES[m]).toLowerCase();
                      let ni = 0, score = 0, last = -1;
                      for (let hi = 0; hi < h.length && ni < n.length; hi++) {
                        if (h[hi] === n[ni]) { score += 10 - Math.min(hi - last - 1, 9); last = hi; ni++; }
                      }
                      return { m, score: ni < n.length ? -1 : score };
                    })
                    .filter(x => x.score >= 0)
                    .sort((a, b) => b.score - a.score)
                    .slice(0, 6)
                : [];

              const addMuscle = (name) => {
                const currentSum = exerciseForm.muscles.reduce((sum, x) => sum + x.percentage, 0);
                const defaultPct = Math.max(0, 100 - currentSum);
                setExerciseForm({
                  ...exerciseForm,
                  muscles: [...exerciseForm.muscles, { name, percentage: defaultPct, x0: 0, y0: 1, x1: 0.33, y1: 1, x2: 0.66, y2: 1, x3: 1, y3: 1 }]
                });
                setExerciseError('');
                setMuscleSearch('');
              };

              return (
                <div style={{ marginTop: '12px' }}>
                  <input
                    type="text"
                    className="modal-input"
                    style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem', background: 'rgba(5, 7, 15, 0.85)', color: 'var(--text-primary)', borderColor: 'rgba(99,102,241,0.3)' }}
                    placeholder="Search muscle to add… (Tab to select top)"
                    value={muscleSearch}
                    onChange={(e) => setMuscleSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Tab' && scored.length > 0) {
                        e.preventDefault();
                        addMuscle(scored[0].m);
                      }
                    }}
                  />
                  {scored.length > 0 && (
                    <div style={{
                      marginTop: '6px',
                      background: '#080b14',
                      border: '1px solid rgba(99,102,241,0.45)',
                      borderRadius: '8px',
                      overflow: 'hidden'
                    }}>
                      {scored.map(({ m }, i) => (
                        <div
                          key={m}
                          style={{
                            padding: '9px 14px', cursor: 'pointer', fontSize: '0.85rem',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            color: 'var(--text-primary)',
                            borderBottom: i < scored.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                            background: i === 0 ? 'rgba(99,102,241,0.10)' : 'transparent'
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.22)'}
                          onMouseLeave={e => e.currentTarget.style.background = i === 0 ? 'rgba(99,102,241,0.10)' : 'transparent'}
                          onMouseDown={(e) => { e.preventDefault(); addMuscle(m); }}
                        >
                          <span>
                            {i === 0 && <span style={{ fontSize: '0.65rem', color: 'var(--accent-primary)', marginRight: '6px', border: '1px solid rgba(99,102,241,0.4)', borderRadius: '3px', padding: '1px 4px' }}>Tab ↵</span>}
                            {m}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--accent-secondary)', background: 'rgba(6,182,212,0.12)', padding: '2px 7px', borderRadius: '4px' }}>{MUSCLES[m]}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Muscle validation bar */}
            <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Distribution Total:</span>
                <span style={{ fontWeight: 'bold', color: muscleSum === 100 ? '#22c55e' : '#ef4444' }}>
                  {muscleSum}% / 100%
                </span>
              </div>
              <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${Math.min(100, muscleSum)}%`,
                  background: muscleSum === 100 ? '#22c55e' : '#eab308',
                  transition: 'width 0.2s ease, background-color 0.2s ease'
                }} />
              </div>
            </div>

          </div>

          {exerciseError && <div className="modal-error" style={{ marginTop: '4px' }}>{exerciseError}</div>}

        </div>
        <div className="modal-actions">
          {currentHasOverride && (
            <button
              className="btn btn-danger"
              style={{ marginRight: 'auto' }}
              onClick={handleRemoveOverride}
            >
              Remove Override
            </button>
          )}
          <button className="btn" onClick={() => setShowExerciseModal(false)}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSaveExerciseForProgramOnly}
            disabled={isInvalid}
            style={disabledStyle}
          >
            Save for {currentProgram} Only
          </button>
          <button
            className="btn btn-success-solid"
            onClick={handleSaveExercise}
            disabled={isInvalid}
            style={disabledStyle}
          >
            Save Globally
          </button>
        </div>
      </div>
    </div>
  );
};

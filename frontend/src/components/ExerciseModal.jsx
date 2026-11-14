import { useMemo, useState } from 'react';
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
import { TensionRomSlider } from './FilterControls';

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

  const [curveSnapshot, setCurveSnapshot] = useState(null);

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
        <div className="modal-body" style={{ overflowY: 'auto', flex: 1, padding: isMobile ? '10px 8px 20px 8px' : '20px 16px', display: 'flex', flexDirection: 'column', gap: isMobile ? '8px' : '14px' }}>
          
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

          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: isMobile ? '10px' : '14px', marginTop: '4px' }}>
            {exerciseForm.muscles.length > 0 && (
              <div style={{
                width: '100%',
                marginBottom: isMobile ? '8px' : '16px',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--card-radius)',
                padding: isMobile ? '12px 12px 10px 12px' : '14px 16px 12px 16px',
                boxShadow: 'var(--card-shadow)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span className="chart-title" style={{ fontSize: '0.95rem', fontWeight: 600, color: '#fff' }}>
                    Tension Profiles
                  </span>
                  {isMobile && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                      ROM <strong style={{ color: '#fff', fontWeight: 600 }}>{tensionSliderPos}%</strong>
                    </span>
                  )}
                </div>
                <div style={{ height: isMobile ? '150px' : '170px', width: '100%' }}>
                  <ResponsiveContainer width="99%" height="100%" minWidth={0} minHeight={0}>
                    <LineChart
                      data={chartData}
                      margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                      style={isMobile ? { pointerEvents: 'none' } : undefined}
                    >
                      <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                      <XAxis
                        dataKey="x"
                        type="number"
                        domain={[0, 1]}
                        ticks={[0, 0.25, 0.5, 0.75, 1]}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                        tickFormatter={(val) => `${Math.round(val * 100)}%`}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                        width={38}
                        domain={[0, 1]}
                        tickFormatter={(v) => Math.round(v * 100)}
                      />
                      {!isMobile && (
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'var(--bg-glass-active)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            color: 'var(--text-primary)',
                            backdropFilter: 'blur(16px)',
                            WebkitBackdropFilter: 'blur(16px)',
                          }}
                          labelFormatter={(l) => `ROM: ${(l * 100).toFixed(0)}%`}
                          formatter={(val) => [(val * 100).toFixed(1) + '%', 'Tension']}
                        />
                      )}
                      {isMobile && (
                        <ReferenceLine
                          x={tensionSliderPos / 100}
                          stroke="rgba(255,255,255,0.35)"
                          strokeWidth={1.5}
                          strokeDasharray="3 3"
                        />
                      )}
                      {exerciseForm.muscles.map((m, i) => (
                        <Line
                          key={m.name}
                          type="monotone"
                          dataKey={m.name}
                          name={m.name}
                          stroke={chartColors[i % chartColors.length]}
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          dot={false}
                          activeDot={{ r: 4, strokeWidth: 0 }}
                          isAnimationActive={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                {isMobile ? (
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px 18px' }}>
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
                          <div
                            key={m.name}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '8px',
                              minWidth: 0,
                            }}
                          >
                            <span style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
                              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: color, flexShrink: 0 }} />
                              <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {m.name}
                              </span>
                            </span>
                            <span style={{ fontSize: '0.76rem', color: '#ffffff', fontWeight: 600, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                              {(normalizedY * 100).toFixed(1)}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <TensionRomSlider value={tensionSliderPos} onChange={setTensionSliderPos} />
                  </div>
                ) : (
                  <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexWrap: 'wrap', gap: '14px', justifyContent: 'center' }}>
                    {exerciseForm.muscles.map((m, i) => (
                      <span key={m.name} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: chartColors[i % chartColors.length] }} />
                        {m.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            {exerciseForm.muscles.length === 0 ? (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', margin: '8px 0' }}>
                No muscle groups assigned yet. Select a muscle below to add it.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '8px' : '10px' }}>
                {exerciseForm.muscles.map((m, index) => {
                  const dotColor = chartColors[index % chartColors.length];
                  const isExpanded = editingCurveIndex === index;
                  return (
                  <div
                    key={m.name}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      background: 'var(--bg-secondary)',
                      padding: isMobile ? '12px' : '14px 16px',
                      borderRadius: 'var(--card-radius)',
                      border: isExpanded ? '1px solid var(--border-color-hover)' : '1px solid var(--border-color)',
                      boxShadow: 'var(--card-shadow)',
                      transition: 'border-color 0.25s ease',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '7px' }}>
                          <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: dotColor }}></span>
                          {m.name}
                        </span>
                        <button
                          type="button"
                          className="btn-icon-small"
                          style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          onClick={() => {
                            if (!window.confirm(`Remove "${m.name}" from this exercise?`)) return;
                            const updated = exerciseForm.muscles.filter((_, i) => i !== index);
                            setExerciseForm({ ...exerciseForm, muscles: updated });
                            if (editingCurveIndex === index) {
                              setEditingCurveIndex(null);
                              setCurveSnapshot(null);
                            } else if (editingCurveIndex !== null && editingCurveIndex > index) {
                              setEditingCurveIndex(editingCurveIndex - 1);
                            }
                            setExerciseError('');
                          }}
                        >
                          ×
                        </button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                        <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                          {isExpanded ? (
                            <>
                              <button
                                type="button"
                                className="btn btn-outline"
                                style={{ flex: 1, padding: '4px 8px', fontSize: '0.8rem', height: '32px' }}
                                onClick={() => {
                                  if (curveSnapshot) {
                                    const updated = [...exerciseForm.muscles];
                                    updated[index] = { ...updated[index], ...curveSnapshot };
                                    setExerciseForm({ ...exerciseForm, muscles: updated });
                                  }
                                  setEditingCurveIndex(null);
                                  setCurveSnapshot(null);
                                }}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                className="btn btn-primary"
                                style={{ flex: 1, padding: '4px 8px', fontSize: '0.8rem', height: '32px' }}
                                onClick={() => {
                                  setEditingCurveIndex(null);
                                  setCurveSnapshot(null);
                                }}
                              >
                                Done
                              </button>
                            </>
                          ) : (
                            <button 
                              type="button" 
                              className="btn btn-outline"
                              style={{ width: '100%', padding: '4px 8px', fontSize: '0.8rem', height: '32px' }}
                              onClick={() => {
                                setCurveSnapshot({
                                  x0: m.x0, y0: m.y0,
                                  x1: m.x1, y1: m.y1,
                                  x2: m.x2, y2: m.y2,
                                  x3: m.x3, y3: m.y3,
                                });
                                setEditingCurveIndex(index);
                              }}
                            >
                              <Sliders size={14} style={{ marginRight: '6px' }} />
                              Sculpt Curve
                            </button>
                          )}
                        </div>
                        <div>
                          <label className="modal-label" style={{ fontSize: '0.7rem' }}>Magnitude (%)</label>
                          <input type="number" className="modal-input" min="0" max="100" step="1" value={m.percentage} onChange={(e) => {
                            const updated = [...exerciseForm.muscles];
                            updated[index] = { ...m, percentage: Math.max(0, parseInt(e.target.value, 10) || 0) };
                            setExerciseForm({ ...exerciseForm, muscles: updated });
                          }} style={{ padding: '4px 8px', fontSize: '0.8rem' }} />
                        </div>
                      </div>
                    </div>

                    {/* Smoothly expanding curve sculptor inside the muscle card */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateRows: isExpanded ? '1fr' : '0fr',
                        opacity: isExpanded ? 1 : 0,
                        marginTop: isExpanded ? '12px' : '0px',
                        transition: 'grid-template-rows 0.28s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.22s ease, margin-top 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
                      }}
                    >
                      <div style={{ overflow: 'hidden' }}>
                        <div style={{
                          paddingTop: '12px',
                          borderTop: '1px solid rgba(255,255,255,0.06)',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                        }}>
                          <BezierEditor 
                            value={m}
                            onChange={(newCurve) => {
                              const updated = [...exerciseForm.muscles];
                              updated[index] = { ...updated[index], ...newCurve };
                              setExerciseForm({ ...exerciseForm, muscles: updated });
                            }}
                          />
                          <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '10px', marginBottom: 0, textAlign: 'center', lineHeight: 1.4 }}>
                            Drag the orange points to set initial and final tension.<br/>
                            Drag the blue handles to modify resistance acceleration.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )})}
              </div>
            )}

            {Object.keys(MUSCLES).filter(m => !exerciseForm.muscles.some(added => added.name === m)).length > 0 && (() => {
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
                    style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem', background: 'rgba(12, 12, 12, 0.9)', color: 'var(--text-primary)', borderColor: 'rgba(99,102,241,0.3)' }}
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
                      background: '#0d0d0d',
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

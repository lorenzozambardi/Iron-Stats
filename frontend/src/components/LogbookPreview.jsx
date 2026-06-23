import React, { useState, useEffect, useRef } from 'react';
import { MUSCLES } from '../constants';
import { formatRestTime, groupSets } from './helpers';

function LogbookPreview({ workoutData, activeExerciseStartLine, activeWeekLineIndex, editorMode }) {
  const scrollAnimRef = useRef(null);
  const [expandedExerciseName, setExpandedExerciseName] = useState(null);

  useEffect(() => {
    if (activeExerciseStartLine !== null && activeExerciseStartLine !== undefined) {
      const element = document.getElementById(`preview-ex-${activeExerciseStartLine}`);
      if (element) {
        const container = element.closest('.preview-container');
        if (container) {
          const elementRect = element.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          const targetY = container.scrollTop + (elementRect.top - containerRect.top);
          
          if (scrollAnimRef.current) {
            cancelAnimationFrame(scrollAnimRef.current);
          }

          const startY = container.scrollTop;
          const difference = targetY - startY;
          const duration = 200; // 200ms is the sweet spot for quintic ease-out
          const startTime = performance.now();

          const step = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Cubic Bezier-equivalent curve: easeOutQuint (cubic-bezier(0.23, 1, 0.32, 1))
            const ease = 1 - Math.pow(1 - progress, 5);
            container.scrollTop = startY + difference * ease;
            if (progress < 1) {
              scrollAnimRef.current = requestAnimationFrame(step);
            } else {
              scrollAnimRef.current = null;
            }
          };
          scrollAnimRef.current = requestAnimationFrame(step);
        }
      }
    }
    return () => {
      if (scrollAnimRef.current) {
        cancelAnimationFrame(scrollAnimRef.current);
      }
    };
  }, [activeExerciseStartLine]);

  if (!workoutData || workoutData.length === 0) {
    return (
      <div className="preview-empty">
        <p>No content to preview yet. Start typing your logbook sessions!</p>
      </div>
    );
  }

  // Group by session
  const sessions = {};
  workoutData.forEach(ex => {
    if (!sessions[ex.session]) {
      sessions[ex.session] = [];
    }
    sessions[ex.session].push(ex);
  });

  return (
    <div className="logbook-preview-content">
      {Object.entries(sessions).map(([sessNum, exercises]) => (
        <div key={sessNum} className="preview-session-group">
          <h2 className="preview-session-title">Session {sessNum}</h2>
          
          <div className="preview-exercises-list">
            {exercises.map((ex, exIdx) => {
              const isActive = activeExerciseStartLine === ex.startLine;
              return (
                <div 
                  key={exIdx} 
                  id={`preview-ex-${ex.startLine}`}
                  className={`preview-exercise-card ${isActive ? 'active' : ''}`}
                  style={{ cursor: (editorMode === 'preview' && ex.exercise_obj) ? 'pointer' : 'default' }}
                  onClick={() => {
                    if (editorMode === 'preview' && ex.exercise_obj) {
                      setExpandedExerciseName(expandedExerciseName === ex.exercise_obj.name ? null : ex.exercise_obj.name);
                    }
                  }}
                >
                  <div className="preview-exercise-header">
                    <div className="preview-exercise-info">
                      <h3>{ex.exercise_obj ? ex.exercise_obj.name : ex.raw_name}</h3>
                      <div className="preview-badges">
                        <span className="badge">{formatRestTime(ex.rest_seconds)} rest</span>
                        {ex.exercise_obj && (
                          <span className="badge muscle">
                            {MUSCLES[Object.keys(ex.exercise_obj.muscles_distr)[0]] || Object.keys(ex.exercise_obj.muscles_distr)[0]}
                          </span>
                        )}
                        {editorMode === 'preview' && ex.exercise_obj && (
                          <span 
                            className="badge info-btn" 
                            style={{ cursor: 'pointer', border: '1px solid rgba(99, 102, 241, 0.4)', background: 'rgba(99, 102, 241, 0.05)', color: 'var(--accent-primary)' }}
                          >
                            {expandedExerciseName === ex.exercise_obj.name ? 'Hide Info' : 'Show Info'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Render Expanded Info under header if expanded */}
                  {editorMode === 'preview' && ex.exercise_obj && expandedExerciseName === ex.exercise_obj.name && (
                    <div style={{ 
                      marginTop: '4px', 
                      marginBottom: '12px', 
                      padding: '10px', 
                      background: 'rgba(0,0,0,0.2)', 
                      borderRadius: '8px', 
                      border: '1px solid var(--border-color)', 
                      fontSize: '0.75rem',
                      textAlign: 'left'
                    }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '6px', marginBottom: '8px' }}>
                        <div><span style={{ color: 'var(--text-muted)' }}>Fatigue:</span> <strong style={{ color: 'var(--text-primary)' }}>{ex.exercise_obj.fatigue}</strong></div>
                        <div><span style={{ color: 'var(--text-muted)' }}>Load Coeff:</span> <strong style={{ color: 'var(--text-primary)' }}>{ex.exercise_obj.load_coeff}</strong></div>
                        <div><span style={{ color: 'var(--text-muted)' }}>Multiplier:</span> <strong style={{ color: 'var(--text-primary)' }}>{ex.exercise_obj.load_multiplier}x</strong></div>
                        <div><span style={{ color: 'var(--text-muted)' }}>Offset:</span> <strong style={{ color: 'var(--text-primary)' }}>{ex.exercise_obj.load_offset}kg</strong></div>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Muscle Distribution:</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {Object.entries(ex.exercise_obj.muscles_distr).map(([muscle, pct]) => (
                            <span key={muscle} className="badge muscle" style={{ background: 'rgba(99, 102, 241, 0.12)', border: '1px solid rgba(99, 102, 241, 0.25)', fontSize: '0.65rem', padding: '2px 6px' }}>
                              {muscle}: <strong>{Math.round((typeof pct === 'number' ? pct : (pct.magnitude || 0)) * 100)}%</strong>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="preview-weeks-grid">
                    {ex.weeks.map(wk => {
                      const isWeekActive = activeWeekLineIndex === wk.lineIndex;
                      return (
                        <div key={wk.week_num} className={`preview-week-column ${isWeekActive ? 'active' : ''}`}>
                          <div className="preview-week-header">W{wk.week_num}</div>
                          <div className="preview-sets-list">
                            {groupSets(wk.sets).map((g, gIdx) => {
                              if (g.isDropset) {
                                return (
                                  <div key={gIdx} className="preview-set-row dropset" style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'stretch', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: '4px', padding: '3px' }}>
                                    <div style={{ fontSize: '0.55rem', textTransform: 'uppercase', color: 'rgba(239, 68, 68, 0.8)', textAlign: 'center', fontWeight: 'bold', borderBottom: '1px solid rgba(239, 68, 68, 0.1)', paddingBottom: '1px', marginBottom: '2px' }}>Dropset</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: '2px' }}>
                                      {g.sets.map((s, sIdx) => (
                                        <React.Fragment key={sIdx}>
                                          {sIdx > 0 && <span style={{ color: 'rgba(239, 68, 68, 0.4)', fontSize: '0.65rem' }}>➔</span>}
                                          <span style={{ fontSize: '0.65rem', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '1px' }}>
                                            <span className="preview-set-weight">{s.load}</span>
                                            <span className="preview-set-reps">×{s.base_reps + s.assisted_reps}</span>
                                            {s.partial_reps > 0 && <span className="preview-set-partial" style={{ fontSize: '0.6rem' }}>+{s.partial_reps}p</span>}
                                            {s.assisted_reps > 0 && <span className="preview-set-assisted" style={{ fontSize: '0.6rem' }}>({s.assisted_reps}a)</span>}
                                            {s.rpe !== undefined && s.rpe !== null && <span style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '0.55rem', marginLeft: '2px' }}>@{s.rpe}</span>}
                                          </span>
                                        </React.Fragment>
                                      ))}
                                    </div>
                                  </div>
                                );
                              } else {
                                const s = g.set;
                                return (
                                  <div key={gIdx} className="preview-set-row">
                                    <span className="preview-set-weight">{s.load}kg</span>
                                    <span className="preview-set-reps">× {s.base_reps + s.assisted_reps}</span>
                                    {s.partial_reps > 0 && <span className="preview-set-partial">+{s.partial_reps}p</span>}
                                    {s.assisted_reps > 0 && <span className="preview-set-assisted">({s.assisted_reps}a)</span>}
                                    {s.rpe !== undefined && s.rpe !== null && <span style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '0.55rem', marginLeft: '3px' }}>@{s.rpe}</span>}
                                  </div>
                                );
                              }
                            })}
                            {wk.sets.length === 0 && (
                              <div className="preview-no-sets">-</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}


export default LogbookPreview;

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MUSCLES } from '../parser';
import { formatDisplayDate } from '../profileUtils';
import { formatRestTime, groupSets } from './helpers';

function LogbookPreview({ workoutData, activeExerciseStartLine, activeWeekLineIndex, editorMode, dateFormat = 'dd/mm/yyyy' }) {
  const scrollAnimRef = useRef(null);
  const [expandedExerciseKey, setExpandedExerciseKey] = useState(null);

  useEffect(() => {
    if (activeExerciseStartLine === null || activeExerciseStartLine === undefined) return;
    let cancelled = false;

    const rafInit = requestAnimationFrame(() => {
      if (cancelled) return;
      const element = document.getElementById(`preview-ex-${activeExerciseStartLine}`);
      if (!element) return;
      const container = element.closest('.preview-container');
      if (!container) return;

      const elementRect = element.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const offset = editorMode === 'split' ? 12 : 68;
      const targetY = Math.max(0, container.scrollTop + (elementRect.top - containerRect.top) - offset);

      if (scrollAnimRef.current) {
        cancelAnimationFrame(scrollAnimRef.current);
      }

      const startY = container.scrollTop;
      const difference = targetY - startY;
      if (Math.abs(difference) < 1) return;
      const duration = 200; // 200ms is the sweet spot for quintic ease-out
      const startTime = performance.now();

      const step = (currentTime) => {
        if (cancelled) return;
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
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafInit);
      if (scrollAnimRef.current) {
        cancelAnimationFrame(scrollAnimRef.current);
      }
    };
  }, [activeExerciseStartLine, editorMode]);

  // Group by session — memoized to avoid recomputing on every editor keystroke
  const sessionsWithMeta = useMemo(() => {
    const sessions = {};
    if (!workoutData) return [];
    workoutData.forEach(ex => {
      if (!sessions[ex.session]) sessions[ex.session] = [];
      sessions[ex.session].push(ex);
    });

    return Object.entries(sessions).map(([sessNum, exercises]) => {
      const latestWeek = Math.max(...exercises.flatMap(e => e.weeks.map(w => w.week_num)), 1);
      let totalEffReps = 0;
      const muscleEffReps = {};

      exercises.forEach(ex => {
        const wk = ex.weeks.find(w => w.week_num === latestWeek);
        if (wk && ex.exercise_obj) {
          let exEffReps = 0;
          wk.sets.forEach(s => { exEffReps += (s.effectiveReps || 0); });
          totalEffReps += exEffReps;
          Object.entries(ex.exercise_obj.muscles_distr).forEach(([sub, pct]) => {
            const pctVal = typeof pct === 'number' ? pct : (pct?.magnitude || 0);
            const main = MUSCLES[sub];
            if (main) muscleEffReps[main] = (muscleEffReps[main] || 0) + (exEffReps * pctVal);
          });
        }
      });

      const qualifyingMuscles = Object.entries(muscleEffReps)
        .filter(([, reps]) => reps >= 10).map(([main]) => main).sort();

      const sessionDateList = Array.from(
        new Set(exercises.flatMap(e => e.weeks.map(w => w.date).filter(Boolean)))
      ).sort();
      const firstDate = sessionDateList.length > 0 ? sessionDateList[0] : null;
      const lastDate = sessionDateList.length > 0 ? sessionDateList[sessionDateList.length - 1] : null;

      const groupedWeeksMap = new Map();
      exercises.forEach(ex => {
        ex.weeks.forEach(wk => {
          groupedWeeksMap.set(wk, groupSets(wk.sets));
        });
      });

      return { sessNum, exercises, latestWeek, totalEffReps, qualifyingMuscles, firstDate, lastDate, groupedWeeksMap };
    });
  }, [workoutData]);

  if (!workoutData || workoutData.length === 0) {
    return (
      <div className="preview-empty">
        <p>No content to preview yet. Start typing your logbook sessions!</p>
      </div>
    );
  }

  return (
    <div className="logbook-preview-content">
      {sessionsWithMeta.map(({ sessNum, exercises, latestWeek, totalEffReps, qualifyingMuscles, firstDate, lastDate, groupedWeeksMap }) => {
        const dateRangeLabel = firstDate
          ? (firstDate === lastDate
              ? formatDisplayDate(firstDate, dateFormat)
              : `${formatDisplayDate(firstDate, dateFormat)} – ${formatDisplayDate(lastDate, dateFormat)}`)
          : null;
        return (
          <div key={sessNum} className="preview-session-group">
            <div className="preview-session-header-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span className="preview-session-eyebrow">Session {sessNum}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  {dateRangeLabel && (
                    <span className="preview-session-pill">{dateRangeLabel}</span>
                  )}
                  <span className="preview-session-pill">{exercises.length} ex</span>
                  <span className="preview-session-pill">{totalEffReps.toFixed(0)} eff. reps · m{latestWeek}</span>
                </div>
              </div>
              {qualifyingMuscles.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                  {qualifyingMuscles.map(m => (
                    <span key={m} className="preview-session-muscle-chip">{m}</span>
                  ))}
                </div>
              )}
            </div>
          
          <div className="preview-exercises-list">
            {exercises.map((ex, exIdx) => {
              const isActive = activeExerciseStartLine === ex.startLine;
              const primaryMuscleKey = ex.exercise_obj?.muscles_distr
                ? Object.entries(ex.exercise_obj.muscles_distr)
                  .sort(([, a], [, b]) => {
                    const magA = typeof a === 'number' ? a : (a?.magnitude || 0);
                    const magB = typeof b === 'number' ? b : (b?.magnitude || 0);
                    return magB - magA;
                  })[0]?.[0] || null
                : null;
              const primaryMuscleLabel = primaryMuscleKey
                ? (MUSCLES[primaryMuscleKey] || primaryMuscleKey)
                : null;
              const exKey = ex.startLine ?? `${sessNum}_${exIdx}`;
              const isExpanded = editorMode === 'preview' && ex.exercise_obj && expandedExerciseKey === exKey;

              return (
                <div 
                  key={exIdx} 
                  id={`preview-ex-${ex.startLine}`}
                  className={`preview-exercise-card ${isActive ? 'active' : ''}`}
                  style={{ cursor: (editorMode === 'preview' && ex.exercise_obj) ? 'pointer' : 'default' }}
                  onClick={() => {
                    if (editorMode === 'preview' && ex.exercise_obj) {
                      setExpandedExerciseKey(expandedExerciseKey === exKey ? null : exKey);
                    }
                  }}
                >
                  <div className="preview-exercise-header">
                    <div className="preview-exercise-info">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', width: '100%' }}>
                        <h3>{ex.exercise_obj ? ex.exercise_obj.name : ex.raw_name}</h3>
                        {primaryMuscleLabel && (
                          <span className="badge muscle" style={{ flexShrink: 0 }}>
                            {primaryMuscleLabel}
                          </span>
                        )}
                      </div>
                      <div className="preview-badges">
                        <span className="badge">{formatRestTime(ex.rest_seconds)} rest</span>
                        {ex.concentric !== undefined && (
                          <span className="badge tempo">
                            {ex.concentric}-{ex.shortening_pause}-{ex.eccentric}-{ex.lengthening_pause}
                          </span>
                        )}
                        {editorMode === 'preview' && ex.exercise_obj && (
                          <span 
                            className={`badge info-btn ${isExpanded ? 'active' : ''}`} 
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedExerciseKey(expandedExerciseKey === exKey ? null : exKey);
                            }}
                          >
                            {isExpanded ? 'Hide Info' : 'Info'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Render Expanded Info under header if expanded */}
                  {isExpanded && (
                    <div
                      style={{
                        padding: '10px 12px',
                        background: 'var(--bg-primary)',
                        borderRadius: '10px',
                        border: '1px solid var(--border-color)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        textAlign: 'left'
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '8px' }}>
                        {[
                          { label: 'FATIGUE', value: ex.exercise_obj.fatigue },
                          { label: 'LOAD COEFF', value: ex.exercise_obj.load_coeff },
                          { label: 'MULTIPLIER', value: `${ex.exercise_obj.load_multiplier}x` },
                          { label: 'OFFSET', value: `${ex.exercise_obj.load_offset}kg` }
                        ].map(({ label, value }) => (
                          <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                            <span style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600, color: 'var(--text-muted)' }}>
                              {label}
                            </span>
                            <strong style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                              {value}
                            </strong>
                          </div>
                        ))}
                      </div>
                      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '8px' }}>
                        <span style={{ display: 'block', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                          Muscle Distribution
                        </span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {Object.entries(ex.exercise_obj.muscles_distr).map(([muscle, pct]) => (
                            <span key={muscle} className="badge muscle">
                              {muscle}: <strong>{Math.round((typeof pct === 'number' ? pct : (pct.magnitude || 0)) * 100)}%</strong>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <div
                    className="preview-weeks-grid"
                    style={ex.weeks.length === 1 ? { gridTemplateColumns: '1fr' } : undefined}
                  >
                    {ex.weeks.map(wk => {
                      const isWeekActive = activeWeekLineIndex === wk.lineIndex;
                      return (
                        <div key={wk.week_num} className={`preview-week-column ${isWeekActive ? 'active' : ''}`}>
                          <div className="preview-week-header">
                            <span className="preview-week-label">
                              <span>m{wk.week_num}</span>
                              {wk.date && (
                                <span className="preview-week-date">{formatDisplayDate(wk.date, dateFormat)}</span>
                              )}
                            </span>
                            <span className="preview-week-count">
                              {wk.sets.length} {wk.sets.length === 1 ? 'set' : 'sets'}
                            </span>
                          </div>
                          <div className="preview-sets-list">
                            {(groupedWeeksMap.get(wk) || []).map((g, gIdx) => {
                              if (g.isDropset) {
                                return (
                                  <div
                                    key={gIdx}
                                    className="preview-set-row dropset"
                                    style={{
                                      background: 'rgba(244, 63, 94, 0.06)',
                                      border: '1px solid rgba(244, 63, 94, 0.2)',
                                      borderRadius: '6px',
                                      padding: '4px 6px',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: '2px',
                                      alignItems: 'stretch'
                                    }}
                                  >
                                    <div style={{ fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-fatigue)', fontWeight: 700, textAlign: 'left' }}>
                                      Dropset
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px' }}>
                                      {g.sets.map((s, sIdx) => (
                                        <React.Fragment key={sIdx}>
                                          {sIdx > 0 && <span style={{ color: 'rgba(244, 63, 94, 0.55)', fontSize: '0.68rem' }}>→</span>}
                                          <span style={{ fontSize: '0.7rem', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'baseline', gap: '2px' }}>
                                            <span className="preview-set-weight">{s.load}<span className="preview-set-unit">kg</span></span>
                                            <span className="preview-set-reps">×{s.base_reps + s.assisted_reps}</span>
                                            {s.partial_reps > 0 && <span className="preview-set-partial">+{s.partial_reps}p</span>}
                                            {s.assisted_reps > 0 && <span className="preview-set-assisted">({s.assisted_reps}a)</span>}
                                            {s.rpe !== undefined && s.rpe !== null && <span className="preview-set-rpe" style={{ marginLeft: '2px' }}>@{s.rpe}</span>}
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
                                    <span className="preview-set-main">
                                      <span className="preview-set-weight">{s.load}<span className="preview-set-unit">kg</span></span>
                                      <span className="preview-set-reps">× {s.base_reps + s.assisted_reps}</span>
                                      {s.partial_reps > 0 && <span className="preview-set-partial">+{s.partial_reps}p</span>}
                                      {s.assisted_reps > 0 && <span className="preview-set-assisted">({s.assisted_reps}a)</span>}
                                    </span>
                                    {s.rpe !== undefined && s.rpe !== null && <span className="preview-set-rpe">@{s.rpe}</span>}
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
      )})}
    </div>
  );
}


export default React.memo(LogbookPreview);

import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { MUSCLES } from '../parser';

function parseSetLineToSets(line) {
  if (!line || !line.trim()) return [];
  const rawSets = line.trim().split(/(?<=\d[\w+()@]*)\.(?=\d)/);
  return rawSets.filter(s => s.trim().length > 0);
}

function parseLogbookToStructure(text) {
  if (!text) return [];
  const lines = text.split('\n');
  const sessions = [];
  let currentSession = null;
  let currentExercise = null;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    
    if (!line) continue;

    if (line.startsWith('#')) {
      currentSession = {
        title: line,
        exercises: []
      };
      sessions.push(currentSession);
      currentExercise = null;
      continue;
    }

    if (!currentSession) {
      currentSession = { title: '# 1', exercises: [] };
      sessions.push(currentSession);
    }

    const isSetLine = line.includes('..') || /^[old\s]*[\d().+/@\s]+$/i.test(line);

    if (!isSetLine && line.length > 0 && !line.toLowerCase().startsWith('override:')) {
      const parts = line.split('|').map(p => p.trim());
      const exName = parts[0];
      const rest = parts[1] || "2'";
      const restStr = parts.slice(2).join(' | ');
      
      let tempo = '';
      let note = restStr;
      const tempoMatch = restStr.match(/\b(\d+\s*-\s*\d+\s*-\s*\d+\s*-\s*\d+)\b/);
      if (tempoMatch) {
        tempo = tempoMatch[1].replace(/\s+/g, '');
        note = restStr.replace(tempoMatch[0], '').replace(/^[\s,|,-]+|[\s,|,-]+$/g, '').trim();
      }

      currentExercise = {
        name: exName,
        rest: rest,
        tempo: tempo,
        note: note,
        weeks: []
      };
      currentSession.exercises.push(currentExercise);
    } else if (currentExercise && isSetLine) {
      const parsedSets = parseSetLineToSets(line);
      currentExercise.weeks.push({ sets: parsedSets.length > 0 ? parsedSets : [line] });
    } else if (!isSetLine && !line.toLowerCase().startsWith('override:')) {
      currentExercise = {
        name: line,
        rest: "2'",
        tempo: '',
        note: '',
        weeks: []
      };
      currentSession.exercises.push(currentExercise);
    }
  }

  return sessions;
}

function serializeStructureToText(sessions) {
  return sessions.map(sess => {
    let sStr = (sess.title || '').startsWith('#') ? sess.title : `# ${sess.title || ''}`;
    const exStrs = sess.exercises.map(ex => {
      let header = ex.name;
      if (ex.rest) header += ` | ${ex.rest}`;
      if (ex.tempo) header += ` | ${ex.tempo}`;
      if (ex.note) header += ` | ${ex.note}`;
      const weeksStr = ex.weeks.map(wk => wk.sets.join('.')).filter(w => w.length > 0).join('\n');
      return weeksStr ? `${header}\n${weeksStr}` : header;
    });
    return [sStr, ...exStrs].join('\n\n');
  }).join('\n\n');
}

export default function EasyEditor({ logbookText, onChange, exercisesDb = [] }) {
  const [sessions, setSessions] = useState(() => parseLogbookToStructure(logbookText));
  const isInternalChange = useRef(false);

  useEffect(() => {
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    setSessions(parseLogbookToStructure(logbookText));
  }, [logbookText]);

  const triggerChange = (newSessions) => {
    setSessions(newSessions);
    isInternalChange.current = true;
    const newText = serializeStructureToText(newSessions);
    onChange(newText);
  };

  const updateSessionTitle = (sIdx, newTitle) => {
    const updated = sessions.map((s, idx) => idx === sIdx ? { ...s, title: newTitle } : s);
    triggerChange(updated);
  };

  const addSession = () => {
    insertSessionAtIndex(sessions.length);
  };

  const insertSessionAtIndex = (targetIndex) => {
    const nextNum = sessions.length + 1;
    const newSess = { title: `# ${nextNum}`, exercises: [] };
    const newSessions = [...sessions];
    newSessions.splice(targetIndex, 0, newSess);
    triggerChange(newSessions);
  };

  const deleteSession = (sIdx) => {
    const sTitle = sessions[sIdx]?.title || 'this session';
    if (window.confirm(`Are you sure you want to delete "${sTitle}"?`)) {
      const updated = sessions.filter((_, idx) => idx !== sIdx);
      triggerChange(updated);
    }
  };

  const insertExerciseAtIndex = (sIdx, targetIndex) => {
    const defaultName = exercisesDb.length > 0 ? exercisesDb[0].name : 'Exercise';
    const newEx = {
      name: defaultName,
      rest: "2'",
      tempo: '',
      note: '',
      weeks: [{ sets: ['35..5', '30..7'] }]
    };
    const updated = sessions.map((s, idx) => {
      if (idx === sIdx) {
        const newExs = [...s.exercises];
        newExs.splice(targetIndex, 0, newEx);
        return { ...s, exercises: newExs };
      }
      return s;
    });
    triggerChange(updated);
  };

  const updateExercise = (sIdx, eIdx, fields) => {
    const updated = sessions.map((s, idx) => {
      if (idx === sIdx) {
        const updatedExs = s.exercises.map((ex, exIdx) => exIdx === eIdx ? { ...ex, ...fields } : ex);
        return { ...s, exercises: updatedExs };
      }
      return s;
    });
    triggerChange(updated);
  };

  const deleteExercise = (sIdx, eIdx) => {
    const exName = sessions[sIdx]?.exercises[eIdx]?.name || 'this exercise';
    if (window.confirm(`Are you sure you want to delete "${exName}"?`)) {
      const updated = sessions.map((s, idx) => {
        if (idx === sIdx) {
          return { ...s, exercises: s.exercises.filter((_, exIdx) => exIdx !== eIdx) };
        }
        return s;
      });
      triggerChange(updated);
    }
  };

  const addWeek = (sIdx, eIdx) => {
    const updated = sessions.map((s, idx) => {
      if (idx === sIdx) {
        const updatedExs = s.exercises.map((ex, exIdx) => {
          if (exIdx === eIdx) {
            const lastWeekSets = ex.weeks.length > 0 ? [...ex.weeks[ex.weeks.length - 1].sets] : ['35..5'];
            return { ...ex, weeks: [...ex.weeks, { sets: lastWeekSets }] };
          }
          return ex;
        });
        return { ...s, exercises: updatedExs };
      }
      return s;
    });
    triggerChange(updated);
  };

  const deleteWeek = (sIdx, eIdx, wIdx) => {
    if (window.confirm(`Are you sure you want to delete Week ${wIdx + 1}?`)) {
      const updated = sessions.map((s, idx) => {
        if (idx === sIdx) {
          const updatedExs = s.exercises.map((ex, exIdx) => {
            if (exIdx === eIdx) {
              return { ...ex, weeks: ex.weeks.filter((_, wkIdx) => wkIdx !== wIdx) };
            }
            return ex;
          });
          return { ...s, exercises: updatedExs };
        }
        return s;
      });
      triggerChange(updated);
    }
  };

  const addSetToWeek = (sIdx, eIdx, wIdx) => {
    const updated = sessions.map((s, idx) => {
      if (idx === sIdx) {
        const updatedExs = s.exercises.map((ex, exIdx) => {
          if (exIdx === eIdx) {
            const updatedWeeks = ex.weeks.map((wk, wkIdx) => {
              if (wkIdx === wIdx) {
                const lastSetVal = wk.sets.length > 0 ? wk.sets[wk.sets.length - 1] : '35..5';
                return { ...wk, sets: [...wk.sets, lastSetVal] };
              }
              return wk;
            });
            return { ...ex, weeks: updatedWeeks };
          }
          return ex;
        });
        return { ...s, exercises: updatedExs };
      }
      return s;
    });
    triggerChange(updated);
  };

  const updateSetValue = (sIdx, eIdx, wIdx, stIdx, newVal) => {
    const updated = sessions.map((s, idx) => {
      if (idx === sIdx) {
        const updatedExs = s.exercises.map((ex, exIdx) => {
          if (exIdx === eIdx) {
            const updatedWeeks = ex.weeks.map((wk, wkIdx) => {
              if (wkIdx === wIdx) {
                const newSets = wk.sets.map((val, i) => i === stIdx ? newVal : val);
                return { ...wk, sets: newSets };
              }
              return wk;
            });
            return { ...ex, weeks: updatedWeeks };
          }
          return ex;
        });
        return { ...s, exercises: updatedExs };
      }
      return s;
    });
    triggerChange(updated);
  };

  const updateSetLoadRepsRpe = (sIdx, eIdx, wIdx, stIdx, newLoad, newReps, newRpe) => {
    const l = (newLoad || '').trim();
    const r = (newReps || '').trim();
    const rp = (newRpe || '').trim();
    
    if (!l && !r && !rp) {
      updateSetValue(sIdx, eIdx, wIdx, stIdx, '');
      return;
    }
    let base = `${l}..${r}`;
    if (rp) {
      base += `@${rp}`;
    }
    updateSetValue(sIdx, eIdx, wIdx, stIdx, base);
  };

  const deleteSetFromWeek = (sIdx, eIdx, wIdx, stIdx) => {
    if (window.confirm(`Are you sure you want to delete Set ${stIdx + 1}?`)) {
      const updated = sessions.map((s, idx) => {
        if (idx === sIdx) {
          const updatedExs = s.exercises.map((ex, exIdx) => {
            if (exIdx === eIdx) {
              const updatedWeeks = ex.weeks.map((wk, wkIdx) => {
                if (wkIdx === wIdx) {
                  return { ...wk, sets: wk.sets.filter((_, i) => i !== stIdx) };
                }
                return wk;
              });
              return { ...ex, weeks: updatedWeeks };
            }
            return ex;
          });
          return { ...s, exercises: updatedExs };
        }
        return s;
      });
      triggerChange(updated);
    }
  };

  const getMuscleForExercise = (exName) => {
    if (!exercisesDb || exercisesDb.length === 0) return null;
    const match = exercisesDb.find(e => e.name.toLowerCase() === exName.toLowerCase());
    if (match && match.muscles_distr) {
      const keys = Object.keys(match.muscles_distr);
      if (keys.length > 0) {
        return MUSCLES[keys[0]] || keys[0];
      }
    }
    return null;
  };

  return (
    <div className="easy-editor-container" style={{ background: 'var(--bg-primary)', height: '100%', overflowY: 'auto', padding: '84px 10px 24px 10px', display: 'flex', flexDirection: 'column', gap: '16px', boxSizing: 'border-box' }}>
      <datalist id="easy-exercises-db-list">
        {exercisesDb.map(ex => (
          <option key={ex.name} value={ex.name} />
        ))}
      </datalist>
      <datalist id="rpe-suggestions-list">
        <option value="6" />
        <option value="6.5" />
        <option value="7" />
        <option value="7.5" />
        <option value="8" />
        <option value="8.5" />
        <option value="9" />
        <option value="9.5" />
        <option value="10" />
      </datalist>

      {sessions.length === 0 && (
        <div style={{ padding: '30px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', textAlign: 'center', background: 'rgba(255,255,255,0.01)', borderRadius: '12px', border: '1px dashed var(--border-color)' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>No sessions found in logbook.</p>
          <button 
            onClick={addSession}
            style={{ background: 'var(--accent-primary)', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={16}/> Create First Session (# 1)
          </button>
        </div>
      )}

      {sessions.map((sess, sIdx) => (
        <React.Fragment key={sIdx}>
          <div className="preview-session-group" style={{ display: 'flex', flexDirection: 'column', gap: '14px', background: 'rgba(255, 255, 255, 0.015)', border: '1px solid var(--border-color)', borderLeft: '4px solid var(--accent-primary)', borderRadius: '14px', padding: '14px 10px' }}>
            
            {/* Session Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '4px 0' }}>
              <input 
                value={(sess.title || '').replace(/^#\s*/, '')}
                onChange={(e) => {
                  const val = e.target.value;
                  const formatted = val.trim() ? (val.startsWith('#') ? val : `# ${val}`) : '# ';
                  updateSessionTitle(sIdx, formatted);
                }}
                style={{ background: 'transparent', border: 'none', color: 'var(--accent-primary)', fontSize: '1.25rem', fontWeight: 'bold', fontFamily: 'var(--font-display)', outline: 'none', width: '100%', appearance: 'none', WebkitAppearance: 'none' }}
                placeholder="1"
              />
              <button 
                onClick={() => deleteSession(sIdx)}
                title="Delete Session"
                style={{ background: 'transparent', border: 'none', color: 'rgba(239, 68, 68, 0.7)', cursor: 'pointer', width: '28px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              >
                <Trash2 size={16} />
              </button>
            </div>

            {/* Exercises List */}
            <div className="preview-exercises-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {sess.exercises.length === 0 && (
                <button 
                  onClick={() => insertExerciseAtIndex(sIdx, 0)}
                  style={{ alignSelf: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: '50%', width: '34px', height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginTop: '6px' }}
                  title="Add Exercise"
                >
                  <Plus size={18}/>
                </button>
              )}

              {sess.exercises.map((ex, eIdx) => {
                const muscle = getMuscleForExercise(ex.name);
                return (
                  <React.Fragment key={eIdx}>
                    <div className="preview-exercise-card" style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      
                      {/* Exercise Header & Info */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {/* Row 1: Exercise Title & Delete Button */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                          <input 
                            value={ex.name}
                            onChange={(e) => updateExercise(sIdx, eIdx, { name: e.target.value })}
                            list="easy-exercises-db-list"
                            style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '1.25rem', fontWeight: '700', outline: 'none', width: '100%', appearance: 'none', WebkitAppearance: 'none' }}
                            placeholder="Exercise Name"
                          />
                          <button onClick={() => deleteExercise(sIdx, eIdx)} style={{ background: 'transparent', border: 'none', color: 'rgba(239, 68, 68, 0.7)', cursor: 'pointer', width: '28px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} title="Delete Exercise">
                            <Trash2 size={16}/>
                          </button>
                        </div>

                        {/* Row 2: Muscle Badge directly under Title */}
                        {muscle && (
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            <span className="badge muscle" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '5px 12px', fontSize: '0.75rem', borderRadius: '100px', lineHeight: 1 }}>
                              {muscle}
                            </span>
                          </div>
                        )}

                        {/* Row 3: Rest & Tempo Pill Boxes (Row 1) */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', width: '100%', marginTop: '4px', boxSizing: 'border-box' }}>
                          {/* Rest Pill Box */}
                          <div style={{ height: '42px', minHeight: '42px', maxHeight: '42px', display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '100px', padding: '0 14px', boxSizing: 'border-box' }}>
                            <span style={{ fontSize: '0.85rem', color: '#ffffff', fontWeight: '600', flexShrink: 0 }}>Rest:</span>
                            <input 
                              value={ex.rest}
                              onChange={(e) => updateExercise(sIdx, eIdx, { rest: e.target.value })}
                              style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '0.92rem', width: '100%', outline: 'none', textAlign: 'center', appearance: 'none', WebkitAppearance: 'none' }}
                              placeholder="2'"
                            />
                          </div>

                          {/* Tempo Pill Box */}
                          <div style={{ height: '42px', minHeight: '42px', maxHeight: '42px', display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '100px', padding: '0 14px', boxSizing: 'border-box' }}>
                            <span style={{ fontSize: '0.85rem', color: '#ffffff', fontWeight: '600', flexShrink: 0 }}>Tempo:</span>
                            <input 
                              value={ex.tempo || ''}
                              onChange={(e) => updateExercise(sIdx, eIdx, { tempo: e.target.value })}
                              placeholder="1-0-2-0"
                              style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '0.92rem', width: '100%', outline: 'none', textAlign: 'center', appearance: 'none', WebkitAppearance: 'none' }}
                            />
                          </div>
                        </div>

                        {/* Row 4: Notes Pill Box (Full Width Row 2) */}
                        <div style={{ height: '42px', minHeight: '42px', maxHeight: '42px', display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '100px', padding: '0 14px', width: '100%', boxSizing: 'border-box' }}>
                          <span style={{ fontSize: '0.85rem', color: '#ffffff', fontWeight: '600', flexShrink: 0 }}>Notes:</span>
                          <input 
                            value={ex.note || ''}
                            onChange={(e) => updateExercise(sIdx, eIdx, { note: e.target.value })}
                            placeholder='e.g. 1" pause, ultime mezze rep'
                            style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '0.92rem', width: '100%', outline: 'none', appearance: 'none', WebkitAppearance: 'none' }}
                          />
                        </div>
                      </div>

                      {/* Weeks List */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {ex.weeks.map((wk, wIdx) => (
                          <div key={wIdx} style={{ background: 'rgba(0,0,0,0.18)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              
                              {/* Week Header */}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '6px' }}>
                                <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--accent-secondary, #06b6d4)', fontFamily: 'var(--font-mono)' }}>
                                  Week {wIdx + 1}
                                </span>
                                <button 
                                  onClick={() => deleteWeek(sIdx, eIdx, wIdx)}
                                  style={{ background: 'transparent', border: 'none', color: 'rgba(239, 68, 68, 0.7)', cursor: 'pointer', width: '28px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                                  title="Delete Week"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>

                              {/* Sets List for this Week */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                                {wk.sets.map((stVal, stIdx) => {
                                  let rpeVal = '';
                                  let mainStr = stVal || '';
                                  const atIdx = mainStr.indexOf('@');
                                  if (atIdx !== -1) {
                                    rpeVal = mainStr.substring(atIdx + 1).trim();
                                    mainStr = mainStr.substring(0, atIdx).trim();
                                  }
                                  const parts = mainStr.split('..');
                                  const loadVal = parts[0] || '';
                                  const repsVal = parts.slice(1).join('..') || '';

                                  return (
                                    <div key={stIdx} style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: 'rgba(0,0,0,0.22)', padding: '12px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.04)' }}>
                                    {/* Line 1: Set Title & Trash Button */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                      <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>
                                        Set {stIdx + 1}
                                      </span>
                                      <button 
                                        onClick={() => deleteSetFromWeek(sIdx, eIdx, wIdx, stIdx)}
                                        style={{ background: 'transparent', border: 'none', color: 'rgba(239, 68, 68, 0.7)', cursor: 'pointer', width: '28px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                                        title="Delete Set"
                                      >
                                        <Trash2 size={16} />
                                      </button>
                                    </div>

                                    {/* Line 2 (Grid): 3 Large Input Pill Boxes (Carico, Reps, RPE) */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', width: '100%', boxSizing: 'border-box' }}>
                                      {/* Weight Box */}
                                      <div style={{ height: '42px', minHeight: '42px', maxHeight: '42px', display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)', borderRadius: '100px', padding: '0 14px', boxSizing: 'border-box' }}>
                                        <input 
                                          value={loadVal}
                                          onChange={(e) => updateSetLoadRepsRpe(sIdx, eIdx, wIdx, stIdx, e.target.value, repsVal, rpeVal)}
                                          style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '0.95rem', fontWeight: 'bold', outline: 'none', textAlign: 'center', appearance: 'none', WebkitAppearance: 'none' }}
                                          placeholder="0"
                                        />
                                        <span style={{ fontSize: '0.75rem', color: '#ffffff', fontWeight: '600' }}>kg</span>
                                      </div>

                                      {/* Reps Box */}
                                      <div style={{ height: '42px', minHeight: '42px', maxHeight: '42px', display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)', borderRadius: '100px', padding: '0 14px', boxSizing: 'border-box' }}>
                                        <input 
                                          value={repsVal}
                                          onChange={(e) => updateSetLoadRepsRpe(sIdx, eIdx, wIdx, stIdx, loadVal, e.target.value, rpeVal)}
                                          style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '0.95rem', fontWeight: 'bold', outline: 'none', textAlign: 'center', appearance: 'none', WebkitAppearance: 'none' }}
                                          placeholder="reps"
                                        />
                                      </div>

                                      {/* RPE Box */}
                                      <div style={{ height: '42px', minHeight: '42px', maxHeight: '42px', display: 'flex', alignItems: 'center', gap: '3px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)', borderRadius: '100px', padding: '0 14px', boxSizing: 'border-box' }}>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--accent-secondary, #06b6d4)', fontWeight: 'bold' }}>@</span>
                                        <input 
                                          value={rpeVal}
                                          onChange={(e) => updateSetLoadRepsRpe(sIdx, eIdx, wIdx, stIdx, loadVal, repsVal, e.target.value)}
                                          list="rpe-suggestions-list"
                                          style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '0.95rem', fontWeight: 'bold', outline: 'none', textAlign: 'center', appearance: 'none', WebkitAppearance: 'none' }}
                                          placeholder="RPE"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                  );
                                })}

                                </div>

                                {/* Add Set Pill Button */}
                                <button 
                                  onClick={() => addSetToWeek(sIdx, eIdx, wIdx)}
                                  style={{ alignSelf: 'center', height: '42px', minHeight: '42px', maxHeight: '42px', lineHeight: '1', padding: '0 18px', borderRadius: '100px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '6px', whiteSpace: 'nowrap', boxSizing: 'border-box', WebkitAppearance: 'none', appearance: 'none' }}
                                  title="Add Set"
                                >
                                  <Plus size={15} /> Add Set
                                </button>
                              </div>
                            ))}
                          </div>

                          {/* Add Week Pill Button */}
                          <button 
                            onClick={() => addWeek(sIdx, eIdx)}
                            style={{ alignSelf: 'center', height: '42px', minHeight: '42px', maxHeight: '42px', lineHeight: '1', padding: '0 18px', borderRadius: '100px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '6px', whiteSpace: 'nowrap', boxSizing: 'border-box', WebkitAppearance: 'none', appearance: 'none' }}
                            title="Add Week"
                          >
                            <Plus size={15}/> Add Week
                          </button>
                        </div>

                      {/* Add Exercise Pill Divider */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '12px 0', position: 'relative' }}>
                        <div style={{ position: 'absolute', left: '10px', right: '10px', height: '1px', background: 'var(--border-color)', opacity: 0.2, zIndex: 0 }} />
                        <button 
                          onClick={() => insertExerciseAtIndex(sIdx, eIdx + 1)}
                          style={{ position: 'relative', zIndex: 1, height: '42px', minHeight: '42px', maxHeight: '42px', lineHeight: '1', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: '100px', padding: '0 18px', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', whiteSpace: 'nowrap', boxSizing: 'border-box', WebkitAppearance: 'none', appearance: 'none' }}
                          title="Insert Exercise"
                        >
                          <Plus size={15} /> Add Exercise
                        </button>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>

              {/* Add Exercise Pill Button (if session has no exercises) */}
              {sess.exercises.length === 0 && (
                <button 
                  onClick={() => insertExerciseAtIndex(sIdx, 0)}
                  style={{ alignSelf: 'center', height: '42px', minHeight: '42px', maxHeight: '42px', lineHeight: '1', padding: '0 18px', borderRadius: '100px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '6px', whiteSpace: 'nowrap', boxSizing: 'border-box', WebkitAppearance: 'none', appearance: 'none' }}
                  title="Add Exercise"
                >
                  <Plus size={15}/> Add Exercise
                </button>
              )}

            </div>

            {/* Intermediate Insert Session Divider */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '14px 0', position: 'relative' }}>
              <div style={{ position: 'absolute', left: '0', right: '0', height: '1px', background: 'var(--border-color)', opacity: 0.2, zIndex: 0 }} />
              <button 
                onClick={() => insertSessionAtIndex(sIdx + 1)}
                style={{ position: 'relative', zIndex: 1, height: '42px', minHeight: '42px', maxHeight: '42px', lineHeight: '1', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: '100px', padding: '0 18px', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', whiteSpace: 'nowrap', boxSizing: 'border-box', WebkitAppearance: 'none', appearance: 'none' }}
                title="Insert Session"
              >
                <Plus size={15} /> Add Session
              </button>
            </div>
          </React.Fragment>
        ))}

    </div>
  );
}

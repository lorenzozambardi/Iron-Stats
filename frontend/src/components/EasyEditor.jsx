import { memo, useState, useEffect, useRef, useMemo } from 'react';
import { Calendar, Plus, Trash2 } from 'lucide-react';
import { MUSCLES, isDateLine, isDatesHeader } from '../parser';
import { formatTodayDDMMYYYY } from './editorSnippets';

function parseSetLineToSets(line) {
  if (!line || !line.trim()) return [];
  const rawSets = line.trim().split(',');
  return rawSets.map(s => s.trim()).filter(s => s.length > 0);
}

function parseLogbookToStructure(text) {
  if (!text) return [];
  const lines = text.split('\n');
  const sessions = [];
  let currentSession = null;
  let currentExercise = null;
  let inDatesBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    
    if (!line) continue;

    if (line.startsWith('#')) {
      currentSession = {
        title: line,
        dates: [],
        exercises: []
      };
      sessions.push(currentSession);
      currentExercise = null;
      inDatesBlock = false;
      continue;
    }

    if (!currentSession) {
      currentSession = { title: '# 1', dates: [], exercises: [] };
      sessions.push(currentSession);
    }

    if (isDatesHeader(line)) {
      inDatesBlock = true;
      currentExercise = null;
      continue;
    }

    if (inDatesBlock) {
      if (isDateLine(line)) {
        currentSession.dates.push(line);
        continue;
      }
      inDatesBlock = false;
    }

    const lineNoOld = line.replace(/(?:\b|(?<=^))old\s+/gi, '').trim();
    const isSetLine = !line.includes('|') && (
      /(?:^|\s)-?[\d.]+(?:\/-?[\d.]+)*\s*\.\./.test(lineNoOld) ||
      (lineNoOld.length > 0 && /\d/.test(lineNoOld) && /^[\d().+/@,\s]+$/.test(lineNoOld))
    );

    if (!isSetLine && !line.toLowerCase().startsWith('override:')) {
      const parts = line.split('|').map(p => p.trim());
      const exName = parts[0];
      const rest = parts.length > 1 ? parts[1] : "2'";
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
    }
  }

  return sessions;
}

function serializeStructureToText(sessions, overrides = []) {
  const body = sessions.map(sess => {
    let sStr = (sess.title || '').startsWith('#') ? sess.title : `# ${sess.title || ''}`;
    const validDates = Array.isArray(sess.dates)
      ? sess.dates.map(d => (d || '').trim()).filter(Boolean)
      : [];
    if (validDates.length > 0) {
      sStr += `\nDates:\n${validDates.join('\n')}`;
    }
    const exStrs = sess.exercises.map(ex => {
      let header = ex.name;
      const hasMetaAfterRest = Boolean(ex.tempo || ex.note);
      if (ex.rest) header += ` | ${ex.rest}`;
      else if (hasMetaAfterRest) header += ' |';
      if (ex.tempo) header += ` | ${ex.tempo}`;
      if (ex.note) header += ` | ${ex.note}`;
      const weeksStr = ex.weeks.map(wk => wk.sets.map(s => (s || '').trim()).filter(Boolean).join(', ')).filter(w => w.length > 0).join('\n');
      return weeksStr ? `${header}\n${weeksStr}` : header;
    });
    return [sStr, ...exStrs].join('\n\n');
  }).join('\n\n');
  if (overrides.length === 0) return body;
  return body ? `${overrides.join('\n')}\n\n${body}` : overrides.join('\n');
}

function parseSetDisplayValues(stVal) {
  let rpeVal = '';
  let mainStr = (stVal || '').trim();
  // Only split trailing @RPE when there is a single '@' and no dropset '/' after it
  const firstAt = mainStr.indexOf('@');
  const lastAt = mainStr.lastIndexOf('@');
  if (firstAt !== -1 && firstAt === lastAt && !mainStr.substring(firstAt + 1).includes('/')) {
    rpeVal = mainStr.substring(firstAt + 1).trim();
    mainStr = mainStr.substring(0, firstAt).trim();
  }
  if (!mainStr.includes('..')) {
    return { loadVal: '', repsVal: mainStr, rpeVal };
  }
  const parts = mainStr.split('..');
  const loadVal = parts[0].trim();
  const repsVal = parts.slice(1).join('..').trim();
  return { loadVal, repsVal, rpeVal };
}

const dashboardCardStyle = {
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border-color)',
  borderRadius: 'var(--card-radius)',
  boxShadow: 'var(--card-shadow)',
};

const bareInputStyle = {
  background: 'transparent',
  border: 'none',
  outline: 'none',
  appearance: 'none',
  WebkitAppearance: 'none',
};

const iconButtonStyle = (size) => ({
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  width: `${size}px`,
  height: `${size}px`,
  borderRadius: '6px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  padding: 0,
});

const metaCellStyle = {
  height: '32px',
  display: 'flex',
  alignItems: 'center',
  gap: '5px',
  background: 'var(--bg-primary)',
  border: '1px solid var(--border-color)',
  borderRadius: '8px',
  padding: '0 8px',
  minWidth: 0,
  boxSizing: 'border-box',
};

const metaLabelStyle = {
  fontSize: '0.6rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--text-muted)',
  flexShrink: 0,
};

const metaInputStyle = {
  ...bareInputStyle,
  fontFamily: 'var(--font-sans)',
  fontSize: '0.78rem',
  fontWeight: 500,
  color: 'var(--text-primary)',
  width: '100%',
  minWidth: 0,
};

const setWellStyle = {
  height: '30px',
  display: 'flex',
  alignItems: 'center',
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border-color)',
  borderRadius: '7px',
  padding: '0 7px',
  minWidth: 0,
  boxSizing: 'border-box',
};

const setInputStyle = {
  ...bareInputStyle,
  fontFamily: 'var(--font-sans)',
  fontVariantNumeric: 'tabular-nums',
  fontSize: '0.8rem',
  fontWeight: 600,
  color: 'var(--text-primary)',
  width: '100%',
  minWidth: 0,
};

const sessionPillBtnStyle = {
  ...dashboardCardStyle,
  height: '30px',
  padding: '0 12px',
  borderRadius: '999px',
  color: 'var(--text-secondary)',
  fontFamily: 'var(--font-sans)',
  fontSize: '0.74rem',
  fontWeight: 600,
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  appearance: 'none',
  WebkitAppearance: 'none',
};

const EasyEditor = memo(function EasyEditor({ logbookText, onChange, exercisesDb = [] }) {
  const [sessions, setSessions] = useState(() => parseLogbookToStructure(logbookText));
  const lastEmittedTextRef = useRef(logbookText);

  useEffect(() => {
    if (logbookText === lastEmittedTextRef.current) {
      return;
    }
    lastEmittedTextRef.current = logbookText;
    setSessions(parseLogbookToStructure(logbookText));
  }, [logbookText]);

  const overrideLines = useMemo(() => {
    if (!logbookText) return [];
    return logbookText
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.toLowerCase().startsWith('override:'));
  }, [logbookText]);

  const triggerChange = (newSessions) => {
    setSessions(newSessions);
    const newText = serializeStructureToText(newSessions, overrideLines);
    lastEmittedTextRef.current = newText;
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
    let maxNum = 0;
    for (const s of sessions) {
      const m = (s.title || '').match(/\d+/);
      if (m) {
        const n = parseInt(m[0], 10);
        if (n > maxNum) maxNum = n;
      }
    }
    const nextNum = Math.max(sessions.length + 1, maxNum + 1);
    const newSess = { title: `# ${nextNum}`, dates: [], exercises: [] };
    const newSessions = [...sessions];
    newSessions.splice(targetIndex, 0, newSess);
    triggerChange(newSessions);
  };

  const addSessionDate = (sIdx) => {
    const updated = sessions.map((s, idx) =>
      idx === sIdx ? { ...s, dates: [...(s.dates || []), formatTodayDDMMYYYY()] } : s
    );
    triggerChange(updated);
  };

  const updateSessionDate = (sIdx, dIdx, newVal) => {
    const updated = sessions.map((s, idx) => {
      if (idx !== sIdx) return s;
      const nextDates = [...(s.dates || [])];
      nextDates[dIdx] = newVal;
      return { ...s, dates: nextDates };
    });
    triggerChange(updated);
  };

  const deleteSessionDate = (sIdx, dIdx) => {
    const updated = sessions.map((s, idx) =>
      idx === sIdx ? { ...s, dates: (s.dates || []).filter((_, i) => i !== dIdx) } : s
    );
    triggerChange(updated);
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
    if (window.confirm(`Are you sure you want to delete m${wIdx + 1}?`)) {
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
    let base = l ? (r ? `${l}.. ${r}` : `${l}..`) : r;
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

  const muscleMap = useMemo(() => {
    const map = new Map();
    if (!exercisesDb) return map;
    for (const ex of exercisesDb) {
      if (ex.muscles_distr) {
        const keys = Object.keys(ex.muscles_distr);
        if (keys.length > 0) {
          map.set(ex.name.toLowerCase(), MUSCLES[keys[0]] || keys[0]);
        }
      }
    }
    return map;
  }, [exercisesDb]);

  const getMuscleForExercise = (exName) => {
    if (!exName) return null;
    return muscleMap.get(exName.toLowerCase()) || null;
  };

  return (
    <div
      className="easy-editor-container"
      style={{
        background: 'var(--bg-primary)',
        height: '100%',
        overflowY: 'auto',
        padding: '80px 8px 110px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '18px',
        boxSizing: 'border-box',
        fontFamily: 'var(--font-sans)',
      }}
    >
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
        <div
          style={{
            ...dashboardCardStyle,
            padding: '28px 16px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
            textAlign: 'center',
          }}
        >
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
            No sessions found in logbook.
          </p>
          <button
            type="button"
            onClick={addSession}
            style={{
              background: 'var(--accent-primary)',
              color: '#fff',
              border: 'none',
              padding: '10px 18px',
              borderRadius: '999px',
              fontFamily: 'var(--font-sans)',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Plus size={16} /> Create First Session (# 1)
          </button>
        </div>
      )}

      {sessions.map((sess, sIdx) => (
        <div
          key={sIdx}
          className="easy-session-group"
          style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
        >
          {/* Session Header Bar */}
          <div
            style={{
              ...dashboardCardStyle,
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  color: 'var(--accent-primary)',
                  background: 'var(--accent-primary-subtle)',
                  border: '1px solid var(--accent-primary-glow)',
                  padding: '3px 8px',
                  borderRadius: '999px',
                  flexShrink: 0,
                }}
              >
                SESSION
              </span>
              <input
                value={(sess.title || '').replace(/^#+\s*/, '')}
                onChange={(e) => {
                  const val = e.target.value;
                  const existingHashes = (sess.title || '').match(/^(#+)/)?.[1] || '#';
                  const formatted = val.trim() ? (val.startsWith('#') ? val : `${existingHashes} ${val}`) : `${existingHashes} `;
                  updateSessionTitle(sIdx, formatted);
                }}
                style={{
                  ...bareInputStyle,
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.05rem',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  minWidth: 0,
                  flex: 1,
                }}
                placeholder="1"
              />
              <span
                style={{
                  fontSize: '0.72rem',
                  color: 'var(--text-muted)',
                  fontWeight: 500,
                  flexShrink: 0,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {sess.exercises.length} {sess.exercises.length === 1 ? 'ex' : 'exs'}
              </span>
            </div>

            <button
              type="button"
              onClick={() => addSessionDate(sIdx)}
              title="Add Session Date"
              style={{
                ...sessionPillBtnStyle,
                height: '26px',
                padding: '0 9px',
                fontSize: '0.68rem',
                background: 'var(--bg-primary)',
                boxShadow: 'none',
              }}
            >
              <Calendar size={12} /> + Date
            </button>

            <button
              type="button"
              onClick={() => deleteSession(sIdx)}
              title="Delete Session"
              style={{ ...iconButtonStyle(28), color: 'rgba(239, 68, 68, 0.7)' }}
            >
              <Trash2 size={15} />
            </button>
          </div>

          {/* Session Dates Bar */}
          {Array.isArray(sess.dates) && sess.dates.length > 0 && (
            <div
              style={{
                ...dashboardCardStyle,
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <span style={{ ...metaLabelStyle, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  <Calendar size={11} /> Dates (DD-MM-YYYY)
                </span>
                <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {sess.dates.length} {sess.dates.length === 1 ? 'cycle' : 'cycles'}
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {sess.dates.map((dateVal, dIdx) => (
                  <div
                    key={dIdx}
                    style={{
                      ...metaCellStyle,
                      height: '30px',
                      padding: '0 6px 0 8px',
                      gap: '5px',
                      flex: '0 1 148px',
                    }}
                  >
                    <span style={{ ...metaLabelStyle, textTransform: 'none', color: 'var(--accent-primary)' }}>m{dIdx + 1}</span>
                    <input
                      value={dateVal}
                      onChange={(e) => updateSessionDate(sIdx, dIdx, e.target.value)}
                      placeholder="DD-MM-YYYY"
                      style={{
                        ...metaInputStyle,
                        fontSize: '0.75rem',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => deleteSessionDate(sIdx, dIdx)}
                      title={`Remove m${dIdx + 1} date`}
                      style={{ ...iconButtonStyle(20), color: 'rgba(239, 68, 68, 0.65)' }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Exercise Cards */}
          {sess.exercises.map((ex, eIdx) => {
            const muscle = getMuscleForExercise(ex.name);
            const metaFields = [
              { key: 'rest', label: 'REST', value: ex.rest, placeholder: "2'" },
              { key: 'tempo', label: 'TEMPO', value: ex.tempo || '', placeholder: '1-0-2-0' },
              { key: 'note', label: 'NOTE', value: ex.note || '', placeholder: 'Notes...' },
            ];

            return (
              <div
                key={eIdx}
                className="easy-exercise-card"
                style={{
                  ...dashboardCardStyle,
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                {/* Header Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {muscle && (
                      <div
                        style={{
                          fontSize: '0.65rem',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          color: 'var(--accent-primary)',
                          marginBottom: '2px',
                        }}
                      >
                        {muscle}
                      </div>
                    )}
                    <input
                      value={ex.name}
                      onChange={(e) => updateExercise(sIdx, eIdx, { name: e.target.value })}
                      list="easy-exercises-db-list"
                      placeholder="Exercise Name"
                      style={{
                        ...bareInputStyle,
                        fontFamily: 'var(--font-display)',
                        fontSize: '1.02rem',
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        width: '100%',
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => insertExerciseAtIndex(sIdx, eIdx + 1)}
                      title="Insert Exercise Below"
                      style={{ ...iconButtonStyle(28), color: 'var(--text-muted)' }}
                    >
                      <Plus size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteExercise(sIdx, eIdx)}
                      title="Delete Exercise"
                      style={{ ...iconButtonStyle(28), color: 'rgba(239, 68, 68, 0.7)' }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* Compact Single-Row Metadata Strip (Rest, Tempo, Notes) */}
                <div style={{ display: 'grid', gridTemplateColumns: '82px 104px minmax(0, 1fr)', gap: '6px' }}>
                  {metaFields.map(({ key, label, value, placeholder }) => (
                    <div key={key} style={metaCellStyle}>
                      <span style={metaLabelStyle}>{label}</span>
                      <input
                        value={value}
                        onChange={(e) => updateExercise(sIdx, eIdx, { [key]: e.target.value })}
                        placeholder={placeholder}
                        style={metaInputStyle}
                      />
                    </div>
                  ))}
                </div>

                {/* Weeks & Sets */}
                {ex.weeks.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {ex.weeks.map((wk, wIdx) => (
                      <div
                        key={wIdx}
                        style={{
                          background: 'var(--bg-primary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '12px',
                          padding: '10px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                        }}
                      >
                        {/* Week Header */}
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            borderBottom: '1px solid rgba(255,255,255,0.06)',
                            paddingBottom: '6px',
                          }}
                        >
                          <span
                            style={{
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              letterSpacing: '0.04em',
                              color: 'var(--accent-secondary)',
                            }}
                          >
                            m{wIdx + 1}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <button
                              type="button"
                              onClick={() => addSetToWeek(sIdx, eIdx, wIdx)}
                              title="Add Set"
                              style={{
                                height: '22px',
                                padding: '0 8px',
                                borderRadius: '999px',
                                background: 'var(--bg-secondary)',
                                border: '1px solid var(--border-color)',
                                color: 'var(--text-primary)',
                                fontFamily: 'var(--font-sans)',
                                fontSize: '0.65rem',
                                fontWeight: 600,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                                appearance: 'none',
                                WebkitAppearance: 'none',
                              }}
                            >
                              <Plus size={11} /> Set
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteWeek(sIdx, eIdx, wIdx)}
                              title="Delete Microcycle"
                              style={{ ...iconButtonStyle(22), color: 'rgba(239, 68, 68, 0.7)' }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        {/* Set Rows */}
                        {wk.sets.map((stVal, stIdx) => {
                          const { loadVal, repsVal, rpeVal } = parseSetDisplayValues(stVal);

                          return (
                            <div
                              key={stIdx}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '20px minmax(0, 1.1fr) minmax(0, 1fr) minmax(0, 0.85fr) 22px',
                                gap: '6px',
                                alignItems: 'center',
                              }}
                            >
                              <span
                                style={{
                                  fontSize: '0.68rem',
                                  fontWeight: 600,
                                  color: 'var(--text-muted)',
                                  fontVariantNumeric: 'tabular-nums',
                                  textAlign: 'center',
                                }}
                              >
                                {stIdx + 1}
                              </span>

                              <div style={setWellStyle}>
                                <input
                                  value={loadVal}
                                  onChange={(e) => updateSetLoadRepsRpe(sIdx, eIdx, wIdx, stIdx, e.target.value, repsVal, rpeVal)}
                                  placeholder="0"
                                  style={{ ...setInputStyle, textAlign: 'right' }}
                                />
                                <span style={{ fontSize: '0.64rem', color: 'var(--text-muted)', marginLeft: '3px', flexShrink: 0 }}>
                                  kg
                                </span>
                              </div>

                              <div style={setWellStyle}>
                                <input
                                  value={repsVal}
                                  onChange={(e) => updateSetLoadRepsRpe(sIdx, eIdx, wIdx, stIdx, loadVal, e.target.value, rpeVal)}
                                  placeholder="reps"
                                  style={{ ...setInputStyle, textAlign: 'center' }}
                                />
                              </div>

                              <div style={{ ...setWellStyle, padding: '0 6px' }}>
                                <span style={{ fontSize: '0.68rem', color: 'var(--accent-secondary)', fontWeight: 700, flexShrink: 0 }}>
                                  @
                                </span>
                                <input
                                  value={rpeVal}
                                  onChange={(e) => updateSetLoadRepsRpe(sIdx, eIdx, wIdx, stIdx, loadVal, repsVal, e.target.value)}
                                  list="rpe-suggestions-list"
                                  placeholder="RPE"
                                  style={{ ...setInputStyle, textAlign: 'center' }}
                                />
                              </div>

                              <button
                                type="button"
                                onClick={() => deleteSetFromWeek(sIdx, eIdx, wIdx, stIdx)}
                                title="Delete Set"
                                style={{ ...iconButtonStyle(22), color: 'var(--text-muted)' }}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}

                {/* Exercise Footer: + Add Microcycle */}
                <button
                  type="button"
                  onClick={() => addWeek(sIdx, eIdx)}
                  title="Add Microcycle"
                  style={{
                    height: '28px',
                    borderRadius: '8px',
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-secondary)',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    alignSelf: 'flex-start',
                    padding: '0 10px',
                    cursor: 'pointer',
                    appearance: 'none',
                    WebkitAppearance: 'none',
                  }}
                >
                  <Plus size={13} /> Add Microcycle
                </button>
              </div>
            );
          })}

          {/* Session Footer: + Exercise / + Session */}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', paddingTop: '2px' }}>
            <button
              type="button"
              onClick={() => insertExerciseAtIndex(sIdx, sess.exercises.length)}
              title="Add Exercise"
              style={sessionPillBtnStyle}
            >
              <Plus size={13} /> Exercise
            </button>
            <button
              type="button"
              onClick={() => insertSessionAtIndex(sIdx + 1)}
              title="Add Session"
              style={sessionPillBtnStyle}
            >
              <Plus size={13} /> Session
            </button>
          </div>
        </div>
      ))}
    </div>
  );
});

export default EasyEditor;

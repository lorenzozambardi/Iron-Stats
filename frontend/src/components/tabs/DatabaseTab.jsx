import React, { useState, useMemo } from 'react';
import { Search, Plus } from 'lucide-react';
import { fuzzyScore } from '../helpers';

const DatabaseTab = React.memo(({ 
  isMobile, 
  activeTab, 
  activeExercises, 
  handleOpenAddExercise, 
  handleOpenEditExercise, 
  debouncedLogbookText, 
  currentProgram 
}) => {
  const [exerciseSearch, setExerciseSearch] = useState('');

  // Filters for exercise DB (fuzzy, always returns best matches)
  const filteredExercises = useMemo(() => {
    if (!exerciseSearch) return activeExercises;
    return activeExercises
      .map(ex => {
        const nameScore = fuzzyScore(exerciseSearch, ex.name);
        const bestScore = Math.max(
          nameScore,
          ...Object.keys(ex.muscles_distr).map(m => fuzzyScore(exerciseSearch, m))
        );
        return { ex, score: bestScore };
      })
      .filter(x => x.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map(x => x.ex);
  }, [exerciseSearch, activeExercises]);

  return (
    <div className={`swipe-view ${activeTab === 'db' ? 'active-desktop' : ''}`} id="view-db">
      {(isMobile || activeTab === 'db') && (
        <div className="tab-workspace-flat" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="filters-bar" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Search size={16} color="var(--text-muted)" />
            <input 
              type="text" 
              className="select-control"
              style={{ flex: 1, padding: '8px 12px' }}
              placeholder="Search exercises by name or muscle group..."
              value={exerciseSearch}
              onChange={(e) => setExerciseSearch(e.target.value)}
            />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Showing {filteredExercises.length} of {activeExercises.length}
            </span>
            <button 
              className="btn btn-primary" 
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '0.8rem', height: '36px' }}
              onClick={handleOpenAddExercise}
            >
              <Plus size={14} /> Add Exercise
            </button>
          </div>

          <div className="exercise-db-grid" style={{ flex: 1, overflowY: 'auto' }}>
            {filteredExercises.map(ex => (
              <div 
                className="exercise-db-card" 
                key={ex.name}
                onClick={() => handleOpenEditExercise(ex)}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', marginBottom: '4px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <h4 className="ex-card-title" style={{ margin: 0, wordBreak: 'break-word', fontSize: '0.95rem' }}>{ex.name}</h4>
                      {debouncedLogbookText.split('\n').some(line => line.toLowerCase().startsWith(`override: ${ex.name.toLowerCase()} |`)) && (
                          <span style={{ 
                            background: 'rgba(99, 102, 241, 0.15)', 
                            color: '#818cf8', 
                            border: '1px solid rgba(99, 102, 241, 0.3)',
                            alignSelf: 'flex-start',
                            fontSize: '0.7rem',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            marginTop: '2px',
                            fontWeight: '500'
                          }}>
                            Overridden for {currentProgram}
                          </span>
                        )}
                    </div>
                  </div>
                  <div className="ex-card-detail" style={{ margin: '4px 0 10px 0' }}>
                    <span>Fatigue: <b>{ex.fatigue}</b></span>
                    <span>Coeff: <b>{ex.load_coeff}</b></span>
                    {ex.load_multiplier !== 1 && <span>Multiplier: <b>{ex.load_multiplier}x</b></span>}
                    {ex.load_offset !== 0 && <span>Offset: <b>{ex.load_offset}kg</b></span>}
                  </div>
                </div>
                <div>
                  <div className="ex-card-muscle-badges">
                    {Object.entries(ex.muscles_distr).map(([muscle, pct]) => (
                      <span key={muscle} className="badge muscle">
                        {muscle} ({Math.round((typeof pct === 'number' ? pct : (pct.magnitude || 0)) * 100)}%)
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

export default DatabaseTab;

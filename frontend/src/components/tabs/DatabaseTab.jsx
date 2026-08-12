import React, { useMemo } from 'react';
import { Search, Plus } from 'lucide-react';
import { fuzzyScore } from '../helpers';

const DatabaseTab = React.memo(({ 
  isMobile, 
  activeTab, 
  activeExercises, 
  handleOpenAddExercise, 
  handleOpenEditExercise, 
  debouncedLogbookText, 
  currentProgram,
  exerciseSearch,
  setExerciseSearch
}) => {

  // Filters for exercise DB (fuzzy, always returns best matches)
  const filteredExercises = useMemo(() => {
    if (!exerciseSearch.trim()) return activeExercises;
    const lowerSearch = exerciseSearch.toLowerCase();
    return activeExercises
      .map(ex => {
        let maxMuscleMatch = 0;
        Object.keys(ex.muscles_distr).forEach(m => {
          maxMuscleMatch = Math.max(maxMuscleMatch, fuzzyScore(lowerSearch, m));
        });
        const nameMatch = fuzzyScore(lowerSearch, ex.name);
        return { ex, score: Math.max(nameMatch, maxMuscleMatch) };
      })
      .filter(x => x.score > 0.3)
      .sort((a, b) => b.score - a.score)
      .map(x => x.ex);
  }, [exerciseSearch, activeExercises]);

  const overriddenExercisesSet = useMemo(() => {
    const overrides = new Set();
    const lines = debouncedLogbookText.split('\n');
    for (const line of lines) {
      if (line.toLowerCase().startsWith('override: ')) {
        const parts = line.split('|');
        if (parts.length >= 2) {
          const exName = parts[0].substring(10).trim().toLowerCase();
          overrides.add(exName);
        }
      }
    }
    return overrides;
  }, [debouncedLogbookText]);

  return (
    <div className={`swipe-view ${activeTab === 'db' ? 'active-desktop' : ''}`} id="view-db">
      {/* Mobile Database Controls (floating inside the swipe view) */}
      {isMobile && (
        <div id="mobile-header-db-controls" style={{ 
          position: 'absolute', 
          top: '18px', 
          left: '70px',
          right: '12px', 
          zIndex: 50, 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px', 
          pointerEvents: 'none' 
        }}>
          <div className="search-pill-container" style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '99px', border: '1px solid var(--border-color)', padding: '0 12px', flex: 1, height: '44px', pointerEvents: 'auto', boxShadow: '0 10px 30px rgba(0, 0, 0, 0.8)' }}>
            <Search size={16} color="var(--text-muted)" />
            <input 
              type="text" 
              placeholder="Search exercises" 
              value={exerciseSearch}
              onChange={(e) => setExerciseSearch(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none', marginLeft: '8px', fontSize: '0.9rem', flex: 1, width: '100%', height: '100%' }}
            />
          </div>
          <button 
            onClick={handleOpenAddExercise} 
            style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'var(--accent-primary)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0, boxShadow: '0 10px 30px rgba(0, 0, 0, 0.8)', pointerEvents: 'auto' }}
          >
            <Plus size={20} strokeWidth={2.5} />
          </button>
        </div>
      )}

      {(isMobile || activeTab === 'db') && (
        <div className="db-tab-workspace" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {!isMobile && (
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
          )}

          {isMobile && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', paddingLeft: '6px', marginTop: '-12px', marginBottom: '-8px' }}>
              Showing {filteredExercises.length} of {activeExercises.length}
            </div>
          )}

          <div className="exercise-db-grid" style={{ flex: 1, overflowY: 'auto', paddingBottom: '100px' }}>
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
                      {overriddenExercisesSet.has(ex.name.toLowerCase()) && (
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

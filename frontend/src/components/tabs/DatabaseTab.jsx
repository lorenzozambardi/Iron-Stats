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
          <div className="search-pill-container" style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-secondary)', borderRadius: '99px', border: '1px solid var(--border-color)', padding: '0 14px', flex: 1, height: '44px', pointerEvents: 'auto', boxShadow: '0 4px 10px rgba(0, 0, 0, 0.5)' }}>
            <Search size={15} color="var(--text-muted)" />
            <input 
              type="text" 
              placeholder="Search exercises" 
              value={exerciseSearch}
              onChange={(e) => setExerciseSearch(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none', marginLeft: '8px', fontSize: '0.88rem', flex: 1, width: '100%', height: '100%' }}
            />
          </div>
          <button 
            onClick={handleOpenAddExercise} 
            aria-label="Add Exercise"
            style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'var(--accent-primary)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0, boxShadow: '0 4px 12px var(--accent-primary-glow)', pointerEvents: 'auto' }}
          >
            <Plus size={20} strokeWidth={2.5} />
          </button>
        </div>
      )}

      {(isMobile || activeTab === 'db') && (
        <div className="db-tab-workspace">
          {!isMobile && (
            <div className="db-toolbar">
              <div className="db-search-input-wrap">
                <Search size={15} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                <input 
                  type="text" 
                  className="db-search-input"
                  placeholder="Search exercises by name or muscle group..."
                  value={exerciseSearch}
                  onChange={(e) => setExerciseSearch(e.target.value)}
                />
              </div>
              <span className="db-count-pill">
                Showing {filteredExercises.length} of {activeExercises.length}
              </span>
              <button 
                className="btn btn-primary" 
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 16px', fontSize: '0.8rem', height: '38px', flexShrink: 0 }}
                onClick={handleOpenAddExercise}
              >
                <Plus size={15} /> Add Exercise
              </button>
            </div>
          )}

          {isMobile && (
            <div className="db-mobile-count">
              Showing {filteredExercises.length} of {activeExercises.length} exercises
            </div>
          )}

          <div className="exercise-db-grid">
            {filteredExercises.map(ex => (
              <div 
                className="exercise-db-card" 
                key={ex.name}
                onClick={() => handleOpenEditExercise(ex)}
              >
                <div className="ex-card-header">
                  <h4 className="ex-card-title">{ex.name}</h4>
                  {overriddenExercisesSet.has(ex.name.toLowerCase()) && (
                    <span className="ex-override-badge">
                      Overridden for {currentProgram}
                    </span>
                  )}
                </div>
                <div className="ex-card-detail">
                  <span className="ex-stat-item">
                    <span className="ex-stat-label">Fatigue</span>
                    <span className="ex-stat-val">{ex.fatigue}</span>
                  </span>
                  <span className="ex-stat-item">
                    <span className="ex-stat-label">Coeff</span>
                    <span className="ex-stat-val">{ex.load_coeff}</span>
                  </span>
                  {ex.load_multiplier !== 1 && (
                    <span className="ex-stat-item">
                      <span className="ex-stat-label">Multiplier</span>
                      <span className="ex-stat-val">{ex.load_multiplier}x</span>
                    </span>
                  )}
                  {ex.load_offset !== 0 && (
                    <span className="ex-stat-item">
                      <span className="ex-stat-label">Offset</span>
                      <span className="ex-stat-val">{ex.load_offset}kg</span>
                    </span>
                  )}
                </div>
                <div className="ex-card-muscle-badges">
                  {Object.entries(ex.muscles_distr).map(([muscle, pct]) => (
                    <span key={muscle} className="badge muscle">
                      <span>{muscle}</span>
                      <span className="ex-muscle-pct">
                        {Math.round((typeof pct === 'number' ? pct : (pct.magnitude || 0)) * 100)}%
                      </span>
                    </span>
                  ))}
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

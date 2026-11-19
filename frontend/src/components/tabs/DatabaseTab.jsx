import React, { useMemo, useState } from 'react';
import { Search, Plus } from 'lucide-react';
import { fuzzyScoreLower } from '../helpers';

const DatabaseTab = React.memo(({ 
  isMobile, 
  isActive, 
  activeExercises, 
  handleOpenAddExercise, 
  handleOpenEditExercise, 
  overrideLinesText, 
  currentProgram
}) => {
  const [exerciseSearch, setExerciseSearch] = useState('');

  // Precompute lowercase names & muscle keys when activeExercises changes
  const searchIndex = useMemo(() => {
    return activeExercises.map(ex => ({
      ex,
      lowerName: ex.name.toLowerCase(),
      lowerMuscles: Object.keys(ex.muscles_distr).map(m => m.toLowerCase())
    }));
  }, [activeExercises]);

  // Filters for exercise DB (fuzzy, always returns best matches)
  const filteredExercises = useMemo(() => {
    const trimmed = exerciseSearch.trim();
    if (!trimmed) return activeExercises;
    const lowerSearch = trimmed.toLowerCase();
    const matches = [];
    for (let i = 0; i < searchIndex.length; i++) {
      const item = searchIndex[i];
      let bestScore = fuzzyScoreLower(lowerSearch, item.lowerName);
      for (let j = 0; j < item.lowerMuscles.length; j++) {
        const mScore = fuzzyScoreLower(lowerSearch, item.lowerMuscles[j]);
        if (mScore > bestScore) bestScore = mScore;
      }
      if (bestScore > 0.3) {
        matches.push({ ex: item.ex, score: bestScore });
      }
    }
    matches.sort((a, b) => b.score - a.score);
    return matches.map(m => m.ex);
  }, [exerciseSearch, activeExercises, searchIndex]);

  const overriddenExercisesSet = useMemo(() => {
    const overrides = new Set();
    if (!overrideLinesText) return overrides;
    const lines = overrideLinesText.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      const match = trimmed.match(/^override:\s*([^|]+)\|/i);
      if (match) {
        overrides.add(match[1].trim().toLowerCase());
      }
    }
    return overrides;
  }, [overrideLinesText]);

  return (
    <div className={`swipe-view ${isActive ? 'active-desktop' : ''}`} id="view-db">
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

      {(isMobile || isActive) && (
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
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

export default DatabaseTab;

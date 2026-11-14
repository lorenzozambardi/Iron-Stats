import { describe, it, expect } from 'vitest';
import { lintLogbook } from '../linter';
import defaultExercises from '../defaultExercises.json';
import { defaultLogbook } from '../defaultLogbook';

describe('lintLogbook', () => {
  it('produces no syntax errors on the default logbook', () => {
    const diags = lintLogbook(defaultLogbook, defaultExercises);
    const syntaxErrors = diags.filter(d => d.category === 'syntax' && d.severity === 'error');
    expect(syntaxErrors).toEqual([]);
  });

  it('flags session headers missing a number', () => {
    const log = `#\nLat Machine | 2'\n90.. 10`;
    const diags = lintLogbook(log, defaultExercises);
    expect(diags.some(d => d.id === 'session-missing-number' && d.lineIndex === 0)).toBe(true);
  });

  it('flags unrecognized exercises and provides a fuzzy suggestion', () => {
    const miniDb = [{ name: 'Lat Machine', muscles_distr: { 'Latissimus Dorsi': 1 } }];
    const log = `# 1\nltmc | 2'\n90.. 10`;
    const diags = lintLogbook(log, miniDb);
    const err = diags.find(d => d.id === 'unknown-exercise');
    expect(err).toBeDefined();
    expect(err.lineIndex).toBe(1);
    expect(err.suggestion).toBe('Lat Machine');
  });

  it('flags orphan set lines before any recognized exercise', () => {
    const log = `# 1\n90.. 10, 8`;
    const diags = lintLogbook(log, defaultExercises);
    expect(diags.some(d => d.id === 'orphan-set-line' && d.lineIndex === 1)).toBe(true);
  });

  it('flags malformed override lines and invalid muscles_distr', () => {
    const log = `override: Lat Machine\noverride: Lat Machine | muscles_distr=[1,2]`;
    const diags = lintLogbook(log, defaultExercises);
    expect(diags.some(d => d.id === 'override-malformed' && d.lineIndex === 0)).toBe(true);
    expect(diags.some(d => d.id === 'override-invalid-muscles' && d.lineIndex === 1)).toBe(true);
  });

  it('flags invalid rest time format', () => {
    const log = `# 1\nLat Machine | fast\n90.. 10`;
    const diags = lintLogbook(log, defaultExercises);
    expect(diags.some(d => d.id === 'invalid-rest-time' && d.lineIndex === 1)).toBe(true);
  });

  it('allows valid load carry-forward and flags empty reps on first week', () => {
    const validLog = `# 1\nLat Machine | 2'\n90.. 10, 8\n95..`;
    expect(lintLogbook(validLog, defaultExercises).filter(d => d.category === 'syntax')).toEqual([]);

    const invalidLog = `# 1\nLat Machine | 2'\n95..`;
    const diags = lintLogbook(invalidLog, defaultExercises);
    expect(diags.some(d => d.id === 'empty-reps-no-prev' && d.lineIndex === 2)).toBe(true);
  });

  it('flags RPE out of range and extended reps with explicit low RPE, without false-positiving default RPE', () => {
    const log = `# 1\nLat Machine | 2'\n90.. 10+2\n90.. 10+2@7\n90.. 10@12`;
    const diags = lintLogbook(log, defaultExercises);
    expect(diags.some(d => d.lineIndex === 2)).toBe(false);
    expect(diags.some(d => d.id === 'extended-reps-low-rpe' && d.lineIndex === 3)).toBe(true);
    expect(diags.some(d => d.id === 'invalid-rpe' && d.lineIndex === 4)).toBe(true);
  });

  it('flags week-over-week load changes strictly greater than ±50%', () => {
    const within50 = `# 1\nLat Machine | 2'\n100.. 10\n150.. 10\n75.. 10`;
    const withinDiags = lintLogbook(within50, defaultExercises);
    expect(withinDiags.some(d => d.id === 'load-spike' || d.id === 'load-drop')).toBe(false);

    const spikeAndDrop = `# 1\nLat Machine | 2'\n100.. 10\n160.. 10\n60.. 10`;
    const spikeDiags = lintLogbook(spikeAndDrop, defaultExercises);
    expect(spikeDiags.some(d => d.id === 'load-spike' && d.lineIndex === 3)).toBe(true);
    expect(spikeDiags.some(d => d.id === 'load-drop' && d.lineIndex === 4)).toBe(true);
  });

  it('flags missing weeks within a session and session numbering gaps', () => {
    const log = `# 1\nLat Machine | 2'\n90.. 10\n90.. 10\n90.. 10\n\nDB Hammer | 2'\n20.. 10\n\n# 3\nSquat | 3'\n100.. 8`;
    const diags = lintLogbook(log, defaultExercises);
    expect(diags.some(d => d.id === 'missing-week' && d.lineIndex === 6)).toBe(true);
    expect(diags.some(d => d.id === 'session-gap' && d.lineIndex === 9)).toBe(true);
  });

  it('does NOT flag duplicate exercises within the same session', () => {
    const log = `# 1\nLat Machine | 2'\n90.. 10\n\nLat Machine | 2'\n80.. 12`;
    const diags = lintLogbook(log, defaultExercises);
    expect(diags).toEqual([]);
  });
});

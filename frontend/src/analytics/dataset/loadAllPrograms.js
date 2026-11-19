/**
 * Multi-program loader reusing Iron Stats' /api/programs and /api/logbook contracts
 * plus parser.js (getExercisesWithOverrides, matchExercise, parseLogbook).
 */

import { getExercisesWithOverrides, isDateLine, isDatesHeader, matchExercise, parseLogbook } from '../../parser.js';

export function parseLogbookWithWarnings(logText, exercisesDb) {
  const text = typeof logText === 'string' ? logText : '';
  const localExercises = getExercisesWithOverrides(text, exercisesDb || []);
  const workoutData = parseLogbook(text, exercisesDb || []);
  const parseWarnings = [];

  const lines = text.split('\n');
  let inDatesBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith('#') || line.toLowerCase().startsWith('override:')) {
      inDatesBlock = false;
      continue;
    }
    if (isDatesHeader(line)) {
      inDatesBlock = true;
      continue;
    }
    if (inDatesBlock) {
      if (isDateLine(line)) continue;
      inDatesBlock = false;
    }
    const isLogLine = line.includes('..') || /^(?:old\s+)*[\d().+/@,\s]+$/i.test(line);
    if (isLogLine) continue;
    const matched = matchExercise(line, localExercises);
    if (!matched) {
      parseWarnings.push({
        lineIndex: i + 1,
        rawLine: line.slice(0, 80),
        reason: 'unmatched_exercise_header',
      });
    }
  }

  return { workoutData, parseWarnings };
}

export async function loadAllPrograms({ fetchImpl = globalThis.fetch, exercisesDb = [], programNames = null, signal } = {}) {
  let names = Array.isArray(programNames) && programNames.length > 0 ? programNames.slice() : null;
  if (!names) {
    const res = await fetchImpl('/api/programs', { signal });
    if (!res.ok) throw new Error(`Failed to list programs (${res.status})`);
    const json = await res.json();
    names = Array.isArray(json) ? json : [];
  }

  const results = await Promise.all(
    names.map(async (id) => {
      try {
        const res = await fetchImpl(`/api/logbook?program=${encodeURIComponent(id)}`, { signal });
        if (!res.ok) {
          return { id, rawText: '', workoutData: [], parseWarnings: [{ lineIndex: 0, rawLine: id, reason: `fetch_${res.status}` }], loadError: true };
        }
        const rawText = await res.text();
        const { workoutData, parseWarnings } = parseLogbookWithWarnings(rawText, exercisesDb);
        return { id, rawText, workoutData, parseWarnings, loadError: false };
      } catch (err) {
        if (err?.name === 'AbortError') throw err;
        return { id, rawText: '', workoutData: [], parseWarnings: [{ lineIndex: 0, rawLine: id, reason: err?.message || 'load_error' }], loadError: true };
      }
    })
  );

  return results.filter((p) => !p.loadError);
}

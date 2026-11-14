import {
  getExercisesWithOverrides,
  matchExercise,
  parseLine,
  parseLogbook
} from './parser';
import { fuzzyScore } from './components/helpers';

const LOAD_ANOMALY_THRESHOLD = 0.5; // ±50% week-over-week load change
const REP_SPIKE_RATIO = 2.0;
const REP_DROP_RATIO = 0.4;
const REST_PART_REGEX = /^(?:(\d+)')?(?:(\d+)")?$/;
const REP_PART_REGEX = /^(\d+)(?:\((\d+)\))?(?:\+(\d+))?(?:@(\d+(?:\.\d+)?))?$/;
const VALID_OVERRIDE_NUMERIC_KEYS = new Set(['fatigue', 'load_coeff', 'load_multiplier', 'load_offset']);

/**
 * Find the closest exercise name suggestion for an unrecognized header.
 */
function suggestExerciseName(rawHeader, exercises) {
  const query = rawHeader.split('|')[0].trim();
  if (query.length < 2 || !exercises || exercises.length === 0) return null;

  let bestName = null;
  let bestScore = -1;
  for (const ex of exercises) {
    const score = fuzzyScore(query, ex.name);
    if (score > bestScore) {
      bestScore = score;
      bestName = ex.name;
    }
  }
  return bestScore > 0 ? bestName : null;
}

/**
 * Validate an `override:` directive line.
 * Returns an array of diagnostics for the line.
 */
function lintOverrideLine(trimmed, rawLine, lineIndex) {
  const diagnostics = [];
  const lineOffset = rawLine.indexOf(trimmed);
  const match = trimmed.match(/^override:\s*([^|]+)\|\s*(.+)$/i);
  if (!match) {
    diagnostics.push({
      id: 'override-malformed',
      lineIndex,
      from: lineOffset,
      to: lineOffset + trimmed.length,
      severity: 'error',
      category: 'syntax',
      message: 'Malformed override. Expected: override: Exercise Name | key=value'
    });
    return diagnostics;
  }

  const propStr = match[2].trim();
  const parts = propStr.split('|');
  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) {
      diagnostics.push({
        id: 'override-malformed',
        lineIndex,
        from: lineOffset,
        to: lineOffset + trimmed.length,
        severity: 'error',
        category: 'syntax',
        message: `Malformed override property "${part.trim()}". Expected key=value.`
      });
      continue;
    }

    const key = part.substring(0, eqIdx).trim().toLowerCase();
    const val = part.substring(eqIdx + 1).trim();

    if (VALID_OVERRIDE_NUMERIC_KEYS.has(key)) {
      const num = parseFloat(val);
      const invalid =
        !Number.isFinite(num) ||
        (key === 'load_multiplier' ? num <= 0 : key !== 'load_offset' && num < 0);
      if (invalid) {
        diagnostics.push({
          id: 'override-invalid-value',
          lineIndex,
          from: lineOffset,
          to: lineOffset + trimmed.length,
          severity: 'error',
          category: 'syntax',
          message: `Invalid numeric value "${val}" for override "${key}".`
        });
      }
    } else if (key === 'muscles_distr') {
      try {
        const parsed = JSON.parse(val);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new TypeError('muscles_distr must be a JSON object');
        }
        let totalMag = 0;
        for (const [mKey, prof] of Object.entries(parsed)) {
          if (prof && typeof prof === 'object' && !Array.isArray(prof)) {
            const x0 = Number(prof.x0 ?? 0.0);
            const y0 = Number(prof.y0 ?? 1.0);
            const x1 = Number(prof.x1 ?? 0.33);
            const y1 = Number(prof.y1 ?? 1.0);
            const x2 = Number(prof.x2 ?? 0.66);
            const y2 = Number(prof.y2 ?? 1.0);
            const x3 = Number(prof.x3 ?? 1.0);
            const y3 = Number(prof.y3 ?? 1.0);
            const mag = Number(prof.magnitude ?? 0.0);
            if (![x0, y0, x1, y1, x2, y2, x3, y3, mag].every(Number.isFinite)) {
              throw new RangeError(`Non-finite Bezier value in "${mKey}"`);
            }
            if (!(0.0 <= x0 && x0 < x1 && x1 < x2 && x2 < x3 && x3 <= 1.0)) {
              throw new RangeError(`Bezier x values must be strictly increasing in [0, 1] for "${mKey}"`);
            }
            if (Math.min(y0, y1, y2, y3) < 0.0 || mag < 0.0) {
              throw new RangeError(`Negative Bezier value in "${mKey}"`);
            }
            totalMag += mag;
          } else if (typeof prof === 'number') {
            if (!Number.isFinite(prof) || prof < 0) {
              throw new RangeError(`Invalid magnitude for "${mKey}"`);
            }
            totalMag += prof;
          } else {
            throw new TypeError(`Invalid entry for "${mKey}"`);
          }
        }
        if (Object.keys(parsed).length > 0 && totalMag <= 0) {
          throw new RangeError('Muscle distribution magnitudes must sum to > 0');
        }
      } catch (err) {
        diagnostics.push({
          id: 'override-invalid-muscles',
          lineIndex,
          from: lineOffset,
          to: lineOffset + trimmed.length,
          severity: 'error',
          category: 'syntax',
          message: `Invalid muscles_distr override: ${err.message}`
        });
      }
    }
  }

  return diagnostics;
}

/**
 * Validate a set/rep log line and return syntax + per-set anomaly diagnostics.
 */
function lintSetLine(trimmed, rawLine, lineIndex, hasCurrentExercise, prevWeeksCount) {
  const diagnostics = [];
  const lineOffset = rawLine.indexOf(trimmed);

  if (!hasCurrentExercise) {
    diagnostics.push({
      id: 'orphan-set-line',
      lineIndex,
      from: lineOffset,
      to: lineOffset + trimmed.length,
      severity: 'error',
      category: 'syntax',
      message: 'Set line appears before any recognized exercise header.'
    });
    return diagnostics;
  }

  const cleanLine = trimmed.replace(/(?:\b|(?<=^))old\s+/gi, '').trim();
  const tokens = cleanLine.split(',').map(t => t.trim()).filter(Boolean);

  for (const token of tokens) {
    let repStr = token;
    if (token.includes('..')) {
      const subparts = token.split('..');
      repStr = subparts[subparts.length - 1].trim();
      const loadParts = subparts.length > 2
        ? subparts.slice(0, -1).map(s => s.trim()).filter(Boolean)
        : (subparts[0].trim() ? subparts[0].trim().split('/') : []);

      if (loadParts.length > 0) {
        const invalidLoad = loadParts.some(lp => {
          const p = lp.trim();
          if (!p) return true;
          const num = Number(p);
          return !Number.isFinite(num) || num < 0;
        });
        if (invalidLoad) {
          diagnostics.push({
            id: 'invalid-load',
            lineIndex,
            from: lineOffset,
            to: lineOffset + trimmed.length,
            severity: 'error',
            category: 'syntax',
            message: `Invalid load "${subparts.slice(0, -1).join('..')}" in "${token}".`
          });
        }
      }

      if (!repStr) {
        if (prevWeeksCount === 0) {
          diagnostics.push({
            id: 'empty-reps-no-prev',
            lineIndex,
            from: lineOffset,
            to: lineOffset + trimmed.length,
            severity: 'error',
            category: 'syntax',
            message: `No reps after ".." in "${token}" and no previous week to carry forward.`
          });
        }
        continue;
      }
    }

    const repParts = repStr.split('/');
    for (const rpRaw of repParts) {
      const rp = rpRaw.trim();
      if (!rp) {
        diagnostics.push({
          id: 'malformed-set-token',
          lineIndex,
          from: lineOffset,
          to: lineOffset + trimmed.length,
          severity: 'error',
          category: 'syntax',
          message: `Empty dropset segment in "${token}".`
        });
        continue;
      }

      const match = rp.match(REP_PART_REGEX);
      if (!match) {
        diagnostics.push({
          id: 'malformed-set-token',
          lineIndex,
          from: lineOffset,
          to: lineOffset + trimmed.length,
          severity: 'error',
          category: 'syntax',
          message: `Invalid set syntax "${rp}". Expected reps like 10, 10+2, 10(2), or 10@8.5.`
        });
        continue;
      }

      const base = parseInt(match[1], 10);
      const assisted = match[2] ? parseInt(match[2], 10) : 0;
      const partial = match[3] ? parseInt(match[3], 10) : 0;
      const hasExplicitRpe = match[4] !== undefined;
      const rpe = hasExplicitRpe ? parseFloat(match[4]) : null;

      if (hasExplicitRpe && (rpe < 0 || rpe > 10)) {
        diagnostics.push({
          id: 'invalid-rpe',
          lineIndex,
          from: lineOffset,
          to: lineOffset + trimmed.length,
          severity: 'error',
          category: 'syntax',
          message: `RPE ${rpe} in "${rp}" must be between 0 and 10.`
        });
      } else if (hasExplicitRpe && rpe < 5) {
        diagnostics.push({
          id: 'low-rpe-zero-effective',
          lineIndex,
          from: lineOffset,
          to: lineOffset + trimmed.length,
          severity: 'info',
          category: 'anomaly',
          message: `RPE ${rpe} in "${rp}" contributes 0 effective base reps.`
        });
      }

      if (hasExplicitRpe && rpe < 8.5 && (assisted > 0 || partial > 0)) {
        diagnostics.push({
          id: 'extended-reps-low-rpe',
          lineIndex,
          from: lineOffset,
          to: lineOffset + trimmed.length,
          severity: 'warning',
          category: 'anomaly',
          message: `Assisted/partial reps in "${rp}" logged at RPE ${rpe} (< 8.5).`
        });
      }

      if (base === 0 && assisted === 0 && partial === 0) {
        diagnostics.push({
          id: 'zero-reps',
          lineIndex,
          from: lineOffset,
          to: lineOffset + trimmed.length,
          severity: 'warning',
          category: 'anomaly',
          message: `Set "${rp}" has 0 reps.`
        });
      }
    }
  }

  return diagnostics;
}

/**
 * Check semantic/cross-week/cross-session anomalies on parsed workoutData.
 */
function checkWorkoutAnomalies(workoutData, lines, sessionHeaderLines) {
  const diagnostics = [];
  if (!workoutData || workoutData.length === 0) return diagnostics;

  const bySession = new Map();
  for (const ex of workoutData) {
    if (!bySession.has(ex.session)) bySession.set(ex.session, []);
    bySession.get(ex.session).push(ex);
  }

  // 1. Session numbering gaps (ignore session 0)
  const sessionNums = [...bySession.keys()].filter(s => s > 0).sort((a, b) => a - b);
  for (let i = 1; i < sessionNums.length; i++) {
    const prev = sessionNums[i - 1];
    const curr = sessionNums[i];
    if (curr - prev > 1 && sessionHeaderLines.has(curr)) {
      const lineIndex = sessionHeaderLines.get(curr);
      const rawLine = lines[lineIndex] || '';
      const trimmed = rawLine.trim();
      const offset = rawLine.indexOf(trimmed);
      diagnostics.push({
        id: 'session-gap',
        lineIndex,
        from: offset,
        to: offset + trimmed.length,
        severity: 'info',
        category: 'anomaly',
        message: `Session #${curr} follows #${prev} (skipped #${prev + 1}).`
      });
    }
  }

  // 2. Per-session & per-exercise checks
  for (const [sessionNum, exercises] of bySession.entries()) {
    const maxWeeks = Math.max(0, ...exercises.map(e => e.weeks.length));

    for (const ex of exercises) {
      const headerRaw = lines[ex.startLine] || '';
      const headerTrimmed = headerRaw.trim();
      const headerOffset = headerRaw.indexOf(headerTrimmed);

      // Empty exercise block
      if (ex.weeks.length === 0) {
        diagnostics.push({
          id: 'empty-exercise',
          lineIndex: ex.startLine,
          from: headerOffset,
          to: headerOffset + headerTrimmed.length,
          severity: 'info',
          category: 'syntax',
          message: `Exercise "${ex.exercise_obj?.name || headerTrimmed}" has no logged weeks.`
        });
        continue;
      }

      // Uneven week counts within the same session
      if (maxWeeks >= 2 && ex.weeks.length < maxWeeks) {
        diagnostics.push({
          id: 'missing-week',
          lineIndex: ex.startLine,
          from: headerOffset,
          to: headerOffset + headerTrimmed.length,
          severity: 'warning',
          category: 'anomaly',
          message: `Logged ${ex.weeks.length} week(s), while session ${sessionNum} has up to ${maxWeeks} weeks.`
        });
      }

      // Week-over-week load (±50%) and rep anomalies
      for (let w = 1; w < ex.weeks.length; w++) {
        const prevWeek = ex.weeks[w - 1];
        const currWeek = ex.weeks[w];
        if (!prevWeek.sets.length || !currWeek.sets.length) continue;

        const prevLoad = prevWeek.sets[0].load;
        const currLoad = currWeek.sets[0].load;
        const weekRaw = lines[currWeek.lineIndex] || '';
        const weekTrimmed = weekRaw.trim();
        const weekOffset = weekRaw.indexOf(weekTrimmed);

        if (prevLoad > 0 && currLoad > 0) {
          const ratio = (currLoad - prevLoad) / prevLoad;
          if (Math.abs(ratio) > LOAD_ANOMALY_THRESHOLD) {
            const pct = Math.round(ratio * 100);
            const sign = pct > 0 ? '+' : '';
            diagnostics.push({
              id: ratio > 0 ? 'load-spike' : 'load-drop',
              lineIndex: currWeek.lineIndex,
              from: weekOffset,
              to: weekOffset + weekTrimmed.length,
              severity: 'warning',
              category: 'anomaly',
              message: `Load changed by ${sign}${pct}% (${prevLoad} → ${currLoad}) from week ${prevWeek.week_num} to week ${currWeek.week_num}.`
            });
          } else if (currLoad === prevLoad) {
            const prevReps = prevWeek.sets[0].base_reps;
            const currReps = currWeek.sets[0].base_reps;
            if (prevReps >= 4 && (currReps >= prevReps * REP_SPIKE_RATIO || currReps <= prevReps * REP_DROP_RATIO)) {
              diagnostics.push({
                id: 'rep-anomaly',
                lineIndex: currWeek.lineIndex,
                from: weekOffset,
                to: weekOffset + weekTrimmed.length,
                severity: 'warning',
                category: 'anomaly',
                message: `Unusual rep change (${prevReps} → ${currReps}) at the same load (${currLoad}) from week ${prevWeek.week_num} to week ${currWeek.week_num}.`
              });
            }
          }
        }
      }
    }
  }

  return diagnostics;
}

/**
 * Lint raw logbook text and check for syntax issues and training anomalies.
 *
 * @param {string} logText
 * @param {Array} exercises
 * @param {Array|null} preParsedWorkoutData - Optional result of parseLogbook(logText, exercises)
 * @returns {Array} Sorted diagnostics
 */
export function lintLogbook(logText, exercises = [], preParsedWorkoutData = null) {
  if (!logText || typeof logText !== 'string') return [];

  const lines = logText.split('\n');
  const localExercises = getExercisesWithOverrides(logText, exercises);
  const diagnostics = [];
  const sessionHeaderLines = new Map();

  let hasCurrentExercise = false;
  let currentWeeksCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    const lineOffset = rawLine.indexOf(trimmed);

    if (trimmed.startsWith('#')) {
      const match = trimmed.match(/\d+/);
      if (!match) {
        diagnostics.push({
          id: 'session-missing-number',
          lineIndex: i,
          from: lineOffset,
          to: lineOffset + trimmed.length,
          severity: 'error',
          category: 'syntax',
          message: 'Session header "#" is missing a session number.'
        });
      } else {
        const sessNum = parseInt(match[0], 10);
        if (!sessionHeaderLines.has(sessNum)) {
          sessionHeaderLines.set(sessNum, i);
        }
      }
      continue;
    }

    if (trimmed.toLowerCase().startsWith('override:')) {
      diagnostics.push(...lintOverrideLine(trimmed, rawLine, i));
      continue;
    }

    const isLogLine = trimmed.includes('..') || /^(?:old\s+)*[\d().+/@,\s]+$/i.test(trimmed);
    if (isLogLine) {
      diagnostics.push(...lintSetLine(trimmed, rawLine, i, hasCurrentExercise, currentWeeksCount));
      if (hasCurrentExercise) {
        const parsed = parseLine(trimmed, i);
        if (parsed.length > 0 || (trimmed.includes('..') && currentWeeksCount > 0)) {
          currentWeeksCount++;
        }
      }
      continue;
    }

    // Exercise header
    const matchedObj = matchExercise(trimmed, localExercises);
    if (!matchedObj) {
      const namePart = trimmed.split('|')[0].trim();
      const suggestion = suggestExerciseName(trimmed, localExercises);
      diagnostics.push({
        id: 'unknown-exercise',
        lineIndex: i,
        from: lineOffset,
        to: lineOffset + namePart.length,
        severity: 'error',
        category: 'syntax',
        message: suggestion
          ? `Unrecognized exercise "${namePart}". Did you mean "${suggestion}"?`
          : `Unrecognized exercise "${namePart}".`,
        ...(suggestion ? { suggestion } : {})
      });
      hasCurrentExercise = false;
      currentWeeksCount = 0;
    } else {
      hasCurrentExercise = true;
      currentWeeksCount = 0;

      // Validate rest time part if provided (e.g. Exercise | 2'30" | notes)
      const pipeParts = trimmed.split('|');
      if (pipeParts.length > 1) {
        const restPart = pipeParts[1].trim();
        if (restPart && !REST_PART_REGEX.test(restPart)) {
          const restOffset = rawLine.indexOf(restPart, lineOffset + pipeParts[0].length);
          diagnostics.push({
            id: 'invalid-rest-time',
            lineIndex: i,
            from: restOffset >= 0 ? restOffset : lineOffset,
            to: (restOffset >= 0 ? restOffset : lineOffset) + restPart.length,
            severity: 'warning',
            category: 'syntax',
            message: `Unrecognized rest time "${restPart}". Expected format like 2' or 2'30" or 90".`
          });
        }
      }
    }
  }

  const workoutData = preParsedWorkoutData || parseLogbook(logText, exercises);
  diagnostics.push(...checkWorkoutAnomalies(workoutData, lines, sessionHeaderLines));

  const severityOrder = { error: 0, warning: 1, info: 2 };
  diagnostics.sort((a, b) => {
    if (a.lineIndex !== b.lineIndex) return a.lineIndex - b.lineIndex;
    return (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3);
  });

  return diagnostics;
}

export const COEFF_ASSISTED = 0.5;
export const COEFF_PARTIAL = 0.33;

export const MUSCLES = {
  "Clavicular Head": "Chest", "Sternal Head": "Chest", "Latissimus Dorsi": "Back",
  "Upper and Mid Trapezius": "Back", "Lower Trapezius and Rhomboids": "Back", "Erectors": "Back",
  "Anterior Deltoid": "Shoulders", "Lateral Deltoid": "Shoulders", "Posterior Deltoid": "Shoulders",
  "Rotator Cuff": "Shoulders", "Quadriceps": "Legs", "Hamstrings": "Legs", "Glutes": "Legs",
  "Adductors": "Legs", "Calves": "Legs", "Biceps Brachii": "Biceps", "Brachialis": "Biceps",
  "Brachioradialis": "Biceps", "Long Head": "Triceps", "Lateral Head": "Triceps", "Medial Head": "Triceps"
};

// Parse overrides from program markdown and clone/modify exercises list
export function getExercisesWithOverrides(logText, globalExercises) {
  if (!logText) return globalExercises;
  const lines = logText.split('\n').map(l => l.trim());
  const localExercises = globalExercises.map(ex => ({
    ...ex,
    muscles_distr: { ...ex.muscles_distr }
  }));
  
  for (const line of lines) {
    if (line.toLowerCase().startsWith('override:')) {
      const match = line.match(/^override:\s*([^|]+)\|\s*(.*)$/i);
      if (match) {
        const exName = match[1].trim();
        const propStr = match[2].trim();
        
        let exObj = localExercises.find(ex => ex.name.toLowerCase() === exName.toLowerCase());
        if (!exObj) {
          exObj = {
            name: exName,
            muscles_distr: {},
            fatigue: 5.0,
            load_coeff: 0.5,
            load_multiplier: 1.0,
            load_offset: 0.0,
            is_isolation: false
          };
          localExercises.push(exObj);
        }
        
        const parts = propStr.split('|');
        for (const part of parts) {
          const eqIdx = part.indexOf('=');
          if (eqIdx !== -1) {
            const key = part.substring(0, eqIdx).trim().toLowerCase();
            const val = part.substring(eqIdx + 1).trim();
            
            if (key === 'fatigue') {
              exObj.fatigue = parseFloat(val);
            } else if (key === 'load_coeff') {
              exObj.load_coeff = parseFloat(val);
            } else if (key === 'load_multiplier') {
              exObj.load_multiplier = parseFloat(val);
            } else if (key === 'load_offset') {
              exObj.load_offset = parseFloat(val);
            } else if (key === 'is_isolation') {
              exObj.is_isolation = val.toLowerCase() === 'true';
            } else if (key === 'muscles_distr') {
              try {
                exObj.muscles_distr = JSON.parse(val);
              } catch (e) {
                console.error('Failed to parse muscles_distr JSON in override:', val, e);
              }
            }
          }
        }
      }
    }
  }
  return localExercises;
}

// Replicate Python's get_close_matches using Levenshtein distance
function levenshteinDistance(s1, s2) {
  const m = s1.length;
  const n = s2.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        curr[j] = prev[j - 1];
      } else {
        curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + 1);
      }
    }
    const temp = prev;
    prev = curr;
    curr = temp;
  }
  return prev[n];
}

function getStringSimilarity(s1, s2) {
  const dist = levenshteinDistance(s1, s2);
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1.0;
  return 1.0 - dist / maxLen;
}

// Hard map from Analyzer.py (enhanced to fix matching bug)
const HARD_MAP = {
  // --- PETTO ---
  "flat db bench": "Flat DB Bench",
  "spinte db": "Flat DB Bench", "spinte manubri": "Flat DB Bench", "panca piana db": "Flat DB Bench",
  "spinte 20": "20 DB Bench", "spinte db 20": "20 DB Bench", "spinte manubri 20": "20 DB Bench",
  "spinte 32": "32 DB Bench", "spinte db 32": "32 DB Bench", "spinte manubri 32": "32 DB Bench",
  "spinte 45": "45 DB Bench", "spinte db 45": "45 DB Bench", "spinte manubri 45": "45 DB Bench",
  "panca piana": "Flat Barbell Bench", "panca piana bil": "Flat Barbell Bench",
  "panca 20": "20 Barbell Bench", "panca 32": "32 Barbell Bench", "panca 45": "45 Barbell Bench",
  "sm piana": "Flat SM Bench", 
  "sm 20": "20 SM Bench", "20 sm": "20 SM Bench",
  "sm 32": "32 SM Bench", "32 sm": "32 SM Bench",
  "sm 45": "45 SM Bench", "45 sm": "45 SM Bench",
  "sm press 30": "30 SM Press", "smith 30": "30 SM Press",
  "croci db": "DB Flies", "croci manubri": "DB Flies",
  "croci cavo basso": "Low Cable Flies", "croci basse": "Low Cable Flies",
  "croci cavo alto": "High Cable Flies", "croci alte": "High Cable Flies",
  "croci incl": "Incl Cable Flies", "croci cavo incl": "Incl Cable Flies",
  "pec dec": "Pec Deck", "butterfly": "Pec Deck", "pectoral": "Pec Deck",
  "chest press": "Chest Press",

  // --- DORSO ---
  "lat machine": "Lat Machine", "lat presa larga": "Lat Machine", "lat": "Lat Machine",
  "lat machine alternative": "Lat Machine Alternative",
  "pulley stretta": "Close Pulley", "pulley presa stretta": "Close Pulley",
  "pulley larga": "Wide Pulley", "pulley presa larga": "Wide Pulley",
  "pulley sa": "SA Pulley", "pulley mono": "SA Pulley", "pulley single arm": "SA Pulley",
  "t-bar": "T-Bar", "tbar": "T-Bar", "t bar": "T-Bar",
  "machine t-bar": "Machine T-Bar", "t-bar macch": "Machine T-Bar",
  "pullover": "Pullover", "pullover cavo": "Pullover",
  "sa pulldown": "SA Cable Pulldown", "single arm pulldown": "SA Cable Pulldown", "pulldown cavo": "SA Cable Pulldown",
  "sa machine pulldown": "SA Machine Pulldown", "pulldown macch": "SA Machine Pulldown",
  "chin up": "Chin-Ups", "max chin up": "Chin-Ups", "trazioni": "Chin-Ups",

  // --- SPALLE ---
  "lr": "LR", "alzate laterali": "LR", "lateral raise": "LR",
  "lrc": "LRC", "alzate laterali cavo": "LRC", "lateral raise cable": "LRC",
  "shoulder press": "Machine Press", "press macch": "Machine Press",
  "extra": "Shoulder Extra-Rotations", "extra rotazioni": "Shoulder Extra-Rotations",

  // --- GAMBE ---
  "squat": "Squat", "back squat": "Squat",
  "pressa": "Leg Press 45", "leg press": "Leg Press 45", "pressa 45": "Leg Press 45",
  "hack squat": "Hack Squat", "hack": "Hack Squat",
  "sissy": "Sissy Squat", "sissy squat": "Sissy Squat",
  "rdl": "RDL", "stacchi rumeni": "RDL", "rumeni": "RDL",
  "stacco gambe tese": "Stiff Leg Deadlift", "sldl": "Stiff Leg Deadlift",
  "deadlift": "Deadlift", "stacco": "Deadlift", "stacco terra": "Deadlift",
  "leg curl": "Leg Curl", "leg curl sdraiato": "Leg Curl",
  "leg ext": "Leg Extension", "leg extension": "Leg Extension",

  // --- BRACCIA (Bicipiti) ---
  "curl 45": "45 Incl Curl", "curl incl 45": "45 Incl Curl",
  "curl 49": "49 Incl Curl", "curl incl 49": "49 Incl Curl",
  "hammer db": "DB Hammer", "hammer manubri": "DB Hammer", "bicipiti hammer": "DB Hammer",
  "preacher": "Preacher Curl", "scott": "Preacher Curl", "panca scott": "Preacher Curl",

  // --- BRACCIA (Tricipiti) ---
  "fr pr c": "Cable French Press", "french press cavo": "Cable French Press",
  "pushdown 54": "Bench 54 Pushdown", "pd cavo panca 54": "Bench 54 Pushdown", "push down 54": "Bench 54 Pushdown",
  "pushdown incl": "Incl Cable Pushdown", "pushdown cavo incl": "Incl Cable Pushdown",
  "low cable triceps": "Low Cable Triceps", "tricipiti cavo basso": "Low Cable Triceps",
  "bench 54 triceps": "Bench 54 Triceps", "tricipiti panca 54": "Bench 54 Triceps"
};

const SORTED_HARD_MAP_KEYS = Object.keys(HARD_MAP).sort((a, b) => b.length - a.length);

export function matchExercise(rawName, exercises) {
  const namePart = rawName.split('|')[0];
  const cleanRegex = /(?:\d+s|\d+"|\d+'\d*"|ultime|mezze|rep|fermo|giù|su|cheattate|ds|dds|macch|fullrom|cluster|set|bw|focus|contrazione)/gi;
  const rawClean = namePart.replace(cleanRegex, '').replace(/\|/g, '').toLowerCase().trim();

  // Try exact match
  for (const ex of exercises) {
    if (ex.name.toLowerCase() === rawClean) {
      return ex;
    }
  }

  // Check hard map
  for (const key of SORTED_HARD_MAP_KEYS) {
    if (rawClean.includes(key)) {
      return exercises.find(e => e.name === HARD_MAP[key]) || null;
    }
  }

  // Fallback to fuzzy matching
  let bestMatch = null;
  let bestScore = -1;
  const cutoff = 0.4;

  for (const ex of exercises) {
    const score = getStringSimilarity(rawClean, ex.name.toLowerCase());
    if (score > bestScore && score >= cutoff) {
      bestScore = score;
      bestMatch = ex;
    }
  }

  return bestMatch;
}

export function parseRestTime(line) {
  const match = line.match(/\|\s*(?:(\d+)')?(?:(\d+)")?\s*(?:\||$)/);
  if (match && (match[1] || match[2])) {
    const m = match[1] ? parseInt(match[1], 10) : 0;
    const s = match[2] ? parseInt(match[2], 10) : 0;
    return m * 60 + s;
  }
  return 120;
}

export function parseRepToken(repStr, loads, dropsetId = null) {
  const setsOut = [];
  const repParts = repStr.split('/');
  for (let i = 0; i < repParts.length; i++) {
    const rp = repParts[i].trim();
    if (!rp) continue;
    const load = i < loads.length ? loads[i] : loads[loads.length - 1];
    
    // Regex matching e.g. 10(2)+3@8.5 or 9+2
    // Group 1: base reps
    // Group 2: assisted reps
    // Group 3: partial reps
    // Group 4: RPE
    const match = rp.match(/^(\d+)(?:\((\d+)\))?(?:\+(\d+))?(?:@(\d+(?:\.\d+)?))?/);
    if (match) {
      let base = parseInt(match[1], 10);
      const assisted = match[2] ? parseInt(match[2], 10) : 0;
      const partial = match[3] ? parseInt(match[3], 10) : 0;
      const rpe = match[4] ? parseFloat(match[4]) : 9.0;
      
      const fullReps = base;
      const effectiveRepsCustom = Math.min(5, fullReps);
      
      if (assisted > 0) {
        base -= assisted;
      }
      
      // Calculate effective reps
      const effectiveReps = base + (assisted * COEFF_ASSISTED) + (partial * COEFF_PARTIAL);
      
      setsOut.push({
        load,
        base_reps: base,
        assisted_reps: assisted,
        partial_reps: partial,
        rpe,
        effectiveReps,
        effectiveRepsCustom,
        ...(dropsetId ? { dropsetId } : {})
      });
    }
  }
  return setsOut;
}

export function parseTempoFromComment(comment) {
  const commentClean = (comment || "").trim();
  const match = commentClean.match(/\b(\d+)-(\d+)-(\d+)-(\d+)\b/);
  if (match) {
    return [
      parseFloat(match[1]),
      parseFloat(match[2]),
      parseFloat(match[3]),
      parseFloat(match[4])
    ];
  }
  return [1.0, 0.0, 2.0, 0.0];
}

export function parseTempoFromLine(line) {
  const parts = line.split('|');
  const comment = parts.length > 2 ? parts[2] : "";
  return parseTempoFromComment(comment);
}

export function calculateSetTuts(baseReps, assistedReps, partialReps, rpe, concentric, shorteningPause, eccentric, lengtheningPause) {
  const tuts = [];
  
  // 1. Base reps
  for (let j = 0; j < baseReps; j++) {
    const rir = (10.0 - rpe) + (baseReps - 1 - j);
    let slowdown;
    if (rir >= 5.0) {
      slowdown = 0.0;
    } else if (rir >= 4.0) {
      slowdown = 0.15;
    } else if (rir >= 3.0) {
      slowdown = 0.35;
    } else if (rir >= 2.0) {
      slowdown = 0.60;
    } else if (rir >= 1.0) {
      slowdown = 1.00;
    } else {
      slowdown = 1.60;
    }
    
    const repTut = (concentric + slowdown) + shorteningPause + eccentric + lengtheningPause;
    tuts.push(repTut);
  }
  
  // 2. Assisted reps
  for (let j = 0; j < assistedReps; j++) {
    const repTut = concentric + shorteningPause + eccentric + lengtheningPause;
    tuts.push(repTut);
  }
  
  // 3. Partial reps
  for (let j = 0; j < partialReps; j++) {
    const repTut = 0.5 * (concentric + shorteningPause + eccentric + lengtheningPause);
    tuts.push(repTut);
  }
  
  return tuts;
}

export function calculateSetFatigue(baseReps, assistedReps, partialReps, rpe, concentric, shorteningPause, eccentric, lengtheningPause, fatigue, loadCoeff, tuts = null) {
  const actualTuts = tuts || calculateSetTuts(baseReps, assistedReps, partialReps, rpe, concentric, shorteningPause, eccentric, lengtheningPause);
  let totalFat = 0.0;
  
  // 1. Base reps
  for (let j = 0; j < baseReps; j++) {
    if (j >= actualTuts.length) break;
    const repTut = actualTuts[j];
    let rpeMult = 1.0;
    if (rpe > 0) {
      const rir = (10.0 - rpe) + (baseReps - 1 - j);
      const repRpe = Math.max(0.0, 10.0 - rir);
      rpeMult = repRpe > 0 ? Math.pow(1.1, repRpe - 7.5) : 1.0;
    }
    totalFat += repTut * rpeMult * fatigue * loadCoeff;
  }
  
  // 2. Assisted reps
  for (let j = 0; j < assistedReps; j++) {
    const idx = baseReps + j;
    if (idx >= actualTuts.length) break;
    const repTut = actualTuts[idx];
    const repRpe = 7.0;
    const rpeMult = Math.pow(1.1, repRpe - 7.5);
    totalFat += repTut * rpeMult * fatigue * loadCoeff * COEFF_ASSISTED;
  }
  
  // 3. Partial reps
  for (let j = 0; j < partialReps; j++) {
    const idx = baseReps + assistedReps + j;
    if (idx >= actualTuts.length) break;
    const repTut = actualTuts[idx];
    const rpeMult = 1.0;
    totalFat += repTut * rpeMult * fatigue * loadCoeff * (COEFF_PARTIAL / 0.5);
  }
  
  return totalFat;
}


export function parseLine(line, lineIndex = 0) {
  let cleanLine = line.replace(/(?:\b|(?<=^))old\s+/gi, '').trim();
  cleanLine = cleanLine.replace(/\s+/g, '');
  if (!cleanLine) return [];

  let dropsetCounter = 0;
  const nextDropsetId = () => `ds_${lineIndex}_${dropsetCounter++}`;

  // Plain numbers separated by single dots (reps only, load-less)
  if (/^[\d()+\u002b@.]+$/.test(cleanLine) && !cleanLine.includes('..')) {
    const tokens = cleanLine.split('.');
    const sets = [];
    for (const t of tokens) {
      if (t) {
        const hasSlash = t.includes('/');
        const dsId = hasSlash ? nextDropsetId() : null;
        sets.push(...parseRepToken(t, [0.0], dsId));
      }
    }
    return sets;
  }

  // Preprocess Format: load1..load2..reps1.reps2 -> load1/load2..reps1/reps2
  if ((cleanLine.match(/\.\./g) || []).length > 1) {
    const lastIdx = cleanLine.lastIndexOf('..');
    if (lastIdx !== -1) {
      let loadsPart = cleanLine.substring(0, lastIdx);
      let repsPart = cleanLine.substring(lastIdx + 2);
      if (repsPart.includes('.') && loadsPart.includes('..')) {
        if (/^[\d()+\u002b@.]+$/.test(repsPart)) {
          loadsPart = loadsPart.replace(/\.\./g, '/');
          repsPart = repsPart.replace(/\./g, '/');
          cleanLine = `${loadsPart}..${repsPart}`;
        }
      }
    }
  }

  // Split on single dot not part of a decimal or double dot
  // In JS, (?<!\.)\.(?!\.) works in V8 and Chrome/Node
  const tokens = cleanLine.split(/(?<!\.)\.(?!\.)/);
  let currentLoads = [0.0];
  const parsedSets = [];

  for (const token of tokens) {
    if (!token) continue;
    const hasSlash = token.includes('/');
    const dsId = hasSlash ? nextDropsetId() : null;

    if (token.includes('..')) {
      const subparts = token.split('..');
      const repStr = subparts[subparts.length - 1];
      const loadStr = subparts.slice(0, -1).join('/');
      currentLoads = loadStr.includes('/')
        ? loadStr.split('/').filter(Boolean).map(Number)
        : (loadStr ? [parseFloat(loadStr)] : [0.0]);
      
      if (repStr) {
        parsedSets.push(...parseRepToken(repStr, currentLoads, dsId));
      }
    } else {
      parsedSets.push(...parseRepToken(token, currentLoads, dsId));
    }
  }
  return parsedSets;
}

export function parseLogbook(logText, exercises) {
  const lines = logText.split('\n');
  const localExercises = getExercisesWithOverrides(logText, exercises);
  const workoutData = [];
  let currentExercise = null;
  let currentWeek = 1;
  let currentSession = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0) {
      continue;
    }
    try {
      if (line.startsWith('#')) {
        const match = line.match(/\d+/);
        if (match) {
          currentSession = parseInt(match[0], 10);
        }
        continue;
      }

      if (line.toLowerCase().startsWith('override:')) {
        continue;
      }

      // Check if it's a rep/set log line (contains '..' or starts with digit/contains only numbers/symbols)
      const isLogLine = line.includes('..') || /^[old\s]*[\d().+/@\s]+$/i.test(line);

      if (isLogLine) {
        if (currentExercise) {
          let parsedSets = parseLine(line, i);
          
          // Carry forward load if empty (e.g. line is just reps but load exists from prev week)
          if (parsedSets.length === 0 && line.includes('..') && currentExercise.weeks.length > 0) {
            const loadStr = line.split('..')[0].trim();
            if (loadStr) {
              const loads = loadStr.includes('/') 
                ? loadStr.split('/').filter(Boolean).map(Number) 
                : [parseFloat(loadStr)];
              const prevSets = currentExercise.weeks[currentExercise.weeks.length - 1].sets;
              parsedSets = prevSets.map((s, idx) => {
                const load = idx < loads.length ? loads[idx] : loads[loads.length - 1];
                const effectiveReps = s.base_reps + (s.assisted_reps * COEFF_ASSISTED) + (s.partial_reps * COEFF_PARTIAL);
                return {
                  ...s,
                  load,
                  effectiveReps
                };
              });
            }
          }

          parsedSets = parsedSets.map(s => {
            const tuts = s.tuts || calculateSetTuts(
              s.base_reps,
              s.assisted_reps,
              s.partial_reps,
              s.rpe,
              currentExercise.concentric,
              currentExercise.shortening_pause,
              currentExercise.eccentric,
              currentExercise.lengthening_pause
            );
            const totalTut = tuts.reduce((sum, val) => sum + val, 0);
            const effectiveTut = tuts.slice(-5).reduce((sum, val) => sum + val, 0);
            return {
              ...s,
              tuts,
              totalTut,
              effectiveTut
            };
          });

          currentExercise.weeks.push({
            week_num: currentWeek,
            sets: parsedSets,
            raw_line: line,
            lineIndex: i
          });
          currentWeek++;
        }
      } else {
        // Exercise header
        const matchedObj = matchExercise(line, localExercises);
        if (matchedObj) {
          const [c, s_pause, e, l] = parseTempoFromLine(line);
          currentExercise = {
            exercise_obj: matchedObj,
            raw_name: line,
            session: currentSession,
            rest_seconds: parseRestTime(line),
            concentric: c,
            shortening_pause: s_pause,
            eccentric: e,
            lengthening_pause: l,
            weeks: [],
            startLine: i
          };
          workoutData.push(currentExercise);
          currentWeek = 1;
        }
      }
    } catch (e) {
      console.error(`Error parsing line: "${line}"`, e);
    }
  }
  return workoutData;
}

export function calculateMetrics(workoutData, targetSession, targetWeek, targetMacro, targetSub) {
  const results = [];
  for (const wEx of workoutData) {
    if (targetSession && wEx.session !== targetSession) continue;
    const ex = wEx.exercise_obj;
    
    // Check macro muscle filter
    if (targetMacro) {
      const hasMacro = Object.keys(ex.muscles_distr).some(sub => MUSCLES[sub] === targetMacro);
      if (!hasMacro) continue;
    }

    // Check sub muscle filter
    if (targetSub && !(targetSub in ex.muscles_distr)) continue;

    // Determine distribution coefficient
    let distrSum = 1.0;
    if (targetSub) {
      distrSum = ex.muscles_distr[targetSub] || 0.0;
    } else if (targetMacro) {
      distrSum = Object.entries(ex.muscles_distr)
        .filter(([sub]) => MUSCLES[sub] === targetMacro)
        .reduce((sum, [, val]) => sum + val, 0.0);
    }

    for (const wData of wEx.weeks) {
      if (targetWeek && wData.week_num !== targetWeek) continue;
      
      let vol = 0.0;
      let ton = 0.0;
      let totalFat = 0.0;
      let customEffSum = 0.0;
      let totalTut = 0.0;
      let effectiveTut = 0.0;
      let sets = 0.0;
      
      for (const s of wData.sets) {
        const effReps = s.effectiveReps * distrSum;
        vol += effReps;
        
        const actualLoad = (s.load * ex.load_multiplier) + ex.load_offset;
        ton += actualLoad * effReps;
        
        const setFat = calculateSetFatigue(
          s.base_reps,
          s.assisted_reps,
          s.partial_reps,
          s.rpe,
          wEx.concentric,
          wEx.shortening_pause,
          wEx.eccentric,
          wEx.lengthening_pause,
          ex.fatigue,
          ex.load_coeff,
          s.tuts
        );
        totalFat += setFat * distrSum;
        
        // Custom effective reps scale with muscle distribution just like volume
        const customEff = (s.effectiveRepsCustom || 0) * distrSum;
        customEffSum += customEff;

        totalTut += (s.totalTut || 0) * distrSum;
        effectiveTut += (s.effectiveTut || 0) * distrSum;
        sets += 1.0 * distrSum;
      }
      
      if (vol > 0) {
        results.push({
          session: wEx.session,
          name: ex.name,
          week: wData.week_num,
          volume: vol,
          tonnage: ton,
          fatigue: totalFat,
          effectiveRepsCustom: customEffSum,
          totalTut,
          effectiveTut,
          sets
        });
      }
    }
  }
  return results;
}

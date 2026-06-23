export const COEFF_ASSISTED = 0.5;
export const COEFF_PARTIAL = 0.33;

export const MUSCLES = {
  // --- Chest ---
  "Clavicular Head": "Chest",
  "Sternal Head": "Chest",
  "Costal Head": "Chest",
  "Pectoralis Minor": "Chest",
  "Pectoralis Major": "Chest",
  "Serratus Anterior": "Chest",
  "Lower Pectoralis": "Chest",

  // --- Back ---
  "Latissimus Dorsi": "Back",
  "Latissimus Dorsi Iliac": "Back",
  "Latissimus Dorsi Lumbar": "Back",
  "Latissimus Dorsi Thoracic": "Back",
  "Teres Major": "Back",
  "Upper Trapezius": "Back",
  "Mid Trapezius": "Back",
  "Lower Trapezius": "Back",
  "Rhomboids": "Back",
  "Erectors": "Back",
  "Erector Spinae": "Back",
  "Upper and Mid Trapezius": "Back",
  "Lower Trapezius and Rhomboids": "Back",

  // --- Shoulders ---
  "Anterior Deltoid": "Shoulders",
  "Lateral Deltoid": "Shoulders",
  "Posterior Deltoid": "Shoulders",
  "Supraspinatus": "Shoulders",
  "Infraspinatus": "Shoulders",
  "Teres Minor": "Shoulders",
  "Subscapularis": "Shoulders",
  "Rotator Cuff": "Shoulders",

  // --- Legs ---
  "Quadriceps": "Legs",
  "Rectus Femoris": "Legs",
  "Vastus Lateralis": "Legs",
  "Vastus Medialis": "Legs",
  "Vastus Intermedius": "Legs",
  "Hamstrings": "Legs",
  "Biceps Femoris": "Legs",
  "Semitendinosus": "Legs",
  "Semimembranosus": "Legs",
  "Glutes": "Legs",
  "Gluteus Maximus": "Legs",
  "Gluteus Medius": "Legs",
  "Gluteus Minimus": "Legs",
  "Adductors": "Legs",
  "Sartorius": "Legs",
  "Tensor Fasciae Latae": "Legs",
  "Gracilis": "Legs",
  "Pectineus": "Legs",
  "Iliopsoas": "Legs",
  "Calves": "Legs",
  "Gastrocnemius": "Legs",
  "Soleus": "Legs",
  "Tibialis Anterior": "Legs",
  "Plantaris": "Legs",
  "Popliteus": "Legs",

  // --- Biceps ---
  "Biceps Brachii": "Biceps",
  "Biceps Brachii Long Head": "Biceps",
  "Biceps Brachii Short Head": "Biceps",
  "Brachialis": "Biceps",
  "Brachioradialis": "Biceps",
  "Coracobrachialis": "Biceps",

  // --- Triceps ---
  "Long Head": "Triceps",
  "Lateral Head": "Triceps",
  "Medial Head": "Triceps",

  // --- Forearms ---
  "Wrist Flexors": "Forearms",
  "Wrist Extensors": "Forearms",

  // --- Core ---
  "Abdominals": "Core",
  "Rectus Abdominis": "Core",
  "Obliques": "Core",
  "Transversus Abdominis": "Core",

  // --- Neck ---
  "Neck Flexors": "Neck",
  "Neck Extensors": "Neck",
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
export const HARD_MAP = {
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
  "leg curl seduto busto flesso": "Leg Curl Seduto (Busto Flesso)", "leg curl seduto": "Leg Curl Seduto (Busto Flesso)",
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
  "bench 54 triceps": "Bench 54 Triceps", "tricipiti panca 54": "Bench 54 Triceps",

  // --- ADDOME ---
  "dragon flag": "Dragon Flag Raises", "dragon flag raises": "Dragon Flag Raises",
  "hanging leg": "Hanging Leg Raises", "hanging leg raises": "Hanging Leg Raises", "leg raises": "Hanging Leg Raises"
};

const SORTED_HARD_MAP_KEYS = Object.keys(HARD_MAP).sort((a, b) => b.length - a.length);
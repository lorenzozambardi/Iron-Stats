import re
import sys
import argparse
import json
from difflib import get_close_matches
from dataclasses import dataclass, field
from typing import List, Dict, Optional

COEFF_ASSISTED = 0.5
COEFF_PARTIAL = 0.33

@dataclass
class Exercise:
    name: str
    muscles_distr: Dict[str, float]
    fatigue: float
    load_coeff: float
    load_multiplier: float = 1.0
    load_offset: float = 0.0
    is_isolation: bool = False

MUSCLES = {
    "Clavicular Head": "Chest", "Sternal Head": "Chest", "Latissimus Dorsi": "Back",
    "Upper and Mid Trapezius": "Back", "Lower Trapezius and Rhomboids": "Back", "Erectors": "Back",
    "Anterior Deltoid": "Shoulders", "Lateral Deltoid": "Shoulders", "Posterior Deltoid": "Shoulders",
    "Rotator Cuff": "Shoulders", "Quadriceps": "Legs", "Hamstrings": "Legs", "Glutes": "Legs",
    "Adductors": "Legs", "Calves": "Legs", "Biceps Brachii": "Biceps", "Brachialis": "Biceps",
    "Brachioradialis": "Biceps", "Long Head": "Triceps", "Lateral Head": "Triceps", "Medial Head": "Triceps"
}

exercises_list = [
    Exercise("Squat", {"Quadriceps": 0.5, "Glutes": 0.3, "Adductors": 0.1, "Erectors": 0.1}, 9.5, 0.10),
    Exercise("Leg Press 45", {"Quadriceps": 0.6, "Glutes": 0.3, "Adductors": 0.1}, 8.0, 0.30),
    Exercise("Sissy Squat", {"Quadriceps": 1}, 5.0, 0.70, is_isolation=True),
    Exercise("RDL", {"Hamstrings": 0.6, "Glutes": 0.3, "Erectors": 0.1}, 8.5, 0.30),
    Exercise("Leg Curl", {"Hamstrings": 1}, 4.0, 0.80, is_isolation=True),
    Exercise("Leg Extension", {"Quadriceps": 1}, 4.0, 0.80, is_isolation=True),
    Exercise("Stiff Leg Deadlift", {"Hamstrings": 0.7, "Glutes": 0.2, "Erectors": 0.1}, 9.0, 0.25),
    Exercise("Deadlift", {"Glutes": 0.4, "Hamstrings": 0.3, "Erectors": 0.2, "Latissimus Dorsi": 0.1}, 10.0, 0.10),
    Exercise("Hack Squat", {"Quadriceps": 0.7, "Glutes": 0.3}, 8.5, 0.30),
    Exercise("Flat Barbell Bench", {"Sternal Head": 0.7, "Clavicular Head": 0.1, "Anterior Deltoid": 0.1, "Lateral Head": 0.1}, 8.0, 0.40),
    Exercise("20 Barbell Bench", {"Sternal Head": 0.6, "Clavicular Head": 0.2, "Anterior Deltoid": 0.1, "Lateral Head": 0.1}, 7.8, 0.42),
    Exercise("32 Barbell Bench", {"Sternal Head": 0.4, "Clavicular Head": 0.4, "Anterior Deltoid": 0.1, "Lateral Head": 0.1}, 7.6, 0.45),
    Exercise("45 Barbell Bench", {"Clavicular Head": 0.6, "Sternal Head": 0.2, "Anterior Deltoid": 0.2}, 7.5, 0.50),
    Exercise("Flat DB Bench", {"Sternal Head": 0.75, "Clavicular Head": 0.1, "Anterior Deltoid": 0.15}, 7.0, 0.50, load_multiplier=2.0),
    Exercise("20 DB Bench", {"Sternal Head": 0.6, "Clavicular Head": 0.3, "Anterior Deltoid": 0.1}, 6.8, 0.52, load_multiplier=2.0),
    Exercise("32 DB Bench", {"Clavicular Head": 0.5, "Sternal Head": 0.3, "Anterior Deltoid": 0.2}, 6.8, 0.55, load_multiplier=2.0),
    Exercise("45 DB Bench", {"Clavicular Head": 0.7, "Sternal Head": 0.1, "Anterior Deltoid": 0.2}, 6.5, 0.60, load_multiplier=2.0),
    Exercise("Chest Press", {"Sternal Head": 0.7, "Clavicular Head": 0.2, "Anterior Deltoid": 0.1}, 6.0, 0.60),
    Exercise("Flat SM Bench", {"Sternal Head": 0.7, "Clavicular Head": 0.15, "Anterior Deltoid": 0.15}, 6.5, 0.50, load_multiplier=2.0, load_offset=20.0),
    Exercise("20 SM Bench", {"Sternal Head": 0.6, "Clavicular Head": 0.25, "Anterior Deltoid": 0.15}, 6.4, 0.52, load_multiplier=2.0, load_offset=20.0),
    Exercise("32 SM Bench", {"Clavicular Head": 0.5, "Sternal Head": 0.3, "Anterior Deltoid": 0.2}, 6.3, 0.55, load_multiplier=2.0, load_offset=20.0),
    Exercise("45 SM Bench", {"Clavicular Head": 0.65, "Sternal Head": 0.15, "Anterior Deltoid": 0.2}, 6.2, 0.60, load_multiplier=2.0, load_offset=20.0),
    Exercise("Pec Deck", {"Sternal Head": 0.8, "Clavicular Head": 0.2}, 3.5, 0.80, is_isolation=True),
    Exercise("DB Flies", {"Sternal Head": 0.7, "Clavicular Head": 0.3}, 4.5, 0.75, load_multiplier=2.0, is_isolation=True),
    Exercise("High Cable Flies", {"Sternal Head": 0.8, "Clavicular Head": 0.2}, 3.5, 0.80, is_isolation=True),
    Exercise("Low Cable Flies", {"Clavicular Head": 0.8, "Sternal Head": 0.2}, 3.5, 0.80, is_isolation=True),
    Exercise("30 SM Press", {"Clavicular Head": 0.5, "Sternal Head": 0.3, "Anterior Deltoid": 0.2}, 6.3, 0.55, load_multiplier=2.0, load_offset=20.0),
    Exercise("Incl Cable Flies", {"Clavicular Head": 0.8, "Sternal Head": 0.2}, 3.5, 0.80, is_isolation=True),
    Exercise("Lat Machine", {"Latissimus Dorsi": 0.7, "Upper and Mid Trapezius": 0.1, "Lower Trapezius and Rhomboids": 0.1, "Biceps Brachii": 0.1}, 6.0, 0.60),
    Exercise("Lat Machine Alternative", {"Latissimus Dorsi": 0.8, "Upper and Mid Trapezius": 0.05, "Lower Trapezius and Rhomboids": 0.05, "Biceps Brachii": 0.1}, 6.0, 0.60),
    Exercise("Wide Pulley", {"Latissimus Dorsi": 0.4, "Upper and Mid Trapezius": 0.3, "Lower Trapezius and Rhomboids": 0.2, "Biceps Brachii": 0.1}, 6.5, 0.55),
    Exercise("Close Pulley", {"Latissimus Dorsi": 0.6, "Lower Trapezius and Rhomboids": 0.2, "Upper and Mid Trapezius": 0.1, "Biceps Brachii": 0.1}, 6.0, 0.60),
    Exercise("SA Pulley", {"Latissimus Dorsi": 0.7, "Lower Trapezius and Rhomboids": 0.2, "Biceps Brachii": 0.1}, 5.5, 0.70, is_isolation=True),
    Exercise("T-Bar", {"Latissimus Dorsi": 0.4, "Upper and Mid Trapezius": 0.3, "Lower Trapezius and Rhomboids": 0.2, "Erectors": 0.1}, 8.0, 0.35),
    Exercise("Machine T-Bar", {"Latissimus Dorsi": 0.4, "Upper and Mid Trapezius": 0.3, "Lower Trapezius and Rhomboids": 0.3}, 6.5, 0.55),
    Exercise("Pullover", {"Latissimus Dorsi": 0.8, "Sternal Head": 0.2}, 4.5, 0.75, is_isolation=True),
    Exercise("SA Cable Pulldown", {"Latissimus Dorsi": 0.9, "Biceps Brachii": 0.1}, 4.5, 0.75, is_isolation=True),
    Exercise("SA Machine Pulldown", {"Latissimus Dorsi": 0.9, "Biceps Brachii": 0.1}, 5.0, 0.70, is_isolation=True),
    Exercise("Chin-Ups", {"Latissimus Dorsi": 0.4, "Biceps Brachii": 0.5, "Lower Trapezius and Rhomboids": 0.1}, 7.5, 0.45),
    Exercise("LR", {"Lateral Deltoid": 0.9, "Upper and Mid Trapezius": 0.1}, 3.0, 0.90, load_multiplier=2.0, is_isolation=True),
    Exercise("LRC", {"Lateral Deltoid": 0.9, "Upper and Mid Trapezius": 0.1}, 3.0, 0.90, load_multiplier=0.5, is_isolation=True),
    Exercise("Machine Press", {"Anterior Deltoid": 0.7, "Lateral Deltoid": 0.1, "Clavicular Head": 0.1, "Lateral Head": 0.1}, 6.5, 0.55),
    Exercise("Shoulder Extra-Rotations", {"Rotator Cuff": 1}, 2.0, 1.00, is_isolation=True),
    Exercise("45 Incl Curl", {"Biceps Brachii": 0.8, "Brachialis": 0.1, "Brachioradialis": 0.1}, 3.5, 0.85, load_multiplier=2.0, is_isolation=True),
    Exercise("49 Incl Curl", {"Biceps Brachii": 0.8, "Brachialis": 0.1, "Brachioradialis": 0.1}, 3.5, 0.85, load_multiplier=2.0, is_isolation=True),
    Exercise("DB Hammer", {"Brachioradialis": 0.5, "Brachialis": 0.4, "Biceps Brachii": 0.1}, 3.5, 0.85, load_multiplier=2.0, is_isolation=True),
    Exercise("Preacher Curl", {"Brachialis": 0.6, "Biceps Brachii": 0.4}, 4.0, 0.80, is_isolation=True),
    Exercise("Cable French Press", {"Long Head": 0.7, "Lateral Head": 0.15, "Medial Head": 0.15}, 4.0, 0.80, load_multiplier=0.5, is_isolation=True),
    Exercise("Incl Cable Pushdown", {"Lateral Head": 0.4, "Medial Head": 0.4, "Long Head": 0.2}, 3.5, 0.85, is_isolation=True),
    Exercise("Bench 54 Pushdown", {"Lateral Head": 0.4, "Medial Head": 0.4, "Long Head": 0.2}, 3.5, 0.85, is_isolation=True),
    Exercise("Low Cable Triceps", {"Long Head": 0.8, "Medial Head": 0.1, "Lateral Head": 0.1}, 3.5, 0.85, is_isolation=True),
    Exercise("Bench 54 Triceps", {"Long Head": 0.7, "Lateral Head": 0.15, "Medial Head": 0.15}, 4.0, 0.80, is_isolation=True),
    Exercise("EZ-Bar Curl", {"Biceps Brachii": 0.6, "Brachioradialis": 0.25, "Brachialis": 0.15}, 5.0, 0.70, load_multiplier=2.0, load_offset=8.0, is_isolation=True),
    Exercise("Bayesian Curl SA", {"Biceps Brachii": 0.8, "Brachioradialis": 0.1, "Brachialis": 0.1}, 3.0, 0.90, load_multiplier=0.5, is_isolation=True)
]

@dataclass
class SetData:
    load: float
    base_reps: int
    assisted_reps: int = 0
    partial_reps: int = 0
    rpe: float = 9.0
    total_tut: float = 0.0
    effective_tut: float = 0.0
    tuts: List[float] = field(default_factory=list)
    
    @property
    def effective_reps(self) -> float:
        return self.base_reps + (self.assisted_reps * COEFF_ASSISTED) + (self.partial_reps * COEFF_PARTIAL)

@dataclass
class WeekData:
    week_num: int
    sets: List[SetData] = field(default_factory=list)

@dataclass
class WorkoutExercise:
    exercise_obj: Exercise
    raw_name: str
    session: int = 0
    rest_seconds: int = 120
    weeks: List[WeekData] = field(default_factory=list)
    concentric: float = 1.0
    shortening_pause: float = 0.0
    eccentric: float = 2.0
    lengthening_pause: float = 0.0

HARD_MAP = {
    # --- PETTO ---
    "flat db bench": "Flat DB Bench",
    "spinte db": "Flat DB Bench", "spinte manubri": "Flat DB Bench", "panca piana db": "Flat DB Bench",
    "spinte 20": "20 DB Bench", "spinte db 20": "20 DB Bench", "spinte manubri 20": "20 DB Bench",
    "spinte 32": "32 DB Bench", "spinte db 32": "32 DB Bench", "spinte manubri 32": "32 DB Bench",
    "spinte 45": "45 DB Bench", "spinte db 45": "45 DB Bench", "spinte manubri 45": "45 DB Bench",
    "panca piana": "Flat Barbell Bench", "panca piana bil": "Flat Barbell Bench",
    "panca 20": "20 Barbell Bench", "panca 32": "32 Barbell Bench", "panca 45": "45 Barbell Bench",
    "sm piana": "Flat SM Bench", "sm 20": "20 SM Bench", "20 sm": "20 SM Bench", "sm 32": "32 SM Bench", "32 sm": "32 SM Bench", "sm 45": "45 SM Bench", "45 sm": "45 SM Bench",
    "sm press 30": "30 SM Press", "smith 30": "30 SM Press",
    "croci db": "DB Flies", "croci manubri": "DB Flies",
    "croci cavo basso": "Low Cable Flies", "croci basse": "Low Cable Flies",
    "croci cavo alto": "High Cable Flies", "croci alte": "High Cable Flies",
    "croci incl": "Incl Cable Flies", "croci cavo incl": "Incl Cable Flies",
    "pec dec": "Pec Deck", "butterfly": "Pec Deck", "pectoral": "Pec Deck",
    "chest press": "Chest Press",

    # --- DORSO ---
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

    # --- SPALLE ---
    "lr": "LR", "alzate laterali": "LR", "lateral raise": "LR",
    "lrc": "LRC", "alzate laterali cavo": "LRC", "lateral raise cable": "LRC",
    "shoulder press": "Machine Press", "press macch": "Machine Press",
    "extra": "Shoulder Extra-Rotations", "extra rotazioni": "Shoulder Extra-Rotations",

    # --- GAMBE ---
    "squat": "Squat", "back squat": "Squat",
    "pressa": "Leg Press 45", "leg press": "Leg Press 45", "pressa 45": "Leg Press 45",
    "hack squat": "Hack Squat", "hack": "Hack Squat",
    "sissy": "Sissy Squat", "sissy squat": "Sissy Squat",
    "rdl": "RDL", "stacchi rumeni": "RDL", "rumeni": "RDL",
    "stacco gambe tese": "Stiff Leg Deadlift", "sldl": "Stiff Leg Deadlift",
    "deadlift": "Deadlift", "stacco": "Deadlift", "stacco terra": "Deadlift",
    "leg curl": "Leg Curl", "leg curl sdraiato": "Leg Curl",
    "leg ext": "Leg Extension", "leg extension": "Leg Extension",

    # --- BRACCIA (Bicipiti) ---
    "curl 45": "45 Incl Curl", "curl incl 45": "45 Incl Curl",
    "curl 49": "49 Incl Curl", "curl incl 49": "49 Incl Curl",
    "hammer db": "DB Hammer", "hammer manubri": "DB Hammer", "bicipiti hammer": "DB Hammer",
    "preacher": "Preacher Curl", "scott": "Preacher Curl", "panca scott": "Preacher Curl",

    # --- BRACCIA (Tricipiti) ---
    "fr pr c": "Cable French Press", "french press cavo": "Cable French Press",
    "pushdown 54": "Bench 54 Pushdown", "pd cavo panca 54": "Bench 54 Pushdown", "push down 54": "Bench 54 Pushdown",
    "pushdown incl": "Incl Cable Pushdown", "pushdown cavo incl": "Incl Cable Pushdown",
    "low cable triceps": "Low Cable Triceps", "tricipiti cavo basso": "Low Cable Triceps",
    "bench 54 triceps": "Bench 54 Triceps", "tricipiti panca 54": "Bench 54 Triceps"
}

SORTED_HARD_MAP_KEYS = sorted(HARD_MAP.keys(), key=len, reverse=True)

def match_exercise(raw_name: str, exercises: List[Exercise]) -> Optional[Exercise]:
    name_part = raw_name.split('|')[0]
    raw_clean = re.sub(r'(?i)(\d+s|\d+"|\d+\'\d*"|ultime|mezze|rep|fermo|giù|su|cheattate|ds|dds|macch|fullrom|cluster|set|bw|focus|contrazione)', '', name_part).lower().strip()
    
    for ex in exercises:
        if ex.name.lower() == raw_clean:
            return ex

    for key in SORTED_HARD_MAP_KEYS:
        if key in raw_clean:
            return next((e for e in exercises if e.name == HARD_MAP[key]), None)

    names = [e.name for e in exercises]
    matches = get_close_matches(raw_clean, names, n=1, cutoff=0.4)
    if matches:
        return next((e for e in exercises if e.name == matches[0]), None)
    return None

def parse_rest_time(line: str) -> int:
    match = re.search(r'\|\s*(?:(\d+)\')?(?:(\d+)")?\s*(?:\||$)', line)
    if match and (match.group(1) or match.group(2)):
        m = int(match.group(1)) if match.group(1) else 0
        s = int(match.group(2)) if match.group(2) else 0
        return m * 60 + s
    return 120

def parse_tempo_from_comment(comment: str) -> tuple[float, float, float, float]:
    comment_clean = comment.strip()
    match = re.search(r'\b(\d+)-(\d+)-(\d+)-(\d+)\b', comment_clean)
    if match:
        return (
            float(match.group(1)),
            float(match.group(2)),
            float(match.group(3)),
            float(match.group(4))
        )
    return 1.0, 0.0, 2.0, 0.0

def parse_tempo_from_line(line: str) -> tuple[float, float, float, float]:
    parts = line.split('|')
    comment = parts[2] if len(parts) > 2 else ""
    return parse_tempo_from_comment(comment)

def calculate_set_tuts(base_reps: int, assisted_reps: int, partial_reps: int, rpe: float,
                       concentric: float, shortening_pause: float, eccentric: float, lengthening_pause: float) -> List[float]:
    tuts = []
    
    # 1. Base reps
    for j in range(base_reps):
        rir = (10.0 - rpe) + (base_reps - 1 - j)
        if rir >= 5.0:
            slowdown = 0.0
        elif rir >= 4.0:
            slowdown = 0.15
        elif rir >= 3.0:
            slowdown = 0.35
        elif rir >= 2.0:
            slowdown = 0.60
        elif rir >= 1.0:
            slowdown = 1.00
        else:
            slowdown = 1.60
        
        rep_tut = (concentric + slowdown) + shortening_pause + eccentric + lengthening_pause
        tuts.append(rep_tut)
        
    # 2. Assisted reps
    for j in range(assisted_reps):
        rep_tut = concentric + shortening_pause + eccentric + lengthening_pause
        tuts.append(rep_tut)
        
    # 3. Partial reps
    for j in range(partial_reps):
        rep_tut = 0.5 * (concentric + shortening_pause + eccentric + lengthening_pause)
        tuts.append(rep_tut)
        
    return tuts

def calculate_set_fatigue(base_reps: int, assisted_reps: int, partial_reps: int, rpe: float,
                          concentric: float, shortening_pause: float, eccentric: float, lengthening_pause: float,
                          fatigue: float, load_coeff: float, tuts: Optional[List[float]] = None) -> float:
    actual_tuts = tuts if tuts is not None else calculate_set_tuts(base_reps, assisted_reps, partial_reps, rpe, concentric, shortening_pause, eccentric, lengthening_pause)
    total_fat = 0.0
    
    # 1. Base reps
    for j in range(base_reps):
        if j >= len(actual_tuts): break
        rep_tut = actual_tuts[j]
        if rpe > 0:
            rir = (10.0 - rpe) + (base_reps - 1 - j)
            rep_rpe = max(0.0, 10.0 - rir)
            rpe_mult = (1.1 ** (rep_rpe - 7.5)) if rep_rpe > 0 else 1.0
        else:
            rpe_mult = 1.0
        total_fat += rep_tut * rpe_mult * fatigue * load_coeff
        
    # 2. Assisted reps
    for j in range(assisted_reps):
        idx = base_reps + j
        if idx >= len(actual_tuts): break
        rep_tut = actual_tuts[idx]
        rep_rpe = 7.0
        rpe_mult = 1.1 ** (rep_rpe - 7.5)
        total_fat += rep_tut * rpe_mult * fatigue * load_coeff * COEFF_ASSISTED
        
    # 3. Partial reps
    for j in range(partial_reps):
        idx = base_reps + assisted_reps + j
        if idx >= len(actual_tuts): break
        rep_tut = actual_tuts[idx]
        rep_rpe = 7.5
        rpe_mult = 1.0
        total_fat += rep_tut * rpe_mult * fatigue * load_coeff * (COEFF_PARTIAL / 0.5)
        
    return total_fat

def parse_rep_token(rep_str: str, loads: List[float]) -> List[SetData]:
    sets_out = []
    rep_parts = rep_str.split('/')
    for i, rp in enumerate(rep_parts):
        if not rp.strip(): continue
        load = loads[i] if i < len(loads) else loads[-1]
        match = re.match(r'(\d+)(?:\((\d+)\))?(?:\+(\d+))?(?:@(\d+(?:\.\d+)?))?', rp.strip())
        if match:
            base = int(match.group(1))
            assisted = int(match.group(2)) if match.group(2) else 0
            partial = int(match.group(3)) if match.group(3) else 0
            rpe = float(match.group(4)) if match.group(4) else 9.0
            if assisted > 0:
                base -= assisted
            sets_out.append(SetData(load=load, base_reps=base, assisted_reps=assisted, partial_reps=partial, rpe=rpe))
    return sets_out

def parse_line(line: str) -> List[SetData]:
    line = re.sub(r'(?i)old\s+', '', line).strip()
    line = line.replace(" ", "")
    if not line: return []

    if re.match(r'^[\d\.\(\)\+@]+$', line) and '..' not in line:
        tokens = line.split('.')
        sets = []
        for t in tokens:
            if t: sets.extend(parse_rep_token(t, [0.0]))
        return sets

    # Preprocess Format: load1..load2..reps1.reps2 -> load1/load2..reps1/reps2
    if line.count('..') > 1:
        parts = line.rsplit('..', 1)
        if len(parts) == 2:
            loads_part, reps_part = parts[0], parts[1]
            if '.' in reps_part and '..' in loads_part:
                if re.match(r'^[\d\.\(\)\+@]+$', reps_part):
                    loads_part = loads_part.replace('..', '/')
                    reps_part = reps_part.replace('.', '/')
                    line = f"{loads_part}..{reps_part}"

    tokens = re.split(r'(?<!\.)\.(?!\.)', line)
    current_loads = [0.0]
    parsed_sets = []

    for token in tokens:
        if not token: continue
        if '..' in token:
            subparts = token.split('..')
            rep_str = subparts[-1]
            load_str = "/".join(subparts[:-1]) if len(subparts) > 2 else subparts[0]
            current_loads = [float(x) for x in load_str.split('/') if x] if '/' in load_str else ([float(load_str)] if load_str else [0.0])
            if rep_str: parsed_sets.extend(parse_rep_token(rep_str, current_loads))
        else:
            parsed_sets.extend(parse_rep_token(token, current_loads))
    return parsed_sets

def analyze_workout_log(log_text: str, exercises: List[Exercise]) -> List[WorkoutExercise]:
    # Clone global exercises list to apply overrides locally for this logbook file
    local_exercises = []
    for ex in exercises:
        local_exercises.append(Exercise(
            name=ex.name,
            muscles_distr=dict(ex.muscles_distr),
            fatigue=ex.fatigue,
            load_coeff=ex.load_coeff,
            load_multiplier=ex.load_multiplier,
            load_offset=ex.load_offset,
            is_isolation=ex.is_isolation
        ))
        
    lines = [line.strip() for line in log_text.split('\n') if line.strip()]
    
    # Parse overrides first
    for line in lines:
        if line.lower().startswith('override:'):
            match = re.match(r'^override:\s*([^|]+)\|\s*(.*)$', line, re.IGNORECASE)
            if match:
                ex_name = match.group(1).strip()
                prop_str = match.group(2).strip()
                
                # Find or create
                ex_obj = next((e for e in local_exercises if e.name.lower() == ex_name.lower()), None)
                if not ex_obj:
                    ex_obj = Exercise(
                        name=ex_name,
                        muscles_distr={},
                        fatigue=5.0,
                        load_coeff=0.5,
                        load_multiplier=1.0,
                        load_offset=0.0,
                        is_isolation=False
                    )
                    local_exercises.append(ex_obj)
                
                # Parse properties
                parts = prop_str.split('|')
                for part in parts:
                    if '=' in part:
                        key, val = part.split('=', 1)
                        key = key.strip().lower()
                        val = val.strip()
                        
                        if key == 'fatigue':
                            ex_obj.fatigue = float(val)
                        elif key == 'load_coeff':
                            ex_obj.load_coeff = float(val)
                        elif key == 'load_multiplier':
                            ex_obj.load_multiplier = float(val)
                        elif key == 'load_offset':
                            ex_obj.load_offset = float(val)
                        elif key == 'is_isolation':
                            ex_obj.is_isolation = val.lower() in ('true', '1')
                        elif key == 'muscles_distr':
                            try:
                                ex_obj.muscles_distr = json.loads(val)
                            except Exception as e:
                                sys.stderr.write(f"Failed to parse muscles_distr JSON in override: '{val}' | {e}\n")
                                
    workout_data = []
    current_exercise, current_week, current_session = None, 1, 0
    
    for line in lines:
        try:
            if line.startswith('#'):
                match = re.search(r'\d+', line)
                if match: current_session = int(match.group())
                continue
            if line.lower().startswith('override:'):
                continue
                
            if '..' in line or re.match(r'^[\d\.\(\)\+\/@]+$', line.replace("old", "").replace(" ", "").strip(), re.IGNORECASE):
                if current_exercise:
                    parsed_sets = parse_line(line)
                    if not parsed_sets and '..' in line and current_exercise.weeks:
                        load_str = line.split('..')[0].strip()
                        if load_str:
                            loads = [float(x) for x in load_str.split('/') if x]
                            prev_sets = current_exercise.weeks[-1].sets
                            parsed_sets = [SetData(load=loads[i] if i < len(loads) else loads[-1], base_reps=s.base_reps, assisted_reps=s.assisted_reps, partial_reps=s.partial_reps, rpe=s.rpe, tuts=list(s.tuts)) for i, s in enumerate(prev_sets)]
                    
                    for s in parsed_sets:
                        tuts = s.tuts if s.tuts else calculate_set_tuts(
                            base_reps=s.base_reps,
                            assisted_reps=s.assisted_reps,
                            partial_reps=s.partial_reps,
                            rpe=s.rpe,
                            concentric=current_exercise.concentric,
                            shortening_pause=current_exercise.shortening_pause,
                            eccentric=current_exercise.eccentric,
                            lengthening_pause=current_exercise.lengthening_pause
                        )
                        s.tuts = tuts
                        s.total_tut = sum(tuts)
                        s.effective_tut = sum(tuts[-5:])
                    
                    current_exercise.weeks.append(WeekData(week_num=current_week, sets=parsed_sets))
                    current_week += 1
            else:
                matched_obj = match_exercise(line, local_exercises)
                if matched_obj:
                    c, s_pause, e, l = parse_tempo_from_line(line)
                    current_exercise = WorkoutExercise(
                        exercise_obj=matched_obj,
                        raw_name=line,
                        session=current_session,
                        rest_seconds=parse_rest_time(line),
                        concentric=c,
                        shortening_pause=s_pause,
                        eccentric=e,
                        lengthening_pause=l
                    )
                    workout_data.append(current_exercise)
                    current_week = 1
        except Exception as e:
            sys.stderr.write(f"Error parsing: '{line}' | {e}\n")
    return workout_data

def calculate_metrics(workout_data: List[WorkoutExercise], target_session: Optional[int], target_week: Optional[int], target_macro: Optional[str], target_sub: Optional[str]):
    results = []
    for w_ex in workout_data:
        if target_session and w_ex.session != target_session: continue
        ex = w_ex.exercise_obj
        if target_macro and target_macro not in {MUSCLES[sub] for sub in ex.muscles_distr.keys()}: continue
        if target_sub and target_sub not in ex.muscles_distr: continue
        distr_sum = ex.muscles_distr.get(target_sub, 0.0) if target_sub else (sum(val for m, val in ex.muscles_distr.items() if MUSCLES.get(m) == target_macro) if target_macro else 1.0)

        for w_data in w_ex.weeks:
            if target_week and w_data.week_num != target_week: continue
            vol, ton, total_fat, total_tut, effective_tut, sets_count = 0.0, 0.0, 0.0, 0.0, 0.0, 0.0
            for s in w_data.sets:
                eff_reps = s.effective_reps * distr_sum
                vol += eff_reps
                actual_load = (s.load * ex.load_multiplier) + ex.load_offset
                ton += actual_load * eff_reps
                set_fat = calculate_set_fatigue(
                    base_reps=s.base_reps,
                    assisted_reps=s.assisted_reps,
                    partial_reps=s.partial_reps,
                    rpe=s.rpe,
                    concentric=w_ex.concentric,
                    shortening_pause=w_ex.shortening_pause,
                    eccentric=w_ex.eccentric,
                    lengthening_pause=w_ex.lengthening_pause,
                    fatigue=ex.fatigue,
                    load_coeff=ex.load_coeff,
                    tuts=s.tuts
                )
                total_fat += set_fat * distr_sum
                total_tut += s.total_tut * distr_sum
                effective_tut += s.effective_tut * distr_sum
                sets_count += 1.0 * distr_sum
            if vol > 0:
                results.append({
                    "Session": w_ex.session,
                    "Name": ex.name,
                    "Week": w_data.week_num,
                    "Volume": vol,
                    "Tonnage": ton,
                    "Fatigue": total_fat,
                    "Total TUT": total_tut,
                    "Eff TUT": effective_tut,
                    "Sets": sets_count
                })
    return results

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--session", type=int); parser.add_argument("--week", type=int); parser.add_argument("--macro", type=str); parser.add_argument("--sub", type=str); parser.add_argument("--file", type=str)
    args = parser.parse_args()
    raw_log = open(args.file).read() if args.file else (sys.stdin.read() if not sys.stdin.isatty() else "")
    if not raw_log.strip(): sys.exit("No input.")
    parsed = analyze_workout_log(raw_log, exercises_list)
    metrics = calculate_metrics(parsed, args.session, args.week, args.macro, args.sub)
    print(f"\n{'Session':<10} | {'Exercise':<25} | {'Week':<10} | {'Volume':<10} | {'Tonnage':<15} | {'Fatigue':<15} | {'Total TUT':<12} | {'Eff TUT':<12} | {'Sets':<10}\n" + "-" * 148)
    tv, tt, tf, ttut, etut, tsets = 0.0, 0.0, 0.0, 0.0, 0.0, 0.0
    for m in metrics:
        tv += m["Volume"]; tt += m["Tonnage"]; tf += m["Fatigue"]; ttut += m["Total TUT"]; etut += m["Eff TUT"]; tsets += m["Sets"]
        print(f"{m['Session']:<10} | {m['Name']:<25} | {m['Week']:<10} | {m['Volume']:<10.2f} | {m['Tonnage']:<15.2f} | {m['Fatigue']:<15.2f} | {m['Total TUT']:<12.1f} | {m['Eff TUT']:<12.1f} | {m['Sets']:<10.2f}")
    print("-" * 148 + f"\n{'TOTAL':<10} | {'':<25} | {'':<10} | {tv:<10.2f} | {tt:<15.2f} | {tf:<15.2f} | {ttut:<12.1f} | {etut:<12.1f} | {tsets:<10.2f}")

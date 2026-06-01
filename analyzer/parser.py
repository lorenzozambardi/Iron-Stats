import json
import re
import sys
from difflib import get_close_matches
from typing import List, Optional

from .constants import HARD_MAP, SORTED_HARD_MAP_KEYS
from .metrics import calculate_set_tuts
from .models import Exercise, SetData, WeekData, WorkoutExercise

# Precompiled regular expressions for performance optimization
RE_CLEAN_EXERCISE = re.compile(
    r'(?i)(\d+s|\d+"|\d+\'\d*"|ultime|mezze|rep|fermo|giù|su|cheattate|ds|dds|macch|fullrom|cluster|set|bw|focus|contrazione)'
)
RE_REST_TIME = re.compile(r'\|\s*(?:(\d+)\')?(?:(\d+)")?\s*(?:\||$)')
RE_TEMPO_COMMENT = re.compile(r"\b(\d+)-(\d+)-(\d+)-(\d+)\b")
RE_REP_TOKEN = re.compile(r"(\d+)(?:\((\d+)\))?(?:\+(\d+))?(?:@(\d+(?:\.\d+)?))?")
RE_OLD_PREFIX = re.compile(r"(?i)old\s+")
RE_LOG_LINE_SHORT = re.compile(r"^[\d\.\(\)\+@]+$")
RE_DOT_SPLIT = re.compile(r"(?<!\.)\.(?!\.)")
RE_OVERRIDE = re.compile(r"^override:\s*([^|]+)\|\s*(.*)$", re.IGNORECASE)
RE_DIGITS = re.compile(r"\d+")
RE_LOG_LINE_LONG = re.compile(r"^[\d\.\(\)\+\/@]+$", re.IGNORECASE)


def match_exercise(raw_name: str, exercises: List[Exercise]) -> Optional[Exercise]:
    name_part = raw_name.split("|")[0]
    raw_clean = RE_CLEAN_EXERCISE.sub("", name_part).lower().strip()

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
    match = RE_REST_TIME.search(line)
    if match and (match.group(1) or match.group(2)):
        m = int(match.group(1)) if match.group(1) else 0
        s = int(match.group(2)) if match.group(2) else 0
        return m * 60 + s
    return 120


def parse_tempo_from_comment(comment: str) -> tuple[float, float, float, float]:
    comment_clean = comment.strip()
    match = RE_TEMPO_COMMENT.search(comment_clean)
    if match:
        return (
            float(match.group(1)),
            float(match.group(2)),
            float(match.group(3)),
            float(match.group(4)),
        )
    return 1.0, 0.0, 2.0, 0.0


def parse_tempo_from_line(line: str) -> tuple[float, float, float, float]:
    parts = line.split("|")
    comment = parts[2] if len(parts) > 2 else ""
    return parse_tempo_from_comment(comment)


def parse_rep_token(rep_str: str, loads: List[float]) -> List[SetData]:
    sets_out = []
    rep_parts = rep_str.split("/")
    for i, rp in enumerate(rep_parts):
        if not rp.strip():
            continue
        load = loads[i] if i < len(loads) else loads[-1]
        match = RE_REP_TOKEN.match(rp.strip())
        if match:
            base = int(match.group(1))
            assisted = int(match.group(2)) if match.group(2) else 0
            partial = int(match.group(3)) if match.group(3) else 0
            rpe = float(match.group(4)) if match.group(4) else 9.0
            if assisted > 0:
                base -= assisted
            sets_out.append(
                SetData(
                    load=load,
                    base_reps=base,
                    assisted_reps=assisted,
                    partial_reps=partial,
                    rpe=rpe,
                )
            )
    return sets_out


def parse_line(line: str) -> List[SetData]:
    line = RE_OLD_PREFIX.sub("", line).strip()
    line = line.replace(" ", "")
    if not line:
        return []

    if RE_LOG_LINE_SHORT.match(line) and ".." not in line:
        tokens = line.split(".")
        sets = []
        for t in tokens:
            if t:
                sets.extend(parse_rep_token(t, [0.0]))
        return sets

    if line.count("..") > 1:
        parts = line.rsplit("..", 1)
        if len(parts) == 2:
            loads_part, reps_part = parts[0], parts[1]
            if "." in reps_part and ".." in loads_part:
                if RE_LOG_LINE_SHORT.match(reps_part):
                    loads_part = loads_part.replace("..", "/")
                    reps_part = reps_part.replace(".", "/")
                    line = f"{loads_part}..{reps_part}"

    tokens = RE_DOT_SPLIT.split(line)
    current_loads = [0.0]
    parsed_sets = []

    for token in tokens:
        if not token:
            continue
        if ".." in token:
            subparts = token.split("..")
            rep_str = subparts[-1]
            load_str = "/".join(subparts[:-1]) if len(subparts) > 2 else subparts[0]
            current_loads = (
                [float(x) for x in load_str.split("/") if x]
                if "/" in load_str
                else ([float(load_str)] if load_str else [0.0])
            )
            if rep_str:
                parsed_sets.extend(parse_rep_token(rep_str, current_loads))
        else:
            parsed_sets.extend(parse_rep_token(token, current_loads))
    return parsed_sets


def analyze_workout_log(
    log_text: str, exercises: List[Exercise]
) -> List[WorkoutExercise]:
    local_exercises = []
    for ex in exercises:
        local_exercises.append(
            Exercise(
                name=ex.name,
                muscles_distr=dict(ex.muscles_distr),
                fatigue=ex.fatigue,
                load_coeff=ex.load_coeff,
                load_multiplier=ex.load_multiplier,
                load_offset=ex.load_offset,
                is_isolation=ex.is_isolation,
            )
        )

    lines = [line.strip() for line in log_text.split("\n") if line.strip()]

    for line in lines:
        if line.lower().startswith("override:"):
            match = RE_OVERRIDE.match(line)
            if match:
                ex_name = match.group(1).strip()
                prop_str = match.group(2).strip()

                ex_obj = next(
                    (e for e in local_exercises if e.name.lower() == ex_name.lower()),
                    None,
                )
                if not ex_obj:
                    ex_obj = Exercise(
                        name=ex_name,
                        muscles_distr={},
                        fatigue=5.0,
                        load_coeff=0.5,
                        load_multiplier=1.0,
                        load_offset=0.0,
                        is_isolation=False,
                    )
                    local_exercises.append(ex_obj)

                parts = prop_str.split("|")
                for part in parts:
                    if "=" in part:
                        key, val = part.split("=", 1)
                        key = key.strip().lower()
                        val = val.strip()

                        if key == "fatigue":
                            ex_obj.fatigue = float(val)
                        elif key == "load_coeff":
                            ex_obj.load_coeff = float(val)
                        elif key == "load_multiplier":
                            ex_obj.load_multiplier = float(val)
                        elif key == "load_offset":
                            ex_obj.load_offset = float(val)
                        elif key == "is_isolation":
                            ex_obj.is_isolation = val.lower() in ("true", "1")
                        elif key == "muscles_distr":
                            try:
                                ex_obj.muscles_distr = json.loads(val)
                            except Exception as e:
                                sys.stderr.write(
                                    f"Failed to parse muscles_distr JSON in override: '{val}' | {e}\n"
                                )

    workout_data = []
    current_exercise, current_week, current_session = None, 1, 0

    for line in lines:
        try:
            if line.startswith("#"):
                match = RE_DIGITS.search(line)
                if match:
                    current_session = int(match.group())
                continue
            if line.lower().startswith("override:"):
                continue

            if ".." in line or RE_LOG_LINE_LONG.match(
                line.replace("old", "").replace(" ", "").strip()
            ):
                if current_exercise:
                    parsed_sets = parse_line(line)
                    if not parsed_sets and ".." in line and current_exercise.weeks:
                        load_str = line.split("..")[0].strip()
                        if load_str:
                            loads = [float(x) for x in load_str.split("/") if x]
                            prev_sets = current_exercise.weeks[-1].sets
                            parsed_sets = [
                                SetData(
                                    load=loads[i] if i < len(loads) else loads[-1],
                                    base_reps=s.base_reps,
                                    assisted_reps=s.assisted_reps,
                                    partial_reps=s.partial_reps,
                                    rpe=s.rpe,
                                    tuts=list(s.tuts),
                                )
                                for i, s in enumerate(prev_sets)
                            ]

                    for s in parsed_sets:
                        tuts = (
                            s.tuts
                            if s.tuts
                            else calculate_set_tuts(
                                base_reps=s.base_reps,
                                assisted_reps=s.assisted_reps,
                                partial_reps=s.partial_reps,
                                rpe=s.rpe,
                                concentric=current_exercise.concentric,
                                shortening_pause=current_exercise.shortening_pause,
                                eccentric=current_exercise.eccentric,
                                lengthening_pause=current_exercise.lengthening_pause,
                            )
                        )
                        s.tuts = tuts
                        s.total_tut = sum(tuts)
                        eff_base = min(float(s.base_reps), max(0.0, s.rpe - 4.0))
                        eff_base_count = int(eff_base + 0.5)
                        start_idx = max(0, s.base_reps - eff_base_count)
                        base_tut = sum(tuts[start_idx : s.base_reps])
                        extended_tut = sum(tuts[s.base_reps :])
                        s.effective_tut = base_tut + extended_tut

                    current_exercise.weeks.append(
                        WeekData(week_num=current_week, sets=parsed_sets)
                    )
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
                        lengthening_pause=l,
                    )
                    workout_data.append(current_exercise)
                    current_week = 1
        except Exception as e:
            sys.stderr.write(f"Error parsing: '{line}' | {e}\n")
    return workout_data

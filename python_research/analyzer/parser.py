import json
import math
import re
import sys

from .constants import HARD_MAP, SORTED_HARD_MAP_KEYS
from .metrics import calculate_set_fatigue, calculate_set_tuts, compute_effective_tut
from .models import Exercise, SetData, WeekData, WorkoutExercise, coerce_muscles_distr


def levenshtein_distance(s1: str, s2: str) -> int:
    m = len(s1)
    n = len(s2)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m + 1):
        dp[i][0] = i
    for j in range(n + 1):
        dp[0][j] = j
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            cost = 0 if s1[i - 1] == s2[j - 1] else 1
            dp[i][j] = min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + cost,
            )
    return dp[m][n]


def get_string_similarity(s1: str, s2: str) -> float:
    dist = levenshtein_distance(s1, s2)
    max_len = max(len(s1), len(s2))
    if max_len == 0:
        return 1.0
    return 1.0 - dist / max_len

# Precompiled regular expressions for performance optimization
# Matches fluff text in exercise names to be cleaned out (e.g. '10s', 'rep', 'cluster')
RE_CLEAN_EXERCISE = re.compile(
    r'(?i)(\d+s|\d+"|\d+\'\d*"|ultime|mezze|rep|fermo|giù|su|cheattate|ds|dds|macch|fullrom|cluster|set|bw|focus|contrazione|last|half|reps|pause|\bdown\b|up|cheated|machine|contraction)'
)
# Matches rest times in the format | 2' | or | 90" | or | 1'30" |
RE_REST_TIME = re.compile(r'\|\s*(?:(\d+)\')?(?:(\d+)")?\s*(?:\||$)')
# Matches tempo notations like 1-0-2-0 (concentric-pause-eccentric-pause)
RE_TEMPO_COMMENT = re.compile(r"\b(\d+)-(\d+)-(\d+)-(\d+)\b")
# Matches set structures like "10(2)+3@8.5" (10 base reps, 2 assisted, 3 partials, @8.5 RPE)
RE_REP_TOKEN = re.compile(r"(\d+)(?:\((\d+)\))?(?:\+(\d+))?(?:@(\d+(?:\.\d+)?))?")
RE_OLD_PREFIX = re.compile(r"(?i)(?:\b|(?<=^))old\s+")
# Matches lines that contain only short numerical sets (e.g. "10, 9, 8")
RE_LOG_LINE_SHORT = re.compile(r"^[\d\.\(\)\+@,\s]+$")
# Matches exercise override syntax: "override: Lat Machine | fatigue=6.0 | load_coeff=0.8"
RE_OVERRIDE = re.compile(r"^override:\s*([^|]+)\|\s*(.*)$", re.IGNORECASE)
RE_DIGITS = re.compile(r"\d+")
# Matches general log lines containing sets, weights, and dropsets (e.g. "90/80.. 10, 8")
RE_LOG_LINE_LONG = re.compile(r"^[\d\.\(\)\+\/@,\s]+$", re.IGNORECASE)


def match_exercise(raw_name: str, exercises: list[Exercise]) -> Exercise | None:
    """
    Attempts to match a raw string (e.g. from the logbook) to a known exercise in the database.
    It cleans the string, checks for exact matches, checks a hardcoded alias map, and finally 
    uses fuzzy string matching with a cutoff to avoid false positives.
    """
    name_part = raw_name.split("|")[0]
    raw_lower = name_part.strip().lower()

    for ex in exercises:
        if ex.name.lower() == raw_lower:
            return ex

    for key in SORTED_HARD_MAP_KEYS:
        if key in raw_lower:
            return next((e for e in exercises if e.name == HARD_MAP[key]), None)

    raw_clean = RE_CLEAN_EXERCISE.sub("", name_part).lower().strip()

    for ex in exercises:
        if ex.name.lower() == raw_clean:
            return ex

    for key in SORTED_HARD_MAP_KEYS:
        if key in raw_clean:
            return next((e for e in exercises if e.name == HARD_MAP[key]), None)

    # Fallback to fuzzy matching
    best_match = None
    best_score = -1.0
    cutoff = 0.4

    for ex in exercises:
        score = get_string_similarity(raw_clean, ex.name.lower())
        if score > best_score and score >= cutoff:
            best_score = score
            best_match = ex

    return best_match


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


def parse_rep_token(
    rep_str: str, loads: list[float], dropset_id: str | None = None
) -> list[SetData]:
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
            rpe = min(10.0, max(0.0, float(match.group(4)))) if match.group(4) else 9.0
            if assisted > 0:
                base = max(0, base - assisted)
            sets_out.append(
                SetData(
                    load=load,
                    base_reps=base,
                    assisted_reps=assisted,
                    partial_reps=partial,
                    rpe=rpe,
                    dropset_id=dropset_id,
                )
            )
    return sets_out


def parse_line(line: str, line_index: int = 0) -> list[SetData]:
    line = RE_OLD_PREFIX.sub("", line).strip()
    if not line:
        return []

    tokens = [t.strip() for t in line.split(",") if t.strip()]
    current_loads = [0.0]
    parsed_sets = []
    dropset_counter = 0

    for token in tokens:
        has_slash = "/" in token
        ds_id = f"ds_{line_index}_{dropset_counter}" if has_slash else None
        if has_slash:
            dropset_counter += 1

        if ".." in token:
            subparts = token.split("..")
            rep_str = subparts[-1].strip()
            load_str = (
                "/".join(subparts[:-1]).strip()
                if len(subparts) > 2
                else subparts[0].strip()
            )
            if load_str:
                parsed_loads = (
                    [float(x) for x in load_str.split("/") if x]
                    if "/" in load_str
                    else [float(load_str)]
                )
                if parsed_loads and all(math.isfinite(x) for x in parsed_loads):
                    current_loads = parsed_loads
            if rep_str:
                parsed_sets.extend(parse_rep_token(rep_str, current_loads, ds_id))
        else:
            parsed_sets.extend(parse_rep_token(token, current_loads, ds_id))

    return parsed_sets


def analyze_workout_log(
    log_text: str, exercises: list[Exercise]
) -> list[WorkoutExercise]:
    """
    Parses a raw markdown workout log into a structured List of WorkoutExercise objects.
    It handles:
    - Exercise overrides (`override: ...`)
    - Session numbers (`# 1`)
    - Exercise headers (`Lat Machine | 2' | 1-0-2-0`)
    - Sets and loads (`90..10.8+2`)
    And calculates TUT and effective reps for each parsed set.
    """
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
                            try:
                                parsed_val = float(val)
                            except ValueError:
                                parsed_val = math.nan
                            if math.isfinite(parsed_val) and parsed_val >= 0.0:
                                ex_obj.fatigue = parsed_val
                        elif key == "load_coeff":
                            try:
                                parsed_val = float(val)
                            except ValueError:
                                parsed_val = math.nan
                            if math.isfinite(parsed_val) and parsed_val >= 0.0:
                                ex_obj.load_coeff = parsed_val
                        elif key == "load_multiplier":
                            try:
                                parsed_val = float(val)
                            except ValueError:
                                parsed_val = math.nan
                            if math.isfinite(parsed_val) and parsed_val > 0.0:
                                ex_obj.load_multiplier = parsed_val
                        elif key == "load_offset":
                            try:
                                parsed_val = float(val)
                            except ValueError:
                                parsed_val = math.nan
                            if math.isfinite(parsed_val):
                                ex_obj.load_offset = parsed_val
                        elif key == "is_isolation":
                            ex_obj.is_isolation = val.lower() in ("true", "1")
                        elif key == "muscles_distr":
                            try:
                                ex_obj.muscles_distr = coerce_muscles_distr(json.loads(val))
                            except (json.JSONDecodeError, ValueError, TypeError) as exc:
                                sys.stderr.write(
                                    f"Failed to parse muscles_distr JSON in override: '{val}' | {exc}\n"
                                )

    workout_data = []
    current_exercise, current_week, current_session = None, 1, 0

    for i, line in enumerate(lines):
        line = line.strip()
        if not line:
            continue
        try:
            if line.startswith("#"):
                match = RE_DIGITS.search(line)
                if match:
                    current_session = int(match.group())
                continue
            if line.lower().startswith("override:"):
                continue

            if ".." in line or RE_LOG_LINE_LONG.match(
                RE_OLD_PREFIX.sub("", line).replace(" ", "").strip()
            ):
                if current_exercise:
                    parsed_sets = parse_line(line, i)
                    if not parsed_sets and ".." in line and current_exercise.weeks:
                        clean_cf = RE_OLD_PREFIX.sub("", line).strip()
                        cf_subparts = clean_cf.split("..")
                        load_str = (
                            "/".join(cf_subparts[:-1]).strip()
                            if len(cf_subparts) > 2
                            else cf_subparts[0].strip()
                        )
                        if load_str:
                            loads = [float(x) for x in load_str.split("/") if x]
                            if loads and all(math.isfinite(x) for x in loads):
                                prev_sets = current_exercise.weeks[-1].sets
                                parsed_sets = [
                                    SetData(
                                        load=loads[idx] if idx < len(loads) else loads[-1],
                                        base_reps=s.base_reps,
                                        assisted_reps=s.assisted_reps,
                                        partial_reps=s.partial_reps,
                                        rpe=s.rpe,
                                        fatigue=s.fatigue,
                                        dropset_id=s.dropset_id,
                                        tuts=list(s.tuts),
                                    )
                                    for idx, s in enumerate(prev_sets)
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
                        s.tuts = list(tuts)
                        s.total_tut = sum(s.tuts)
                        s.effective_tut = compute_effective_tut(s.tuts, s.base_reps, s.rpe)
                        if s.fatigue == 0.0:
                            s.fatigue = calculate_set_fatigue(
                                base_reps=s.base_reps,
                                assisted_reps=s.assisted_reps,
                                partial_reps=s.partial_reps,
                                rpe=s.rpe,
                                concentric=current_exercise.concentric,
                                shortening_pause=current_exercise.shortening_pause,
                                eccentric=current_exercise.eccentric,
                                lengthening_pause=current_exercise.lengthening_pause,
                                fatigue=current_exercise.exercise_obj.fatigue if current_exercise.exercise_obj else 5.0,
                                load_coeff=current_exercise.exercise_obj.load_coeff if current_exercise.exercise_obj else 0.5,
                                tuts=s.tuts,
                            )

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
        except Exception as err:  # noqa: BLE001
            sys.stderr.write(f"Error parsing: '{line}' | {err}\n")
    return workout_data

import datetime
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
    r"(?i)(?:\b\d+s\b|\b\d+'\d*\"|\b\d+\"|\b(?:ultime|mezze|reps?|fermo|giù|su|cheattate|dds|ds|macch|fullrom|cluster|set|bw|focus|contrazione|last|half|pause|down|up|cheated|machine|contraction)\b)"
)
# Matches rest times in a single pipe-separated segment (e.g. "2'", '90"', "1'30\"", "2' 30\"")
RE_REST_SEGMENT = re.compile(r"^(?:(\d+)'\s*)?(?:(\d+)\")?$")
# Matches tempo notations like 1-0-2-0 (concentric-pause-eccentric-pause), including decimals
RE_TEMPO_COMMENT = re.compile(
    r"\b(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\b"
)
RE_NON_EXERCISE_PROSE = re.compile(r"^[A-Za-zÀ-ÖØ-öø-ÿ0-9 _-]{1,32}:\s+")
RE_BULLET_LINE = re.compile(r"^[-*+]\s+")
RE_HR_LINE = re.compile(r"^(?:[-*_]\s*){3,}$")
RE_TOP_HEADER = re.compile(r"^#(?!#)")
# Matches set structures like "10(2)+3@8.5" (10 base reps, 2 assisted, 3 partials, @8.5 RPE)
RE_REP_TOKEN = re.compile(r"^(\d+)(?:\((\d+)\))?(?:\+(\d+))?(?:@(\d+(?:\.\d+)?))?$")
RE_OLD_PREFIX = re.compile(r"(?i)(?:\b|(?<=^))old\s+")
# Matches exercise override syntax: "override: Lat Machine | fatigue=6.0 | load_coeff=0.8"
RE_OVERRIDE = re.compile(r"^override:\s*([^|]+)\|\s*(.*)$", re.IGNORECASE)
RE_DIGITS = re.compile(r"\d+")
# Matches general log lines containing sets, weights, and dropsets (e.g. "90/80.. 10, 8")
RE_LOG_LINE_LONG = re.compile(r"^[\d\.\(\)\+\/@,\s]+$", re.IGNORECASE)
RE_LOG_LINE_LOAD = re.compile(r"(?:^|\s)-?[\d.]+(?:/-?[\d.]+)*\s*\.\.")
RE_DATES_HEADER = re.compile(r"^dates:\s*$", re.IGNORECASE)
RE_DATE_DMY = re.compile(r"^(\d{2})[-/](\d{2})[-/](\d{4})$")
RE_DATE_YMD = re.compile(r"^(\d{4})[-/](\d{2})[-/](\d{2})$")

HARD_MAP_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    (
        key,
        re.compile(rf"(?:^|[^a-z0-9]){re.escape(key)}(?:$|[^a-z0-9])", re.IGNORECASE),
    )
    for key in SORTED_HARD_MAP_KEYS
]


def is_dates_header(line: str) -> bool:
    return isinstance(line, str) and bool(RE_DATES_HEADER.match(line.strip()))


def parse_date_token_to_iso(raw: str) -> str | None:
    """Parses DD-MM-YYYY, DD/MM/YYYY, or YYYY-MM-DD into ISO YYYY-MM-DD."""
    if not isinstance(raw, str):
        return None
    s = raw.strip()
    if not s or s == "-":
        return None

    dmy = RE_DATE_DMY.match(s)
    ymd = RE_DATE_YMD.match(s)
    if dmy:
        d, m, y = int(dmy.group(1)), int(dmy.group(2)), int(dmy.group(3))
    elif ymd:
        y, m, d = int(ymd.group(1)), int(ymd.group(2)), int(ymd.group(3))
    else:
        return None

    if y < 1900 or y > 2150:
        return None
    try:
        dt = datetime.date(y, m, d)
    except ValueError:
        return None
    return dt.isoformat()


def is_date_line(line: str) -> bool:
    if not isinstance(line, str):
        return False
    s = line.strip()
    if s == "-":
        return True
    return parse_date_token_to_iso(s) is not None


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

    raw_clean = re.sub(r"\s+", " ", RE_CLEAN_EXERCISE.sub("", name_part)).lower().strip()

    for ex in exercises:
        if ex.name.lower() == raw_clean:
            return ex

    for key, pattern in HARD_MAP_PATTERNS:
        if pattern.search(raw_lower):
            target = next((e for e in exercises if e.name == HARD_MAP[key]), None)
            if target is not None:
                return target

    for key, pattern in HARD_MAP_PATTERNS:
        if pattern.search(raw_clean):
            target = next((e for e in exercises if e.name == HARD_MAP[key]), None)
            if target is not None:
                return target

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
    parts = line.split("|")
    if len(parts) < 2:
        return 120

    def try_segment(seg: str) -> int | None:
        trimmed = seg.strip()
        if not trimmed:
            return None
        match = RE_REST_SEGMENT.match(trimmed)
        if match and (match.group(1) or match.group(2)):
            m = int(match.group(1)) if match.group(1) else 0
            s = int(match.group(2)) if match.group(2) else 0
            return m * 60 + s
        return None

    first_col = parts[1].strip()
    if first_col:
        parsed = try_segment(first_col)
        return parsed if parsed is not None else 120

    for seg in parts[2:]:
        parsed = try_segment(seg)
        if parsed is not None:
            return parsed
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
    comment = " | ".join(parts[2:]) if len(parts) > 2 else ""
    return parse_tempo_from_comment(comment)


def _parse_load_spec(load_str: str) -> list[float] | None:
    trimmed = load_str.strip()
    if not trimmed:
        return None
    parts = trimmed.split("/") if "/" in trimmed else [trimmed]
    parsed: list[float] = []
    for p in parts:
        pt = p.strip()
        if not pt:
            return None
        try:
            val = float(pt)
        except ValueError:
            return None
        if not math.isfinite(val):
            return None
        parsed.append(val)
    return parsed if parsed else None


def parse_rep_token(
    rep_str: str, loads: list[float], dropset_id: str | None = None
) -> list[SetData]:
    sets_out = []
    rep_parts = rep_str.split("/")
    for i, rp in enumerate(rep_parts):
        rp_norm = re.sub(r"\s*([+@])\s*", r"\1", rp.strip())
        rp_norm = re.sub(r"\s*\(\s*(\d+)\s*\)", r"(\1)", rp_norm)
        if not rp_norm:
            continue
        load = loads[i] if i < len(loads) else loads[-1]
        match = RE_REP_TOKEN.match(rp_norm)
        if match:
            base = int(match.group(1))
            raw_assisted = int(match.group(2)) if match.group(2) else 0
            assisted = min(raw_assisted, base)
            partial = int(match.group(3)) if match.group(3) else 0
            rpe = min(10.0, max(0.0, float(match.group(4)))) if match.group(4) else 9.0
            if assisted > 0:
                base = base - assisted
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
    line = RE_OLD_PREFIX.sub("", line.split("--", 1)[0]).strip()
    if not line:
        return []

    tokens = [t.strip() for t in line.split(",") if t.strip()]
    current_loads = [0.0]
    seq_loads: list[float] | None = None
    seq_load_idx = 0
    parsed_sets = []
    dropset_counter = 0

    for token in tokens:
        if ".." in token:
            subparts = token.split("..")
            rep_str = subparts[-1].strip()
            has_slash = "/" in rep_str
            ds_id = f"ds_{line_index}_{dropset_counter}" if has_slash else None
            if has_slash:
                dropset_counter += 1

            if len(subparts) > 2:
                load_str = "/".join(subparts[:-1]).strip()
                parsed_loads = _parse_load_spec(load_str)
                if parsed_loads:
                    if has_slash:
                        current_loads = parsed_loads
                        seq_loads = None
                    else:
                        seq_loads = parsed_loads
                        seq_load_idx = 0
                        current_loads = [seq_loads[0]]
            else:
                seq_loads = None
                load_str = subparts[0].strip()
                parsed_loads = _parse_load_spec(load_str)
                if parsed_loads:
                    current_loads = parsed_loads

            if rep_str:
                if seq_loads is not None and not has_slash:
                    loads_for_token = [seq_loads[min(seq_load_idx, len(seq_loads) - 1)]]
                    seq_load_idx += 1
                else:
                    loads_for_token = current_loads
                parsed_sets.extend(parse_rep_token(rep_str, loads_for_token, ds_id))
        else:
            has_slash = "/" in token
            ds_id = f"ds_{line_index}_{dropset_counter}" if has_slash else None
            if has_slash:
                dropset_counter += 1
            if seq_loads is not None and not has_slash:
                loads_for_token = [seq_loads[min(seq_load_idx, len(seq_loads) - 1)]]
                seq_load_idx += 1
            else:
                loads_for_token = current_loads
            parsed_sets.extend(parse_rep_token(token, loads_for_token, ds_id))

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

    raw_lines = log_text.split("\n")

    for raw_line in raw_lines:
        line = raw_line.strip()
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
    session_dates: dict[int, list[str | None]] = {}
    current_exercise, current_week, current_session = None, 1, 0
    in_dates_block = False
    start_idx = 0

    first_non_empty = next((k for k, rl in enumerate(raw_lines) if rl.strip()), -1)
    if first_non_empty != -1 and raw_lines[first_non_empty].strip() == "---":
        for k in range(first_non_empty + 1, len(raw_lines)):
            t = raw_lines[k].strip()
            if t.startswith("#"):
                break
            if t in ("---", "..."):
                start_idx = k + 1
                break

    for i in range(start_idx, len(raw_lines)):
        line = raw_lines[i].strip()
        if not line:
            continue
        try:
            if line.startswith("#"):
                if RE_TOP_HEADER.match(line):
                    match = RE_DIGITS.search(line)
                    current_session = int(match.group()) if match else (current_session + 1)
                in_dates_block = False
                current_exercise = None
                continue
            if line.lower().startswith("override:"):
                in_dates_block = False
                continue

            if is_dates_header(line):
                in_dates_block = True
                current_exercise = None
                session_dates.setdefault(current_session, [])
                continue

            if in_dates_block:
                if is_date_line(line):
                    session_dates[current_session].append(parse_date_token_to_iso(line))
                    continue
                in_dates_block = False

            if (
                line.startswith(">")
                or RE_HR_LINE.match(line)
                or RE_BULLET_LINE.match(line)
            ):
                continue

            line_no_comment = line.split("--", 1)[0]
            line_no_comment_trim = line_no_comment.strip()
            line_no_old = RE_OLD_PREFIX.sub("", line_no_comment).strip()
            if (
                "|" not in line_no_comment
                and not is_date_line(line_no_comment_trim)
                and (
                    RE_LOG_LINE_LOAD.search(line_no_old)
                    or (
                        bool(line_no_old)
                        and bool(RE_DIGITS.search(line_no_old))
                        and bool(RE_LOG_LINE_LONG.match(line_no_old))
                    )
                )
            ):
                if current_exercise:
                    parsed_sets = parse_line(line, i)
                    if not parsed_sets and ".." in line_no_comment and current_exercise.weeks:
                        clean_cf = RE_OLD_PREFIX.sub("", line_no_comment).strip()
                        raw_tokens = [t.strip() for t in clean_cf.split(",") if t.strip()]
                        collected_loads: list[float] = []
                        valid_cf = len(raw_tokens) > 0
                        for tok in raw_tokens:
                            if ".." not in tok:
                                valid_cf = False
                                break
                            sub = tok.split("..")
                            if sub[-1].strip():
                                valid_cf = False
                                break
                            load_str = "/".join(sub[:-1]).strip() if len(sub) > 2 else sub[0].strip()
                            parsed_tok_loads = _parse_load_spec(load_str)
                            if not parsed_tok_loads:
                                valid_cf = False
                                break
                            collected_loads.extend(parsed_tok_loads)
                        loads = collected_loads if (valid_cf and collected_loads) else None
                        if loads:
                            prev_sets = current_exercise.weeks[-1].sets
                            ds_drop_counters: dict[str, int] = {}
                            non_ds_idx = 0
                            carried: list[SetData] = []
                            for s in prev_sets:
                                if s.dropset_id:
                                    load_idx = ds_drop_counters.get(s.dropset_id, 0)
                                    ds_drop_counters[s.dropset_id] = load_idx + 1
                                else:
                                    load_idx = non_ds_idx
                                    non_ds_idx += 1
                                carried.append(
                                    SetData(
                                        load=loads[load_idx] if load_idx < len(loads) else loads[-1],
                                        base_reps=s.base_reps,
                                        assisted_reps=s.assisted_reps,
                                        partial_reps=s.partial_reps,
                                        rpe=s.rpe,
                                        fatigue=s.fatigue,
                                        dropset_id=s.dropset_id,
                                        tuts=list(s.tuts),
                                    )
                                )
                            parsed_sets = carried

                    if not parsed_sets:
                        continue

                    for s in parsed_sets:
                        tuts = (
                            s.tuts
                            if s.tuts is not None and len(s.tuts) > 0
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
                if is_date_line(line_no_comment_trim) or (
                    "|" not in line and RE_NON_EXERCISE_PROSE.match(line)
                ):
                    continue
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
                elif "|" in line:
                    current_exercise = None
        except Exception as err:  # noqa: BLE001
            sys.stderr.write(f"Error parsing: '{line}' | {err}\n")

    for w_ex in workout_data:
        dates_for_session = session_dates.get(w_ex.session)
        if not dates_for_session:
            continue
        for wk in w_ex.weeks:
            idx = wk.week_num - 1
            if 0 <= idx < len(dates_for_session):
                wk.date = dates_for_session[idx]

    return workout_data

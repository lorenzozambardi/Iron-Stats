from typing import List, Optional

from .constants import COEFF_ASSISTED, COEFF_PARTIAL, MUSCLES
from .models import WorkoutExercise


def calculate_set_tuts(
    base_reps: int,
    assisted_reps: int,
    partial_reps: int,
    rpe: float,
    concentric: float,
    shortening_pause: float,
    eccentric: float,
    lengthening_pause: float,
) -> List[float]:
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

        rep_tut = (
            (concentric + slowdown) + shortening_pause + eccentric + lengthening_pause
        )
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


def calculate_set_fatigue(
    base_reps: int,
    assisted_reps: int,
    partial_reps: int,
    rpe: float,
    concentric: float,
    shortening_pause: float,
    eccentric: float,
    lengthening_pause: float,
    fatigue: float,
    load_coeff: float,
    tuts: Optional[List[float]] = None,
) -> float:
    actual_tuts = (
        tuts
        if tuts is not None
        else calculate_set_tuts(
            base_reps,
            assisted_reps,
            partial_reps,
            rpe,
            concentric,
            shortening_pause,
            eccentric,
            lengthening_pause,
        )
    )
    total_fat = 0.0

    # 1. Base reps
    for j in range(base_reps):
        if j >= len(actual_tuts):
            break
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
        if idx >= len(actual_tuts):
            break
        rep_tut = actual_tuts[idx]
        rep_rpe = 7.0
        rpe_mult = 1.1 ** (rep_rpe - 7.5)
        total_fat += rep_tut * rpe_mult * fatigue * load_coeff * COEFF_ASSISTED

    # 3. Partial reps
    for j in range(partial_reps):
        idx = base_reps + assisted_reps + j
        if idx >= len(actual_tuts):
            break
        rep_tut = actual_tuts[idx]
        rep_rpe = 7.5
        rpe_mult = 1.0
        total_fat += rep_tut * rpe_mult * fatigue * load_coeff * (COEFF_PARTIAL / 0.5)

    return total_fat


def calculate_metrics(
    workout_data: List[WorkoutExercise],
    target_session: Optional[int],
    target_week: Optional[int],
    target_macro: Optional[str],
    target_sub: Optional[str],
):
    results = []
    for w_ex in workout_data:
        if target_session and w_ex.session != target_session:
            continue
        ex = w_ex.exercise_obj
        if target_macro and target_macro not in {
            MUSCLES.get(sub) for sub in ex.muscles_distr.keys()
        }:
            continue
        if target_sub and target_sub not in ex.muscles_distr:
            continue
        import numpy as np
        
        def get_auc(tp):
            if isinstance(tp, (int, float)):
                return float(tp)
            if hasattr(tp, "get_curve"):
                curve = tp.get_curve(100)
                return np.trapz(curve, dx=0.01)
            return 0.0

        if target_sub:
            distr_sum = get_auc(ex.muscles_distr.get(target_sub, 0.0))
        elif target_macro:
            distr_sum = sum(
                get_auc(val)
                for m, val in ex.muscles_distr.items()
                if MUSCLES.get(m) == target_macro
            )
        else:
            distr_sum = 1.0

        for w_data in w_ex.weeks:
            if target_week and w_data.week_num != target_week:
                continue
            vol, ton, eff_ton, total_fat, total_tut, effective_tut, sets_count = (
                0.0,
                0.0,
                0.0,
                0.0,
                0.0,
                0.0,
                0.0,
            )
            for s in w_data.sets:
                tot_reps = s.total_reps * distr_sum
                eff_reps = s.effective_reps * distr_sum
                vol += tot_reps
                actual_load = (s.load * ex.load_multiplier) + ex.load_offset
                ton += actual_load * tot_reps
                eff_ton += actual_load * eff_reps
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
                    tuts=s.tuts,
                )
                total_fat += set_fat * distr_sum
                total_tut += s.total_tut * distr_sum
                effective_tut += s.effective_tut * distr_sum
                sets_count += 1.0 * distr_sum
            if vol > 0:
                results.append(
                    {
                        "Session": w_ex.session,
                        "Name": ex.name,
                        "Week": w_data.week_num,
                        "Volume": vol,
                        "Tonnage": ton,
                        "Eff Tonnage": eff_ton,
                        "Fatigue": total_fat,
                        "TUT": total_tut,
                        "Eff TUT": effective_tut,
                        "Sets": sets_count,
                    }
                )
    return results

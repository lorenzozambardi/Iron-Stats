from typing import List, Optional

from .constants import COEFF_ASSISTED, COEFF_PARTIAL, MUSCLES
from .models import WorkoutExercise


import numpy as np

def calculate_set_tuts(
    base_reps: int,
    assisted_reps: int,
    partial_reps: int,
    rpe: float,
    concentric: float,
    shortening_pause: float,
    eccentric: float,
    lengthening_pause: float,
) -> Union[List[float], np.ndarray]:
    if (base_reps + assisted_reps + partial_reps) == 0:
        return np.array([])

    base_tuts = np.array([])
    if base_reps > 0:
        j = np.arange(base_reps)
        rir = (10.0 - rpe) + (base_reps - 1 - j)
        slowdown = np.zeros(base_reps)
        slowdown[rir < 1.0] = 1.60
        slowdown[(rir >= 1.0) & (rir < 2.0)] = 1.00
        slowdown[(rir >= 2.0) & (rir < 3.0)] = 0.60
        slowdown[(rir >= 3.0) & (rir < 4.0)] = 0.35
        slowdown[(rir >= 4.0) & (rir < 5.0)] = 0.15
        base_tuts = concentric + slowdown + shortening_pause + eccentric + lengthening_pause

    base_rep_tut = concentric + shortening_pause + eccentric + lengthening_pause
    ass_tuts = np.full(assisted_reps, base_rep_tut) if assisted_reps > 0 else np.array([])
    part_tuts = np.full(partial_reps, 0.5 * base_rep_tut) if partial_reps > 0 else np.array([])

    return np.concatenate([base_tuts, ass_tuts, part_tuts])


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
    tuts: Optional[Union[List[float], np.ndarray]] = None,
) -> float:
    actual_tuts = (
        np.asarray(tuts)
        if tuts is not None and len(tuts) > 0
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

    if base_reps > 0 and len(actual_tuts) > 0:
        n_base = min(base_reps, len(actual_tuts))
        j = np.arange(n_base)
        if rpe > 0:
            rir = (10.0 - rpe) + (base_reps - 1 - j)
            rep_rpe = np.maximum(0.0, 10.0 - rir)
            rpe_mult = np.where(rep_rpe > 0, 1.1 ** (rep_rpe - 7.5), 1.0)
        else:
            rpe_mult = np.ones(n_base)
        
        total_fat += np.sum(actual_tuts[:n_base] * rpe_mult) * fatigue * load_coeff

    if assisted_reps > 0 and len(actual_tuts) > base_reps:
        n_ass = min(assisted_reps, len(actual_tuts) - base_reps)
        rep_rpe = 7.0
        rpe_mult = 1.1 ** (rep_rpe - 7.5)
        total_fat += np.sum(actual_tuts[base_reps : base_reps + n_ass]) * rpe_mult * fatigue * load_coeff * COEFF_ASSISTED

    if partial_reps > 0 and len(actual_tuts) > base_reps + assisted_reps:
        start_idx = base_reps + assisted_reps
        n_part = min(partial_reps, len(actual_tuts) - start_idx)
        rpe_mult = 1.0
        total_fat += np.sum(actual_tuts[start_idx : start_idx + n_part]) * rpe_mult * fatigue * load_coeff * (COEFF_PARTIAL / 0.5)

    return float(total_fat)


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
            
            if not w_data.sets:
                continue

            n_sets = len(w_data.sets)
            tot_reps_arr = np.array([s.total_reps for s in w_data.sets]) * distr_sum
            eff_reps_arr = np.array([s.effective_reps for s in w_data.sets]) * distr_sum
            actual_load_arr = np.array([(s.load * ex.load_multiplier) + ex.load_offset for s in w_data.sets])
            
            vol = float(np.sum(tot_reps_arr))
            
            if vol > 0:
                ton = float(np.sum(actual_load_arr * tot_reps_arr))
                eff_ton = float(np.sum(actual_load_arr * eff_reps_arr))
                
                total_fat = sum(
                    calculate_set_fatigue(
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
                    for s in w_data.sets
                ) * distr_sum
                
                total_tut = sum(s.total_tut for s in w_data.sets) * distr_sum
                effective_tut = sum(s.effective_tut for s in w_data.sets) * distr_sum
                sets_count = n_sets * distr_sum
                
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

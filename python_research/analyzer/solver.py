import json
import math
import random
import sys
from typing import Any

import numpy as np

try:
    from .constants import COEFF_PARTIAL, MUSCLES
    from .models import Exercise, exercises_list
except ImportError:
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from analyzer.constants import COEFF_PARTIAL, MUSCLES
    from analyzer.models import Exercise, exercises_list


# --- TARGET CURVES GENERATORS ---
def get_target_curve(curve_type: str, resolution: int = 50) -> np.ndarray:
    t = np.linspace(0, 1, resolution)
    if curve_type == 'constant':
        return np.ones(resolution)
    elif curve_type == 'sigmoid':
        # Peak-normalized S-shape emphasizing peak contraction (t=1)
        raw = 1.0 / (1.0 + np.exp(-10.0 * (t - 0.5)))
        return raw / float(np.max(raw))
    elif curve_type == 'inv_sigmoid':
        # Peak-normalized S-shape emphasizing stretch (t=0)
        raw = 1.0 / (1.0 + np.exp(10.0 * (t - 0.5)))
        return raw / float(np.max(raw))
    elif curve_type == 'linear':
        # Linear decrease from 1 to 0
        return 1 - t
    else:
        return np.ones(resolution)

# --- REST CALCULATOR ---
def calculate_rest(fatigue: float) -> str:
    if fatigue <= 2.0:
        mins = 1.0
    elif fatigue <= 7.0:
        # 2.0 -> 7.0 mapped to 1.0 -> 3.0
        mins = 1.0 + (fatigue - 2.0) * (2.0 / 5.0)
    else:
        # 7.0 -> 10.0 mapped to 3.0 -> 3.5 (clamped at 10.0 so Rest_max = 3'30")
        capped_fatigue = min(10.0, fatigue)
        mins = 3.0 + (capped_fatigue - 7.0) * (0.5 / 3.0)

    rounded_mins = math.floor(mins * 2.0 + 0.5) / 2.0
    if rounded_mins == int(rounded_mins):
        return f"{int(rounded_mins)}'"
    else:
        return f"{int(rounded_mins)}'30\""


def _set_tuts(base_reps: int, partial_reps: int, rpe: float) -> tuple[float, float]:
    """Compute (total_tut, effective_tut) using default 1-0-2-0 tempo (3.0s) and RIR slowdown."""
    total_tut = 0.0
    eff_tut = 0.0
    if base_reps > 0:
        eff_base = min(float(base_reps), max(0.0, rpe - 4.0))
        full_eff = int(eff_base)
        frac = eff_base - full_eff
        start_idx = max(0, base_reps - full_eff)
        base_rir = 10.0 - rpe

        for j in range(base_reps):
            rir = base_rir + (base_reps - 1 - j)
            if rir < 1.0:
                slowdown = 1.60
            elif rir < 2.0:
                slowdown = 1.00
            elif rir < 3.0:
                slowdown = 0.60
            elif rir < 4.0:
                slowdown = 0.35
            elif rir < 5.0:
                slowdown = 0.15
            else:
                slowdown = 0.0
            rep_tut = 3.0 + slowdown
            total_tut += rep_tut
            if j >= start_idx:
                eff_tut += rep_tut
            elif frac > 0.0 and j == start_idx - 1:
                eff_tut += frac * rep_tut

    if partial_reps > 0:
        part_tut = 1.5 * partial_reps
        total_tut += part_tut
        eff_tut += part_tut

    return total_tut, eff_tut

# --- WORKOUT STATE DEFINITION ---
class ScheduledSet:
    def __init__(self, base_reps: int, partial_reps: int, rpe: float):
        self.base_reps = base_reps
        self.partial_reps = partial_reps
        self.rpe = rpe
        
    @property
    def total_reps(self) -> float:
        return self.base_reps + self.partial_reps * COEFF_PARTIAL
        
    @property
    def effective_reps(self) -> float:
        eff_base = min(float(self.base_reps), max(0.0, self.rpe - 4.0))
        return eff_base + self.partial_reps * COEFF_PARTIAL

    def clone(self):
        return ScheduledSet(self.base_reps, self.partial_reps, self.rpe)

class ScheduledExercise:
    def __init__(self, exercise: Exercise):
        self.exercise = exercise
        self.sets: list[ScheduledSet] = []

    def clone(self):
        cloned = ScheduledExercise(self.exercise)
        cloned.sets = [s.clone() for s in self.sets]
        return cloned

class WorkoutState:
    def __init__(self, days: int):
        self.days: list[list[ScheduledExercise]] = [[] for _ in range(days)]

# --- CONFIGURATION (from UI) ---
class SolverConfig:
    def __init__(self):
        self.days = 4
        self.min_sets = 2
        self.max_sets = 5
        self.min_reps = 6
        self.max_reps = 15
        self.min_ex = 4
        self.max_ex = 8
        self.calibration_steps = 500
        
        self.weights = {
            'curve': 0.30,
            'vol': 0.15,
            'ton': 0.10,
            'tut': 0.10,
            'distr': 0.15,
            'variety': 0.10,
            'balance': 0.10
        }
        
        self.target_ratios = {
            'vol': 0.70,
            'ton': 0.70,
            'tut': 0.74
        }
        
        # Default all muscles to constant
        self.muscle_targets = {}
        # Volume Distribution (Macro -> Sub)
        self.volume_dist = {'macros': {}, 'subs': {}}
        # Will be populated with target_curves per macro muscle

# --- SOLVER CORE ---
class WorkoutSolver:
    def __init__(self, config: SolverConfig):
        self.config = config
        if self.config.days < 1:
            raise ValueError(f"days must be >= 1, got {self.config.days}")
        if self.config.min_ex < 1 or self.config.max_ex < self.config.min_ex:
            raise ValueError(f"Invalid min_ex/max_ex: {self.config.min_ex}, {self.config.max_ex}")
        if self.config.min_sets < 1 or self.config.max_sets < self.config.min_sets:
            raise ValueError(f"Invalid min_sets/max_sets: {self.config.min_sets}, {self.config.max_sets}")
        if self.config.min_reps < 1 or self.config.max_reps < self.config.min_reps:
            raise ValueError(f"Invalid min_reps/max_reps: {self.config.min_reps}, {self.config.max_reps}")
        self.db = exercises_list
        self.resolution = 50
        self.max_ex_fatigue = max(10.0, max((ex.fatigue for ex in self.db), default=10.0))
        
        macro_to_db_subs: dict[str, list[str]] = {}
        macro_to_subs: dict[str, list[str]] = {}
        for sub, macro in MUSCLES.items():
            macro_to_subs.setdefault(macro, []).append(sub)
        for ex in self.db:
            for m in ex.muscles_distr:
                macro_grp = MUSCLES.get(m)
                if macro_grp:
                    lst = macro_to_db_subs.setdefault(macro_grp, [])
                    if m not in lst:
                        lst.append(m)

        self.target_sub_vol = {}
        subs_dict = self.config.volume_dist.get('subs', {})
        if self.config.volume_dist.get('macros'):
            for macro, m_val in self.config.volume_dist['macros'].items():
                if m_val <= 0:
                    continue
                macro_subs = subs_dict.get(macro)
                if macro_subs:
                    sub_sum = sum(max(0.0, float(v)) for v in macro_subs.values())
                    for sub, s_val in macro_subs.items():
                        val = max(0.0, float(s_val))
                        self.target_sub_vol[sub] = (m_val / 100.0) * (val / sub_sum) if sub_sum > 0.0 else 0.0
                else:
                    fallback_subs = macro_to_db_subs.get(macro) or macro_to_subs.get(macro, [])
                    if fallback_subs:
                        share = 1.0 / len(fallback_subs)
                        for sub in fallback_subs:
                            self.target_sub_vol[sub] = (m_val / 100.0) * share
        total_target = sum(self.target_sub_vol.values())
        if total_target <= 0.0:
            self.target_sub_vol = {}
        elif abs(total_target - 1.0) > 1e-12:
            self.target_sub_vol = {k: v / total_target for k, v in self.target_sub_vol.items()}
        
        # Precompute target curves per muscle based on config
        self.T_m = {}
        for m, curve_type in self.config.muscle_targets.items():
            if m in macro_to_subs or len(subs_dict.get(m, {})) > 0:
                curve = get_target_curve(curve_type, self.resolution)
                for sub in macro_to_subs.get(m, []):
                    self.T_m[sub] = curve
                for sub in subs_dict.get(m, {}):
                    self.T_m[sub] = curve
        for m, curve_type in self.config.muscle_targets.items():
            if m not in macro_to_subs and len(subs_dict.get(m, {})) == 0:
                self.T_m[m] = get_target_curve(curve_type, self.resolution)
            
        self.all_submuscles = set()
        for ex in self.db:
            for m in ex.muscles_distr:
                self.all_submuscles.add(m)
        self.distr_muscles = self.all_submuscles | set(self.target_sub_vol.keys())
                
        self.x_domain = np.linspace(0.0, 1.0, self.resolution)
        self.partial_mask = (self.x_domain <= 0.3333).astype(float)
        self.default_curve = np.ones(self.resolution)

        self.scales: dict[str, float] = {}
        self.unique_ex_count = len({ex.name for ex in self.db})

        # Precompute physical-ROM-aligned Bezier curves and stretched-ROM partial magnitudes
        self.ex_curves: dict[str, dict[str, np.ndarray]] = {}
        self.ex_has_area: dict[str, dict[str, bool]] = {}
        self.ex_partial_mag: dict[str, dict[str, float]] = {}
        for ex in self.db:
            self.ex_curves[ex.name] = {}
            self.ex_has_area[ex.name] = {}
            self.ex_partial_mag[ex.name] = {}
            for m, prof in ex.muscles_distr.items():
                phys = prof.get_physical_curve(self.resolution)
                self.ex_curves[ex.name][m] = phys
                self.ex_has_area[ex.name][m] = prof.exact_area() > 0.0
                self.ex_partial_mag[ex.name][m] = prof.partial_magnitude(0.3333)
            
    def get_random_exercise(self) -> Exercise:
        return random.choice(self.db)
        
    def generate_random_state(self) -> WorkoutState:
        state = WorkoutState(self.config.days)
        for d in range(self.config.days):
            num_ex = random.randint(self.config.min_ex, self.config.max_ex)
            for _ in range(num_ex):
                ex = ScheduledExercise(self.get_random_exercise())
                num_sets = random.randint(self.config.min_sets, self.config.max_sets)
                for _ in range(num_sets):
                    reps = random.randint(self.config.min_reps, self.config.max_reps)
                    rpe = random.choice([7.0, 8.0, 8.5, 9.0, 10.0])
                    partials = random.choice([0, 0, 0, 2, 4, 6]) if rpe >= 9.0 else 0
                    ex.sets.append(ScheduledSet(reps, partials, rpe))
                state.days[d].append(ex)
        return state

    def evaluate_workout(self, state: WorkoutState) -> Any:
        """
        Evaluates the fitness (cost) of a given WorkoutState (a generated program).
        Lower cost is better. The cost is a weighted sum of seven normalized error metrics
        (E_curve, E_vol, E_ton, E_tut, E_distr, E_variety, E_balance) scaled by 10000.0,
        plus a hard penalty of 150.0 * 1000.0 per same-day duplicate exercise.

        For fast SA evaluation, lightweight surrogates replace full logbook metrics:
        - Load: RPE-aware normalized Epley estimate ``(100 / (1 + 0.033 * (base_reps + max(0, 10 - rpe)))) * load_coeff``.
        - TUT: RIR-slowdown dynamic TUT at default ``1-0-2-0`` tempo (distinct from ``E_vol``).
        - Fatigue: linear ``total_reps * fatigue`` (dimensionally consistent with ``ex.fatigue``).
        """
        total_vol = 0.0
        eff_vol = 0.0
        total_ton = 0.0
        eff_ton = 0.0
        total_tut = 0.0
        eff_tut = 0.0
        
        V_m = {m: np.zeros(self.resolution) for m in self.distr_muscles}
        sub_vols = {m: 0.0 for m in self.distr_muscles}
        
        unique_exercises = set()
        total_exercises = 0
        
        penalty = 0.0
        
        daily_fatigue = []
        daily_vol = []
        
        for d in range(len(state.days)):
            day_fatigue = 0.0
            day_vol = 0.0
            day_exercises = set()
            
            for sched_ex in state.days[d]:
                ex = sched_ex.exercise
                
                if ex.name in day_exercises:
                    penalty += 150.0
                day_exercises.add(ex.name)
                unique_exercises.add(ex.name)
                total_exercises += 1
                
                ex_fatigue = 0.0
                ex_base_reps = 0.0
                ex_partial_reps = 0.0
                
                for s in sched_ex.sets:
                    s_total = s.total_reps
                    s_eff = s.effective_reps
                    
                    total_vol += s_total
                    eff_vol += s_eff
                    day_vol += s_total
                    
                    eff_set_reps = s.base_reps + max(0.0, 10.0 - s.rpe)
                    load = (100.0 / (1.0 + 0.033 * eff_set_reps)) * ex.load_coeff
                    total_ton += s_total * load
                    eff_ton += s_eff * load
                    
                    s_tot_tut, s_eff_tut = _set_tuts(s.base_reps, s.partial_reps, s.rpe)
                    total_tut += s_tot_tut
                    eff_tut += s_eff_tut
                    
                    ex_fatigue += s_total * ex.fatigue
                    
                    ex_base_reps += s.base_reps
                    ex_partial_reps += s.partial_reps
                    
                for m, bezier_prof in ex.muscles_distr.items():
                    base_curve = self.ex_curves[ex.name][m]
                    V_m[m] += base_curve * ex_base_reps
                    if ex_partial_reps > 0:
                        V_m[m] += base_curve * (ex_partial_reps * COEFF_PARTIAL) * self.partial_mask
                    if self.ex_has_area[ex.name][m]:
                        sub_vols[m] += (
                            bezier_prof.magnitude * ex_base_reps
                            + self.ex_partial_mag[ex.name][m] * (ex_partial_reps * COEFF_PARTIAL)
                        )

                day_fatigue += ex_fatigue
                
            daily_fatigue.append(day_fatigue)
            daily_vol.append(day_vol)
                
        # 1. Curve Error (weighted by target_sub_vol when set, or active ROM volume W_m otherwise)
        E_curve = 0.0
        total_sub_vol = sum(sub_vols.values())
        if self.target_sub_vol:
            for m, target_w in self.target_sub_vol.items():
                if target_w <= 0.0:
                    continue
                curve = V_m.get(m)
                max_v = float(np.max(curve)) if curve is not None else 0.0
                target = self.T_m.get(m, self.default_curve)
                if max_v > 0.0 and curve is not None:
                    normalized_v = curve / max_v
                    mse = float(np.sum((normalized_v - target) ** 2)) / self.resolution
                else:
                    mse = float(np.sum(target ** 2)) / self.resolution
                E_curve += target_w * mse
        elif len(V_m) > 0:
            active_mses: list[tuple[float, float]] = []
            for m, curve in V_m.items():
                max_v = float(np.max(curve))
                if max_v > 0.0:
                    target = self.T_m.get(m, self.default_curve)
                    normalized_v = curve / max_v
                    mse = float(np.sum((normalized_v - target) ** 2)) / self.resolution
                    active_mses.append((sub_vols.get(m, 0.0), mse))
            if active_mses:
                active_total_vol = sum(w for w, _ in active_mses)
                if active_total_vol > 0.0:
                    E_curve = sum((w / active_total_vol) * mse for w, mse in active_mses)
                else:
                    E_curve = sum(mse for _, mse in active_mses) / len(active_mses)
            
        # 2. Ratio Errors
        E_vol = (eff_vol / total_vol - self.config.target_ratios['vol'])**2 if total_vol > 0 else 0.0
        E_ton = (eff_ton / total_ton - self.config.target_ratios['ton'])**2 if total_ton > 0 else 0.0
        E_tut = (eff_tut / total_tut - self.config.target_ratios['tut'])**2 if total_tut > 0 else 0.0
        
        # 3. Distribution Error
        E_distr = 0.0
        if total_sub_vol > 0 and self.target_sub_vol:
            for m in self.distr_muscles:
                target_pct = self.target_sub_vol.get(m, 0.0)
                actual_pct = sub_vols.get(m, 0.0) / total_sub_vol
                E_distr += (actual_pct - target_pct)**2
            E_distr /= 2.0 # Max squared L2 distance between two distributions on the simplex is 2.0
                
        # 5. Variety Error
        E_variety = 0.0
        if total_exercises > 0:
            variety_ratio = len(unique_exercises) / total_exercises
            # Ideal ratio is 1.0 (all exercises are unique)
            E_variety = (1.0 - variety_ratio)**2
        
        # 6. Balance Error (Variance of fatigue and volume across days, normalized to [0, 1])
        E_balance = 0.0
        if len(daily_fatigue) > 1:
            max_set_vol = self.config.max_reps + COEFF_PARTIAL * 6.0
            max_day_vol = self.config.max_ex * self.config.max_sets * max_set_vol
            max_day_fatigue = max_day_vol * self.max_ex_fatigue
            max_var_f = (max_day_fatigue / 2.0)**2
            var_fatigue = np.var(daily_fatigue)
            norm_var_f = var_fatigue / max_var_f if max_var_f > 0 else 0.0
            
            var_vol = np.var(daily_vol)
            max_var_v = (max_day_vol / 2.0)**2
            norm_var_v = var_vol / max_var_v if max_var_v > 0 else 0.0
            
            E_balance = (norm_var_f + norm_var_v) / 2.0
                    
        raw_metrics = {
            'curve': E_curve,
            'vol': E_vol,
            'ton': E_ton,
            'tut': E_tut,
            'distr': E_distr,
            'variety': E_variety,
            'balance': E_balance
        }
        
        scaled = {}
        for k, v in raw_metrics.items():
            scale = self.scales.get(k, 1.0)
            if scale == 0.0: scale = 1e-6
            scaled[k] = v / scale
            
        mo_cost = (self.config.weights.get('curve', 0.30) * scaled['curve'] +
                   self.config.weights.get('vol', 0.15) * scaled['vol'] +
                   self.config.weights.get('ton', 0.10) * scaled['ton'] +
                   self.config.weights.get('tut', 0.10) * scaled['tut'] +
                   self.config.weights.get('distr', 0.15) * scaled['distr'] +
                   self.config.weights.get('variety', 0.10) * scaled['variety'] +
                   self.config.weights.get('balance', 0.10) * scaled['balance'])
                
        # Upscaling the final mathematical value to allow the Simulated Annealing 
        # Temperature gradient (T=50.0) to properly reject bad states.
        cost = (mo_cost * 10000.0) + (penalty * 1000.0)
                
        if getattr(self, '_return_raw', False):
            return cost, raw_metrics
            
        return cost

    def mutate_workout(self, state: WorkoutState) -> WorkoutState:
        new_state = WorkoutState(self.config.days)
        d = random.randint(0, self.config.days - 1)
        
        for i in range(self.config.days):
            if i == d:
                new_state.days[i] = [ex.clone() for ex in state.days[i]]
            else:
                new_state.days[i] = list(state.days[i])
                
        day = new_state.days[d]

        eligible_add_set = [ex for ex in day if len(ex.sets) < self.config.max_sets]
        eligible_rem_set = [ex for ex in day if len(ex.sets) > self.config.min_sets]
        sets_on_day = [s for ex in day for s in ex.sets]
        eligible_partial_sets = [s for s in sets_on_day if s.rpe >= 9.0]

        eligible_mutations: list[str] = []
        if len(day) < self.config.max_ex:
            eligible_mutations.append('add_ex')
        if len(day) > self.config.min_ex:
            eligible_mutations.append('remove_ex')
        if len(day) > 0 and self.unique_ex_count > 1:
            eligible_mutations.append('swap_ex')
        if eligible_add_set:
            eligible_mutations.append('add_set')
        if eligible_rem_set:
            eligible_mutations.append('remove_set')
        if sets_on_day and self.config.min_reps < self.config.max_reps:
            eligible_mutations.append('mut_reps')
        if sets_on_day:
            eligible_mutations.append('mut_rpe')
        if eligible_partial_sets:
            eligible_mutations.append('mut_partials')

        if not eligible_mutations:
            return new_state

        mutation_type = random.choice(eligible_mutations)
        default_reps = max(self.config.min_reps, min(self.config.max_reps, 10))

        if mutation_type == 'add_ex':
            ex = ScheduledExercise(self.get_random_exercise())
            ex.sets = [ScheduledSet(default_reps, 0, 8.0) for _ in range(self.config.min_sets)]
            day.append(ex)

        elif mutation_type == 'remove_ex':
            day.pop(random.randrange(len(day)))

        elif mutation_type == 'swap_ex':
            idx = random.randrange(len(day))
            current_ex_name = day[idx].exercise.name
            candidates = [e for e in self.db if e.name != current_ex_name]
            chosen_ex = random.choice(candidates) if candidates else self.get_random_exercise()
            new_ex = ScheduledExercise(chosen_ex)
            new_ex.sets = [s.clone() for s in day[idx].sets]
            day[idx] = new_ex

        elif mutation_type == 'add_set':
            ex = random.choice(eligible_add_set)
            ex.sets.append(ScheduledSet(default_reps, 0, 8.0))

        elif mutation_type == 'remove_set':
            ex = random.choice(eligible_rem_set)
            ex.sets.pop(random.randrange(len(ex.sets)))

        elif mutation_type == 'mut_reps':
            s = random.choice(sets_on_day)
            rep_choices = list(dict.fromkeys(
                r for r in (
                    max(self.config.min_reps, min(self.config.max_reps, s.base_reps + d_rep))
                    for d_rep in (-2, -1, 1, 2)
                )
                if r != s.base_reps
            ))
            if rep_choices:
                s.base_reps = random.choice(rep_choices)

        elif mutation_type == 'mut_rpe':
            s = random.choice(sets_on_day)
            rpe_choices = [
                max(5.0, min(10.0, s.rpe + d_rpe))
                for d_rpe in (-0.5, 0.5)
            ]
            rpe_choices = [r for r in rpe_choices if r != s.rpe]
            if rpe_choices:
                s.rpe = random.choice(rpe_choices)
            if s.rpe < 9.0:
                s.partial_reps = 0

        elif mutation_type == 'mut_partials':
            s = random.choice(eligible_partial_sets)
            partial_choices = [p for p in (0, 2, 4, 6) if p != s.partial_reps]
            s.partial_reps = random.choice(partial_choices)

        return new_state

    def calibrate(self):
        """
        Estimate metric normalization scales ``s_i = 2 * mean(E_i)`` via Monte Carlo sampling
        over ``calibration_steps`` random states (empirical sample mean, not exact expectation).
        Any zero scale is guarded to ``1e-6`` inside ``evaluate_workout``.
        """
        steps = getattr(self.config, 'calibration_steps', 500)
        if steps <= 0:
            return
            
        print(f"Calibrating scales with {steps} random states...", file=sys.stderr)
        self._return_raw = True
        sums = {k: 0.0 for k in ['curve', 'vol', 'ton', 'tut', 'distr', 'variety', 'balance']}
        
        for _ in range(steps):
            state = self.generate_random_state()
            _, raw = self.evaluate_workout(state)
            for k in sums:
                sums[k] += raw[k]
                
        self._return_raw = False
        
        for k, value in sums.items():
            mean_val = value / steps
            self.scales[k] = mean_val * 2.0
            
        print(f"Calibration finished. Scales: {self.scales}", file=sys.stderr)

    def solve(self, iterations=10000, initial_temp=50.0, cooling_rate=None):
        """
        Runs the Simulated Annealing algorithm to find the optimal WorkoutState.
        
        The algorithm starts with a random workout and a high temperature, allowing it to 
        accept worse states to escape local minima. The temperature decays over `iterations` 
        by `cooling_rate`. At each step, a mutation (e.g. add/swap exercise, change reps) 
        is applied and the new state is evaluated.
        """
        iterations = max(0, int(iterations))
        if cooling_rate is None:
            cooling_rate = (0.01 / initial_temp) ** (1.0 / iterations) if iterations > 0 else 0.995
            
        self.calibrate()
        
        current_state = self.generate_random_state()
        current_cost = self.evaluate_workout(current_state)
        
        best_state = current_state
        best_cost = current_cost
        
        T = initial_temp
        
        print(f"Starting SA optimization for {iterations} iterations...", file=sys.stderr)
        print(f"Initial Cost: {current_cost:.4f}", file=sys.stderr)
        
        for i in range(iterations):
            neighbor = self.mutate_workout(current_state)
            neighbor_cost = self.evaluate_workout(neighbor)
            
            # Acceptance probability
            if neighbor_cost < current_cost:
                current_state = neighbor
                current_cost = neighbor_cost
                if neighbor_cost < best_cost:
                    best_state = neighbor
                    best_cost = neighbor_cost
            else:
                delta = neighbor_cost - current_cost
                if random.random() < math.exp(-delta / T):
                    current_state = neighbor
                    current_cost = neighbor_cost
                    
            T *= cooling_rate
            
            if i % 1000 == 0:
                print(f"Iter {i:5d} | Temp: {T:6.2f} | Current Cost: {current_cost:8.4f} | Best Cost: {best_cost:8.4f}", file=sys.stderr)
                
        print(f"Optimization finished. Final Best Cost: {best_cost:.4f}", file=sys.stderr)
        return best_state

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=str, help="JSON configuration string")
    args = parser.parse_args()

    config = SolverConfig()
    iterations = 10000
    
    if args.config:
        try:
            data = json.loads(args.config)
            
            # Override config fields if present
            if 'days' in data: config.days = int(data['days'])
            if 'minSets' in data: config.min_sets = int(data['minSets'])
            if 'maxSets' in data: config.max_sets = int(data['maxSets'])
            if 'minReps' in data: config.min_reps = int(data['minReps'])
            if 'maxReps' in data: config.max_reps = int(data['maxReps'])
            if 'minEx' in data: config.min_ex = int(data['minEx'])
            if 'maxEx' in data: config.max_ex = int(data['maxEx'])
            if 'iterations' in data: iterations = int(data['iterations'])
            if 'calibrationSteps' in data: config.calibration_steps = int(data['calibrationSteps'])
            
            if 'weights' in data:
                config.weights['curve'] = float(data['weights'].get('curve', 0.30))
                config.weights['vol'] = float(data['weights'].get('vol', 0.15))
                config.weights['ton'] = float(data['weights'].get('ton', 0.10))
                config.weights['tut'] = float(data['weights'].get('tut', 0.10))
                config.weights['distr'] = float(data['weights'].get('distr', 0.15))
                config.weights['variety'] = float(data['weights'].get('variety', 0.10))
                config.weights['balance'] = float(data['weights'].get('balance', 0.10))
                
            if 'ratios' in data:
                config.target_ratios['vol'] = float(data['ratios'].get('vol', 0.70))
                config.target_ratios['ton'] = float(data['ratios'].get('ton', 0.70))
                config.target_ratios['tut'] = float(data['ratios'].get('tut', 0.74))
                
            if 'muscleTargets' in data:
                config.muscle_targets = data['muscleTargets']
                
            if 'volumeDist' in data:
                config.volume_dist = data['volumeDist']
                
        except Exception as e:  # noqa: BLE001
            print(f"Error parsing config JSON: {e}", file=sys.stderr)
            sys.exit(1)

    solver = WorkoutSolver(config)
    best_workout = solver.solve(iterations=iterations, initial_temp=50.0, cooling_rate=None)
    
    # Format output as JSON
    out_days = []
    for d, day in enumerate(best_workout.days):
        day_exs = []
        for ex in day:
            sets_data = []
            for s in ex.sets:
                sets_data.append({
                    "base_reps": s.base_reps,
                    "partial_reps": s.partial_reps,
                    "rpe": s.rpe
                })
            day_exs.append({
                "exercise": ex.exercise.name,
                "rest": calculate_rest(ex.exercise.fatigue),
                "muscles": ", ".join(list(ex.exercise.muscles_distr.keys())[:2]),
                "sets": sets_data
            })
        out_days.append(day_exs)
        
    final_output = {
        "success": True,
        "days": out_days,
        "final_cost": solver.evaluate_workout(best_workout)
    }
    
    print(json.dumps(final_output))

import numpy as np
import random
import copy
import sys
import json
import math
from typing import List, Dict, Any

from analyzer.models import exercises_list, COEFF_ASSISTED, COEFF_PARTIAL, Exercise

# --- TARGET CURVES GENERATORS ---
def get_target_curve(curve_type: str, resolution: int = 50) -> np.ndarray:
    t = np.linspace(0, 1, resolution)
    if curve_type == 'constant':
        return np.ones(resolution)
    elif curve_type == 'sigmoid':
        # S-shape emphasizing peak contraction (t=1)
        return 1 / (1 + np.exp(-10 * (t - 0.5)))
    elif curve_type == 'inv_sigmoid':
        # S-shape emphasizing stretch (t=0)
        return 1 / (1 + np.exp(10 * (t - 0.5)))
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
        # 7.0 -> 10.0 mapped to 3.0 -> 3.5
        mins = 3.0 + (fatigue - 7.0) * (0.5 / 3.0)
        
    rounded_mins = round(mins * 2) / 2
    if rounded_mins == int(rounded_mins):
        return f"{int(rounded_mins)}'"
    else:
        return f"{int(rounded_mins)}'30\""

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
        self.sets: List[ScheduledSet] = []

    def clone(self):
        cloned = ScheduledExercise(self.exercise)
        cloned.sets = [s.clone() for s in self.sets]
        return cloned

class WorkoutState:
    def __init__(self, days: int):
        self.days: List[List[ScheduledExercise]] = [[] for _ in range(days)]

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
            'curve': 0.35,
            'vol': 0.15,
            'ton': 0.1,
            'tut': 0.1,
            'distr': 0.2,
            'variety': 0.1,
            'balance': 0.1
        }
        
        self.target_ratios = {
            'vol': 0.70,
            'ton': 0.70,
            'tut': 0.70
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
        self.db = exercises_list
        self.resolution = 50
        
        self.target_sub_vol = {}
        if self.config.volume_dist.get('macros'):
            for macro, m_val in self.config.volume_dist['macros'].items():
                if macro in self.config.volume_dist.get('subs', {}):
                    for sub, s_val in self.config.volume_dist['subs'][macro].items():
                        self.target_sub_vol[sub] = (m_val / 100.0) * (s_val / 100.0)
        
        # Precompute target curves per muscle based on config
        self.T_m = {}
        subs_dict = self.config.volume_dist.get('subs', {})
        for m, curve_type in self.config.muscle_targets.items():
            curve = get_target_curve(curve_type, self.resolution)
            if m in subs_dict:
                for sub in subs_dict[m].keys():
                    self.T_m[sub] = curve
            else:
                self.T_m[m] = curve
            
        self.all_submuscles = set()
        for ex in self.db:
            for m in ex.muscles_distr.keys():
                self.all_submuscles.add(m)
                
        self.t_domain = np.linspace(0, 1, self.resolution)
        self.partial_mask = (self.t_domain <= 0.3333).astype(float)
        self.default_curve = np.ones(self.resolution)
        
        self.scales = {}
        
        # Precompute bezier curves for all exercises
        self.ex_curves = {}
        for ex in self.db:
            self.ex_curves[ex.name] = {
                m: prof.get_curve(self.resolution) for m, prof in ex.muscles_distr.items()
            }
            
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
                    partials = random.choice([0, 0, 0, 2, 4]) if rpe >= 9.0 else 0
                    ex.sets.append(ScheduledSet(reps, partials, rpe))
                state.days[d].append(ex)
        return state

    def evaluate_workout(self, state: WorkoutState) -> float:
        """
        Evaluates the fitness (cost) of a given WorkoutState (a generated program).
        Lower cost is better. The cost is a weighted sum of several error metrics:
        - E_curva: Mean Squared Error (MSE) against the target muscle activation curves.
        - E_vol/ton/tut: Ratio errors for effective vs total volume/tonnage/tut.
        - E_distr: Muscle distribution error (actual vs target volume distribution).
        - E_variety: Penalty for reusing the same exercises (unique exercises / total exercises).
        - E_balance: Variance of daily fatigue and volume to ensure balanced days.
        
        The final raw weighted cost (`mo_cost`) is multiplied by 10000.0 to expand the 
        gradient for the Simulated Annealing temperature scale (which starts at T=50.0).
        A hard penalty of 1000.0 is applied per duplicate exercise on the same day.
        """
        total_vol = 0.0
        eff_vol = 0.0
        total_ton = 0.0
        eff_ton = 0.0
        total_tut = 0.0
        eff_tut = 0.0
        
        V_m = {m: np.zeros(self.resolution) for m in self.all_submuscles}
        sub_vols = {m: 0.0 for m in self.all_submuscles}
        
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
                ex_total_reps = 0.0
                
                for s in sched_ex.sets:
                    s_total = s.total_reps
                    s_eff = s.effective_reps
                    
                    total_vol += s_total
                    eff_vol += s_eff
                    day_vol += s_total
                    
                    load = ex.load_multiplier * (100.0 / (1.0 + 0.033 * s.base_reps)) + ex.load_offset
                    total_ton += s_total * load
                    eff_ton += s_eff * load
                    
                    total_tut += s_total * 2.0
                    eff_tut += s_eff * 2.0
                    
                    ex_fatigue += (s_total * load * ex.fatigue * ex.load_coeff * 0.01)
                    
                    ex_base_reps += s.base_reps
                    ex_partial_reps += s.partial_reps
                    ex_total_reps += s_total
                    
                for m, bezier_prof in ex.muscles_distr.items():
                    base_curve = self.ex_curves[ex.name][m]
                    V_m[m] += base_curve * ex_base_reps
                    if ex_partial_reps > 0:
                        V_m[m] += base_curve * ex_partial_reps * self.partial_mask
                    sub_vols[m] += bezier_prof.magnitude * ex_total_reps

                day_fatigue += ex_fatigue
                
            daily_fatigue.append(day_fatigue)
            daily_vol.append(day_vol)
                
        # 1. Curve Error
        E_curva = 0.0
        if len(V_m) > 0:
            trained_muscles = 0
            for m, curve in V_m.items():
                max_v = np.max(curve)
                if max_v > 0:
                    target = self.T_m.get(m, self.default_curve)
                    normalized_v = curve / max_v
                    E_curva += np.sum((normalized_v - target)**2) / self.resolution
                    trained_muscles += 1
            if trained_muscles > 0:
                E_curva /= trained_muscles # Normalize to [0, 1] range
            
        # 2. Ratio Errors
        E_vol = (eff_vol / total_vol - self.config.target_ratios['vol'])**2 if total_vol > 0 else 0.0
        E_ton = (eff_ton / total_ton - self.config.target_ratios['ton'])**2 if total_ton > 0 else 0.0
        E_tut = (eff_tut / total_tut - self.config.target_ratios['tut'])**2 if total_tut > 0 else 0.0
        
        # 3. Distribution Error
        E_distr = 0.0
        total_sub_vol = sum(sub_vols.values())
        if total_sub_vol > 0:
            for m in self.all_submuscles:
                target_pct = self.target_sub_vol.get(m, 0.0)
                actual_pct = sub_vols.get(m, 0.0) / total_sub_vol
                E_distr += (actual_pct - target_pct)**2
            E_distr /= 2.0 # Max theoretical variance between two distributions is 2.0
                
        # 5. Variety Error
        E_variety = 0.0
        if total_exercises > 0:
            variety_ratio = len(unique_exercises) / total_exercises
            # Ideal ratio is 1.0 (all exercises are unique)
            E_variety = (1.0 - variety_ratio)**2
        
        # 6. Balance Error (Variance of fatigue and volume across days, normalized to [0, 1])
        E_balance = 0.0
        if len(daily_fatigue) > 1:
            # Approximate max daily fatigue based on hard limits
            max_day_fatigue = self.config.max_ex * self.config.max_sets * self.config.max_reps * 15.0
            max_var_f = (max_day_fatigue / 2.0)**2
            var_fatigue = np.var(daily_fatigue)
            norm_var_f = var_fatigue / max_var_f if max_var_f > 0 else 0.0
            
            # Approximate max daily volume
            max_day_vol = self.config.max_ex * self.config.max_sets * self.config.max_reps
            var_vol = np.var(daily_vol)
            max_var_v = (max_day_vol / 2.0)**2
            norm_var_v = var_vol / max_var_v if max_var_v > 0 else 0.0
            
            E_balance = (norm_var_f + norm_var_v) / 2.0
                    
        raw_metrics = {
            'curve': E_curva,
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
            
        mo_cost = (self.config.weights['curve'] * scaled['curve'] +
                   self.config.weights['vol'] * scaled['vol'] +
                   self.config.weights['ton'] * scaled['ton'] +
                   self.config.weights['tut'] * scaled['tut'] + 
                   self.config.weights.get('distr', 0.2) * scaled['distr'] +
                   self.config.weights.get('variety', 0.1) * scaled['variety'] +
                   self.config.weights.get('balance', 0.1) * scaled['balance'])
                
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
        
        mutation_type = random.choice(['add_ex', 'remove_ex', 'swap_ex', 'add_set', 'remove_set', 'mut_reps', 'mut_rpe', 'mut_partials'])
        
        if mutation_type == 'add_ex':
            if len(day) < self.config.max_ex:
                ex = ScheduledExercise(self.get_random_exercise())
                ex.sets = [ScheduledSet(10, 0, 8.0) for _ in range(self.config.min_sets)]
                day.append(ex)
                
        elif mutation_type == 'remove_ex':
            if len(day) > self.config.min_ex:
                day.pop(random.randrange(len(day)))
                
        elif mutation_type == 'swap_ex':
            if len(day) > 0:
                idx = random.randrange(len(day))
                new_ex = ScheduledExercise(self.get_random_exercise())
                new_ex.sets = [s.clone() for s in day[idx].sets] # keep sets
                day[idx] = new_ex
                
        elif mutation_type == 'add_set':
            if len(day) > 0:
                ex = random.choice(day)
                if len(ex.sets) < self.config.max_sets:
                    ex.sets.append(ScheduledSet(10, 0, 8.0))
                    
        elif mutation_type == 'remove_set':
            if len(day) > 0:
                ex = random.choice(day)
                if len(ex.sets) > self.config.min_sets:
                    ex.sets.pop()
                    
        elif mutation_type == 'mut_reps':
            if len(day) > 0:
                ex = random.choice(day)
                if len(ex.sets) > 0:
                    s = random.choice(ex.sets)
                    s.base_reps += random.choice([-2, -1, 1, 2])
                    s.base_reps = max(self.config.min_reps, min(self.config.max_reps, s.base_reps))
                    
        elif mutation_type == 'mut_rpe':
            if len(day) > 0:
                ex = random.choice(day)
                if len(ex.sets) > 0:
                    s = random.choice(ex.sets)
                    s.rpe += random.choice([-0.5, 0.5])
                    s.rpe = max(5.0, min(10.0, s.rpe))
                    
        elif mutation_type == 'mut_partials':
            if len(day) > 0:
                ex = random.choice(day)
                if len(ex.sets) > 0:
                    s = random.choice(ex.sets)
                    if s.rpe >= 9.0:
                        s.partial_reps = random.choice([0, 2, 4, 6])
                    else:
                        s.partial_reps = 0

        return new_state

    def calibrate(self):
        steps = getattr(self.config, 'calibration_steps', 500)
        if steps <= 0:
            return
            
        print(f"Calibrating scales with {steps} random states...", file=sys.stderr)
        self._return_raw = True
        sums = {k: 0.0 for k in ['curve', 'vol', 'ton', 'tut', 'distr', 'variety', 'balance']}
        
        for _ in range(steps):
            state = self.generate_random_state()
            _, raw = self.evaluate_workout(state)
            for k in sums.keys():
                sums[k] += raw[k]
                
        self._return_raw = False
        
        for k in sums.keys():
            mean_val = sums[k] / steps
            self.scales[k] = mean_val * 2.0
            
        print(f"Calibration finished. Scales: {self.scales}", file=sys.stderr)

    def solve(self, iterations=10000, initial_temp=100.0, cooling_rate=None):
        """
        Runs the Simulated Annealing algorithm to find the optimal WorkoutState.
        
        The algorithm starts with a random workout and a high temperature, allowing it to 
        accept worse states to escape local minima. The temperature decays over `iterations` 
        by `cooling_rate`. At each step, a mutation (e.g. add/swap exercise, change reps) 
        is applied and the new state is evaluated.
        """
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
    iterations = 5000
    
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
                config.weights['curve'] = float(data['weights'].get('curve', 0.35))
                config.weights['vol'] = float(data['weights'].get('vol', 0.15))
                config.weights['ton'] = float(data['weights'].get('ton', 0.1))
                config.weights['tut'] = float(data['weights'].get('tut', 0.1))
                config.weights['distr'] = float(data['weights'].get('distr', 0.2))
                config.weights['variety'] = float(data['weights'].get('variety', 0.1))
                config.weights['balance'] = float(data['weights'].get('balance', 0.1))
                
            if 'ratios' in data:
                config.target_ratios['vol'] = float(data['ratios'].get('vol', 0.70))
                config.target_ratios['ton'] = float(data['ratios'].get('ton', 0.70))
                config.target_ratios['tut'] = float(data['ratios'].get('tut', 0.70))
                
            if 'muscleTargets' in data:
                config.muscle_targets = data['muscleTargets']
                
            if 'volumeDist' in data:
                config.volume_dist = data['volumeDist']
                
        except Exception as e:
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

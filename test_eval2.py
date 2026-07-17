import json
import numpy as np
from analyzer.solver import SolverConfig, WorkoutSolver, WorkoutState, ScheduledExercise, ScheduledSet

config = SolverConfig()

# Simulate frontend sending UNIFORM config for some basic muscles
config.volume_dist = {
    'macros': {
        'Legs': 20.0,
        'Chest': 20.0,
        'Back': 20.0,
        'Shoulders': 20.0,
        'Arms': 20.0
    },
    'subs': {
        'Legs': {'Quadriceps': 50.0, 'Hamstrings': 50.0},
        'Chest': {'Sternal Head': 50.0, 'Clavicular Head': 50.0},
        'Back': {'Latissimus Dorsi': 100.0},
        'Shoulders': {'Anterior Deltoid': 33.3, 'Lateral Deltoid': 33.3, 'Upper and Mid Trapezius': 33.3},
        'Arms': {'Biceps Brachii': 50.0, 'Lateral Head': 50.0}
    }
}

solver = WorkoutSolver(config)
print("Target Sub Vol:", solver.target_sub_vol)

# Let's extract the sub_vols for a single squat set
state = WorkoutState(1)
ex = solver.db[0] # Squat
sched_ex = ScheduledExercise(ex)
sched_ex.sets.append(ScheduledSet(10, 0, 8.0)) # 10 reps
state.days[0].append(sched_ex)

cost = solver.evaluate_workout(state)
print("Cost:", cost)

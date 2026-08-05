import json
import numpy as np
from analyzer.solver import SolverConfig, WorkoutSolver, WorkoutState, ScheduledExercise, ScheduledSet

config = SolverConfig()
# We don't have the exact UI payload, but let's test if target_sub_vol works.
print("Target Sub Vol initial:", config.target_sub_vol if hasattr(config, 'target_sub_vol') else "Not calculated yet")

solver = WorkoutSolver(config)
print("Target Sub Vol after init:", solver.target_sub_vol)

state = solver.generate_random_state()
cost = solver.evaluate_workout(state)
print("Random State Cost:", cost)

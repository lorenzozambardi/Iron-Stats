import json
import numpy as np
from analyzer.solver import SolverConfig, WorkoutSolver, WorkoutState, ScheduledExercise, ScheduledSet

config = SolverConfig()

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
config.calibration_steps = 100

solver = WorkoutSolver(config)
best = solver.solve(iterations=10)

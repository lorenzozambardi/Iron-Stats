from dataclasses import dataclass, field
from typing import Dict, List, Optional, Union, Any
import numpy as np


@dataclass
class BezierProfile:
    x0: float
    y0: float
    x1: float
    y1: float
    x2: float
    y2: float
    x3: float
    y3: float
    magnitude: float

    def get_curve(self, resolution: int = 50) -> np.ndarray:
        t = np.linspace(0, 1, resolution)
        # Scale t to x domain [x0, x3]
        x_span = self.x3 - self.x0
        if x_span == 0: x_span = 1.0
        x = self.x0 + x_span * (3 * (1-t)**2 * t * self.x1 + 3 * (1-t) * t**2 * self.x2 + t**3)
        y = (1-t)**3 * self.y0 + 3 * (1-t)**2 * t * self.y1 + 3 * (1-t) * t**2 * self.y2 + t**3 * self.y3
        
        dx = np.diff(x)
        y_avg = (y[:-1] + y[1:]) / 2
        area = np.sum(y_avg * dx)
        
        if area > 0:
            return y * (self.magnitude / area)
        return np.zeros_like(y)

from analyzer.constants import COEFF_ASSISTED, COEFF_PARTIAL


@dataclass
class Exercise:
    name: str
    muscles_distr: Dict[str, Any]
    fatigue: float
    load_coeff: float
    load_multiplier: float = 1.0
    load_offset: float = 0.0
    is_isolation: bool = False

    def __post_init__(self):
        new_distr = {}
        for m, val in self.muscles_distr.items():
            if isinstance(val, (int, float)):
                new_distr[m] = BezierProfile(0.0, 1.0, 0.33, 1.0, 0.66, 1.0, 1.0, 1.0, float(val))
            elif isinstance(val, dict):
                new_distr[m] = BezierProfile(
                    float(val.get("x0", 0.0)),
                    float(val.get("y0", 1.0)),
                    float(val.get("x1", 0.33)),
                    float(val.get("y1", 1.0)),
                    float(val.get("x2", 0.66)),
                    float(val.get("y2", 1.0)),
                    float(val.get("x3", 1.0)),
                    float(val.get("y3", 1.0)),
                    float(val.get("magnitude", 0.0))
                )
            elif isinstance(val, BezierProfile):
                new_distr[m] = val
        self.muscles_distr = new_distr
        
        # Enforce rule: sum of magnitudes must be 1.0
        total_mag = sum(tp.magnitude for tp in self.muscles_distr.values())
        if total_mag > 0 and abs(total_mag - 1.0) > 1e-4:
            # Normalize to exactly 1.0
            for tp in self.muscles_distr.values():
                tp.magnitude = round(tp.magnitude / total_mag, 4)



import json
import os

exercises_list = []
_data_path = os.path.join(os.path.dirname(__file__), '..', '..', 'frontend', 'src', 'defaultExercises.json')
if os.path.exists(_data_path):
    with open(_data_path, 'r', encoding='utf-8') as f:
        _data = json.load(f)
        for _ex in _data:
            exercises_list.append(Exercise(
                name=_ex['name'],
                muscles_distr=_ex['muscles_distr'],
                fatigue=float(_ex['fatigue']),
                load_coeff=float(_ex['load_coeff']),
                load_multiplier=float(_ex.get('load_multiplier', 1.0)),
                load_offset=float(_ex.get('load_offset', 0.0)),
                is_isolation=bool(_ex.get('is_isolation', False))
            ))



@dataclass
class SetData:
    load: float
    base_reps: int
    assisted_reps: int = 0
    partial_reps: int = 0
    rpe: float = 9.0
    total_tut: float = 0.0
    effective_tut: float = 0.0
    tuts: List[float] = field(default_factory=list)

    @property
    def effective_reps(self) -> float:
        eff_base = min(float(self.base_reps), max(0.0, self.rpe - 4.0))
        return (
            eff_base
            + (self.assisted_reps * COEFF_ASSISTED)
            + (self.partial_reps * COEFF_PARTIAL)
        )

    @property
    def total_reps(self) -> float:
        return (
            float(self.base_reps)
            + (self.assisted_reps * COEFF_ASSISTED)
            + (self.partial_reps * COEFF_PARTIAL)
        )


@dataclass
class WeekData:
    week_num: int
    sets: List[SetData] = field(default_factory=list)


@dataclass
class WorkoutExercise:
    exercise_obj: Exercise
    raw_name: str
    session: int = 0
    weeks: List[WeekData] = field(default_factory=list)
    concentric: float = 1.0
    shortening_pause: float = 0.0
    eccentric: float = 2.0
    lengthening_pause: float = 0.0

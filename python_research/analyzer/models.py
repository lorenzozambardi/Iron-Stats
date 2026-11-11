from dataclasses import dataclass, field
from typing import Any

import numpy as np

try:
    from .constants import COEFF_ASSISTED, COEFF_PARTIAL
except ImportError:
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from analyzer.constants import COEFF_ASSISTED, COEFF_PARTIAL


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

    def __post_init__(self) -> None:
        if not (self.x0 < self.x1 < self.x2 < self.x3):
            raise ValueError(
                f"Non-monotone Bezier profile: {self.x0}, {self.x1}, {self.x2}, {self.x3}"
            )

    def _eval_xy(self, t: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        u = 1.0 - t
        u2 = u * u
        u3 = u2 * u
        t2 = t * t
        t3 = t2 * t
        x = u3 * self.x0 + 3.0 * u2 * t * self.x1 + 3.0 * u * t2 * self.x2 + t3 * self.x3
        y = u3 * self.y0 + 3.0 * u2 * t * self.y1 + 3.0 * u * t2 * self.y2 + t3 * self.y3
        return x, y

    def get_curve(self, resolution: int = 50) -> np.ndarray:
        """Evaluate the area-normalized cubic Bezier tension curve at uniform parameter t."""
        t = np.linspace(0.0, 1.0, resolution)
        x, y = self._eval_xy(t)

        dx = np.diff(x)
        y_avg = (y[:-1] + y[1:]) / 2.0
        area = float(np.sum(y_avg * dx))

        if area > 0.0:
            return y * (self.magnitude / area)
        return np.zeros_like(y)

    def solve_y(self, target_x: float, tol: float = 1e-6, max_iter: int = 30) -> float:
        """Invert x(t) = target_x via bisection (requires x0 < x1 < x2 < x3) and evaluate y(t)."""
        if target_x < self.x0 or target_x > self.x3:
            return 0.0
        if target_x == self.x0:
            return float(self.y0)
        if target_x == self.x3:
            return float(self.y3)

        lower = 0.0
        upper = 1.0
        t = 0.5
        for _ in range(max_iter):
            u = 1.0 - t
            x = (
                (u**3) * self.x0
                + 3.0 * (u**2) * t * self.x1
                + 3.0 * u * (t**2) * self.x2
                + (t**3) * self.x3
            )
            if abs(x - target_x) < tol:
                break
            if x < target_x:
                lower = t
            else:
                upper = t
            t = 0.5 * (lower + upper)

        u = 1.0 - t
        return float(
            (u**3) * self.y0
            + 3.0 * (u**2) * t * self.y1
            + 3.0 * u * (t**2) * self.y2
            + (t**3) * self.y3
        )

    def get_physical_curve(self, resolution: int = 50) -> np.ndarray:
        """Sample the area-normalized tension curve on a uniform physical ROM grid x in [0, 1]."""
        t = np.linspace(0.0, 1.0, resolution)
        x, y = self._eval_xy(t)
        area = float(np.sum(((y[:-1] + y[1:]) / 2.0) * np.diff(x)))
        if area <= 0.0:
            return np.zeros(resolution, dtype=float)
        scale = self.magnitude / area
        x_grid = np.linspace(0.0, 1.0, resolution)
        return np.array([self.solve_y(float(xv)) * scale for xv in x_grid], dtype=float)


def coerce_muscles_distr(muscles_distr: dict[str, Any]) -> dict[str, "BezierProfile"]:
    """Convert raw muscle distribution entries to BezierProfile objects and enforce sum == 1.0."""
    new_distr: dict[str, BezierProfile] = {}
    for m, val in muscles_distr.items():
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
                float(val.get("magnitude", 0.0)),
            )
        elif isinstance(val, BezierProfile):
            new_distr[m] = val

    total_mag = sum(tp.magnitude for tp in new_distr.values())
    if total_mag > 0 and abs(total_mag - 1.0) > 1e-4:
        for tp in new_distr.values():
            tp.magnitude = tp.magnitude / total_mag
    return new_distr


@dataclass
class Exercise:
    name: str
    muscles_distr: dict[str, Any]
    fatigue: float
    load_coeff: float
    load_multiplier: float = 1.0
    load_offset: float = 0.0
    is_isolation: bool = False

    def __post_init__(self):
        self.muscles_distr = coerce_muscles_distr(self.muscles_distr)



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
    fatigue: float = 0.0
    dropset_id: str | None = None
    tuts: list[float] = field(default_factory=list)

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
    sets: list[SetData] = field(default_factory=list)


@dataclass
class WorkoutExercise:
    exercise_obj: Exercise
    raw_name: str
    session: int = 0
    rest_seconds: int = 120
    weeks: list[WeekData] = field(default_factory=list)
    concentric: float = 1.0
    shortening_pause: float = 0.0
    eccentric: float = 2.0
    lengthening_pause: float = 0.0

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

from .constants import COEFF_ASSISTED, COEFF_PARTIAL


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



exercises_list = [
    Exercise("Squat", {"Quadriceps": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.9, 0.1, 0.45), "Glutes": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.35), "Adductors": BezierProfile(0.2, 1.0, 0.33, 0.9, 0.66, 0.5, 0.7, 0.1, 0.15), "Erectors": BezierProfile(0.4, 1.0, 0.33, 0.9, 0.66, 0.5, 0.6, 0.1, 0.05)}, 9.5, 0.1),
    Exercise("Leg Press 45", {"Quadriceps": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.9, 0.1, 0.45), "Glutes": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.35), "Adductors": BezierProfile(0.2, 1.0, 0.33, 0.9, 0.66, 0.5, 0.7, 0.1, 0.15), "Erectors": BezierProfile(0.4, 1.0, 0.33, 0.9, 0.66, 0.5, 0.6, 0.1, 0.05)}, 8.0, 0.3),
    Exercise("Sissy Squat", {"Quadriceps": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.9, 0.1, 1.0)}, 5.0, 0.7, is_isolation=True),
    Exercise("Hack Squat", {"Quadriceps": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.9, 0.1, 0.7), "Glutes": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.3)}, 8.5, 0.3),
    Exercise("Flat Barbell Bench", {"Sternal Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.5), "Clavicular Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.1), "Anterior Deltoid": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.15), "Lateral Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 1.0, 0.1, 0.1), "Long Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 1.0, 0.1, 0.05), "Medial Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 1.0, 0.1, 0.1)}, 8.0, 0.4),
    Exercise("20 Barbell Bench", {"Sternal Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.5), "Clavicular Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.1), "Anterior Deltoid": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.15), "Lateral Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 1.0, 0.1, 0.1), "Long Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 1.0, 0.1, 0.05), "Medial Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 1.0, 0.1, 0.1)}, 7.8, 0.42),
    Exercise("32 Barbell Bench", {"Clavicular Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.4), "Sternal Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.2), "Anterior Deltoid": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.2), "Lateral Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 1.0, 0.1, 0.05), "Long Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 1.0, 0.1, 0.05), "Medial Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 1.0, 0.1, 0.1)}, 7.6, 0.45),
    Exercise("45 Barbell Bench", {"Clavicular Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.4), "Sternal Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.2), "Anterior Deltoid": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.2), "Lateral Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 1.0, 0.1, 0.05), "Long Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 1.0, 0.1, 0.05), "Medial Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 1.0, 0.1, 0.1)}, 7.5, 0.5),
    Exercise("Flat DB Bench", {"Sternal Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.5), "Clavicular Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.1), "Anterior Deltoid": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.15), "Lateral Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 1.0, 0.1, 0.1), "Long Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 1.0, 0.1, 0.05), "Medial Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 1.0, 0.1, 0.1)}, 7.0, 0.5, load_multiplier=2.0),
    Exercise("20 DB Bench", {"Sternal Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.5), "Clavicular Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.1), "Anterior Deltoid": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.15), "Lateral Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 1.0, 0.1, 0.1), "Long Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 1.0, 0.1, 0.05), "Medial Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 1.0, 0.1, 0.1)}, 6.8, 0.52, load_multiplier=2.0),
    Exercise("32 DB Bench", {"Clavicular Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.4), "Sternal Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.2), "Anterior Deltoid": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.2), "Lateral Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 1.0, 0.1, 0.05), "Long Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 1.0, 0.1, 0.05), "Medial Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 1.0, 0.1, 0.1)}, 6.8, 0.55, load_multiplier=2.0),
    Exercise("45 DB Bench", {"Clavicular Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.4), "Sternal Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.2), "Anterior Deltoid": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.2), "Lateral Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 1.0, 0.1, 0.05), "Long Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 1.0, 0.1, 0.05), "Medial Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 1.0, 0.1, 0.1)}, 6.5, 0.6, load_multiplier=2.0),
    Exercise("Chest Press", {"Sternal Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.5), "Clavicular Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.1), "Anterior Deltoid": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.15), "Lateral Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 1.0, 0.1, 0.1), "Long Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 1.0, 0.1, 0.05), "Medial Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 1.0, 0.1, 0.1)}, 6.0, 0.6),
    Exercise("Flat SM Bench", {"Sternal Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.5), "Clavicular Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.1), "Anterior Deltoid": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.15), "Lateral Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 1.0, 0.1, 0.1), "Long Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 1.0, 0.1, 0.05), "Medial Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 1.0, 0.1, 0.1)}, 6.5, 0.5, load_multiplier=2.0, load_offset=20.0),
    Exercise("20 SM Bench", {"Sternal Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.5), "Clavicular Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.1), "Anterior Deltoid": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.15), "Lateral Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 1.0, 0.1, 0.1), "Long Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 1.0, 0.1, 0.05), "Medial Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 1.0, 0.1, 0.1)}, 6.4, 0.52, load_multiplier=2.0, load_offset=20.0),
    Exercise("32 SM Bench", {"Clavicular Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.4), "Sternal Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.2), "Anterior Deltoid": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.2), "Lateral Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 1.0, 0.1, 0.05), "Long Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 1.0, 0.1, 0.05), "Medial Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 1.0, 0.1, 0.1)}, 6.3, 0.55, load_multiplier=2.0, load_offset=20.0),
    Exercise("45 SM Bench", {"Clavicular Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.4), "Sternal Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.2), "Anterior Deltoid": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.2), "Lateral Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 1.0, 0.1, 0.05), "Long Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 1.0, 0.1, 0.05), "Medial Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 1.0, 0.1, 0.1)}, 6.2, 0.6, load_multiplier=2.0, load_offset=20.0),
    Exercise("30 SM Press", {"Clavicular Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.4), "Sternal Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.2), "Anterior Deltoid": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.2), "Lateral Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 1.0, 0.1, 0.05), "Long Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 1.0, 0.1, 0.05), "Medial Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 1.0, 0.1, 0.1)}, 6.3, 0.55, load_multiplier=2.0, load_offset=20.0),
    Exercise("Machine Press", {"Anterior Deltoid": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.6), "Lateral Deltoid": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.1), "Clavicular Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 0.8, 0.1, 0.1), "Lateral Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 1.0, 0.1, 0.05), "Long Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 1.0, 0.1, 0.05), "Medial Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.5, 1.0, 0.1, 0.1)}, 6.5, 0.55),
    Exercise("RDL", {"Hamstrings": BezierProfile(0.0, 1.0, 0.33, 0.8, 0.66, 0.4, 0.7, 0.1, 0.6), "Glutes": BezierProfile(0.2, 1.0, 0.33, 0.8, 0.66, 0.4, 1.0, 0.1, 0.3), "Erectors": BezierProfile(0.4, 1.0, 0.33, 0.8, 0.66, 0.4, 0.6, 0.1, 0.1)}, 8.5, 0.3),
    Exercise("Stiff Leg Deadlift", {"Hamstrings": BezierProfile(0.0, 1.0, 0.33, 0.8, 0.66, 0.4, 0.7, 0.1, 0.6), "Glutes": BezierProfile(0.2, 1.0, 0.33, 0.8, 0.66, 0.4, 1.0, 0.1, 0.3), "Erectors": BezierProfile(0.4, 1.0, 0.33, 0.8, 0.66, 0.4, 0.6, 0.1, 0.1)}, 9.0, 0.25),
    Exercise("Deadlift", {"Glutes": BezierProfile(0.2, 1.0, 0.33, 0.8, 0.66, 0.4, 1.0, 0.1, 0.4), "Hamstrings": BezierProfile(0.0, 1.0, 0.33, 0.8, 0.66, 0.4, 0.7, 0.1, 0.3), "Erectors": BezierProfile(0.4, 1.0, 0.33, 0.8, 0.66, 0.4, 0.6, 0.1, 0.2), "Latissimus Dorsi": BezierProfile(0.4, 1.0, 0.33, 0.8, 0.66, 0.4, 0.6, 0.1, 0.1)}, 10.0, 0.1),
    Exercise("Leg Curl", {"Hamstrings": BezierProfile(0.1, 0.5, 0.33, 1.0, 0.66, 0.9, 0.9, 0.3, 1.0)}, 4.0, 0.8, is_isolation=True),
    Exercise("Leg Extension", {"Quadriceps": BezierProfile(0.1, 0.4, 0.33, 0.7, 0.66, 1.0, 0.9, 0.9, 1.0)}, 4.0, 0.8, is_isolation=True),
    Exercise("DB Flies", {"Sternal Head": BezierProfile(0.0, 1.0, 0.33, 0.7, 0.66, 0.2, 0.7, 0.0, 0.7), "Clavicular Head": BezierProfile(0.0, 1.0, 0.33, 0.7, 0.66, 0.2, 0.7, 0.0, 0.3)}, 4.5, 0.75, load_multiplier=2.0, is_isolation=True),
    Exercise("Pec Deck", {"Sternal Head": BezierProfile(0.0, 0.8, 0.33, 1.0, 0.66, 1.0, 1.0, 0.8, 0.7), "Clavicular Head": BezierProfile(0.0, 0.8, 0.33, 1.0, 0.66, 1.0, 1.0, 0.8, 0.3)}, 3.5, 0.8, is_isolation=True),
    Exercise("High Cable Flies", {"Sternal Head": BezierProfile(0.0, 0.8, 0.33, 1.0, 0.66, 1.0, 1.0, 0.8, 0.7), "Clavicular Head": BezierProfile(0.0, 0.8, 0.33, 1.0, 0.66, 1.0, 1.0, 0.8, 0.3)}, 3.5, 0.8, is_isolation=True),
    Exercise("Low Cable Flies", {"Sternal Head": BezierProfile(0.0, 0.8, 0.33, 1.0, 0.66, 1.0, 1.0, 0.8, 0.7), "Clavicular Head": BezierProfile(0.0, 0.8, 0.33, 1.0, 0.66, 1.0, 1.0, 0.8, 0.3)}, 3.5, 0.8, is_isolation=True),
    Exercise("Incl Cable Flies", {"Sternal Head": BezierProfile(0.0, 0.8, 0.33, 1.0, 0.66, 1.0, 1.0, 0.8, 0.7), "Clavicular Head": BezierProfile(0.0, 0.8, 0.33, 1.0, 0.66, 1.0, 1.0, 0.8, 0.3)}, 3.5, 0.8, is_isolation=True),
    Exercise("Lat Machine", {"Latissimus Dorsi": BezierProfile(0.1, 0.4, 0.33, 0.6, 0.66, 0.9, 1.0, 1.0, 0.6), "Upper and Mid Trapezius": BezierProfile(0.2, 0.4, 0.33, 0.6, 0.66, 0.9, 1.0, 1.0, 0.1), "Lower Trapezius and Rhomboids": BezierProfile(0.2, 0.4, 0.33, 0.6, 0.66, 0.9, 1.0, 1.0, 0.1), "Biceps Brachii": BezierProfile(0.2, 0.4, 0.33, 0.6, 0.66, 0.9, 0.8, 1.0, 0.1), "Brachialis": BezierProfile(0.2, 0.4, 0.33, 0.6, 0.66, 0.9, 0.8, 1.0, 0.05), "Brachioradialis": BezierProfile(0.2, 0.4, 0.33, 0.6, 0.66, 0.9, 0.8, 1.0, 0.05)}, 6.0, 0.6),
    Exercise("Lat Machine Alternative", {"Latissimus Dorsi": BezierProfile(0.1, 0.4, 0.33, 0.6, 0.66, 0.9, 1.0, 1.0, 0.6), "Upper and Mid Trapezius": BezierProfile(0.2, 0.4, 0.33, 0.6, 0.66, 0.9, 1.0, 1.0, 0.1), "Lower Trapezius and Rhomboids": BezierProfile(0.2, 0.4, 0.33, 0.6, 0.66, 0.9, 1.0, 1.0, 0.1), "Biceps Brachii": BezierProfile(0.2, 0.4, 0.33, 0.6, 0.66, 0.9, 0.8, 1.0, 0.1), "Brachialis": BezierProfile(0.2, 0.4, 0.33, 0.6, 0.66, 0.9, 0.8, 1.0, 0.05), "Brachioradialis": BezierProfile(0.2, 0.4, 0.33, 0.6, 0.66, 0.9, 0.8, 1.0, 0.05)}, 6.0, 0.6),
    Exercise("Wide Pulley", {"Latissimus Dorsi": BezierProfile(0.1, 0.4, 0.33, 0.6, 0.66, 0.9, 1.0, 1.0, 0.4), "Upper and Mid Trapezius": BezierProfile(0.2, 0.4, 0.33, 0.6, 0.66, 0.9, 1.0, 1.0, 0.2), "Lower Trapezius and Rhomboids": BezierProfile(0.2, 0.4, 0.33, 0.6, 0.66, 0.9, 1.0, 1.0, 0.2), "Biceps Brachii": BezierProfile(0.2, 0.4, 0.33, 0.6, 0.66, 0.9, 0.8, 1.0, 0.1), "Brachialis": BezierProfile(0.2, 0.4, 0.33, 0.6, 0.66, 0.9, 0.8, 1.0, 0.05), "Brachioradialis": BezierProfile(0.2, 0.4, 0.33, 0.6, 0.66, 0.9, 0.8, 1.0, 0.05)}, 6.5, 0.55),
    Exercise("Close Pulley", {"Latissimus Dorsi": BezierProfile(0.1, 0.4, 0.33, 0.6, 0.66, 0.9, 1.0, 1.0, 0.4), "Upper and Mid Trapezius": BezierProfile(0.2, 0.4, 0.33, 0.6, 0.66, 0.9, 1.0, 1.0, 0.2), "Lower Trapezius and Rhomboids": BezierProfile(0.2, 0.4, 0.33, 0.6, 0.66, 0.9, 1.0, 1.0, 0.2), "Biceps Brachii": BezierProfile(0.2, 0.4, 0.33, 0.6, 0.66, 0.9, 0.8, 1.0, 0.1), "Brachialis": BezierProfile(0.2, 0.4, 0.33, 0.6, 0.66, 0.9, 0.8, 1.0, 0.05), "Brachioradialis": BezierProfile(0.2, 0.4, 0.33, 0.6, 0.66, 0.9, 0.8, 1.0, 0.05)}, 6.0, 0.6),
    Exercise("SA Pulley", {"Latissimus Dorsi": BezierProfile(0.1, 0.4, 0.33, 0.6, 0.66, 0.9, 1.0, 1.0, 0.4), "Upper and Mid Trapezius": BezierProfile(0.2, 0.4, 0.33, 0.6, 0.66, 0.9, 1.0, 1.0, 0.2), "Lower Trapezius and Rhomboids": BezierProfile(0.2, 0.4, 0.33, 0.6, 0.66, 0.9, 1.0, 1.0, 0.2), "Biceps Brachii": BezierProfile(0.2, 0.4, 0.33, 0.6, 0.66, 0.9, 0.8, 1.0, 0.1), "Brachialis": BezierProfile(0.2, 0.4, 0.33, 0.6, 0.66, 0.9, 0.8, 1.0, 0.05), "Brachioradialis": BezierProfile(0.2, 0.4, 0.33, 0.6, 0.66, 0.9, 0.8, 1.0, 0.05)}, 5.5, 0.7, is_isolation=True),
    Exercise("T-Bar", {"Latissimus Dorsi": BezierProfile(0.1, 0.4, 0.33, 0.6, 0.66, 0.9, 1.0, 1.0, 0.4), "Upper and Mid Trapezius": BezierProfile(0.2, 0.4, 0.33, 0.6, 0.66, 0.9, 1.0, 1.0, 0.2), "Lower Trapezius and Rhomboids": BezierProfile(0.2, 0.4, 0.33, 0.6, 0.66, 0.9, 1.0, 1.0, 0.2), "Biceps Brachii": BezierProfile(0.2, 0.4, 0.33, 0.6, 0.66, 0.9, 0.8, 1.0, 0.1), "Brachialis": BezierProfile(0.2, 0.4, 0.33, 0.6, 0.66, 0.9, 0.8, 1.0, 0.05), "Brachioradialis": BezierProfile(0.2, 0.4, 0.33, 0.6, 0.66, 0.9, 0.8, 1.0, 0.05)}, 8.0, 0.35),
    Exercise("Machine T-Bar", {"Latissimus Dorsi": BezierProfile(0.1, 0.4, 0.33, 0.6, 0.66, 0.9, 1.0, 1.0, 0.4), "Upper and Mid Trapezius": BezierProfile(0.2, 0.4, 0.33, 0.6, 0.66, 0.9, 1.0, 1.0, 0.2), "Lower Trapezius and Rhomboids": BezierProfile(0.2, 0.4, 0.33, 0.6, 0.66, 0.9, 1.0, 1.0, 0.2), "Biceps Brachii": BezierProfile(0.2, 0.4, 0.33, 0.6, 0.66, 0.9, 0.8, 1.0, 0.1), "Brachialis": BezierProfile(0.2, 0.4, 0.33, 0.6, 0.66, 0.9, 0.8, 1.0, 0.05), "Brachioradialis": BezierProfile(0.2, 0.4, 0.33, 0.6, 0.66, 0.9, 0.8, 1.0, 0.05)}, 6.5, 0.55),
    Exercise("SA Cable Pulldown", {"Latissimus Dorsi": BezierProfile(0.1, 0.4, 0.33, 0.6, 0.66, 0.9, 1.0, 1.0, 0.8), "Biceps Brachii": BezierProfile(0.2, 0.4, 0.33, 0.6, 0.66, 0.9, 0.8, 1.0, 0.2)}, 4.5, 0.75, is_isolation=True),
    Exercise("SA Machine Pulldown", {"Latissimus Dorsi": BezierProfile(0.1, 0.4, 0.33, 0.6, 0.66, 0.9, 1.0, 1.0, 0.8), "Biceps Brachii": BezierProfile(0.2, 0.4, 0.33, 0.6, 0.66, 0.9, 0.8, 1.0, 0.2)}, 5.0, 0.7, is_isolation=True),
    Exercise("Chin-Ups", {"Latissimus Dorsi": BezierProfile(0.1, 0.4, 0.33, 0.6, 0.66, 0.9, 1.0, 1.0, 0.4), "Biceps Brachii": BezierProfile(0.2, 0.4, 0.33, 0.6, 0.66, 0.9, 0.8, 1.0, 0.4), "Brachialis": BezierProfile(0.2, 0.4, 0.33, 0.6, 0.66, 0.9, 0.8, 1.0, 0.1), "Lower Trapezius and Rhomboids": BezierProfile(0.2, 0.4, 0.33, 0.6, 0.66, 0.9, 1.0, 1.0, 0.1)}, 7.5, 0.45),
    Exercise("Pullover", {"Latissimus Dorsi": BezierProfile(0.0, 0.8, 0.33, 1.0, 0.66, 1.0, 0.5, 0.8, 1.0)}, 4.5, 0.75, is_isolation=True),
    Exercise("LR", {"Lateral Deltoid": BezierProfile(0.2, 0.0, 0.33, 0.3, 0.66, 0.8, 0.9, 1.0, 0.9), "Upper and Mid Trapezius": BezierProfile(0.2, 0.0, 0.33, 0.3, 0.66, 0.8, 0.9, 1.0, 0.1)}, 3.0, 0.9, load_multiplier=2.0, is_isolation=True),
    Exercise("LR 49", {"Lateral Deltoid": BezierProfile(0.2, 0.0, 0.33, 0.3, 0.66, 0.8, 0.9, 1.0, 0.9), "Upper and Mid Trapezius": BezierProfile(0.2, 0.0, 0.33, 0.3, 0.66, 0.8, 0.9, 1.0, 0.1)}, 3.0, 0.9, load_multiplier=2.0, is_isolation=True),
    Exercise("LRC", {"Lateral Deltoid": BezierProfile(0.0, 0.8, 0.33, 1.0, 0.66, 1.0, 1.0, 0.8, 0.9), "Upper and Mid Trapezius": BezierProfile(0.0, 0.8, 0.33, 1.0, 0.66, 1.0, 1.0, 0.8, 0.1)}, 3.0, 0.9, load_multiplier=0.5, is_isolation=True),
    Exercise("Shoulder Extra-Rotations", {"Rotator Cuff": BezierProfile(0.1, 0.8, 0.33, 1.0, 0.66, 1.0, 0.9, 0.8, 1.0)}, 2.0, 1.0, is_isolation=True),
    Exercise("45 Incl Curl", {"Biceps Brachii": BezierProfile(0.1, 0.3, 0.33, 0.8, 0.66, 1.0, 0.9, 0.4, 0.8), "Brachialis": BezierProfile(0.1, 0.3, 0.33, 0.8, 0.66, 1.0, 0.9, 0.4, 0.1), "Brachioradialis": BezierProfile(0.1, 0.3, 0.33, 0.8, 0.66, 1.0, 0.9, 0.4, 0.1)}, 3.5, 0.85, load_multiplier=2.0, is_isolation=True),
    Exercise("49 Incl Curl", {"Biceps Brachii": BezierProfile(0.1, 0.3, 0.33, 0.8, 0.66, 1.0, 0.9, 0.4, 0.8), "Brachialis": BezierProfile(0.1, 0.3, 0.33, 0.8, 0.66, 1.0, 0.9, 0.4, 0.1), "Brachioradialis": BezierProfile(0.1, 0.3, 0.33, 0.8, 0.66, 1.0, 0.9, 0.4, 0.1)}, 3.5, 0.85, load_multiplier=2.0, is_isolation=True),
    Exercise("DB Hammer", {"Biceps Brachii": BezierProfile(0.1, 0.3, 0.33, 0.8, 0.66, 1.0, 0.9, 0.4, 0.8), "Brachialis": BezierProfile(0.1, 0.3, 0.33, 0.8, 0.66, 1.0, 0.9, 0.4, 0.1), "Brachioradialis": BezierProfile(0.1, 0.3, 0.33, 0.8, 0.66, 1.0, 0.9, 0.4, 0.1)}, 3.5, 0.85, load_multiplier=2.0, is_isolation=True),
    Exercise("EZ-Bar Curl", {"Biceps Brachii": BezierProfile(0.1, 0.3, 0.33, 0.8, 0.66, 1.0, 0.9, 0.4, 0.8), "Brachialis": BezierProfile(0.1, 0.3, 0.33, 0.8, 0.66, 1.0, 0.9, 0.4, 0.1), "Brachioradialis": BezierProfile(0.1, 0.3, 0.33, 0.8, 0.66, 1.0, 0.9, 0.4, 0.1)}, 5.0, 0.7, load_multiplier=2.0, load_offset=8.0, is_isolation=True),
    Exercise("Preacher Curl", {"Brachialis": BezierProfile(0.1, 1.0, 0.33, 0.8, 0.66, 0.4, 0.9, 0.1, 0.6), "Biceps Brachii": BezierProfile(0.1, 1.0, 0.33, 0.8, 0.66, 0.4, 0.9, 0.1, 0.4)}, 4.0, 0.8, is_isolation=True),
    Exercise("Reverse Scott DB Curl", {"Biceps Brachii": BezierProfile(0.1, 0.1, 0.33, 0.4, 0.66, 0.8, 0.9, 1.0, 0.8), "Brachialis": BezierProfile(0.1, 0.1, 0.33, 0.4, 0.66, 0.8, 0.9, 1.0, 0.1), "Brachioradialis": BezierProfile(0.1, 0.1, 0.33, 0.4, 0.66, 0.8, 0.9, 1.0, 0.1)}, 4.0, 0.8, load_multiplier=2.0, is_isolation=True),
    Exercise("Bayesian Curl SA", {"Biceps Brachii": BezierProfile(0.0, 0.8, 0.33, 1.0, 0.66, 1.0, 1.0, 0.8, 0.8), "Brachioradialis": BezierProfile(0.0, 0.8, 0.33, 1.0, 0.66, 1.0, 1.0, 0.8, 0.1), "Brachialis": BezierProfile(0.0, 0.8, 0.33, 1.0, 0.66, 1.0, 1.0, 0.8, 0.1)}, 3.0, 0.9, load_multiplier=0.5, is_isolation=True),
    Exercise("Cable French Press", {"Long Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.6, 1.0, 0.3, 0.7), "Lateral Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.6, 1.0, 0.3, 0.15), "Medial Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.6, 1.0, 0.3, 0.15)}, 4.0, 0.8, load_multiplier=0.5, is_isolation=True),
    Exercise("Incl Cable Pushdown", {"Lateral Head": BezierProfile(0.1, 0.6, 0.33, 0.8, 0.66, 1.0, 1.0, 0.9, 0.4), "Medial Head": BezierProfile(0.1, 0.6, 0.33, 0.8, 0.66, 1.0, 1.0, 0.9, 0.4), "Long Head": BezierProfile(0.1, 0.6, 0.33, 0.8, 0.66, 1.0, 1.0, 0.9, 0.2)}, 3.5, 0.85, is_isolation=True),
    Exercise("Bench 54 Pushdown", {"Lateral Head": BezierProfile(0.1, 0.6, 0.33, 0.8, 0.66, 1.0, 1.0, 0.9, 0.4), "Medial Head": BezierProfile(0.1, 0.6, 0.33, 0.8, 0.66, 1.0, 1.0, 0.9, 0.4), "Long Head": BezierProfile(0.1, 0.6, 0.33, 0.8, 0.66, 1.0, 1.0, 0.9, 0.2)}, 3.5, 0.85, is_isolation=True),
    Exercise("Low Cable Triceps", {"Lateral Head": BezierProfile(0.1, 0.6, 0.33, 0.8, 0.66, 1.0, 1.0, 0.9, 0.4), "Medial Head": BezierProfile(0.1, 0.6, 0.33, 0.8, 0.66, 1.0, 1.0, 0.9, 0.4), "Long Head": BezierProfile(0.1, 0.6, 0.33, 0.8, 0.66, 1.0, 1.0, 0.9, 0.2)}, 3.5, 0.85, is_isolation=True),
    Exercise("Bench 54 Triceps", {"Long Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.6, 1.0, 0.3, 0.7), "Lateral Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.6, 1.0, 0.3, 0.15), "Medial Head": BezierProfile(0.1, 1.0, 0.33, 0.9, 0.66, 0.6, 1.0, 0.3, 0.15)}, 4.0, 0.8, is_isolation=True),
    Exercise("Dragon Flag Raises", {"Abdominals": BezierProfile(0.0, 1.0, 0.33, 0.8, 0.66, 0.4, 0.8, 0.2, 1.0)}, 4.0, 0.8, is_isolation=True),
    Exercise("Hanging Leg Raises", {"Abdominals": BezierProfile(0.3, 0.0, 0.33, 0.3, 0.66, 0.7, 1.0, 1.0, 1.0)}, 4.0, 0.8, is_isolation=True),
]


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
    rest_seconds: int = 120
    weeks: List[WeekData] = field(default_factory=list)
    concentric: float = 1.0
    shortening_pause: float = 0.0
    eccentric: float = 2.0
    lengthening_pause: float = 0.0

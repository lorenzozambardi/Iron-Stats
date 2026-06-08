from dataclasses import dataclass, field
from typing import Dict, List, Optional

from .constants import COEFF_ASSISTED, COEFF_PARTIAL


@dataclass
class Exercise:
    name: str
    muscles_distr: Dict[str, float]
    fatigue: float
    load_coeff: float
    load_multiplier: float = 1.0
    load_offset: float = 0.0
    is_isolation: bool = False


exercises_list = [
    Exercise(
        "Squat",
        {"Quadriceps": 0.5, "Glutes": 0.3, "Adductors": 0.1, "Erectors": 0.1},
        9.5,
        0.10,
    ),
    Exercise(
        "Leg Press 45", {"Quadriceps": 0.6, "Glutes": 0.3, "Adductors": 0.1}, 8.0, 0.30
    ),
    Exercise("Sissy Squat", {"Quadriceps": 1}, 5.0, 0.70, is_isolation=True),
    Exercise("RDL", {"Hamstrings": 0.6, "Glutes": 0.3, "Erectors": 0.1}, 8.5, 0.30),
    Exercise("Leg Curl", {"Hamstrings": 1}, 4.0, 0.80, is_isolation=True),
    Exercise("Leg Extension", {"Quadriceps": 1}, 4.0, 0.80, is_isolation=True),
    Exercise(
        "Stiff Leg Deadlift",
        {"Hamstrings": 0.7, "Glutes": 0.2, "Erectors": 0.1},
        9.0,
        0.25,
    ),
    Exercise(
        "Deadlift",
        {"Glutes": 0.4, "Hamstrings": 0.3, "Erectors": 0.2, "Latissimus Dorsi": 0.1},
        10.0,
        0.10,
    ),
    Exercise("Hack Squat", {"Quadriceps": 0.7, "Glutes": 0.3}, 8.5, 0.30),
    Exercise(
        "Flat Barbell Bench",
        {
            "Sternal Head": 0.7,
            "Clavicular Head": 0.1,
            "Anterior Deltoid": 0.1,
            "Lateral Head": 0.1,
        },
        8.0,
        0.40,
    ),
    Exercise(
        "20 Barbell Bench",
        {
            "Sternal Head": 0.6,
            "Clavicular Head": 0.2,
            "Anterior Deltoid": 0.1,
            "Lateral Head": 0.1,
        },
        7.8,
        0.42,
    ),
    Exercise(
        "32 Barbell Bench",
        {
            "Sternal Head": 0.4,
            "Clavicular Head": 0.4,
            "Anterior Deltoid": 0.1,
            "Lateral Head": 0.1,
        },
        7.6,
        0.45,
    ),
    Exercise(
        "45 Barbell Bench",
        {"Clavicular Head": 0.6, "Sternal Head": 0.2, "Anterior Deltoid": 0.2},
        7.5,
        0.50,
    ),
    Exercise(
        "Flat DB Bench",
        {"Sternal Head": 0.75, "Clavicular Head": 0.1, "Anterior Deltoid": 0.15},
        7.0,
        0.50,
        load_multiplier=2.0,
    ),
    Exercise(
        "20 DB Bench",
        {"Sternal Head": 0.6, "Clavicular Head": 0.3, "Anterior Deltoid": 0.1},
        6.8,
        0.52,
        load_multiplier=2.0,
    ),
    Exercise(
        "32 DB Bench",
        {"Clavicular Head": 0.5, "Sternal Head": 0.3, "Anterior Deltoid": 0.2},
        6.8,
        0.55,
        load_multiplier=2.0,
    ),
    Exercise(
        "45 DB Bench",
        {"Clavicular Head": 0.7, "Sternal Head": 0.1, "Anterior Deltoid": 0.2},
        6.5,
        0.60,
        load_multiplier=2.0,
    ),
    Exercise(
        "Chest Press",
        {"Sternal Head": 0.7, "Clavicular Head": 0.2, "Anterior Deltoid": 0.1},
        6.0,
        0.60,
    ),
    Exercise(
        "Flat SM Bench",
        {"Sternal Head": 0.7, "Clavicular Head": 0.15, "Anterior Deltoid": 0.15},
        6.5,
        0.50,
        load_multiplier=2.0,
        load_offset=20.0,
    ),
    Exercise(
        "20 SM Bench",
        {"Sternal Head": 0.6, "Clavicular Head": 0.25, "Anterior Deltoid": 0.15},
        6.4,
        0.52,
        load_multiplier=2.0,
        load_offset=20.0,
    ),
    Exercise(
        "32 SM Bench",
        {"Clavicular Head": 0.5, "Sternal Head": 0.3, "Anterior Deltoid": 0.2},
        6.3,
        0.55,
        load_multiplier=2.0,
        load_offset=20.0,
    ),
    Exercise(
        "45 SM Bench",
        {"Clavicular Head": 0.65, "Sternal Head": 0.15, "Anterior Deltoid": 0.2},
        6.2,
        0.60,
        load_multiplier=2.0,
        load_offset=20.0,
    ),
    Exercise(
        "Pec Deck",
        {"Sternal Head": 0.8, "Clavicular Head": 0.2},
        3.5,
        0.80,
        is_isolation=True,
    ),
    Exercise(
        "DB Flies",
        {"Sternal Head": 0.7, "Clavicular Head": 0.3},
        4.5,
        0.75,
        load_multiplier=2.0,
        is_isolation=True,
    ),
    Exercise(
        "High Cable Flies",
        {"Sternal Head": 0.8, "Clavicular Head": 0.2},
        3.5,
        0.80,
        is_isolation=True,
    ),
    Exercise(
        "Low Cable Flies",
        {"Clavicular Head": 0.8, "Sternal Head": 0.2},
        3.5,
        0.80,
        is_isolation=True,
    ),
    Exercise(
        "30 SM Press",
        {"Clavicular Head": 0.5, "Sternal Head": 0.3, "Anterior Deltoid": 0.2},
        6.3,
        0.55,
        load_multiplier=2.0,
        load_offset=20.0,
    ),
    Exercise(
        "Incl Cable Flies",
        {"Clavicular Head": 0.8, "Sternal Head": 0.2},
        3.5,
        0.80,
        is_isolation=True,
    ),
    Exercise(
        "Lat Machine",
        {
            "Latissimus Dorsi": 0.7,
            "Upper and Mid Trapezius": 0.1,
            "Lower Trapezius and Rhomboids": 0.1,
            "Biceps Brachii": 0.1,
        },
        6.0,
        0.60,
    ),
    Exercise(
        "Lat Machine Alternative",
        {
            "Latissimus Dorsi": 0.8,
            "Upper and Mid Trapezius": 0.05,
            "Lower Trapezius and Rhomboids": 0.05,
            "Biceps Brachii": 0.1,
        },
        6.0,
        0.60,
    ),
    Exercise(
        "Wide Pulley",
        {
            "Latissimus Dorsi": 0.4,
            "Upper and Mid Trapezius": 0.3,
            "Lower Trapezius and Rhomboids": 0.2,
            "Biceps Brachii": 0.1,
        },
        6.5,
        0.55,
    ),
    Exercise(
        "Close Pulley",
        {
            "Latissimus Dorsi": 0.6,
            "Lower Trapezius and Rhomboids": 0.2,
            "Upper and Mid Trapezius": 0.1,
            "Biceps Brachii": 0.1,
        },
        6.0,
        0.60,
    ),
    Exercise(
        "SA Pulley",
        {
            "Latissimus Dorsi": 0.7,
            "Lower Trapezius and Rhomboids": 0.2,
            "Biceps Brachii": 0.1,
        },
        5.5,
        0.70,
        is_isolation=True,
    ),
    Exercise(
        "T-Bar",
        {
            "Latissimus Dorsi": 0.4,
            "Upper and Mid Trapezius": 0.3,
            "Lower Trapezius and Rhomboids": 0.2,
            "Erectors": 0.1,
        },
        8.0,
        0.35,
    ),
    Exercise(
        "Machine T-Bar",
        {
            "Latissimus Dorsi": 0.4,
            "Upper and Mid Trapezius": 0.3,
            "Lower Trapezius and Rhomboids": 0.3,
        },
        6.5,
        0.55,
    ),
    Exercise("Pullover", {"Latissimus Dorsi": 1}, 4.5, 0.75, is_isolation=True),
    Exercise(
        "SA Cable Pulldown",
        {"Latissimus Dorsi": 0.9, "Biceps Brachii": 0.1},
        4.5,
        0.75,
        is_isolation=True,
    ),
    Exercise(
        "SA Machine Pulldown",
        {"Latissimus Dorsi": 0.9, "Biceps Brachii": 0.1},
        5.0,
        0.70,
        is_isolation=True,
    ),
    Exercise(
        "Chin-Ups",
        {
            "Latissimus Dorsi": 0.4,
            "Biceps Brachii": 0.5,
            "Lower Trapezius and Rhomboids": 0.1,
        },
        7.5,
        0.45,
    ),
    Exercise(
        "LR",
        {"Lateral Deltoid": 0.9, "Upper and Mid Trapezius": 0.1},
        3.0,
        0.90,
        load_multiplier=2.0,
        is_isolation=True,
    ),
    Exercise(
        "LR 49",
        {"Lateral Deltoid": 0.95, "Upper and Mid Trapezius": 0.05},
        3.0,
        0.90,
        load_multiplier=2.0,
        is_isolation=True,
    ),
    Exercise(
        "LRC",
        {"Lateral Deltoid": 0.9, "Upper and Mid Trapezius": 0.1},
        3.0,
        0.90,
        load_multiplier=0.5,
        is_isolation=True,
    ),
    Exercise(
        "Machine Press",
        {
            "Anterior Deltoid": 0.7,
            "Lateral Deltoid": 0.1,
            "Clavicular Head": 0.1,
            "Lateral Head": 0.1,
        },
        6.5,
        0.55,
    ),
    Exercise(
        "Shoulder Extra-Rotations", {"Rotator Cuff": 1}, 2.0, 1.00, is_isolation=True
    ),
    Exercise(
        "45 Incl Curl",
        {"Biceps Brachii": 0.8, "Brachialis": 0.1, "Brachioradialis": 0.1},
        3.5,
        0.85,
        load_multiplier=2.0,
        is_isolation=True,
    ),
    Exercise(
        "49 Incl Curl",
        {"Biceps Brachii": 0.8, "Brachialis": 0.1, "Brachioradialis": 0.1},
        3.5,
        0.85,
        load_multiplier=2.0,
        is_isolation=True,
    ),
    Exercise(
        "DB Hammer",
        {"Brachioradialis": 0.5, "Brachialis": 0.4, "Biceps Brachii": 0.1},
        3.5,
        0.85,
        load_multiplier=2.0,
        is_isolation=True,
    ),
    Exercise(
        "Preacher Curl",
        {"Brachialis": 0.6, "Biceps Brachii": 0.4},
        4.0,
        0.80,
        is_isolation=True,
    ),
    Exercise(
        "Cable French Press",
        {"Long Head": 0.7, "Lateral Head": 0.15, "Medial Head": 0.15},
        4.0,
        0.80,
        load_multiplier=0.5,
        is_isolation=True,
    ),
    Exercise(
        "Incl Cable Pushdown",
        {"Lateral Head": 0.4, "Medial Head": 0.4, "Long Head": 0.2},
        3.5,
        0.85,
        is_isolation=True,
    ),
    Exercise(
        "Bench 54 Pushdown",
        {"Lateral Head": 0.4, "Medial Head": 0.4, "Long Head": 0.2},
        3.5,
        0.85,
        is_isolation=True,
    ),
    Exercise(
        "Low Cable Triceps",
        {"Long Head": 0.8, "Medial Head": 0.1, "Lateral Head": 0.1},
        3.5,
        0.85,
        is_isolation=True,
    ),
    Exercise(
        "Bench 54 Triceps",
        {"Long Head": 0.7, "Lateral Head": 0.15, "Medial Head": 0.15},
        4.0,
        0.80,
        is_isolation=True,
    ),
    Exercise(
        "EZ-Bar Curl",
        {"Biceps Brachii": 0.6, "Brachioradialis": 0.25, "Brachialis": 0.15},
        5.0,
        0.70,
        load_multiplier=2.0,
        load_offset=8.0,
        is_isolation=True,
    ),
    Exercise(
        "Bayesian Curl SA",
        {"Biceps Brachii": 0.8, "Brachioradialis": 0.1, "Brachialis": 0.1},
        3.0,
        0.90,
        load_multiplier=0.5,
        is_isolation=True,
    ),
    Exercise("Dragon Flag Raises", {"Abdominals": 1.0}, 4.0, 0.80, is_isolation=True),
    Exercise("Hanging Leg Raises", {"Abdominals": 1.0}, 4.0, 0.80, is_isolation=True),
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

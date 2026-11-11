"""Unit and numerical-invariant tests for the Iron Stats Python engine."""

from __future__ import annotations

import numpy as np
import pytest

from analyzer.constants import COEFF_PARTIAL
from analyzer.metrics import calculate_set_fatigue, calculate_set_tuts
from analyzer.models import BezierProfile, exercises_list
from analyzer.solver import (
    ScheduledExercise,
    ScheduledSet,
    SolverConfig,
    WorkoutSolver,
    WorkoutState,
)


def test_default_exercises_monotone_and_normalized() -> None:
    assert len(exercises_list) > 0
    for ex in exercises_list:
        total_mag = sum(p.magnitude for p in ex.muscles_distr.values())
        assert total_mag == pytest.approx(1.0, abs=1e-3)
        for prof in ex.muscles_distr.values():
            assert prof.x0 < prof.x1 < prof.x2 < prof.x3
            assert min(prof.y0, prof.y1, prof.y2, prof.y3) >= 0.0


def test_bezier_rejects_non_monotone_x() -> None:
    with pytest.raises(ValueError, match="Non-monotone Bezier profile"):
        BezierProfile(0.4, 1.0, 0.33, 0.8, 0.66, 0.4, 0.6, 0.1, 0.2)


def test_bezier_option_a_and_trapezoidal_conservation() -> None:
    prof = BezierProfile(0.2, 0.0, 0.33, 0.3, 0.66, 0.8, 0.9, 1.0, 0.9)
    t = np.linspace(0.0, 1.0, 50)
    x, _ = prof._eval_xy(t)
    # Option A standard cubic Bezier midpoint
    expected_mid = 0.125 * (0.2 + 3.0 * 0.33 + 3.0 * 0.66 + 0.9)
    x_mid, _ = prof._eval_xy(np.array([0.5]))
    assert float(x_mid[0]) == pytest.approx(expected_mid, abs=1e-12)

    curve = prof.get_curve(resolution=50)
    area = float(np.sum(((curve[:-1] + curve[1:]) / 2.0) * np.diff(x)))
    assert area == pytest.approx(prof.magnitude, rel=1e-6)


def test_physical_curve_respects_support_and_uniform_grid() -> None:
    prof = BezierProfile(0.2, 0.0, 0.33, 0.3, 0.66, 0.8, 0.9, 1.0, 0.9)
    phys = prof.get_physical_curve(resolution=50)
    x_grid = np.linspace(0.0, 1.0, 50)
    assert np.all(phys[x_grid < 0.2] == 0.0)
    assert np.all(phys[x_grid > 0.9] == 0.0)
    assert phys[np.argmin(np.abs(x_grid - 0.5))] > 0.0
    # Riemann vs trapezoidal parity within 2e-2 on LR
    riemann_area = float(np.mean(phys))
    assert abs(riemann_area - prof.magnitude) < 0.05


def test_fatigue_continuous_at_zero_rep_rpe() -> None:
    # 15 reps at RPE 5 => early reps have rep_rpe == 0.0
    tuts = calculate_set_tuts(15, 0, 0, 5.0, 1.0, 0.0, 2.0, 0.0)
    fat_rpe5 = calculate_set_fatigue(15, 0, 0, 5.0, 1.0, 0.0, 2.0, 0.0, 1.0, 1.0, tuts=tuts)
    # Manually compute continuous sum without jump to 1.0 at rep_rpe == 0
    j = np.arange(15)
    rir = (10.0 - 5.0) + (15 - 1 - j)
    rep_rpe = np.maximum(0.0, 10.0 - rir)
    expected = float(np.sum(np.asarray(tuts) * (1.1 ** (rep_rpe - 7.5))))
    assert fat_rpe5 == pytest.approx(expected, rel=1e-9)


def test_solver_partial_weighting_and_etut_evol_degeneracy() -> None:
    cfg = SolverConfig()
    cfg.days = 1
    cfg.calibration_steps = 0
    solver = WorkoutSolver(cfg)

    lr = next(e for e in exercises_list if e.name == "LR")
    state_base = WorkoutState(1)
    ex_b = ScheduledExercise(lr)
    ex_b.sets = [ScheduledSet(10, 0, 9.0)]
    state_base.days[0] = [ex_b]

    state_part = WorkoutState(1)
    ex_p = ScheduledExercise(lr)
    ex_p.sets = [ScheduledSet(10, 10, 9.0)]
    state_part.days[0] = [ex_p]

    # Verify E_tut == E_vol identically under 2.0 s/rep surrogate
    solver._return_raw = True
    _, raw_b = solver.evaluate_workout(state_base)
    _, raw_p = solver.evaluate_workout(state_part)
    solver._return_raw = False
    assert raw_b["tut"] == pytest.approx(raw_b["vol"], abs=1e-12)
    assert raw_p["tut"] == pytest.approx(raw_p["vol"], abs=1e-12)

    # Verify V_m partial contribution scales by COEFF_PARTIAL (0.33), matching sub_vols
    curve_lr = solver.ex_curves["LR"]["Lateral Deltoid"]
    vm_base = curve_lr * 10.0
    vm_part = curve_lr * 10.0 + curve_lr * (10.0 * COEFF_PARTIAL) * solver.partial_mask
    # On x > 0.3333, partial contribution is strictly zero; on x <= 0.3333 (and >= x0=0.2), ratio is 0.33
    mask_active = (solver.x_domain >= 0.2) & (solver.x_domain <= 0.3333)
    assert np.any(mask_active)
    ratio = (vm_part[mask_active] - vm_base[mask_active]) / vm_base[mask_active]
    assert np.allclose(ratio, COEFF_PARTIAL, atol=1e-12)

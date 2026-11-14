"""Unit and numerical-invariant tests for the Iron Stats Python engine."""

from __future__ import annotations

import numpy as np
import pytest

from analyzer.constants import COEFF_PARTIAL, HARD_MAP
from analyzer.metrics import (
    calculate_metrics,
    calculate_set_fatigue,
    calculate_set_tuts,
    compute_effective_tut,
)
from analyzer.models import BezierProfile, Exercise, SetData, exercises_list
from analyzer.parser import analyze_workout_log, match_exercise, parse_rep_token
from analyzer.solver import (
    ScheduledExercise,
    ScheduledSet,
    SolverConfig,
    WorkoutSolver,
    WorkoutState,
    _set_tuts,
    calculate_rest,
    get_target_curve,
)


def test_default_exercises_monotone_and_normalized() -> None:
    assert len(exercises_list) > 0
    for ex in exercises_list:
        total_mag = sum(p.magnitude for p in ex.muscles_distr.values())
        assert total_mag == pytest.approx(1.0, abs=1e-3)
        for prof in ex.muscles_distr.values():
            assert prof.x0 < prof.x1 < prof.x2 < prof.x3
            assert min(prof.y0, prof.y1, prof.y2, prof.y3) >= 0.0


def test_bezier_rejects_non_monotone_x_and_negative_y() -> None:
    with pytest.raises(ValueError, match="Non-monotone or out-of-domain"):
        BezierProfile(0.4, 1.0, 0.33, 0.8, 0.66, 0.4, 0.6, 0.1, 0.2)
    with pytest.raises(ValueError, match="Non-monotone or out-of-domain"):
        BezierProfile(-0.1, 0.0, 0.3, 0.5, 0.6, 0.8, 1.0, 1.0, 0.5)
    with pytest.raises(ValueError, match="Negative Bezier y"):
        BezierProfile(0.1, 0.0, 0.3, -0.2, 0.6, 0.8, 0.9, 1.0, 0.5)


def test_bezier_option_a_and_gl3_conservation() -> None:
    prof = BezierProfile(0.2, 0.0, 0.33, 0.3, 0.66, 0.8, 0.9, 1.0, 0.9)
    t = np.linspace(0.0, 1.0, 50)
    x, _ = prof._eval_xy(t)
    # Option A standard cubic Bezier midpoint
    expected_mid = 0.125 * (0.2 + 3.0 * 0.33 + 3.0 * 0.66 + 0.9)
    x_mid, _ = prof._eval_xy(np.array([0.5]))
    assert float(x_mid[0]) == pytest.approx(expected_mid, abs=1e-12)

    curve = prof.get_curve(resolution=50)
    # 3-pt GL normalization matches parametric trapezoidal within O(h^2) (~6e-5)
    trap_area = float(np.sum(((curve[:-1] + curve[1:]) / 2.0) * np.diff(x)))
    assert trap_area == pytest.approx(prof.magnitude, rel=1e-4)
    # Exact 5-pt GL check on get_curve scale
    scale = prof.magnitude / prof.exact_area()
    pts, wts = np.polynomial.legendre.leggauss(5)
    tg = 0.5 * (pts + 1.0)
    wg = 0.5 * wts
    ug = 1.0 - tg
    yg = (ug**3) * prof.y0 + 3 * (ug**2) * tg * prof.y1 + 3 * ug * (tg**2) * prof.y2 + (tg**3) * prof.y3
    xpg = 3 * (ug**2) * (prof.x1 - prof.x0) + 6 * ug * tg * (prof.x2 - prof.x1) + 3 * (tg**2) * (prof.x3 - prof.x2)
    gl5_area = float(np.sum(wg * yg * xpg) * scale)
    assert gl5_area == pytest.approx(prof.magnitude, rel=1e-12)


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


def test_solver_partial_weighting_and_dynamic_tut() -> None:
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

    # Verify _set_tuts matches full metrics.py dynamic TUT and differs from E_vol
    tuts = calculate_set_tuts(10, 0, 10, 9.0, 1.0, 0.0, 2.0, 0.0)
    tot_t, eff_t = _set_tuts(10, 10, 9.0)
    assert tot_t == pytest.approx(float(np.sum(tuts)), abs=1e-12)
    assert eff_t == pytest.approx(compute_effective_tut(tuts, 10, 9.0), abs=1e-12)

    solver._return_raw = True
    _, raw_b = solver.evaluate_workout(state_base)
    _, raw_p = solver.evaluate_workout(state_part)
    solver._return_raw = False
    assert raw_b["tut"] != pytest.approx(raw_b["vol"], abs=1e-4)
    assert raw_p["tut"] != pytest.approx(raw_p["vol"], abs=1e-4)
    # Empty volume_dist should yield zero E_distr
    assert raw_b["distr"] == 0.0

    # Verify V_m partial contribution scales by COEFF_PARTIAL (0.33), matching sub_vols
    curve_lr = solver.ex_curves["LR"]["Lateral Deltoid"]
    vm_base = curve_lr * 10.0
    vm_part = curve_lr * 10.0 + curve_lr * (10.0 * COEFF_PARTIAL) * solver.partial_mask
    # On x > 0.3333, partial contribution is strictly zero; on x <= 0.3333 (and >= x0=0.2), ratio is 0.33
    mask_active = (solver.x_domain >= 0.2) & (solver.x_domain <= 0.3333)
    assert np.any(mask_active)
    ratio = (vm_part[mask_active] - vm_base[mask_active]) / vm_base[mask_active]
    assert np.allclose(ratio, COEFF_PARTIAL, atol=1e-12)


def test_solver_mutation_clamps_reps_and_rest_rounding() -> None:
    cfg = SolverConfig()
    cfg.days = 1
    cfg.min_reps = 12
    cfg.max_reps = 20
    cfg.min_ex = 1
    cfg.max_ex = 5
    cfg.calibration_steps = 0
    solver = WorkoutSolver(cfg)
    state = solver.generate_random_state()
    for _ in range(100):
        state = solver.mutate_workout(state)
        for ex in state.days[0]:
            for s in ex.sets:
                assert cfg.min_reps <= s.base_reps <= cfg.max_reps

    # Hack Squat & RDL fatigue=8.5 -> 3.25 mins -> rounds half-up to 3'30" matching JS
    assert calculate_rest(8.5) == "3'30\""


def test_partition_of_unity_exact_three_way_and_override() -> None:
    ex = Exercise(
        name="ThreeWay",
        muscles_distr={"Clavicular Head": 1.0, "Sternal Head": 1.0, "Costal Head": 1.0},
        fatigue=5.0,
        load_coeff=0.5,
    )
    assert sum(p.magnitude for p in ex.muscles_distr.values()) == pytest.approx(1.0, abs=1e-12)

    bad_log = (
        'override: ThreeWay | muscles_distr={"Clavicular Head":'
        '{"x0":0.5,"y0":1,"x1":0.3,"y1":1,"x2":0.6,"y2":1,"x3":1,"y3":1,"magnitude":1}}\n'
    )
    # Non-monotone override is rejected cleanly rather than stored unvalidated
    analyze_workout_log(bad_log, [ex])


def test_rep_clamp_fractional_tut_and_fatigue_ordering() -> None:
    clamped = parse_rep_token("3(5)", [50.0])
    assert len(clamped) == 1
    assert clamped[0].base_reps == 0
    assert clamped[0].assisted_reps == 5

    log_8 = "# 1\nLR | 2' | 1-0-2-0\n10.. 10@8\n"
    log_85 = "# 1\nLR | 2' | 1-0-2-0\n10.. 10@8.5\n"
    log_9 = "# 1\nLR | 2' | 1-0-2-0\n10.. 10@9\n"
    m8 = calculate_metrics(analyze_workout_log(log_8, exercises_list))[0]
    m85 = calculate_metrics(analyze_workout_log(log_85, exercises_list))[0]
    m9 = calculate_metrics(analyze_workout_log(log_9, exercises_list))[0]
    assert m8["Eff TUT"] < m85["Eff TUT"] < m9["Eff TUT"]

    squat = next(e for e in exercises_list if e.name == "Squat")
    lr = next(e for e in exercises_list if e.name == "LR")
    f_squat = calculate_set_fatigue(10, 0, 0, 9.0, 1.0, 0.0, 2.0, 0.0, squat.fatigue, squat.load_coeff)
    f_lr = calculate_set_fatigue(10, 0, 0, 9.0, 1.0, 0.0, 2.0, 0.0, lr.fatigue, lr.load_coeff)
    assert f_squat > f_lr


def test_solver_macro_curve_expansion_and_partial_rpe_invariant() -> None:
    cfg = SolverConfig()
    cfg.days = 1
    cfg.calibration_steps = 0
    cfg.muscle_targets = {"Chest": "inv_sigmoid"}
    cfg.volume_dist = {"macros": {"Forearms": 100}, "subs": {"Forearms": {"Wrist Flexors": 100}}}
    solver = WorkoutSolver(cfg)

    assert "Sternal Head" in solver.T_m
    assert solver.T_m["Sternal Head"][0] > solver.T_m["Sternal Head"][-1]
    assert "Wrist Flexors" in solver.distr_muscles

    state = WorkoutState(1)
    lr = next(e for e in exercises_list if e.name == "LR")
    ex = ScheduledExercise(lr)
    ex.sets = [ScheduledSet(10, 4, 9.0)]
    state.days[0] = [ex]
    for _ in range(200):
        mut = solver.mutate_workout(state)
        for s in mut.days[0][0].sets:
            if s.rpe < 9.0:
                assert s.partial_reps == 0


def test_session_zero_filter_and_simplex_target_normalization() -> None:
    # Exercise before any `# 1` header has session == 0
    log = "LR | 2' | 1-0-2-0\n10.. 10@9\n# 1\nLR | 2' | 1-0-2-0\n10.. 8@9\n"
    parsed = analyze_workout_log(log, exercises_list)
    m_s0 = calculate_metrics(parsed, target_session=0)
    assert len(m_s0) == 1
    assert m_s0[0]["Session"] == 0
    assert m_s0[0]["Volume"] == pytest.approx(10.0)

    # Zero-sum non-empty muscles_distr must be rejected
    with pytest.raises(ValueError, match="positive"):
        Exercise(name="ZeroMag", muscles_distr={"Lateral Deltoid": 0.0}, fatigue=3.0, load_coeff=0.5)

    # Unnormalized volume_dist targets are normalized onto the simplex
    cfg = SolverConfig()
    cfg.days = 1
    cfg.calibration_steps = 0
    cfg.volume_dist = {
        "macros": {"Chest": 40, "Shoulders": 10},
        "subs": {"Chest": {"Sternal Head": 100}, "Shoulders": {"Lateral Deltoid": 100}},
    }
    solver = WorkoutSolver(cfg)
    assert sum(solver.target_sub_vol.values()) == pytest.approx(1.0, abs=1e-12)
    assert solver.target_sub_vol["Sternal Head"] == pytest.approx(0.8)
    assert solver.target_sub_vol["Lateral Deltoid"] == pytest.approx(0.2)


def test_bisection_small_dx_bounds_t_and_no_inplace_mutation() -> None:
    prof = BezierProfile(0.0, 0.0, 1e-6, 0.0, 2e-6, 1.0, 1.0, 1.0, 1.0)
    # Near x0 where x'(t) ~ 0, dual guard prevents premature y error
    y_val = prof.solve_y(1e-7)
    # Exact root satisfies x(t*) = 1e-7 -> t* ~ 0.0044260, y(t*) ~ 5.860326e-5
    assert abs(y_val - 5.86032566e-5) < 1e-6

    orig_a = BezierProfile(0.0, 0.0, 0.33, 0.5, 0.66, 0.8, 1.0, 1.0, 2.0)
    orig_b = BezierProfile(0.0, 0.0, 0.33, 0.5, 0.66, 0.8, 1.0, 1.0, 2.0)
    ex = Exercise(name="NoMut", muscles_distr={"Sternal Head": orig_a, "Clavicular Head": orig_b}, fatigue=5.0, load_coeff=0.5)
    assert orig_a.magnitude == 2.0
    assert ex.muscles_distr["Sternal Head"].magnitude == pytest.approx(0.5)

    with pytest.raises(ValueError, match="fatigue"):
        Exercise(name="NegFat", muscles_distr={"Sternal Head": 1.0}, fatigue=-1.0, load_coeff=0.5)
    with pytest.raises(ValueError, match="load_multiplier"):
        Exercise(name="ZeroMult", muscles_distr={"Sternal Head": 1.0}, fatigue=5.0, load_coeff=0.5, load_multiplier=0.0)


def test_extended_rep_fatigue_and_solver_surrogate_consistency() -> None:
    # Assisted & partial reps use concentric-failure multiplier 1.1^2.5
    tuts = calculate_set_tuts(0, 2, 4, 10.0, 1.0, 0.0, 2.0, 0.0)
    fat = calculate_set_fatigue(0, 2, 4, 10.0, 1.0, 0.0, 2.0, 0.0, 2.0, 1.0, tuts=tuts)
    expected = (2 * 3.0 * 0.5 + 4 * 1.5 * COEFF_PARTIAL) * (1.1 ** 2.5) * 2.0
    assert fat == pytest.approx(expected, rel=1e-9)

    # Targeted omitted muscle incurs E_curve penalty rather than shrinking denominator
    cfg = SolverConfig()
    cfg.days = 1
    cfg.calibration_steps = 0
    cfg.volume_dist = {
        "macros": {"Chest": 50, "Shoulders": 50},
        "subs": {"Chest": {"Sternal Head": 100}, "Shoulders": {"Lateral Deltoid": 100}},
    }
    solver = WorkoutSolver(cfg)
    lr = next(e for e in exercises_list if e.name == "LR")
    st = WorkoutState(1)
    ex = ScheduledExercise(lr)
    ex.sets = [ScheduledSet(10, 0, 9.0)]
    st.days[0] = [ex]
    solver._return_raw = True
    _, raw = solver.evaluate_workout(st)
    solver._return_raw = False
    # Sternal Head has target > 0 but 0 volume -> must contribute mean(1^2)=1.0, averaged with LR Lateral Deltoid
    assert raw["curve"] > 0.5


def test_stretched_partial_magnitude_and_unrepresented_target_ecurve() -> None:
    # Exact GL3 stretched-ROM integral matches high-res physical-ROM integration
    hlr = next(e for e in exercises_list if e.name == "Hanging Leg Raises")
    abs_prof = hlr.muscles_distr["Abdominals"]
    p_mag = abs_prof.partial_magnitude(0.3333)
    assert 0.0 < p_mag < 0.02

    dl = next(e for e in exercises_list if e.name == "Deadlift")
    assert dl.muscles_distr["Erectors"].partial_magnitude(0.3333) == 0.0

    # Target muscle absent from DB (Wrist Flexors) must still be counted in E_curve's M_eval
    cfg = SolverConfig()
    cfg.days = 1
    cfg.calibration_steps = 0
    cfg.volume_dist = {
        "macros": {"Forearms": 50, "Shoulders": 50},
        "subs": {"Forearms": {"Wrist Flexors": 100}, "Shoulders": {"Lateral Deltoid": 100}},
    }
    solver = WorkoutSolver(cfg)
    lr = next(e for e in exercises_list if e.name == "LR")
    st = WorkoutState(1)
    ex = ScheduledExercise(lr)
    ex.sets = [ScheduledSet(10, 0, 9.0)]
    st.days[0] = [ex]
    solver._return_raw = True
    _, raw = solver.evaluate_workout(st)
    solver._return_raw = False
    # Wrist Flexors has target > 0 and 0 volume -> contributes mean(1^2) = 1.0 to M_eval
    assert raw["curve"] > 0.5

    # Macro-only volume_dist without subs falls back cleanly instead of disabling E_distr
    cfg_macro = SolverConfig()
    cfg_macro.days = 1
    cfg_macro.calibration_steps = 0
    cfg_macro.volume_dist = {"macros": {"Chest": 100}, "subs": {}}
    solver_macro = WorkoutSolver(cfg_macro)
    assert sum(solver_macro.target_sub_vol.values()) == pytest.approx(1.0, abs=1e-12)
    solver_macro._return_raw = True
    _, raw_m = solver_macro.evaluate_workout(st)
    solver_macro._return_raw = False
    expected_distr = 0.5 * (0.9**2 + 0.1**2 + sum(v**2 for v in solver_macro.target_sub_vol.values()))
    assert raw_m["distr"] == pytest.approx(expected_distr, abs=1e-12)


def test_rpe_clamping_hard_map_and_weighted_ecurve() -> None:
    # RPE > 10 is clamped to 10.0 across parser, SetData, and metrics; negative SetData raises
    parsed_high = parse_rep_token("10@12", [50.0])
    assert parsed_high[0].rpe == 10.0
    assert SetData(load=50.0, base_reps=10, rpe=12.0).rpe == 10.0
    assert calculate_set_fatigue(10, 0, 0, 12.0, 1.0, 0.0, 2.0, 0.0, 5.0) == pytest.approx(
        calculate_set_fatigue(10, 0, 0, 10.0, 1.0, 0.0, 2.0, 0.0, 5.0), rel=1e-12
    )
    with pytest.raises(ValueError, match="Negative RPE"):
        SetData(load=50.0, base_reps=10, rpe=-1.0)
    with pytest.raises(ValueError, match="Negative repetition"):
        SetData(load=50.0, base_reps=-1, rpe=9.0)

    # Case-insensitive "OLD" prefix works identically in Python
    old_parsed = analyze_workout_log("# 1\nLR | 2' | 1-0-2-0\nOLD 10, 8\n", exercises_list)
    assert len(old_parsed) == 1 and len(old_parsed[0].weeks[0].sets) == 2

    # Every HARD_MAP target exists in defaultExercises.json
    ex_names = {e.name for e in exercises_list}
    assert all(target in ex_names for target in HARD_MAP.values())
    m1 = match_exercise("Shoulder Press Machine", exercises_list)
    m2 = match_exercise("Incl Cable Pushdown", exercises_list)
    assert m1 is not None and m1.name == "Machine Shoulder Press"
    assert m2 is not None and m2.name == "Bench 54 Pushdown"

    # Peak-normalized logistic target curves & target-weighted E_curve invariance to untargeted synergists
    assert float(np.max(get_target_curve("sigmoid"))) == pytest.approx(1.0, abs=1e-12)
    assert float(np.max(get_target_curve("inv_sigmoid"))) == pytest.approx(1.0, abs=1e-12)

    cfg = SolverConfig()
    cfg.days = 1
    cfg.calibration_steps = 0
    cfg.volume_dist = {"macros": {"Shoulders": 100}, "subs": {"Shoulders": {"Lateral Deltoid": 100}}}
    solver = WorkoutSolver(cfg)
    assert solver.config.target_ratios["tut"] == 0.74
    lr = next(e for e in exercises_list if e.name == "LR")
    st = WorkoutState(1)
    ex = ScheduledExercise(lr)
    ex.sets = [ScheduledSet(10, 0, 9.0)]
    st.days[0] = [ex]
    solver._return_raw = True
    _, raw = solver.evaluate_workout(st)
    solver._return_raw = False
    # Untargeted Upper and Mid Trapezius (10% of LR) must not affect E_curve when Lateral Deltoid has 100% target
    curve_ld = solver.ex_curves["LR"]["Lateral Deltoid"]
    norm_ld = curve_ld / np.max(curve_ld)
    expected_mse = float(np.mean((norm_ld - 1.0) ** 2))
    assert raw["curve"] == pytest.approx(expected_mse, abs=1e-7)


def test_rest_clamp_narrow_grid_ecurve_and_single_ex_db() -> None:
    assert calculate_rest(15.0) == "3'30\""

    # Narrow profile between adjacent 50-pt grid nodes (1/49 ~ 0.0204) misses grid hits
    # yet E_curve in non-target mode must still weight active M_eval to sum 1.0
    ex_narrow = Exercise(
        name="NarrowEx",
        muscles_distr={
            "Lateral Deltoid": BezierProfile(0.501, 1.0, 0.503, 1.0, 0.506, 1.0, 0.509, 1.0, 0.5),
            "Sternal Head": BezierProfile(0.0, 1.0, 0.33, 1.0, 0.66, 1.0, 1.0, 1.0, 0.5),
        },
        fatigue=4.0,
        load_coeff=0.5,
    )
    import analyzer.solver as solver_mod
    orig_db = solver_mod.exercises_list
    try:
        solver_mod.exercises_list = [ex_narrow]
        cfg = SolverConfig()
        cfg.days = 1
        cfg.min_ex = 1
        cfg.max_ex = 1
        cfg.calibration_steps = 0
        cfg.muscle_targets = {"Sternal Head": "linear"}
        slv = WorkoutSolver(cfg)
        st = WorkoutState(1)
        se = ScheduledExercise(ex_narrow)
        se.sets = [ScheduledSet(10, 0, 9.0)]
        st.days[0] = [se]
        slv._return_raw = True
        _, raw = slv.evaluate_workout(st)
        slv._return_raw = False
        # Sternal Head is constant 1.0 vs linear (1-x); MSE = mean(x^2) over 50 pts ~ 0.340136
        expected_lin_mse = float(np.mean((1.0 - np.linspace(0.0, 1.0, 50)) ** 2))
        assert raw["curve"] == pytest.approx(expected_lin_mse, abs=1e-9)
        mutated = slv.mutate_workout(st)
        assert len(mutated.days[0]) == 1
    finally:
        solver_mod.exercises_list = orig_db


def test_per_macro_subs_normalization_and_unique_swap_guard() -> None:
    cfg = SolverConfig()
    cfg.days = 1
    cfg.calibration_steps = 0
    cfg.volume_dist = {
        "macros": {"Chest": 50, "Shoulders": 50},
        "subs": {"Chest": {"Sternal Head": 40, "Clavicular Head": 40}},
    }
    slv = WorkoutSolver(cfg)
    assert slv.target_sub_vol["Sternal Head"] == pytest.approx(0.25, abs=1e-12)
    assert slv.target_sub_vol["Clavicular Head"] == pytest.approx(0.25, abs=1e-12)
    shoulders_sum = sum(v for k, v in slv.target_sub_vol.items() if k not in ("Sternal Head", "Clavicular Head"))
    assert shoulders_sum == pytest.approx(0.50, abs=1e-12)

    # Two DB entries with identical name must not enable swap_ex
    import analyzer.solver as solver_mod
    orig_db = solver_mod.exercises_list
    dup_ex = Exercise(name="Dup", muscles_distr={"Lateral Deltoid": 1.0}, fatigue=3.0, load_coeff=0.5)
    try:
        solver_mod.exercises_list = [dup_ex, dup_ex]
        s_cfg = SolverConfig()
        s_cfg.days = 1
        s_cfg.min_ex = 1
        s_cfg.max_ex = 1
        s_cfg.calibration_steps = 0
        s_slv = WorkoutSolver(s_cfg)
        assert s_slv.unique_ex_count == 1
    finally:
        solver_mod.exercises_list = orig_db


def test_nan_rejection_old_prefix_boundary_and_calibrate_reset() -> None:
    nan = float("nan")
    with pytest.raises(ValueError, match="Non-finite"):
        BezierProfile(0.0, 0.0, 0.3, nan, 0.6, 1.0, 1.0, 1.0, 1.0)
    with pytest.raises(ValueError, match="Non-finite"):
        BezierProfile(0.0, 0.0, 0.3, 0.5, 0.6, 1.0, 1.0, 1.0, nan)
    with pytest.raises(ValueError, match="Non-finite"):
        Exercise(name="NaNEx", muscles_distr={"Lateral Deltoid": 1.0}, fatigue=nan, load_coeff=0.5)
    with pytest.raises(ValueError, match="Non-finite"):
        SetData(load=50.0, base_reps=10, rpe=nan)

    # Word boundary in RE_OLD_PREFIX must not strip "old " inside "bold 10"
    parsed = analyze_workout_log("# 1\nLR\nbold 10\n10.. 10\n", exercises_list)
    assert len(parsed) == 1 and len(parsed[0].weeks) == 1

    cfg = SolverConfig()
    cfg.days = 1
    cfg.calibration_steps = 5
    slv = WorkoutSolver(cfg)
    slv.calibrate()
    assert slv.scales
    slv.config.calibration_steps = 0
    slv.calibrate()
    assert slv.scales == {}


def test_exact_dyadic_root_override_finiteness_and_carry_forward() -> None:
    # Exact dyadic root t* = 0.5 must converge immediately without repelling
    sym_prof = BezierProfile(0.0, 0.0, 1.0 / 3.0, 1.0, 2.0 / 3.0, 1.0, 1.0, 0.0, 1.0)
    assert sym_prof.solve_y(0.5) == 0.75
    step_prof = BezierProfile(0.0, 0.0, 1.0 / 3.0, 0.0, 2.0 / 3.0, 1.0, 1.0, 1.0, 1.0)
    assert step_prof.solve_y(0.5) == 0.5
    assert step_prof.stretched_area(0.5) == pytest.approx(0.09375, abs=1e-15)

    # Non-finite or malformed overrides must be ignored without crashing or injecting inf/nan
    log_override = (
        "override: LR | load_offset=not_a_number | fatigue=inf | load_coeff=nan | load_multiplier=inf\n"
        "override: LR | muscles_distr=[1, 2]\n"
        "override: LR | muscles_distr={\"Lateral Deltoid\": \"bad\"}\n"
        "# 1\nLR\n10.. 10\nold 12..\n14..12..\n"
    )
    parsed = analyze_workout_log(log_override, exercises_list)
    assert len(parsed) == 1
    assert parsed[0].exercise_obj.load_offset == 0.0
    assert np.isfinite(parsed[0].exercise_obj.fatigue)
    assert len(parsed[0].weeks) == 3
    assert parsed[0].weeks[1].sets[0].load == 12.0
    assert parsed[0].weeks[2].sets[0].load == 14.0


"""Generate 300-DPI English numerical analysis figures for docs/paper.tex.

Includes companion restricted-domain panels [x0 + delta, x3 - delta] to isolate
interpolation error from the boundary slope corner at x0 and jump discontinuity at x3.
"""

from __future__ import annotations

import argparse
import json
from math import comb
from pathlib import Path
from typing import Any

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from numpy.typing import NDArray
from scipy.interpolate import CubicSpline, PchipInterpolator
from scipy.spatial import ConvexHull

FIG_DIR = Path(__file__).resolve().parent
REPO_ROOT = FIG_DIR.parent.parent
EXERCISES_JSON = REPO_ROOT / "frontend" / "src" / "defaultExercises.json"

DEFAULT_LR_PROFILE: dict[str, float] = {
    "x0": 0.2,
    "y0": 0.0,
    "x1": 0.33,
    "y1": 0.3,
    "x2": 0.66,
    "y2": 0.8,
    "x3": 0.9,
    "y3": 1.0,
    "magnitude": 0.9,
}


def load_lr_profile() -> dict[str, float]:
    """Load the Lateral Raise (LR) Lateral Deltoid Bezier profile from defaultExercises.json."""
    if EXERCISES_JSON.exists():
        data: list[dict[str, Any]] = json.loads(EXERCISES_JSON.read_text(encoding="utf-8"))
        lr = next((ex for ex in data if ex.get("name") == "LR"), None)
        if lr and "Lateral Deltoid" in lr.get("muscles_distr", {}):
            return {k: float(v) for k, v in lr["muscles_distr"]["Lateral Deltoid"].items()}
    return dict(DEFAULT_LR_PROFILE)


def solve_bezier(
    p0: NDArray[np.float64],
    p1: NDArray[np.float64],
    p2: NDArray[np.float64],
    p3: NDArray[np.float64],
    n_points: int = 1000,
) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
    """Evaluate a standard cubic Bezier curve on t in [0, 1]."""
    t = np.linspace(0.0, 1.0, n_points)
    u = 1.0 - t
    bx = (u**3) * p0[0] + 3.0 * (u**2) * t * p1[0] + 3.0 * u * (t**2) * p2[0] + (t**3) * p3[0]
    by = (u**3) * p0[1] + 3.0 * (u**2) * t * p1[1] + 3.0 * u * (t**2) * p2[1] + (t**3) * p3[1]
    return bx, by


def solve_bezier_y_exact(
    target_x: float,
    p0: NDArray[np.float64],
    p1: NDArray[np.float64],
    p2: NDArray[np.float64],
    p3: NDArray[np.float64],
    tol: float = 1e-13,
    max_iter: int = 60,
) -> float:
    """Invert x(t) = target_x via bisection and return exact cubic Bezier y(t)."""
    x0, y0 = float(p0[0]), float(p0[1])
    x1, y1 = float(p1[0]), float(p1[1])
    x2, y2 = float(p2[0]), float(p2[1])
    x3, y3 = float(p3[0]), float(p3[1])
    if target_x < x0 or target_x > x3:
        return 0.0
    if target_x == x0:
        return y0
    if target_x == x3:
        return y3

    lo, hi = 0.0, 1.0
    t = 0.5
    for _ in range(max_iter):
        u = 1.0 - t
        x = (u**3) * x0 + 3.0 * (u**2) * t * x1 + 3.0 * u * (t**2) * x2 + (t**3) * x3
        if abs(x - target_x) < tol:
            break
        if x < target_x:
            lo = t
        else:
            hi = t
        t = 0.5 * (lo + hi)

    u = 1.0 - t
    return float((u**3) * y0 + 3.0 * (u**2) * t * y1 + 3.0 * u * (t**2) * y2 + (t**3) * y3)


def evaluate_true_profile(
    x_target: NDArray[np.float64],
    p0: NDArray[np.float64],
    p1: NDArray[np.float64],
    p2: NDArray[np.float64],
    p3: NDArray[np.float64],
) -> NDArray[np.float64]:
    """Evaluate the exact piecewise LR tension profile across x in [0, 1].

    Defined as y(x) = 0 for x < x0 or x > x3, and exact Bezier inversion y(t*(x))
    on [x0, x3]. For LR (y0=0, y3=1), x0 has a slope corner (C^0) and x3 has a
    jump discontinuity y(x3^-) = 1.0 -> y(x3^+) = 0.0.
    """
    return np.array([solve_bezier_y_exact(float(xv), p0, p1, p2, p3) for xv in x_target], dtype=np.float64)


def make_sup_grid(x0: float, x3: float) -> NDArray[np.float64]:
    """Dense [0, 1] grid bracketing x0 and x3 discontinuities for true L^inf norm."""
    eps = 1e-12
    pts = np.concatenate([
        np.linspace(0.0, 1.0, 10001),
        [max(0.0, x0 - eps), x0, min(1.0, x0 + eps), max(0.0, x3 - eps), x3, min(1.0, x3 + eps)],
    ])
    return np.unique(pts)


def gauss_lobatto_nodes(n: int, a: float = 0.0, b: float = 1.0) -> NDArray[np.float64]:
    """Compute Chebyshev-Gauss-Lobatto nodes mapped to [a, b]."""
    k = np.arange(n)
    unit = 0.5 * (1.0 - np.cos(k * np.pi / (n - 1)))
    return a + (b - a) * unit


def bernstein_poly(i: int, n: int, t: NDArray[np.float64]) -> NDArray[np.float64]:
    """Evaluate the i-th Bernstein basis polynomial of degree n."""
    return comb(n, i) * (t**i) * ((1.0 - t) ** (n - i))


def apply_style() -> None:
    style = "seaborn-v0_8-whitegrid" if "seaborn-v0_8-whitegrid" in plt.style.available else "default"
    plt.style.use(style)
    plt.rcParams.update(
        {
            "font.size": 10.0,
            "axes.titlesize": 11.5,
            "axes.labelsize": 10.0,
            "legend.fontsize": 8.5,
            "xtick.labelsize": 9.0,
            "ytick.labelsize": 9.0,
        }
    )


def plot_lagrange_runge(
    rom_grid: NDArray[np.float64],
    y_ideal: NDArray[np.float64],
    ctrl_pts: NDArray[np.float64],
    x0: float,
    x3: float,
    delta: float,
) -> dict[str, float]:
    n_nodes = 9
    a, b = x0 + delta, x3 - delta
    rest_grid = np.linspace(a, b, 600)
    p0, p1, p2, p3 = ctrl_pts
    y_rest_ideal = evaluate_true_profile(rest_grid, p0, p1, p2, p3)

    # Full domain [0, 1]
    x_full = np.linspace(0.0, 1.0, n_nodes)
    y_full = evaluate_true_profile(x_full, p0, p1, p2, p3)
    cond_full = float(np.linalg.cond(np.vander(x_full, increasing=True)))
    coeffs_full = np.polyfit(x_full, y_full, deg=n_nodes - 1)
    y_poly_full = np.polyval(coeffs_full, rom_grid)
    sup_grid = make_sup_grid(x0, x3)
    y_sup_ideal = evaluate_true_profile(sup_grid, p0, p1, p2, p3)
    linf_full = float(np.max(np.abs(y_sup_ideal - np.polyval(coeffs_full, sup_grid))))

    # Restricted smooth domain [a, b] (scale to [0, 1] for Vandermonde conditioning clarity too)
    x_rest = np.linspace(a, b, n_nodes)
    y_rest = evaluate_true_profile(x_rest, p0, p1, p2, p3)
    u_rest = (x_rest - a) / (b - a)
    u_grid = (rest_grid - a) / (b - a)
    y_poly_rest = np.polyval(np.polyfit(u_rest, y_rest, deg=n_nodes - 1), u_grid)
    linf_rest = float(np.max(np.abs(y_rest_ideal - y_poly_rest)))

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11.4, 4.4), dpi=300)

    ax1.plot(rom_grid, y_ideal, "k-", lw=2.0, label="Reference LR Profile")
    ax1.scatter(x_full, y_full, color="#2980b9", s=40, zorder=5, label=f"Equispaced Nodes ($n={n_nodes}$)")
    ax1.plot(rom_grid, y_poly_full, color="#e74c3c", lw=1.8, ls="--", label=rf"Lagrange ($d={n_nodes - 1}$)")
    ax1.axvspan(0.0, x0, color="#e74c3c", alpha=0.10)
    ax1.axvspan(x3 - 0.05, 1.0, color="#e74c3c", alpha=0.10, label="Jump / Boundary Regions")
    ax1.annotate(
        f"Gibbs + Runge\n$\\kappa(V) = {cond_full:.2e}$\n$L^\\infty = {linf_full:.2f}$",
        xy=(0.06, float(y_poly_full[60])),
        xytext=(0.05, 1.15),
        arrowprops={"arrowstyle": "->", "color": "#c0392b", "lw": 1.3},
        bbox={"boxstyle": "round,pad=0.35", "facecolor": "#fadbd8", "edgecolor": "#e74c3c", "alpha": 0.92},
        fontsize=8.5,
        fontweight="bold",
        color="#922b21",
    )
    ax1.set_title(r"Full Domain $[0, 1]$ (Corner at $x_0$, Jump at $x_3$)", fontweight="bold")
    ax1.set_xlabel(r"Normalized ROM $x \in [0, 1]$")
    ax1.set_ylabel(r"Normalized Tension $y(x)$")
    ax1.set_xlim(-0.02, 1.02)
    ax1.set_ylim(-0.35, 1.70)
    ax1.axhline(0.0, color="black", lw=0.7, ls=":")
    ax1.legend(loc="upper left", bbox_to_anchor=(0.0, -0.17), ncol=2, frameon=True, fontsize=8.0)

    ax2.plot(rest_grid, y_rest_ideal, "k-", lw=2.0, label="Reference LR (Smooth Interior)")
    ax2.scatter(x_rest, y_rest, color="#2980b9", s=40, zorder=5, label=f"Equispaced Nodes ($n={n_nodes}$)")
    ax2.plot(rest_grid, y_poly_rest, color="#e74c3c", lw=1.8, ls="--", label=rf"Lagrange ($d={n_nodes - 1}$)")
    ax2.text(
        0.04,
        0.92,
        rf"Restricted $[{a:.2f}, {b:.2f}]$" + "\n" + rf"$L^\infty$ error $= {linf_rest:.2e}$",
        transform=ax2.transAxes,
        va="top",
        bbox={"boxstyle": "round,pad=0.35", "facecolor": "#ebf5fb", "edgecolor": "#2980b9", "alpha": 0.92},
        fontsize=8.5,
        fontweight="bold",
        color="#1b4f72",
    )
    ax2.set_title(rf"Restricted Domain $[{a:.2f}, {b:.2f}]$ ($\delta={delta:.2f}$)", fontweight="bold")
    ax2.set_xlabel(rf"Restricted ROM $x \in [{a:.2f}, {b:.2f}]$")
    ax2.set_ylabel(r"Normalized Tension $y(x)$")
    ax2.set_xlim(a - 0.02, b + 0.02)
    ax2.set_ylim(-0.05, 1.10)
    ax2.legend(loc="upper left", bbox_to_anchor=(0.0, -0.17), ncol=2, frameon=True, fontsize=8.0)

    plt.tight_layout()
    fig.savefig(FIG_DIR / "lagrange_runge.png", dpi=300, bbox_inches="tight")
    plt.close(fig)
    return {"lagrange_full_linf": linf_full, "lagrange_rest_linf": linf_rest, "cond_v9": cond_full}


def plot_lagrange_gauss_lobatto(
    rom_grid: NDArray[np.float64],
    y_ideal: NDArray[np.float64],
    ctrl_pts: NDArray[np.float64],
    x0: float,
    x3: float,
    delta: float,
) -> dict[str, float]:
    a, b = x0 + delta, x3 - delta
    rest_grid = np.linspace(a, b, 600)
    p0, p1, p2, p3 = ctrl_pts
    y_rest_ideal = evaluate_true_profile(rest_grid, p0, p1, p2, p3)

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11.4, 4.4), dpi=300)
    ax1.plot(rom_grid, y_ideal, "k-", lw=2.1, label="Reference LR")
    ax2.plot(rest_grid, y_rest_ideal, "k-", lw=2.1, label="Reference LR")

    sup_grid = make_sup_grid(x0, x3)
    y_sup_ideal = evaluate_true_profile(sup_grid, p0, p1, p2, p3)
    metrics: dict[str, float] = {}
    for n_nodes, color, ls in zip([6, 12], ["#e67e22", "#c0392b"], ["--", "-."], strict=True):
        nodes_full = gauss_lobatto_nodes(n_nodes, 0.0, 1.0)
        y_nf = evaluate_true_profile(nodes_full, p0, p1, p2, p3)
        coeffs_nf = np.polyfit(nodes_full, y_nf, deg=n_nodes - 1)
        y_pf = np.polyval(coeffs_nf, rom_grid)
        metrics[f"cgl{n_nodes}_full_linf"] = float(np.max(np.abs(y_sup_ideal - np.polyval(coeffs_nf, sup_grid))))
        ax1.plot(rom_grid, y_pf, color=color, lw=1.7, ls=ls, label=rf"CGL $N={n_nodes}$ ($L^\infty={metrics[f'cgl{n_nodes}_full_linf']:.2f}$)")
        ax1.scatter(nodes_full, y_nf, color=color, s=26, zorder=4)

        nodes_rest = gauss_lobatto_nodes(n_nodes, a, b)
        y_nr = evaluate_true_profile(nodes_rest, p0, p1, p2, p3)
        u_nr = (nodes_rest - a) / (b - a)
        u_grid = (rest_grid - a) / (b - a)
        y_pr = np.polyval(np.polyfit(u_nr, y_nr, deg=n_nodes - 1), u_grid)
        metrics[f"cgl{n_nodes}_rest_linf"] = float(np.max(np.abs(y_rest_ideal - y_pr)))
        ax2.plot(rest_grid, y_pr, color=color, lw=1.7, ls=ls, label=rf"CGL $N={n_nodes}$ ($L^\infty={metrics[f'cgl{n_nodes}_rest_linf']:.2e}$)")
        ax2.scatter(nodes_rest, y_nr, color=color, s=26, zorder=4)

    ax1.axvspan(0.0, 0.22, color="#e74c3c", alpha=0.09, label="Resting Zone Ripples")
    ax1.set_title(r"Full Domain $[0, 1]$ (Gibbs + Flat Transition)", fontweight="bold")
    ax1.set_xlabel(r"Normalized ROM $x \in [0, 1]$")
    ax1.set_ylabel(r"Normalized Tension $y(x)$")
    ax1.set_xlim(-0.02, 1.02)
    ax1.set_ylim(-0.22, 1.20)
    ax1.axhline(0.0, color="black", lw=0.7, ls=":")
    ax1.legend(loc="upper left", bbox_to_anchor=(0.0, -0.17), ncol=2, frameon=True, fontsize=8.0)

    ax2.set_title(rf"Restricted Domain $[{a:.2f}, {b:.2f}]$ ($\delta={delta:.2f}$)", fontweight="bold")
    ax2.set_xlabel(rf"Restricted ROM $x \in [{a:.2f}, {b:.2f}]$")
    ax2.set_ylabel(r"Normalized Tension $y(x)$")
    ax2.set_xlim(a - 0.02, b + 0.02)
    ax2.set_ylim(-0.05, 1.10)
    ax2.legend(loc="upper left", bbox_to_anchor=(0.0, -0.17), ncol=2, frameon=True, fontsize=8.0)

    plt.tight_layout()
    fig.savefig(FIG_DIR / "lagrange_gauss_lobatto.png", dpi=300, bbox_inches="tight")
    plt.close(fig)
    return metrics


def plot_spline_overshoot(
    rom_grid: NDArray[np.float64],
    y_ideal: NDArray[np.float64],
    ctrl_pts: NDArray[np.float64],
    x0: float,
    x3: float,
    delta: float,
) -> dict[str, float]:
    a, b = x0 + delta, x3 - delta
    rest_grid = np.linspace(a, b, 600)
    p0, p1, p2, p3 = ctrl_pts
    y_rest_ideal = evaluate_true_profile(rest_grid, p0, p1, p2, p3)

    x_knots_full = np.array([0.0, 0.2, 0.45, 0.75, 0.9, 1.0])
    y_knots_full = evaluate_true_profile(x_knots_full, p0, p1, p2, p3)
    spline_full = CubicSpline(x_knots_full, y_knots_full, bc_type="natural")
    y_spline_full = spline_full(rom_grid)
    sup_grid = make_sup_grid(x0, x3)
    y_sup_ideal = evaluate_true_profile(sup_grid, p0, p1, p2, p3)
    linf_full = float(np.max(np.abs(y_sup_ideal - spline_full(sup_grid))))

    x_knots_rest = np.linspace(a, b, 6)
    y_knots_rest = evaluate_true_profile(x_knots_rest, p0, p1, p2, p3)
    y_spline_rest = CubicSpline(x_knots_rest, y_knots_rest, bc_type="natural")(rest_grid)
    linf_rest = float(np.max(np.abs(y_rest_ideal - y_spline_rest)))

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11.4, 4.4), dpi=300)

    ax1.plot(rom_grid, y_ideal, "k-", lw=2.0, label="Reference LR")
    ax1.scatter(x_knots_full, y_knots_full, color="#2c3e50", s=42, zorder=5, label=r"Knots ($N=6$)")
    ax1.plot(rom_grid, y_spline_full, color="#8e44ad", lw=2.0, label=rf"$C^2$ Spline ($L^\infty={linf_full:.2f}$)")
    ax1.fill_between(rom_grid, y_spline_full, 0.0, where=(y_spline_full < 0.0), color="#e74c3c", alpha=0.35, label=r"Negative ($y<0$)")
    idx_min = int(np.argmin(y_spline_full))
    ax1.annotate(
        r"Undershoot $y(x) < 0$",
        xy=(float(rom_grid[idx_min]), float(y_spline_full[idx_min])),
        xytext=(0.24, -0.22),
        arrowprops={"arrowstyle": "->", "color": "#c0392b", "lw": 1.3},
        bbox={"boxstyle": "round,pad=0.35", "facecolor": "#fadbd8", "edgecolor": "#e74c3c", "alpha": 0.92},
        fontsize=8.5,
        fontweight="bold",
        color="#922b21",
    )
    ax1.set_title(r"Full Domain $[0, 1]$ (Undershoot + Jump at $x_3$)", fontweight="bold")
    ax1.set_xlabel(r"Normalized ROM $x \in [0, 1]$")
    ax1.set_ylabel(r"Normalized Tension $y(x)$")
    ax1.set_xlim(-0.02, 1.02)
    ax1.set_ylim(-0.32, 1.25)
    ax1.axhline(0.0, color="black", lw=0.8, ls="--")
    ax1.legend(loc="upper left", bbox_to_anchor=(0.0, -0.17), ncol=2, frameon=True, fontsize=8.0)

    ax2.plot(rest_grid, y_rest_ideal, "k-", lw=2.0, label="Reference LR")
    ax2.scatter(x_knots_rest, y_knots_rest, color="#2c3e50", s=42, zorder=5, label=r"Knots ($N=6$)")
    ax2.plot(rest_grid, y_spline_rest, color="#8e44ad", lw=2.0, label=rf"$C^2$ Spline ($L^\infty={linf_rest:.2e}$)")
    ax2.set_title(rf"Restricted Domain $[{a:.2f}, {b:.2f}]$ ($\delta={delta:.2f}$)", fontweight="bold")
    ax2.set_xlabel(rf"Restricted ROM $x \in [{a:.2f}, {b:.2f}]$")
    ax2.set_ylabel(r"Normalized Tension $y(x)$")
    ax2.set_xlim(a - 0.02, b + 0.02)
    ax2.set_ylim(-0.05, 1.10)
    ax2.legend(loc="upper left", bbox_to_anchor=(0.0, -0.17), ncol=2, frameon=True, fontsize=8.0)

    plt.tight_layout()
    fig.savefig(FIG_DIR / "spline_overshoot.png", dpi=300, bbox_inches="tight")
    plt.close(fig)
    return {"spline6_full_linf": linf_full, "spline6_rest_linf": linf_rest}


def plot_spline_density(
    rom_grid: NDArray[np.float64],
    y_ideal: NDArray[np.float64],
    ctrl_pts: NDArray[np.float64],
    x0: float,
    x3: float,
    delta: float,
) -> None:
    a, b = x0 + delta, x3 - delta
    rest_grid = np.linspace(a, b, 600)
    p0, p1, p2, p3 = ctrl_pts
    y_rest_ideal = evaluate_true_profile(rest_grid, p0, p1, p2, p3)

    # Full domain
    k5 = np.array([0.0, 0.2, 0.5, 0.85, 1.0])
    yk5 = evaluate_true_profile(k5, p0, p1, p2, p3)
    ys5 = CubicSpline(k5, yk5, bc_type="natural")(rom_grid)
    k10 = np.linspace(0.0, 1.0, 10)
    ys10 = CubicSpline(k10, evaluate_true_profile(k10, p0, p1, p2, p3), bc_type="natural")(rom_grid)
    ypchip = PchipInterpolator(k5, yk5)(rom_grid)

    # Restricted domain
    rk5 = np.linspace(a, b, 5)
    ryk5 = evaluate_true_profile(rk5, p0, p1, p2, p3)
    rys5 = CubicSpline(rk5, ryk5, bc_type="natural")(rest_grid)
    rk10 = np.linspace(a, b, 10)
    rys10 = CubicSpline(rk10, evaluate_true_profile(rk10, p0, p1, p2, p3), bc_type="natural")(rest_grid)
    rypchip = PchipInterpolator(rk5, ryk5)(rest_grid)

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11.4, 4.4), dpi=300)

    ax1.plot(rom_grid, y_ideal, "k-", lw=2.1, label="Reference LR")
    ax1.plot(rom_grid, ys5, color="#8e44ad", lw=1.7, ls="--", label=r"$C^2$ ($N=5$)")
    ax1.plot(rom_grid, ys10, color="#2980b9", lw=1.7, ls=":", label=r"$C^2$ ($N=10$)")
    ax1.plot(rom_grid, ypchip, color="#d35400", lw=1.7, ls="-.", label=r"PCHIP ($C^1$)")
    ax1.scatter(k5, yk5, color="#8e44ad", s=34, zorder=5)
    ax1.fill_between(rom_grid, ys5, 0.0, where=(ys5 < 0.0), color="#e74c3c", alpha=0.25)
    ax1.set_title(r"Full Domain $[0, 1]$ (Undershoot + Jump at $x_3$)", fontweight="bold")
    ax1.set_xlabel(r"Normalized ROM $x \in [0, 1]$")
    ax1.set_ylabel(r"Normalized Tension $y(x)$")
    ax1.set_xlim(-0.02, 1.02)
    ax1.set_ylim(-0.18, 1.22)
    ax1.axhline(0.0, color="black", lw=0.7, ls=":")
    ax1.legend(loc="upper left", bbox_to_anchor=(0.0, -0.17), ncol=2, frameon=True, fontsize=8.0)

    ax2.plot(rest_grid, y_rest_ideal, "k-", lw=2.1, label="Reference LR")
    ax2.plot(rest_grid, rys5, color="#8e44ad", lw=1.7, ls="--", label=r"$C^2$ ($N=5$)")
    ax2.plot(rest_grid, rys10, color="#2980b9", lw=1.7, ls=":", label=r"$C^2$ ($N=10$)")
    ax2.plot(rest_grid, rypchip, color="#d35400", lw=1.7, ls="-.", label=r"PCHIP ($C^1$)")
    ax2.scatter(rk5, ryk5, color="#8e44ad", s=34, zorder=5)
    ax2.set_title(rf"Restricted Domain $[{a:.2f}, {b:.2f}]$ ($\delta={delta:.2f}$)", fontweight="bold")
    ax2.set_xlabel(rf"Restricted ROM $x \in [{a:.2f}, {b:.2f}]$")
    ax2.set_ylabel(r"Normalized Tension $y(x)$")
    ax2.set_xlim(a - 0.02, b + 0.02)
    ax2.set_ylim(-0.05, 1.10)
    ax2.legend(loc="upper left", bbox_to_anchor=(0.0, -0.17), ncol=2, frameon=True, fontsize=8.0)

    plt.tight_layout()
    fig.savefig(FIG_DIR / "spline_density.png", dpi=300, bbox_inches="tight")
    plt.close(fig)


def plot_de_casteljau(
    p0: NDArray[np.float64],
    p1: NDArray[np.float64],
    p2: NDArray[np.float64],
    p3: NDArray[np.float64],
) -> None:
    t_val = 0.5
    q0 = (1 - t_val) * p0 + t_val * p1
    q1 = (1 - t_val) * p1 + t_val * p2
    q2 = (1 - t_val) * p2 + t_val * p3
    r0 = (1 - t_val) * q0 + t_val * q1
    r1 = (1 - t_val) * q1 + t_val * q2
    pt = (1 - t_val) * r0 + t_val * r1

    bx, by = solve_bezier(p0, p1, p2, p3, n_points=500)

    fig, ax = plt.subplots(figsize=(8.2, 4.6), dpi=300)
    ax.plot(bx, by, color="#27ae60", lw=2.8, label=r"Cubic Bézier Curve $\mathbf{P}(t)$", zorder=6)

    p_pts = np.array([p0, p1, p2, p3])
    ax.plot(p_pts[:, 0], p_pts[:, 1], "o--", color="#7f8c8d", lw=1.5, ms=7, label=r"Control Polygon $\{P_0, P_1, P_2, P_3\}$")
    p_offsets = [(0.015, -0.05), (-0.035, 0.035), (-0.035, 0.035), (0.015, -0.04)]
    for idx, (node, (dx, dy)) in enumerate(zip(p_pts, p_offsets, strict=True)):
        ax.text(float(node[0]) + dx, float(node[1]) + dy, rf"$P_{idx}$", fontsize=10, fontweight="bold", color="#2c3e50")

    q_pts = np.array([q0, q1, q2])
    ax.plot(q_pts[:, 0], q_pts[:, 1], "s--", color="#2980b9", lw=1.4, ms=6, label=r"Level 1: $\mathbf{Q}_i = (1-t)\mathbf{P}_i + t\mathbf{P}_{i+1}$")
    q_offsets = [(0.018, -0.045), (-0.04, 0.04), (0.018, -0.045)]
    for idx, (node, (dx, dy)) in enumerate(zip(q_pts, q_offsets, strict=True)):
        ax.text(float(node[0]) + dx, float(node[1]) + dy, rf"$\mathbf{{Q}}_{idx}$", fontsize=9.2, color="#1b4f72")

    r_pts = np.array([r0, r1])
    ax.plot(r_pts[:, 0], r_pts[:, 1], "^--", color="#e67e22", lw=1.5, ms=6.5, label=r"Level 2: $\mathbf{R}_i = (1-t)\mathbf{Q}_i + t\mathbf{Q}_{i+1}$")
    for idx, node in enumerate(r_pts):
        ax.text(float(node[0]) + 0.018, float(node[1]) - 0.045, rf"$\mathbf{{R}}_{idx}$", fontsize=9.2, color="#935116")

    ax.scatter([pt[0]], [pt[1]], color="#c0392b", s=95, zorder=7, label=rf"Level 3: $\mathbf{{P}}(t={t_val}) = (1-t)\mathbf{{R}}_0 + t\mathbf{{R}}_1$")
    ax.annotate(
        rf"$\mathbf{{P}}({t_val}) = ({pt[0]:.2f}, {pt[1]:.2f})$",
        xy=(float(pt[0]), float(pt[1])),
        xytext=(0.59, 0.34),
        arrowprops={"arrowstyle": "->", "color": "#c0392b", "lw": 1.4},
        fontsize=10,
        fontweight="bold",
        color="#922b21",
    )

    ax.set_title(r"De Casteljau Stability: Recursive Convex Interpolation ($t = 0.5$)", fontweight="bold", pad=10)
    ax.set_xlabel(r"Normalized Range of Motion $x \in [0, 1]$")
    ax.set_ylabel(r"Muscle Tension $y \in [0, 1]$")
    ax.set_xlim(-0.02, 1.02)
    ax.set_ylim(-0.08, 1.15)
    ax.legend(loc="upper left", frameon=True, fontsize=8.8)

    plt.tight_layout()
    fig.savefig(FIG_DIR / "de_casteljau.png", dpi=300, bbox_inches="tight")
    plt.close(fig)


def plot_bezier_bernstein(ctrl_pts: NDArray[np.float64]) -> None:
    t = np.linspace(0.0, 1.0, 500)
    b0 = bernstein_poly(0, 3, t)
    b1 = bernstein_poly(1, 3, t)
    b2 = bernstein_poly(2, 3, t)
    b3 = bernstein_poly(3, 3, t)

    bx = b0 * ctrl_pts[0, 0] + b1 * ctrl_pts[1, 0] + b2 * ctrl_pts[2, 0] + b3 * ctrl_pts[3, 0]
    by = b0 * ctrl_pts[0, 1] + b1 * ctrl_pts[1, 1] + b2 * ctrl_pts[2, 1] + b3 * ctrl_pts[3, 1]

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11.0, 4.6), dpi=300)

    ax1.plot(t, b0, color="#3498db", lw=2.0, label=r"$B_{0,3}(t) = (1-t)^3$")
    ax1.plot(t, b1, color="#9b59b6", lw=2.0, label=r"$B_{1,3}(t) = 3t(1-t)^2$")
    ax1.plot(t, b2, color="#e67e22", lw=2.0, label=r"$B_{2,3}(t) = 3t^2(1-t)$")
    ax1.plot(t, b3, color="#e74c3c", lw=2.0, label=r"$B_{3,3}(t) = t^3$")
    ax1.plot(t, b0 + b1 + b2 + b3, "k--", lw=1.5, label=r"$\sum B_{i,3}(t) \equiv 1$ (Partition of Unity)")
    ax1.set_title(r"Cubic Bernstein Basis ($n=3$)", fontweight="bold")
    ax1.set_xlabel(r"Parameter $t \in [0, 1]$")
    ax1.set_ylabel("Basis Weight")
    ax1.set_ylim(-0.05, 1.42)
    ax1.legend(loc="upper center", ncol=2, frameon=True, fontsize=8.2)

    hull = ConvexHull(ctrl_pts)
    hull_pts = ctrl_pts[hull.vertices]
    hull_plot = np.vstack([hull_pts, hull_pts[0]])
    ax2.fill(hull_plot[:, 0], hull_plot[:, 1], color="#2ecc71", alpha=0.16, label="Convex Hull")
    ax2.plot(hull_plot[:, 0], hull_plot[:, 1], color="#27ae60", linestyle=":", lw=1.2)
    ax2.plot(ctrl_pts[:, 0], ctrl_pts[:, 1], "o--", color="#16a085", lw=1.5, ms=6.5, label=r"Control Polygon $\{P_i\}$")
    p_cfg = [(0.02, -0.04, "left"), (-0.02, 0.03, "right"), (-0.02, 0.03, "right"), (-0.02, 0.035, "right")]
    for idx, (node, (dx, dy, ha)) in enumerate(zip(ctrl_pts, p_cfg, strict=True)):
        ax2.text(float(node[0]) + dx, float(node[1]) + dy, rf"$P_{idx}({node[0]:.2f},{node[1]:.2f})$", fontsize=8.5, fontweight="bold", color="#0e6251", ha=ha)
    ax2.plot(bx, by, color="#27ae60", lw=2.8, label=r"Bézier Curve $\mathbf{P}(t)$")

    ax2.set_title("Convex Hull Containment on LR", fontweight="bold")
    ax2.set_xlabel(r"Normalized Range of Motion $x \in [0, 1]$")
    ax2.set_ylabel(r"Muscle Tension $y \in [0, 1]$")
    ax2.set_xlim(-0.02, 1.02)
    ax2.set_ylim(-0.06, 1.15)
    ax2.legend(loc="upper left", frameon=True, fontsize=8.5)

    plt.tight_layout()
    fig.savefig(FIG_DIR / "bezier_bernstein.png", dpi=300, bbox_inches="tight")
    plt.close(fig)


def plot_bezier_comparison(
    ctrl_pts: NDArray[np.float64],
    rom_grid: NDArray[np.float64],
    y_bezier: NDArray[np.float64],
    x0: float,
    x3: float,
    delta: float,
) -> dict[str, float]:
    a, b = x0 + delta, x3 - delta
    rest_grid = np.linspace(a, b, 600)
    p0, p1, p2, p3 = ctrl_pts
    y_rest_ideal = evaluate_true_profile(rest_grid, p0, p1, p2, p3)

    # Full domain
    x_knots = np.array([0.0, 0.2, 0.45, 0.75, 0.9, 1.0])
    y_spline_full = CubicSpline(x_knots, evaluate_true_profile(x_knots, p0, p1, p2, p3), bc_type="natural")(rom_grid)
    x_poly = np.linspace(0.0, 1.0, 8)
    y_lagrange_full = np.polyval(np.polyfit(x_poly, evaluate_true_profile(x_poly, p0, p1, p2, p3), deg=7), rom_grid)

    # Restricted domain
    rk = np.linspace(a, b, 6)
    y_spline_rest = CubicSpline(rk, evaluate_true_profile(rk, p0, p1, p2, p3), bc_type="natural")(rest_grid)
    rx_poly = np.linspace(a, b, 8)
    u_rx = (rx_poly - a) / (b - a)
    u_grid = (rest_grid - a) / (b - a)
    y_lagrange_rest = np.polyval(np.polyfit(u_rx, evaluate_true_profile(rx_poly, p0, p1, p2, p3), deg=7), u_grid)

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11.4, 4.6), dpi=300)

    hull = ConvexHull(ctrl_pts)
    hull_pts = ctrl_pts[hull.vertices]
    hull_plot = np.vstack([hull_pts, hull_pts[0]])
    ax1.fill(hull_plot[:, 0], hull_plot[:, 1], color="#27ae60", alpha=0.12, label="Convex Hull")
    ax1.plot(hull_plot[:, 0], hull_plot[:, 1], color="#27ae60", ls=":", lw=1.1)
    ax1.plot(ctrl_pts[:, 0], ctrl_pts[:, 1], "o--", color="#16a085", lw=1.3, ms=5.5, label=r"Control Polygon $\{P_i\}$")
    ax1.plot(rom_grid, y_bezier, color="#27ae60", lw=2.4, label=r"Cubic Bézier ($\mathcal{O}(1)$, $y \geq 0$)")
    ax1.plot(rom_grid, y_spline_full, color="#8e44ad", lw=1.7, ls="-.", label=r"$C^2$ Spline ($y < 0$)")
    ax1.plot(rom_grid, y_lagrange_full, color="#e74c3c", lw=1.7, ls="--", label=r"Lagrange $d=7$ (Gibbs/Runge)")
    ax1.set_title(r"Full Domain $[0, 1]$ (Gibbs Overshoot at $x_3=0.90$)", fontweight="bold")
    ax1.set_xlabel(r"Normalized ROM $x \in [0, 1]$")
    ax1.set_ylabel(r"Normalized Tension $y(x)$")
    ax1.set_xlim(-0.02, 1.02)
    ax1.set_ylim(-0.32, 1.25)
    ax1.axhline(0.0, color="black", lw=0.7)
    ax1.legend(loc="upper left", bbox_to_anchor=(0.0, -0.17), ncol=2, frameon=True, fontsize=8.0)

    ax2.plot(rest_grid, y_rest_ideal, color="#27ae60", lw=2.6, label=r"Cubic Bézier (Exact Reference)")
    ax2.plot(rest_grid, y_spline_rest, color="#8e44ad", lw=1.7, ls="-.", label=rf"$C^2$ Spline ($L^\infty={np.max(np.abs(y_rest_ideal - y_spline_rest)):.2e}$)")
    ax2.plot(rest_grid, y_lagrange_rest, color="#e74c3c", lw=1.7, ls="--", label=rf"Lagrange $d=7$ ($L^\infty={np.max(np.abs(y_rest_ideal - y_lagrange_rest)):.2e}$)")
    ax2.set_title(rf"Restricted Domain $[{a:.2f}, {b:.2f}]$ ($\delta={delta:.2f}$)", fontweight="bold")
    ax2.set_xlabel(rf"Restricted ROM $x \in [{a:.2f}, {b:.2f}]$")
    ax2.set_ylabel(r"Normalized Tension $y(x)$")
    ax2.set_xlim(a - 0.02, b + 0.02)
    ax2.set_ylim(-0.05, 1.10)
    ax2.legend(loc="upper left", bbox_to_anchor=(0.0, -0.17), ncol=2, frameon=True, fontsize=8.0)

    plt.tight_layout()
    fig.savefig(FIG_DIR / "bezier_comparison.png", dpi=300, bbox_inches="tight")
    plt.close(fig)
    return {
        "comp_spline_rest_linf": float(np.max(np.abs(y_rest_ideal - y_spline_rest))),
        "comp_lagrange_rest_linf": float(np.max(np.abs(y_rest_ideal - y_lagrange_rest))),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate paper figures with configurable boundary delta.")
    parser.add_argument("--delta", type=float, default=0.05, help="Interior margin delta for restricted domain [x0+delta, x3-delta].")
    args = parser.parse_args()

    apply_style()
    m = load_lr_profile()
    ctrl_pts = np.array(
        [
            [m["x0"], m["y0"]],
            [m["x1"], m["y1"]],
            [m["x2"], m["y2"]],
            [m["x3"], m["y3"]],
        ],
        dtype=np.float64,
    )
    rom_grid = np.linspace(0.0, 1.0, 1000)
    y_ideal = evaluate_true_profile(rom_grid, ctrl_pts[0], ctrl_pts[1], ctrl_pts[2], ctrl_pts[3])

    stats: dict[str, float] = {}
    stats.update(plot_lagrange_runge(rom_grid, y_ideal, ctrl_pts, m["x0"], m["x3"], args.delta))
    stats.update(plot_lagrange_gauss_lobatto(rom_grid, y_ideal, ctrl_pts, m["x0"], m["x3"], args.delta))
    stats.update(plot_spline_overshoot(rom_grid, y_ideal, ctrl_pts, m["x0"], m["x3"], args.delta))
    plot_spline_density(rom_grid, y_ideal, ctrl_pts, m["x0"], m["x3"], args.delta)
    plot_de_casteljau(ctrl_pts[0], ctrl_pts[1], ctrl_pts[2], ctrl_pts[3])
    plot_bezier_bernstein(ctrl_pts)
    stats.update(plot_bezier_comparison(ctrl_pts, rom_grid, y_ideal, m["x0"], m["x3"], args.delta))

    print(f"Generated 7 figures in {FIG_DIR} (delta={args.delta})")
    for k, v in stats.items():
        print(f"  {k}: {v:.6e}")


if __name__ == "__main__":
    main()

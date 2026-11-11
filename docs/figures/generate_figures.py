"""Generate 300-DPI English numerical analysis figures for docs/paper.tex."""

from __future__ import annotations

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
    """Evaluate a cubic Bezier curve on [0, 1]."""
    t = np.linspace(0.0, 1.0, n_points)
    bx = (1 - t) ** 3 * p0[0] + 3 * (1 - t) ** 2 * t * p1[0] + 3 * (1 - t) * t**2 * p2[0] + t**3 * p3[0]
    by = (1 - t) ** 3 * p0[1] + 3 * (1 - t) ** 2 * t * p1[1] + 3 * (1 - t) * t**2 * p2[1] + t**3 * p3[1]
    return bx, by


def evaluate_true_profile(
    x_target: NDArray[np.float64],
    bx: NDArray[np.float64],
    by: NDArray[np.float64],
    x0: float,
    x3: float,
) -> NDArray[np.float64]:
    """Evaluate the ground-truth LR tension profile across ROM x in [0, 1]."""
    y_out = np.zeros_like(x_target)
    mask = (x_target >= x0) & (x_target <= x3)
    y_out[mask] = np.interp(x_target[mask], bx, by)
    return y_out


def gauss_lobatto_nodes(n: int) -> NDArray[np.float64]:
    """Compute Chebyshev-Gauss-Lobatto nodes mapped to [0, 1]."""
    k = np.arange(n)
    return 0.5 * (1.0 - np.cos(k * np.pi / (n - 1)))


def bernstein_poly(i: int, n: int, t: NDArray[np.float64]) -> NDArray[np.float64]:
    """Evaluate the i-th Bernstein basis polynomial of degree n."""
    return comb(n, i) * (t**i) * ((1.0 - t) ** (n - i))


def apply_style() -> None:
    style = "seaborn-v0_8-whitegrid" if "seaborn-v0_8-whitegrid" in plt.style.available else "default"
    plt.style.use(style)
    plt.rcParams.update(
        {
            "font.size": 10.5,
            "axes.titlesize": 12.5,
            "axes.labelsize": 11,
            "legend.fontsize": 9.5,
            "xtick.labelsize": 9.5,
            "ytick.labelsize": 9.5,
        }
    )


def plot_lagrange_runge(
    rom_grid: NDArray[np.float64],
    y_ideal: NDArray[np.float64],
    bx: NDArray[np.float64],
    by: NDArray[np.float64],
    x0: float,
    x3: float,
) -> None:
    n_nodes = 9
    x_nodes = np.linspace(0.0, 1.0, n_nodes)
    y_nodes = evaluate_true_profile(x_nodes, bx, by, x0, x3)

    vand = np.vander(x_nodes, increasing=True)
    cond_v = float(np.linalg.cond(vand))
    poly_coeffs = np.polyfit(x_nodes, y_nodes, deg=n_nodes - 1)
    y_poly = np.polyval(poly_coeffs, rom_grid)

    fig, ax = plt.subplots(figsize=(8.2, 4.6), dpi=300)
    ax.plot(rom_grid, y_ideal, "k-", linewidth=2.2, label="Reference LR Profile (Lateral Deltoid)")
    ax.scatter(x_nodes, y_nodes, color="#2980b9", s=55, zorder=5, label=f"Equispaced Nodes ($n={n_nodes}$)")
    ax.plot(
        rom_grid,
        y_poly,
        color="#e74c3c",
        linewidth=2.0,
        linestyle="--",
        label=rf"Lagrange Interpolant (degree $d={n_nodes - 1}$)",
    )
    ax.axvspan(0.0, 0.2, color="#e74c3c", alpha=0.12, label="Runge Boundary Regions")
    ax.axvspan(0.85, 1.0, color="#e74c3c", alpha=0.12)

    ax.annotate(
        f"Runge Phenomenon: boundary blow-up\n$\\kappa(V) = {cond_v:.2e}$",
        xy=(0.06, float(y_poly[60])),
        xytext=(0.05, 1.25),
        arrowprops={"arrowstyle": "->", "color": "#c0392b", "lw": 1.5},
        bbox={"boxstyle": "round,pad=0.45", "facecolor": "#fadbd8", "edgecolor": "#e74c3c", "alpha": 0.92},
        fontsize=9.5,
        fontweight="bold",
        color="#922b21",
    )

    ax.set_title("Lagrange Interpolation on Equispaced Nodes (Runge Phenomenon)", fontweight="bold", pad=10)
    ax.set_xlabel(r"Normalized Range of Motion ($t \in [0, 1]$)")
    ax.set_ylabel(r"Normalized Muscle Tension $y(t)$")
    ax.set_xlim(-0.02, 1.02)
    ax.set_ylim(-0.35, 1.75)
    ax.axhline(0.0, color="black", linewidth=0.8, linestyle=":")
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.15), ncol=2, frameon=True)

    plt.tight_layout()
    fig.savefig(FIG_DIR / "lagrange_runge.png", dpi=300, bbox_inches="tight")
    plt.close(fig)


def plot_lagrange_gauss_lobatto(
    rom_grid: NDArray[np.float64],
    y_ideal: NDArray[np.float64],
    bx: NDArray[np.float64],
    by: NDArray[np.float64],
    x0: float,
    x3: float,
) -> None:
    fig, ax = plt.subplots(figsize=(8.2, 4.6), dpi=300)
    ax.plot(rom_grid, y_ideal, "k-", linewidth=2.3, label="Reference LR Profile (Lateral Deltoid)")

    for n_nodes, color, ls in zip([6, 12], ["#e67e22", "#c0392b"], ["--", "-."], strict=True):
        nodes = gauss_lobatto_nodes(n_nodes)
        y_nodes = evaluate_true_profile(nodes, bx, by, x0, x3)
        poly_coeffs = np.polyfit(nodes, y_nodes, deg=n_nodes - 1)
        y_poly = np.polyval(poly_coeffs, rom_grid)
        ax.plot(
            rom_grid,
            y_poly,
            color=color,
            linewidth=1.8,
            linestyle=ls,
            label=rf"Gauss-Lobatto ($N={n_nodes}$ nodes, degree $d={n_nodes - 1}$)",
        )
        ax.scatter(nodes, y_nodes, color=color, s=35, zorder=4)

    ax.axvspan(0.0, 0.22, color="#e74c3c", alpha=0.10, label=r"Resting Zone ($t \in [0, 0.2]$): spurious ripples")
    ax.annotate(
        "Residual oscillations & $y(t) < 0$\nRequires $\\geq 12$ nodes yet still violates positivity",
        xy=(0.10, -0.05),
        xytext=(0.04, 0.50),
        arrowprops={"arrowstyle": "->", "color": "#c0392b", "lw": 1.5},
        bbox={"boxstyle": "round,pad=0.45", "facecolor": "#fef5e7", "edgecolor": "#e67e22", "alpha": 0.92},
        fontsize=9.5,
        fontweight="bold",
        color="#935116",
    )

    ax.set_title("Chebyshev-Gauss-Lobatto Polynomial Interpolation on LR", fontweight="bold", pad=10)
    ax.set_xlabel(r"Normalized Range of Motion ($t \in [0, 1]$)")
    ax.set_ylabel(r"Normalized Muscle Tension $y(t)$")
    ax.set_xlim(-0.02, 1.02)
    ax.set_ylim(-0.22, 1.22)
    ax.axhline(0.0, color="black", linewidth=0.8, linestyle=":")
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.15), ncol=2, frameon=True)

    plt.tight_layout()
    fig.savefig(FIG_DIR / "lagrange_gauss_lobatto.png", dpi=300, bbox_inches="tight")
    plt.close(fig)


def plot_spline_overshoot(
    rom_grid: NDArray[np.float64],
    y_ideal: NDArray[np.float64],
    bx: NDArray[np.float64],
    by: NDArray[np.float64],
    x0: float,
    x3: float,
) -> None:
    x_knots = np.array([0.0, 0.2, 0.45, 0.75, 0.9, 1.0])
    y_knots = evaluate_true_profile(x_knots, bx, by, x0, x3)
    cs = CubicSpline(x_knots, y_knots, bc_type="natural")
    y_spline = cs(rom_grid)

    fig, ax = plt.subplots(figsize=(8.2, 4.6), dpi=300)
    ax.plot(rom_grid, y_ideal, "k-", linewidth=2.2, label="Reference LR Profile (Lateral Deltoid)")
    ax.scatter(x_knots, y_knots, color="#2c3e50", s=55, zorder=5, label=r"Spline Knots ($N=6$)")
    ax.plot(
        rom_grid,
        y_spline,
        color="#8e44ad",
        linewidth=2.2,
        label=r"Natural $C^2$ Cubic Spline (Thomas Solver)",
    )
    ax.fill_between(
        rom_grid,
        y_spline,
        0.0,
        where=(y_spline < 0.0),
        color="#e74c3c",
        alpha=0.35,
        label=r"Non-Physical Region ($y(t) < 0$)",
    )

    idx_min = int(np.argmin(y_spline))
    ax.annotate(
        "Non-physical undershoot: $y(t) < 0$\nNegative muscle tension is impossible",
        xy=(float(rom_grid[idx_min]), float(y_spline[idx_min])),
        xytext=(0.25, -0.25),
        arrowprops={"arrowstyle": "->", "color": "#c0392b", "lw": 1.5},
        bbox={"boxstyle": "round,pad=0.45", "facecolor": "#fadbd8", "edgecolor": "#e74c3c", "alpha": 0.92},
        fontsize=9.5,
        fontweight="bold",
        color="#922b21",
    )

    ax.set_title(r"$C^2$ Natural Cubic Spline Overshoot / Undershoot on LR", fontweight="bold", pad=10)
    ax.set_xlabel(r"Normalized Range of Motion ($t \in [0, 1]$)")
    ax.set_ylabel(r"Normalized Muscle Tension $y(t)$")
    ax.set_xlim(-0.02, 1.02)
    ax.set_ylim(-0.34, 1.25)
    ax.axhline(0.0, color="black", linewidth=0.9, linestyle="--")
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.15), ncol=2, frameon=True)

    plt.tight_layout()
    fig.savefig(FIG_DIR / "spline_overshoot.png", dpi=300, bbox_inches="tight")
    plt.close(fig)


def plot_spline_density(
    rom_grid: NDArray[np.float64],
    y_ideal: NDArray[np.float64],
    bx: NDArray[np.float64],
    by: NDArray[np.float64],
    x0: float,
    x3: float,
) -> None:
    knots_sparse = np.array([0.0, 0.2, 0.5, 0.85, 1.0])
    y_sparse = evaluate_true_profile(knots_sparse, bx, by, x0, x3)
    y_spline_sparse = CubicSpline(knots_sparse, y_sparse, bc_type="natural")(rom_grid)

    knots_dense = np.linspace(0.0, 1.0, 10)
    y_dense = evaluate_true_profile(knots_dense, bx, by, x0, x3)
    y_spline_dense = CubicSpline(knots_dense, y_dense, bc_type="natural")(rom_grid)

    y_pchip = PchipInterpolator(knots_sparse, y_sparse)(rom_grid)

    fig, ax = plt.subplots(figsize=(8.2, 4.6), dpi=300)
    ax.plot(rom_grid, y_ideal, "k-", linewidth=2.3, label="Reference LR Profile")
    ax.plot(rom_grid, y_spline_sparse, color="#8e44ad", lw=1.8, ls="--", label=r"Natural $C^2$ ($N=5$ knots, undershoot)")
    ax.plot(rom_grid, y_spline_dense, color="#2980b9", lw=1.8, ls=":", label=r"Dense $C^2$ ($N=10$ knots, high parameter count)")
    ax.plot(rom_grid, y_pchip, color="#d35400", lw=1.8, ls="-.", label=r"Monotone PCHIP ($y \geq 0$, reduced to $C^1$)")
    ax.scatter(knots_sparse, y_sparse, color="#8e44ad", s=45, zorder=5)
    ax.fill_between(rom_grid, y_spline_sparse, 0.0, where=(y_spline_sparse < 0.0), color="#e74c3c", alpha=0.25)

    ax.set_title("Spline Trade-off: Knot Density vs. Curvature Continuity", fontweight="bold", pad=10)
    ax.set_xlabel(r"Normalized Range of Motion ($t \in [0, 1]$)")
    ax.set_ylabel(r"Normalized Muscle Tension $y(t)$")
    ax.set_xlim(-0.02, 1.02)
    ax.set_ylim(-0.18, 1.22)
    ax.axhline(0.0, color="black", linewidth=0.8, linestyle=":")
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.15), ncol=2, frameon=True, fontsize=8.8)

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
    ax.plot(q_pts[:, 0], q_pts[:, 1], "s--", color="#2980b9", lw=1.4, ms=6, label=r"Level 1: $Q_i = (1-t)P_i + t P_{i+1}$")
    q_offsets = [(0.018, -0.045), (-0.04, 0.04), (0.018, -0.045)]
    for idx, (node, (dx, dy)) in enumerate(zip(q_pts, q_offsets, strict=True)):
        ax.text(float(node[0]) + dx, float(node[1]) + dy, rf"$Q_{idx}$", fontsize=9.2, color="#1b4f72")

    r_pts = np.array([r0, r1])
    ax.plot(r_pts[:, 0], r_pts[:, 1], "^--", color="#e67e22", lw=1.5, ms=6.5, label=r"Level 2: $R_i = (1-t)Q_i + t Q_{i+1}$")
    for idx, node in enumerate(r_pts):
        ax.text(float(node[0]) + 0.018, float(node[1]) - 0.045, rf"$R_{idx}$", fontsize=9.2, color="#935116")

    ax.scatter([pt[0]], [pt[1]], color="#c0392b", s=95, zorder=7, label=rf"Level 3: $\mathbf{{P}}(t={t_val}) = (1-t)R_0 + t R_1$")
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
    bx: NDArray[np.float64],
    by: NDArray[np.float64],
    x0: float,
    x3: float,
) -> None:
    x_knots = np.array([0.0, 0.2, 0.45, 0.75, 0.9, 1.0])
    y_knots = evaluate_true_profile(x_knots, bx, by, x0, x3)
    y_spline = CubicSpline(x_knots, y_knots, bc_type="natural")(rom_grid)

    x_poly = np.linspace(0.0, 1.0, 8)
    y_poly_knots = evaluate_true_profile(x_poly, bx, by, x0, x3)
    y_lagrange = np.polyval(np.polyfit(x_poly, y_poly_knots, deg=7), rom_grid)

    fig, ax = plt.subplots(figsize=(8.6, 4.9), dpi=300)
    hull = ConvexHull(ctrl_pts)
    hull_pts = ctrl_pts[hull.vertices]
    hull_plot = np.vstack([hull_pts, hull_pts[0]])
    ax.fill(hull_plot[:, 0], hull_plot[:, 1], color="#27ae60", alpha=0.12, label="Bézier Convex Hull")
    ax.plot(hull_plot[:, 0], hull_plot[:, 1], color="#27ae60", linestyle=":", linewidth=1.2)

    ax.plot(ctrl_pts[:, 0], ctrl_pts[:, 1], "o--", color="#16a085", lw=1.4, ms=6.5, label=r"Control Polygon ($P_0, P_1, P_2, P_3$)")
    p_cfg = [(0.015, -0.055, "left"), (-0.015, 0.045, "right"), (-0.015, 0.045, "right"), (0.015, 0.02, "left")]
    for idx, (node, (dx, dy, ha)) in enumerate(zip(ctrl_pts, p_cfg, strict=True)):
        ax.text(float(node[0]) + dx, float(node[1]) + dy, rf"$P_{idx}({node[0]:.2f}, {node[1]:.2f})$", fontsize=8.5, fontweight="bold", color="#0e6251", ha=ha)

    ax.plot(rom_grid, y_bezier, color="#27ae60", lw=2.8, label=r"Cubic Bézier ($\mathcal{O}(1)$, guaranteed $y(t) \geq 0$)")
    ax.plot(rom_grid, y_spline, color="#8e44ad", lw=1.8, ls="-.", label=r"$C^2$ Cubic Spline (undershoot $y < 0$)")
    ax.plot(rom_grid, y_lagrange, color="#e74c3c", lw=1.8, ls="--", label=r"Lagrange Polynomial $d=7$ (Runge boundary oscillation)")

    ax.set_title("Bézier ROM Comparison vs. Cubic Spline and Lagrange on LR", fontweight="bold", pad=10)
    ax.set_xlabel(r"Normalized Range of Motion ($t \in [0, 1]$)")
    ax.set_ylabel(r"Normalized Muscle Tension $y(t)$")
    ax.set_xlim(-0.02, 1.08)
    ax.set_ylim(-0.32, 1.32)
    ax.axhline(0.0, color="black", linewidth=0.8, linestyle="-")

    props_text = (
        "Cubic Bézier Guarantees:\n"
        r"• Partition of unity: $\sum B_{i,3}(t) \equiv 1$" "\n"
        r"• Convex hull: $0 \leq y(t) \leq 1$" "\n"
        r"• Exact $\mathcal{O}(1)$ De Casteljau evaluation"
    )
    ax.text(
        0.025,
        0.95,
        props_text,
        transform=ax.transAxes,
        verticalalignment="top",
        bbox={"boxstyle": "round,pad=0.45", "facecolor": "#e8f8f5", "edgecolor": "#1abc9c", "alpha": 0.92},
        fontsize=8.8,
        color="#0b5345",
    )

    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.15), ncol=2, frameon=True, fontsize=9.0)
    plt.tight_layout()
    fig.savefig(FIG_DIR / "bezier_comparison.png", dpi=300, bbox_inches="tight")
    plt.close(fig)


def main() -> None:
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
    bx, by = solve_bezier(ctrl_pts[0], ctrl_pts[1], ctrl_pts[2], ctrl_pts[3])
    rom_grid = np.linspace(0.0, 1.0, 1000)
    y_ideal = evaluate_true_profile(rom_grid, bx, by, m["x0"], m["x3"])

    plot_lagrange_runge(rom_grid, y_ideal, bx, by, m["x0"], m["x3"])
    plot_lagrange_gauss_lobatto(rom_grid, y_ideal, bx, by, m["x0"], m["x3"])
    plot_spline_overshoot(rom_grid, y_ideal, bx, by, m["x0"], m["x3"])
    plot_spline_density(rom_grid, y_ideal, bx, by, m["x0"], m["x3"])
    plot_de_casteljau(ctrl_pts[0], ctrl_pts[1], ctrl_pts[2], ctrl_pts[3])
    plot_bezier_bernstein(ctrl_pts)
    plot_bezier_comparison(ctrl_pts, rom_grid, y_ideal, bx, by, m["x0"], m["x3"])
    print(f"Generated 7 figures in {FIG_DIR}")


if __name__ == "__main__":
    main()

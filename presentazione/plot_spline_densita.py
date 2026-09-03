"""
plot_spline_densita.py
Analisi Numerica (2.2):
Studio della densita' dei nodi e compromessi delle Spline su LR.
Dimostra che per contenere l'undershoot non fisico serve una quantita' eccessiva
di nodi di supporto o la rinuncia alla continuita' C^2 (es. PCHIP C^1),
rendendo la modellazione complessa e poco intuitiva per l'utente rispetto a soli 4 punti di controllo.
"""

import os
import json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from scipy.interpolate import CubicSpline, PchipInterpolator

def get_lr_data():
    json_path = os.path.join(os.path.dirname(__file__), "../frontend/src/defaultExercises.json")
    if os.path.exists(json_path):
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            lr = next((e for e in data if e["name"] == "LR"), None)
            if lr and "muscles_distr" in lr and "Lateral Deltoid" in lr["muscles_distr"]:
                return lr["muscles_distr"]["Lateral Deltoid"]
    return {
        "x0": 0.2, "y0": 0.0,
        "x1": 0.33, "y1": 0.3,
        "x2": 0.66, "y2": 0.8,
        "x3": 0.9, "y3": 1.0,
        "magnitude": 0.9
    }

def solve_bezier(p0, p1, p2, p3, n_points=1000):
    t = np.linspace(0, 1, n_points)
    bx = (1-t)**3 * p0[0] + 3*(1-t)**2 * t * p1[0] + 3*(1-t) * t**2 * p2[0] + t**3 * p3[0]
    by = (1-t)**3 * p0[1] + 3*(1-t)**2 * t * p1[1] + 3*(1-t) * t**2 * p2[1] + t**3 * p3[1]
    return bx, by

def evaluate_true_profile(x_target, bx, by, x0, x3):
    y_out = np.zeros_like(x_target)
    mask_in = (x_target >= x0) & (x_target <= x3)
    y_out[mask_in] = np.interp(x_target[mask_in], bx, by)
    return y_out

def main():
    m = get_lr_data()
    p0 = np.array([m["x0"], m["y0"]])
    p1 = np.array([m["x1"], m["y1"]])
    p2 = np.array([m["x2"], m["y2"]])
    p3 = np.array([m["x3"], m["y3"]])

    bx, by = solve_bezier(p0, p1, p2, p3)
    rom_grid = np.linspace(0, 1, 1000)
    y_ideal = evaluate_true_profile(rom_grid, bx, by, m["x0"], m["x3"])

    # 1. Spline con pochi nodi (N=5) -> undershoot pronunciato
    knots_sparse = np.array([0.0, 0.2, 0.5, 0.85, 1.0])
    y_sparse = evaluate_true_profile(knots_sparse, bx, by, m["x0"], m["x3"])
    cs_sparse = CubicSpline(knots_sparse, y_sparse, bc_type='natural')
    y_spline_sparse = cs_sparse(rom_grid)

    # 2. Spline densa (N=10) -> richiede troppi punti discreti
    knots_dense = np.linspace(0, 1, 10)
    y_dense = evaluate_true_profile(knots_dense, bx, by, m["x0"], m["x3"])
    cs_dense = CubicSpline(knots_dense, y_dense, bc_type='natural')
    y_spline_dense = cs_dense(rom_grid)

    # 3. PCHIP (Monotona ma solo C^1)
    pchip = PchipInterpolator(knots_sparse, y_sparse)
    y_pchip = pchip(rom_grid)

    plt.style.use('seaborn-v0_8-whitegrid' if 'seaborn-v0_8-whitegrid' in plt.style.available else 'default')
    fig, ax = plt.subplots(figsize=(10, 5.2), dpi=300)

    ax.plot(rom_grid, y_ideal, 'k-', linewidth=2.4, label=r'Profilo Reale Target LR')
    ax.plot(rom_grid, y_spline_sparse, color='#8e44ad', linewidth=1.8, linestyle='--',
            label=r'Spline Naturale $C^2$ ($N=5$ nodi, undershoot $y < 0$)')
    ax.plot(rom_grid, y_spline_dense, color='#2980b9', linewidth=1.8, linestyle=':',
            label=r'Spline Densa $C^2$ ($N=10$ nodi, troppi parametri da configurare)')
    ax.plot(rom_grid, y_pchip, color='#d35400', linewidth=1.8, linestyle='-.',
            label=r'Spline Monotona PCHIP (garantisce $y \geq 0$ ma perde continuità $C^2$, solo $C^1$)')

    ax.scatter(knots_sparse, y_sparse, color='#8e44ad', s=45, zorder=5)

    ax.fill_between(rom_grid, y_spline_sparse, 0, where=(y_spline_sparse < 0), color='#e74c3c', alpha=0.25)

    ax.annotate(r'Dilemma delle Spline:' + '\n' +
                r'• $C^2$ naturale $\rightarrow$ undershoot non fisico' + '\n' +
                r'• Aumentare nodi $\rightarrow$ troppi parametri' + '\n' +
                r'• PCHIP $\rightarrow$ perdita curvatura $C^2$',
                xy=(0.10, -0.05), xytext=(0.04, 0.45),
                arrowprops=dict(arrowstyle='->', color='#8e44ad', lw=1.5),
                bbox=dict(boxstyle='round,pad=0.5', facecolor='#f4ecf7', edgecolor='#8e44ad', alpha=0.9),
                fontsize=9.5, fontweight='bold', color='#512e5f')

    ax.set_title(r'Compromessi delle Spline Interpolanti su LR: Densità dei Nodi e Proprietà di Forma', fontsize=13, fontweight='bold', pad=12)
    ax.set_xlabel(r'Range of Motion (ROM adimensionale $t \in [0, 1]$)', fontsize=11)
    ax.set_ylabel(r'Tensione Muscolare Normalizzata $y(t)$', fontsize=11)
    ax.set_xlim(-0.02, 1.02)
    ax.set_ylim(-0.25, 1.25)
    ax.axhline(0, color='black', linewidth=0.8, linestyle=':')
    ax.legend(loc='lower right', frameon=True, fontsize=9)

    plt.tight_layout()
    output_path = os.path.join(os.path.dirname(__file__), "plot_spline_densita.png")
    plt.savefig(output_path, dpi=300, bbox_inches='tight')
    plt.close()
    print(f"Grafico salvato con successo in: {output_path}")

if __name__ == "__main__":
    main()

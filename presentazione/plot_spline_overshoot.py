"""
plot_spline_overshoot.py
Analisi Numerica (2.2 Parte 2/3):
Interpolazione mediante Spline Cubiche C^2 (Algoritmo di Thomas) per l'esercizio LR.
Evidenzia la comparsa di undershoot con valori negativi non fisici (y(t) < 0)
e overshoot locali nei pressi delle zone di forte variazione di pendenza.
"""

import os
import json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from scipy.interpolate import CubicSpline

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

    # Punti di supporto fisici biomeccanici: estremi del movimento e punti interni
    x_knots = np.array([0.0, 0.2, 0.45, 0.75, 0.9, 1.0])
    y_knots = evaluate_true_profile(x_knots, bx, by, m["x0"], m["x3"])

    # Spline Cubica Naturale (C^2)
    cs = CubicSpline(x_knots, y_knots, bc_type='natural')
    y_spline = cs(rom_grid)

    plt.style.use('seaborn-v0_8-whitegrid' if 'seaborn-v0_8-whitegrid' in plt.style.available else 'default')
    fig, ax = plt.subplots(figsize=(9, 5), dpi=300)

    # Profilo reale
    ax.plot(rom_grid, y_ideal, 'k-', linewidth=2.2, label=r'Profilo Reale LR (Lateral Deltoid)')
    
    # Nodi della Spline
    ax.scatter(x_knots, y_knots, color='#2c3e50', s=60, zorder=5, label=r'Nodi di Raccordo Spline ($N=6$)')

    # Spline Cubica C^2
    ax.plot(rom_grid, y_spline, color='#8e44ad', linewidth=2.2, linestyle='-',
            label=r'Spline Cubica Interpolante ($C^2$, Algoritmo di Thomas)')

    # Evidenziazione area non fisica y < 0
    mask_negative = y_spline < 0
    ax.fill_between(rom_grid, y_spline, 0, where=mask_negative, color='#e74c3c', alpha=0.35,
                    label=r'Regione di Violazione Fisica ($y(t) < 0$)')

    # Annotazione undershoot
    idx_min = np.argmin(y_spline)
    ax.annotate(r'Undershoot non fisico: $y(t) < 0$' + '\n' + r'Tensione muscolare negativa impossibile',
                xy=(rom_grid[idx_min], y_spline[idx_min]), xytext=(0.08, -0.18),
                arrowprops=dict(arrowstyle='->', color='#c0392b', lw=1.5),
                bbox=dict(boxstyle='round,pad=0.5', facecolor='#fadbd8', edgecolor='#e74c3c', alpha=0.9),
                fontsize=9.5, fontweight='bold', color='#922b21')

    ax.set_title(r'2.2 Analisi Numerica (2/3) - Spline Cubiche Interpolanti $C^2$ su LR', fontsize=13, fontweight='bold', pad=12)
    ax.set_xlabel(r'Range of Motion (ROM adimensionale $t \in [0, 1]$)', fontsize=11)
    ax.set_ylabel(r'Tensione Muscolare Normalizzata $y(t)$', fontsize=11)
    ax.set_xlim(-0.02, 1.02)
    ax.set_ylim(-0.3, 1.3)
    ax.axhline(0, color='black', linewidth=0.9, linestyle='--')
    ax.legend(loc='upper center', bbox_to_anchor=(0.5, -0.15), ncol=2, frameon=True, fontsize=9.5)

    plt.tight_layout()
    output_path = os.path.join(os.path.dirname(__file__), "plot_spline_overshoot.png")
    plt.savefig(output_path, dpi=300, bbox_inches='tight')
    plt.close()
    print(f"Grafico salvato con successo in: {output_path}")

if __name__ == "__main__":
    main()

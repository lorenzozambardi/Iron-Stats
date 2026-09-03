"""
plot_bezier_confronto.py
Analisi Numerica (2.2 Parte 3/3):
Confronto sinottico tra Curve di Bézier (Polinomi di Bernstein), Spline Cubiche e Polinomi di Lagrange su LR.
Evidenzia:
1. Punti di controllo P0, P1, P2, P3 ed Inviluppo Convesso (Convex Hull).
2. Garanzia assoluta di positività y(t) >= 0.
3. Assenza di oscillazioni di Runge e complessità di valutazione O(1).
"""

import os
import json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from scipy.interpolate import CubicSpline
from scipy.spatial import ConvexHull

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
    return bx, by, t

def evaluate_true_profile(x_target, bx, by, x0, x3):
    y_out = np.zeros_like(x_target)
    mask_in = (x_target >= x0) & (x_target <= x3)
    y_out[mask_in] = np.interp(x_target[mask_in], bx, by)
    return y_out

def main():
    m = get_lr_data()
    ctrl_pts = np.array([
        [m["x0"], m["y0"]],
        [m["x1"], m["y1"]],
        [m["x2"], m["y2"]],
        [m["x3"], m["y3"]]
    ])

    bx, by, _ = solve_bezier(ctrl_pts[0], ctrl_pts[1], ctrl_pts[2], ctrl_pts[3])
    rom_grid = np.linspace(0, 1, 1000)
    y_bezier = evaluate_true_profile(rom_grid, bx, by, m["x0"], m["x3"])

    # Spline interpolante
    x_knots = np.array([0.0, 0.2, 0.45, 0.75, 0.9, 1.0])
    y_knots = evaluate_true_profile(x_knots, bx, by, m["x0"], m["x3"])
    cs = CubicSpline(x_knots, y_knots, bc_type='natural')
    y_spline = cs(rom_grid)

    # Polinomio di Lagrange (8 nodi)
    x_poly = np.linspace(0, 1, 8)
    y_poly_knots = evaluate_true_profile(x_poly, bx, by, m["x0"], m["x3"])
    poly_coeffs = np.polyfit(x_poly, y_poly_knots, deg=7)
    y_lagrange = np.polyval(poly_coeffs, rom_grid)

    plt.style.use('seaborn-v0_8-whitegrid' if 'seaborn-v0_8-whitegrid' in plt.style.available else 'default')
    fig, ax = plt.subplots(figsize=(10, 5.5), dpi=300)

    # 1. Inviluppo convesso (Convex Hull) dei punti di controllo di Bézier
    hull = ConvexHull(ctrl_pts)
    hull_pts = ctrl_pts[hull.vertices]
    # chiudi il poligono per il plot
    hull_plot = np.vstack([hull_pts, hull_pts[0]])
    ax.fill(hull_plot[:, 0], hull_plot[:, 1], color='#27ae60', alpha=0.12, label='Inviluppo Convesso (Convex Hull)')
    ax.plot(hull_plot[:, 0], hull_plot[:, 1], color='#27ae60', linestyle=':', linewidth=1.2)

    # Poligono di controllo
    ax.plot(ctrl_pts[:, 0], ctrl_pts[:, 1], 'o--', color='#16a085', linewidth=1.4, 
            markersize=7, label=r'Poligono di Controllo Bézier ($P_0, P_1, P_2, P_3$)')
    for i, pt in enumerate(ctrl_pts):
        ax.text(pt[0] + 0.015, pt[1] - 0.04, rf'$P_{i}({pt[0]:.2f}, {pt[1]:.2f})$', 
                fontsize=8.5, fontweight='bold', color='#0e6251')

    # 2. Curva di Bézier (Metodo Scelto)
    ax.plot(rom_grid, y_bezier, color='#27ae60', linewidth=2.8,
            label=r'Bézier di grado 3 (Bernstein, $\mathcal{O}(1)$, $y(t) \geq 0$)')

    # 3. Spline Cubica
    ax.plot(rom_grid, y_spline, color='#8e44ad', linewidth=1.8, linestyle='-.',
            label=r'Spline Cubica $C^2$ (presenza di undershoot $y < 0$)')

    # 4. Polinomio di Lagrange
    ax.plot(rom_grid, y_lagrange, color='#e74c3c', linewidth=1.8, linestyle='--',
            label=r'Polinomio Lagrange $d=7$ (oscillazioni Runge ai bordi)')

    ax.set_title(r'2.2 Analisi Numerica (3/3) - Confronto Metodi su LR (Lateral Raise)', fontsize=13, fontweight='bold', pad=12)
    ax.set_xlabel(r'Range of Motion (ROM adimensionale $t \in [0, 1]$)', fontsize=11)
    ax.set_ylabel(r'Tensione Muscolare Normalizzata $y(t)$', fontsize=11)
    ax.set_xlim(-0.02, 1.02)
    ax.set_ylim(-0.35, 1.35)
    ax.axhline(0, color='black', linewidth=0.8, linestyle='-')

    # Box di riepilogo proprietà
    props_text = (
        "Proprietà Bézier Grado 3:\n"
        r"• Partizione dell'unità: $\sum B_{i,3}(t) \equiv 1$" "\n"
        r"• Inviluppo convesso: $0 \leq y(t) \leq 1$" "\n"
        r"• Risoluzione analitica $\mathcal{O}(1)$ (De Casteljau)"
    )
    ax.text(0.03, 0.95, props_text, transform=ax.transAxes, verticalalignment='top',
            bbox=dict(boxstyle='round,pad=0.5', facecolor='#e8f8f5', edgecolor='#1abc9c', alpha=0.9),
            fontsize=8.5, color='#0b5345')

    ax.legend(loc='upper center', bbox_to_anchor=(0.5, -0.15), ncol=2, frameon=True, fontsize=9)

    plt.tight_layout()
    output_path = os.path.join(os.path.dirname(__file__), "plot_bezier_confronto.png")
    plt.savefig(output_path, dpi=300, bbox_inches='tight')
    plt.close()
    print(f"Grafico salvato con successo in: {output_path}")

if __name__ == "__main__":
    main()

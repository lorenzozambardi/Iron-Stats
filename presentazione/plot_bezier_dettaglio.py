"""
plot_bezier_dettaglio.py
Analisi Numerica (2.2):
Dettaglio della formulazione delle curve di Bézier di grado 3 tramite polinomi di Bernstein.
Mostra:
1. Subplot sinistro: Funzioni base di Bernstein B_{i,3}(t) (partizione dell'unita' e positivita').
2. Subplot destro: Curva parametrica risultante su LR, punti di controllo e inviluppo convesso (Convex Hull).
"""

import os
import json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
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

def bernstein_poly(i, n, t):
    from math import comb
    return comb(n, i) * (t ** i) * ((1 - t) ** (n - i))

def main():
    m = get_lr_data()
    ctrl_pts = np.array([
        [m["x0"], m["y0"]],
        [m["x1"], m["y1"]],
        [m["x2"], m["y2"]],
        [m["x3"], m["y3"]]
    ])

    t = np.linspace(0, 1, 500)

    # Calcolo base di Bernstein n=3
    b0 = bernstein_poly(0, 3, t)
    b1 = bernstein_poly(1, 3, t)
    b2 = bernstein_poly(2, 3, t)
    b3 = bernstein_poly(3, 3, t)

    # Curva di Bézier
    bx = b0 * ctrl_pts[0, 0] + b1 * ctrl_pts[1, 0] + b2 * ctrl_pts[2, 0] + b3 * ctrl_pts[3, 0]
    by = b0 * ctrl_pts[0, 1] + b1 * ctrl_pts[1, 1] + b2 * ctrl_pts[2, 1] + b3 * ctrl_pts[3, 1]

    plt.style.use('seaborn-v0_8-whitegrid' if 'seaborn-v0_8-whitegrid' in plt.style.available else 'default')
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 5), dpi=300)

    # Subplot 1: Polinomi di Bernstein
    ax1.plot(t, b0, color='#3498db', lw=2, label=r'$B_{0,3}(t) = (1-t)^3$')
    ax1.plot(t, b1, color='#9b59b6', lw=2, label=r'$B_{1,3}(t) = 3t(1-t)^2$')
    ax1.plot(t, b2, color='#e67e22', lw=2, label=r'$B_{2,3}(t) = 3t^2(1-t)$')
    ax1.plot(t, b3, color='#e74c3c', lw=2, label=r'$B_{3,3}(t) = t^3$')
    ax1.plot(t, b0 + b1 + b2 + b3, 'k--', lw=1.5, label=r'Somma $\equiv 1.0$ (Partizione Unità)')

    ax1.set_title(r'Funzioni Peso di Bernstein ($n=3$)', fontsize=12, fontweight='bold')
    ax1.set_xlabel(r'Parametro $t \in [0, 1]$', fontsize=10.5)
    ax1.set_ylabel(r'Valore del Peso', fontsize=10.5)
    ax1.set_ylim(-0.05, 1.1)
    ax1.legend(loc='upper center', frameon=True, fontsize=8.5)

    # Subplot 2: Curva risultante e Inviluppo Convesso
    hull = ConvexHull(ctrl_pts)
    hull_pts = ctrl_pts[hull.vertices]
    hull_plot = np.vstack([hull_pts, hull_pts[0]])
    ax2.fill(hull_plot[:, 0], hull_plot[:, 1], color='#2ecc71', alpha=0.15, label='Inviluppo Convesso (Convex Hull)')
    ax2.plot(hull_plot[:, 0], hull_plot[:, 1], color='#27ae60', linestyle=':', lw=1.2)

    ax2.plot(ctrl_pts[:, 0], ctrl_pts[:, 1], 'o--', color='#16a085', lw=1.5, ms=7, label=r'Poligono di Controllo $\{P_i\}$')
    for i, pt in enumerate(ctrl_pts):
        ax2.text(pt[0] + 0.02, pt[1] - 0.04, rf'$P_{i}({pt[0]:.2f}, {pt[1]:.2f})$', fontsize=9, fontweight='bold', color='#0e6251')

    ax2.plot(bx, by, color='#27ae60', lw=3, label=r'Curva di Bézier $\mathbf{P}(t)$')

    ax2.set_title(r'Curva di Bézier su LR (Lateral Deltoid)', fontsize=12, fontweight='bold')
    ax2.set_xlabel(r'Range of Motion (ROM $x \in [0, 1]$)', fontsize=10.5)
    ax2.set_ylabel(r'Tensione Muscolare $y \in [0, 1]$', fontsize=10.5)
    ax2.set_xlim(-0.02, 1.02)
    ax2.set_ylim(-0.05, 1.15)
    ax2.legend(loc='upper left', frameon=True, fontsize=8.5)

    plt.tight_layout()
    output_path = os.path.join(os.path.dirname(__file__), "plot_bezier_dettaglio.png")
    plt.savefig(output_path, dpi=300, bbox_inches='tight')
    plt.close()
    print(f"Grafico salvato con successo in: {output_path}")

if __name__ == "__main__":
    main()

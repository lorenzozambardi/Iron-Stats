"""
plot_de_casteljau.py
Illustrazione geometrica dell'Algoritmo di De Casteljau per la curva di Bézier di grado 3 su LR.
Mostra i tre livelli di interpolazione lineare ricorsiva per t = 0.5:
- Livello 0: Punti di controllo P0, P1, P2, P3
- Livello 1: Punti intermedi Q0, Q1, Q2
- Livello 2: Punti intermedi R0, R1
- Livello 3: Punto finale sulla curva P(t)
"""

import os
import json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

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

def solve_bezier(p0, p1, p2, p3, n_points=500):
    t = np.linspace(0, 1, n_points)
    bx = (1-t)**3 * p0[0] + 3*(1-t)**2 * t * p1[0] + 3*(1-t) * t**2 * p2[0] + t**3 * p3[0]
    by = (1-t)**3 * p0[1] + 3*(1-t)**2 * t * p1[1] + 3*(1-t) * t**2 * p2[1] + t**3 * p3[1]
    return bx, by

def lerp(pA, pB, t):
    return (1 - t) * pA + t * pB

def main():
    m = get_lr_data()
    P0 = np.array([m["x0"], m["y0"]])
    P1 = np.array([m["x1"], m["y1"]])
    P2 = np.array([m["x2"], m["y2"]])
    P3 = np.array([m["x3"], m["y3"]])

    t_val = 0.5
    # Livello 1
    Q0 = lerp(P0, P1, t_val)
    Q1 = lerp(P1, P2, t_val)
    Q2 = lerp(P2, P3, t_val)

    # Livello 2
    R0 = lerp(Q0, Q1, t_val)
    R1 = lerp(Q1, Q2, t_val)

    # Livello 3 (Punto sulla curva)
    Pt = lerp(R0, R1, t_val)

    bx, by = solve_bezier(P0, P1, P2, P3)

    plt.style.use('seaborn-v0_8-whitegrid' if 'seaborn-v0_8-whitegrid' in plt.style.available else 'default')
    fig, ax = plt.subplots(figsize=(10, 5.2), dpi=300)

    # Curva di Bézier completa
    ax.plot(bx, by, color='#27ae60', lw=3, label=r'Curva di Bézier $\mathbf{P}(t)$', zorder=6)

    # Poligono di controllo originale (Livello 0)
    P_pts = np.array([P0, P1, P2, P3])
    ax.plot(P_pts[:, 0], P_pts[:, 1], 'o--', color='#7f8c8d', lw=1.5, ms=7, label=r'Poligono di Controllo $\{P_0, P_1, P_2, P_3\}$')
    for i, pt in enumerate(P_pts):
        ax.text(pt[0] + 0.015, pt[1] - 0.04, rf'$P_{i}$', fontsize=10, fontweight='bold', color='#2c3e50')

    # Segmenti Livello 1
    Q_pts = np.array([Q0, Q1, Q2])
    ax.plot(Q_pts[:, 0], Q_pts[:, 1], 's--', color='#2980b9', lw=1.3, ms=6, label=r'Livello 1: $Q_i = (1-t)P_i + tP_{i+1}$')
    for i, pt in enumerate(Q_pts):
        ax.text(pt[0] + 0.015, pt[1] - 0.03, rf'$Q_{i}$', fontsize=9, color='#1b4f72')

    # Segmenti Livello 2
    R_pts = np.array([R0, R1])
    ax.plot(R_pts[:, 0], R_pts[:, 1], '^--', color='#e67e22', lw=1.3, ms=6, label=r'Livello 2: $R_i = (1-t)Q_i + tQ_{i+1}$')
    for i, pt in enumerate(R_pts):
        ax.text(pt[0] + 0.015, pt[1] - 0.03, rf'$R_{i}$', fontsize=9, color='#935116')

    # Punto finale Livello 3 (sulla curva)
    ax.scatter([Pt[0]], [Pt[1]], color='#c0392b', s=100, zorder=7, 
               label=rf'Livello 3: $\mathbf{{P}}(t={t_val}) = (1-t)R_0 + tR_1$')
    ax.text(Pt[0] + 0.02, Pt[1] + 0.03, rf'$\mathbf{{P}}({t_val})$', fontsize=10.5, fontweight='bold', color='#922b21')

    ax.set_title(r'Algoritmo di De Casteljau: Costruzione Geometrica Ricorsiva ($t = 0.5$)', fontsize=13, fontweight='bold', pad=12)
    ax.set_xlabel(r'Range of Motion (ROM $x \in [0, 1]$)', fontsize=11)
    ax.set_ylabel(r'Tensione Muscolare $y \in [0, 1]$', fontsize=11)
    ax.set_xlim(-0.02, 1.02)
    ax.set_ylim(-0.08, 1.15)
    ax.legend(loc='upper left', frameon=True, fontsize=8.8)

    plt.tight_layout()
    output_path = os.path.join(os.path.dirname(__file__), "plot_de_casteljau.png")
    plt.savefig(output_path, dpi=300, bbox_inches='tight')
    plt.close()
    print(f"Grafico salvato con successo in: {output_path}")

if __name__ == "__main__":
    main()

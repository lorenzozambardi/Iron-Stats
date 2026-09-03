"""
plot_lagrange_gauss_lobatto.py
Analisi Numerica (2.2):
Interpolazione polinomiale di Lagrange con nodi non equispaziati di Chebyshev-Gauss-Lobatto (CGL).
Dimostra che, sebbene la distribuzione CGL attenui la divergenza di Runge ai bordi,
sono necessari troppi nodi/parametri (es. N=12 o N=16) per tentare di catturare
il profilo di attivazione di LR (Lateral Raise), generando comunque oscillazioni residue
nelle zone di quiete (t in [0, 0.2]) e violazioni di non-negativita'.
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

def gauss_lobatto_nodes(n):
    """Calcola gli n nodi di Chebyshev-Gauss-Lobatto riscalati su [0, 1]"""
    # Nodi su [-1, 1]: x_k = -cos(k * pi / (n - 1))
    k = np.arange(n)
    nodes_std = -np.cos(k * np.pi / (n - 1))
    # Trasformazione su [0, 1]
    return 0.5 * (nodes_std + 1.0)

def main():
    m = get_lr_data()
    p0 = np.array([m["x0"], m["y0"]])
    p1 = np.array([m["x1"], m["y1"]])
    p2 = np.array([m["x2"], m["y2"]])
    p3 = np.array([m["x3"], m["y3"]])

    bx, by = solve_bezier(p0, p1, p2, p3)
    rom_grid = np.linspace(0, 1, 1000)
    y_ideal = evaluate_true_profile(rom_grid, bx, by, m["x0"], m["x3"])

    # Test con diversi gradi polinomiali su nodi Gauss-Lobatto
    degrees = [6, 12]
    colors = ['#e67e22', '#c0392b']
    linestyles = ['--', '-.']

    plt.style.use('seaborn-v0_8-whitegrid' if 'seaborn-v0_8-whitegrid' in plt.style.available else 'default')
    fig, ax = plt.subplots(figsize=(10, 5.2), dpi=300)

    # Profilo reale
    ax.plot(rom_grid, y_ideal, 'k-', linewidth=2.4, label=r'Profilo Reale Target LR (Lateral Deltoid)')

    for n_nodes, color, ls in zip(degrees, colors, linestyles):
        nodes = gauss_lobatto_nodes(n_nodes)
        y_nodes = evaluate_true_profile(nodes, bx, by, m["x0"], m["x3"])
        poly_coeffs = np.polyfit(nodes, y_nodes, deg=n_nodes - 1)
        y_poly = np.polyval(poly_coeffs, rom_grid)
        deg = n_nodes - 1
        ax.plot(rom_grid, y_poly, color=color, linewidth=1.8, linestyle=ls,
                label=rf'Gauss-Lobatto ($N={n_nodes}$ nodi, grado $d={deg}$)')
        ax.scatter(nodes, y_nodes, color=color, s=35, zorder=4)

    # Evidenziazione zona di oscillazione residua in allungamento (t in [0, 0.2])
    ax.axvspan(0.0, 0.22, color='#e74c3c', alpha=0.10, label=r'Zona di quiete ($t \in [0, 0.2]$): ondulazioni parassite')

    # Annotazione critica
    ax.annotate(r'Ondulazioni parassite residue e $y(t) < 0$' + '\n' + r'Servono $\geq 12$ parametri senza ottenere aderenza perfetta',
                xy=(0.10, -0.05), xytext=(0.04, 0.45),
                arrowprops=dict(arrowstyle='->', color='#c0392b', lw=1.5),
                bbox=dict(boxstyle='round,pad=0.5', facecolor='#fef5e7', edgecolor='#e67e22', alpha=0.9),
                fontsize=9.5, fontweight='bold', color='#935116')

    ax.set_title(r'Interpolazione di Lagrange con Nodi di Chebyshev-Gauss-Lobatto su LR', fontsize=13, fontweight='bold', pad=12)
    ax.set_xlabel(r'Range of Motion (ROM adimensionale $t \in [0, 1]$)', fontsize=11)
    ax.set_ylabel(r'Tensione Muscolare Normalizzata $y(t)$', fontsize=11)
    ax.set_xlim(-0.02, 1.02)
    ax.set_ylim(-0.25, 1.25)
    ax.axhline(0, color='black', linewidth=0.8, linestyle=':')
    ax.legend(loc='lower right', frameon=True, fontsize=9.5)

    plt.tight_layout()
    output_path = os.path.join(os.path.dirname(__file__), "plot_lagrange_gauss_lobatto.png")
    plt.savefig(output_path, dpi=300, bbox_inches='tight')
    plt.close()
    print(f"Grafico salvato con successo in: {output_path}")

if __name__ == "__main__":
    main()

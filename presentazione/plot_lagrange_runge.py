"""
plot_lagrange_runge.py
Analisi Numerica (2.2 Parte 1/3):
Interpolazione polinomiale di Lagrange/Newton su nodi equispaziati per l'esercizio LR (Lateral Raise).
Evidenzia la divergenza del numero di condizionamento kappa(V) della matrice di Vandermonde
e l'insorgenza del Fenomeno di Runge agli estremi del Range of Motion (ROM).
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

def main():
    m = get_lr_data()
    p0 = np.array([m["x0"], m["y0"]])
    p1 = np.array([m["x1"], m["y1"]])
    p2 = np.array([m["x2"], m["y2"]])
    p3 = np.array([m["x3"], m["y3"]])

    bx, by = solve_bezier(p0, p1, p2, p3)
    rom_grid = np.linspace(0, 1, 1000)
    y_ideal = evaluate_true_profile(rom_grid, bx, by, m["x0"], m["x3"])

    # Campionamento di nodi equispaziati per interpolazione polinomiale
    n_nodes = 9
    x_nodes = np.linspace(0, 1, n_nodes)
    y_nodes = evaluate_true_profile(x_nodes, bx, by, m["x0"], m["x3"])

    # Costruzione del polinomio di Lagrange / Vandermonde
    V = np.vander(x_nodes, increasing=True)
    cond_V = np.linalg.cond(V)
    poly_coeffs = np.polyfit(x_nodes, y_nodes, deg=n_nodes - 1)
    y_poly = np.polyval(poly_coeffs, rom_grid)

    plt.style.use('seaborn-v0_8-whitegrid' if 'seaborn-v0_8-whitegrid' in plt.style.available else 'default')
    fig, ax = plt.subplots(figsize=(9, 5), dpi=300)

    # Plot curva ideale biomeccanica
    ax.plot(rom_grid, y_ideal, 'k-', linewidth=2.2, label=r'Profilo Reale LR (Lateral Deltoid)')
    
    # Nodi di interpolazione
    ax.scatter(x_nodes, y_nodes, color='#2980b9', s=60, zorder=5, label=f'Nodi Equispaziati ($n={n_nodes}$)')

    # Polinomio di Lagrange (evidenzia oscillazioni Runge)
    ax.plot(rom_grid, y_poly, color='#e74c3c', linewidth=2, linestyle='--', 
            label=rf'Polinomio di Lagrange ($d={n_nodes-1}$)')

    # Evidenziazione del fenomeno di Runge agli estremi
    ax.axvspan(0.0, 0.2, color='#e74c3c', alpha=0.12, label='Regione Runge (Stretch estremo)')
    ax.axvspan(0.85, 1.0, color='#e74c3c', alpha=0.12, label='Regione Runge (Accorciamento)')

    ax.annotate(r'Fenomeno di Runge: oscillazione divergenze' + f'\n' + r'$\kappa(V) = ' + f'{cond_V:.2e}$',
                xy=(0.06, y_poly[60]), xytext=(0.04, 1.25),
                arrowprops=dict(arrowstyle='->', color='#c0392b', lw=1.5),
                bbox=dict(boxstyle='round,pad=0.5', facecolor='#fadbd8', edgecolor='#e74c3c', alpha=0.9),
                fontsize=9.5, fontweight='bold', color='#922b21')

    ax.set_title(r'2.2 Analisi Numerica (1/3) - Interpolazione Polinomiale di Lagrange su LR', fontsize=13, fontweight='bold', pad=12)
    ax.set_xlabel(r'Range of Motion (ROM adimensionale $t \in [0, 1]$)', fontsize=11)
    ax.set_ylabel(r'Tensione Muscolare Normalizzata $y(t)$', fontsize=11)
    ax.set_xlim(-0.02, 1.02)
    ax.set_ylim(-0.4, 1.8)
    ax.axhline(0, color='black', linewidth=0.8, linestyle=':')
    ax.legend(loc='upper center', bbox_to_anchor=(0.5, -0.15), ncol=2, frameon=True, fontsize=9.5)

    plt.tight_layout()
    output_path = os.path.join(os.path.dirname(__file__), "plot_lagrange_runge.png")
    plt.savefig(output_path, dpi=300, bbox_inches='tight')
    plt.close()
    print(f"Grafico salvato con successo in: {output_path}")

if __name__ == "__main__":
    main()

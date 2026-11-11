# Mathematical Model: Optimization on Cumulative Tension Curve

## 1. Decision Variables
*   $e_{d,k}$: Exercise assigned to ordered slot $k \in \{1, \dots, N_d\}$ on day $d$ (with $E_{\min} \le N_d \le E_{\max}$; same-day duplicates are allowed in the state representation and penalized via $P_{\mathrm{dup}}$).
*   $v_{d,k} \in [S_{\min}, S_{\max}]$: Volume (number of sets) for exercise slot $(d, k)$.
*   $r_{d,k,s} \in [R_{\min}, R_{\max}]$: Base repetitions for set $s$ of exercise slot $(d, k)$.
*   $\mathrm{RPE}_{d,k,s} \in [5.0, 10.0]$: Rate of Perceived Exertion per set (initialized in $\{7.0, 8.0, 8.5, 9.0, 10.0\}$ and mutated in $0.5$ increments).
*   $p_{d,k,s} \in \{0, 2, 4, 6\}$: Stretched-ROM partial repetitions ($\mathrm{RPE}_{d,k,s} \ge 9.0$ only).

## 2. Parameters (UI Editable Input)
> [!IMPORTANT]
> **All constraints and limits listed below are exposed and editable by the user via the user interface (UI).** The values shown are the current default settings.

*   $D$: Number of days in the microcycle. Must be between 3 and 7 ($3 \le D \le 7$, default $4$).
*   $X$: Discrete grid of $R = 50$ points over normalized physical Range of Motion ($x \in [0, 1]$).
*   $B_{e,m}(x)$: Area-normalized cubic Bézier tension profile of exercise $e$ on sub-muscle $m$ (normalized via exact 3-point Gauss–Legendre quadrature).
*   $T_m(x)$: Ideal target tension curve on $x \in [0, 1]$:
    *   **Constant (Flat):** $T_m(x) = 1$.
    *   **Sigmoid:** $1 / (1 + e^{-10(x - 0.5)})$ (emphasis on peak contraction).
    *   **Inverse Sigmoid:** $1 / (1 + e^{10(x - 0.5)})$ (emphasis on maximal stretch).
    *   **Linear:** $1 - x$ (decreasing linearly from stretch to contraction).
*   $F_e \in [1, 10]$: Systemic fatigue cost of exercise $e$.

**Operational Limits (Generator UI Defaults):**
*   **Set Limits:** $S_{\min} = 1$, $S_{\max} = 6$.
*   **Rep Limits:** $R_{\min} = 5$, $R_{\max} = 20$.
*   **Exercises/Day Limits:** $E_{\min} = 3$, $E_{\max} = 10$.
*   **Rest Limits:** $\mathrm{Rest}_{\min} = 60\text{s}$ ($1'$), $\mathrm{Rest}_{\max} = 210\text{s}$ ($3'30''$).

## 3. Objective Function: Multi-Objective Optimization (Scalarized)

The solver simultaneously minimizes seven normalized error metrics via Monte Carlo scale calibration and Simulated Annealing.

### 3.1 Efficiency Weights and Targets (UI Editable)
The UI applies Softmax normalization so $\sum_{i} w_i = 1.0$, and sets ideal efficiency ratio targets $\rho_q^* \in [0, 1]$ (default $0.70$):
*   $w_{\text{curve}}$: Weight for adherence to the Target Curve.
*   $w_{\text{vol}}$: Weight for Volume efficiency ($\rho_{\text{vol}}^*$).
*   $w_{\text{ton}}$: Weight for Tonnage efficiency ($\rho_{\text{ton}}^*$).
*   $w_{\text{tut}}$: Weight for TUT efficiency ($\rho_{\text{tut}}^*$, evaluated using RIR-slowdown dynamic TUT at default `1-0-2-0` tempo).
*   $w_{\text{distr}}$: Weight for adherence to the requested Macro/Micro volumetric distribution.
*   $w_{\text{variety}}$: Weight to incentivize exercise diversity across the microcycle.
*   $w_{\text{balance}}$: Weight to balance daily volume and fatigue across days.

### 3.2 Raw Error Metrics
1.  **Curve Error (Mean MSE):** Using peak-normalized aggregate muscle tension $\hat{V}_m(x) = V_m(x) / \max_{x'} V_m(x')$:
    $$E_{\text{curve}} = \frac{1}{|M_{\text{trained}}|} \sum_{m \in M_{\text{trained}}} \frac{1}{R} \sum_{i=0}^{R-1} \bigl(\hat{V}_m(x_i) - T_m(x_i)\bigr)^2$$
2.  **Volume Error:** $E_{\text{vol}} = \left( \frac{\text{Effective Volume}}{\text{Total Volume}} - \rho_{\text{vol}}^* \right)^2$
3.  **Tonnage Error:** $E_{\text{ton}} = \left( \frac{\text{Effective Tonnage}}{\text{Total Tonnage}} - \rho_{\text{ton}}^* \right)^2$
4.  **TUT Error:** $E_{\text{tut}} = \left( \frac{\text{Effective TUT}}{\text{Total TUT}} - \rho_{\text{tut}}^* \right)^2$
5.  **Volume Distribution Error:** Half squared $\ell_2$ distance on the simplex (equal to $0$ when no target distribution is configured):
    $$\text{Target}_{\text{global}}(m) = \text{Macro}\%(M) \times \text{Sub}\%(m)$$
    $$E_{\text{distr}} = \frac{1}{2.0} \sum_{m} \left( \frac{W_m}{\sum_{m'} W_{m'}} - \text{Target}_{\text{global}}(m) \right)^2$$
6.  **Variety Error:**
    $$E_{\text{variety}} = \left( 1 - \frac{\text{Unique Exercises}}{\text{Total Exercises}} \right)^2$$
7.  **Daily Balance Error:** Population variance of daily fatigue and daily volume normalized by conservative Popoviciu bounds $(F_{\max}/2)^2$ and $(V_{\max}/2)^2$ (equal to $0$ when $D \le 1$):
    $$E_{\text{balance}} = \begin{cases} \frac{1}{2} \left( \frac{\mathrm{Var}_d(F_d)}{(F_{\max}/2)^2} + \frac{\mathrm{Var}_d(D_d)}{(V_{\max}/2)^2} \right), & D > 1 \\ 0, & D \le 1 \end{cases}$$

### 3.3 Calibrated Global Objective Function
Prior to Simulated Annealing, $K$ random states estimate $s_i = 2\,\hat{\mu}(E_i)$ (guarded at $10^{-6}$ if zero). The solver minimizes:
$$J(x) = 10^4 \sum_{i} w_i \frac{E_i(x)}{s_i} + 10^3 \cdot 150 \cdot N_{\text{dup}}(x)$$

## 4. Operational Constraints & Rest Heuristic

### 4.1 Sets, Reps, and Daily Density
$$S_{\min} \cdot x_{i,d} \le v_{i,d} \le S_{\max} \cdot x_{i,d}, \qquad R_{\min} \cdot x_{i,d} \le r_{i,d} \le R_{\max} \cdot x_{i,d}$$
$$E_{\min} \le \sum_{i \in E} x_{i,d} \le E_{\max}$$

### 4.2 Deterministic Rest (Proportional to Fatigue)
Rest is computed a priori from systemic exercise fatigue $F_e$:
* **Low Fatigue ($F_e \le 2.0$):** Fixed rest at 1 minute (`1'`, 60s).
* **Medium Fatigue ($2.0 < F_e \le 7.0$):** Linearly scaled from 1 minute to 3 minutes.
* **High Fatigue ($F_e > 7.0$):** Linearly scaled from 3 minutes up to 3 minutes 30 seconds (`3'30"` at $F_e = 10.0$).
Values are rounded half-up to the nearest half minute.

### 4.3 Same-Day Duplicate Penalty
To encourage diverse movement angles and avoid concentrating all volume into one exercise on the same day, each duplicate exercise on the same day adds a hard penalty of $150{,}000$ to $J(x)$.

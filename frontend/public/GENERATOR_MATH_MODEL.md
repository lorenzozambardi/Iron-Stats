# Mathematical Model: Optimization on Cumulative Tension Curve

## 1. Decision Variables
*   $x_{i,d} \in \{0, 1\}$: Activation. `1` if exercise $i$ is scheduled on day $d$, `0` otherwise.
*   $v_{i,d} \in \mathbb{N}$: Volume (number of sets) for exercise $i$ on day $d$.
*   $r_{i,d} \in \mathbb{N}$: Repetitions per set of exercise $i$ on day $d$.

## 2. Parameters (UI Editable Input)
> [!IMPORTANT]
> **All constraints and limits listed below are not hard-coded, but must be exposed and freely editable by the user via the user interface (UI).** The values shown are the current default settings.

*   $D$: Number of days in the microcycle. Must be between 3 and 7 ($3 \le D \le 7$).
*   $T$: Set of discrete points mapping the Range of Motion (ROM).
*   $C_{i,m}(t)$: Base tension curve of exercise $i$ on muscle $m$.
*   $T_m(t)$: Ideal target tension curve. The interface must allow the user to set it by choosing among the following shapes (on domain $t \in [0, 1]$):
    *   **Constant (Flat):** Flat tension throughout the ROM ($T_m(t) = c$).
    *   **Sigmoid:** Increasing from 0 to 1 (emphasis on peak contraction).
    *   **Inverse Sigmoid:** Decreasing from 1 to 0 (emphasis on maximal stretch).
    *   **Linear (from 1 to 0):** Decreasing linearly (emphasis proportional to stretch).
*   $F_i$: Systemic fatigue cost of exercise $i$.

**Operational Limits (Default):**
*   **Set Limits:** $V_{min} = 1$, $V_{max} = 6$.
*   **Rep Limits:** $R_{min} = 5$, $R_{max} = 20$.
*   **Exercises/Day Limits:** $E_{min} = 3$, $E_{max} = 10$.
*   **Daily Fatigue Limit:** $F_{max\_day} = 1500$.
*   **Rest Limits:** $Rest_{min} = 80\text{s}$ (1'20"), $Rest_{max} = 210\text{s}$ (3'30").

## 3. Objective Function: Multi-Objective Optimization (Scalarized)

The general objective is to simultaneously minimize the tension curve error and the training efficiency indexes (Ratios) error.

### 3.1 Efficiency Weights and Targets (UI Editable)
The user must be able to define the **Weights ($w$)** to decide the importance of each parameter (whose sum must be 1.0) and the **Ideal Targets** for the efficiency fractions (from 0.0 to 1.0):
*   $w_{curve}$: Weight for adherence to the Target Curve.
*   $w_{vol}$: Weight for Volume efficiency. (Ideal Target: $Target_{vol}$)
*   $w_{ton}$: Weight for Tonnage efficiency. (Ideal Target: $Target_{ton}$)
*   $w_{tut}$: Weight for TUT efficiency. (Ideal Target: $Target_{tut}$)
*   $w_{distr}$: Weight for adherence to the requested Macro/Micro volumetric distribution.
*   $w_{variety}$: Weight to incentivize exercise diversity across the entire microcycle.

### 3.2 Error Calculation (Normalized in domain [0, 1])
To ensure that the weights ($w$) assigned by the interface have a perfectly symmetrical and democratic impact, ALL errors are mathematically squashed into the same domain `[0.0, 1.0]`. This is achieved by dividing the deviations by their maximum theoretical value or by averaging instead of summing.

1.  **Curve Error (Mean MSE):** The mean squared error calculated on the curve points is summed for all analyzed muscles and divided by the number of muscles: $E_{curve} = \frac{1}{|M|} \sum_{m} \frac{\sum (V_m - T_m)^2}{Resolution}$
2.  **Volume Error:** $E_{vol} = \left( \frac{\text{Effective Volume}}{\text{Total Volume}} - Target_{vol} \right)^2$
3.  **Tonnage Error:** $E_{ton} = \left( \frac{\text{Effective Tonnage}}{\text{Total Tonnage}} - Target_{ton} \right)^2$
4.  **TUT Error:** $E_{tut} = \left( \frac{\text{Effective TUT}}{\text{Total TUT}} - Target_{tut} \right)^2$
5.  **Volume Distribution Error:** Divided by 2 (maximum theoretical distance between two percentage distributions)
    $$ Target_{global}(m) = Macro\%(M) \times Sub\%(m) $$
    $$ E_{distr} = \frac{1}{2.0} \sum_{m} \left( \frac{V_{effective}(m)}{V_{total}} - Target_{global}(m) \right)^2 $$
6.  **Variety Error:**
    $$ E_{variety} = \left( 1 - \frac{\text{Unique Exercises}}{\text{Total Exercises}} \right)^2 $$
7.  **Daily Balance Error (Ex-Variance):**
    Ensures that volume and fatigue are equally spread across the microcycle days. The daily variance is divided by the theoretical maximum variance, mapping the result to `[0, 1]`.
    $$ E_{balance} = \frac{1}{2} \left( \frac{Var(\text{Fatigue})}{Var_{max\_F}} + \frac{Var(\text{Volume})}{Var_{max\_V}} \right) $$

### 3.3 Global Objective Function (Softmax Weighted Sum)
The weights $w$ provided by the UI (subjected to Softmax Normalization so that $\sum w = 1.0$) are multiplied by the respective Errors.
The algorithm will minimize the following equation:
$$ \min \Big( w_{curve} \cdot E_{curve} + w_{vol} \cdot E_{vol} + w_{ton} \cdot E_{ton} + w_{tut} \cdot E_{tut} + w_{distr} \cdot E_{distr} + w_{variety} \cdot E_{variety} + w_{balance} \cdot E_{balance} \Big) $$

## 4. Physiological Constraints

### 4.1. Sets and Reps Limits (Big-M)
If the exercise is chosen, it must respect the minimum and maximum parameters. If not chosen, the values collapse to 0.
$$ V_{min} \cdot x_{i,d} \le v_{i,d} \le V_{max} \cdot x_{i,d} \quad \text{(e.g., } 1 \le v_{i,d} \le 6 \text{)} $$
$$ R_{min} \cdot x_{i,d} \le r_{i,d} \le R_{max} \cdot x_{i,d} \quad \text{(e.g., } 5 \le r_{i,d} \le 20 \text{)} $$

### 4.2. Minimum and Maximum Density per Day
$$ E_{min} \le \sum_{i \in E} x_{i,d} \le E_{max} \quad \text{(e.g., } 3 \le \text{Exercises} \le 10 \text{)} $$

### 4.4. Deterministic Rest (Proportional to Fatigue)
Rest $rest_i$ is not a free variable to optimize, but is calculated a priori via a non-linear heuristic based on the systemic fatigue $F_i$ of the exercise:
* **Low Fatigue ($F_i \le 2.0$):** Fixed rest at 1 minute (60s). Ideal for light isolation.
* **Medium Fatigue ($2.0 < F_i \le 7.0$):** Scales linearly from 1 minute to 3 minutes.
* **High Fatigue ($F_i > 7.0$):** Scales linearly from 3 minutes up to a maximum of 3 minutes and 30 seconds (for heavy systemic exercises like Deadlifts).
The calculated values are then rounded to the nearest half minute (e.g., 2'30").

### 4.5. Muscle / Neural Recovery Time (Overlap)
To force the algorithm to change working angles and avoid saturating the CNS with the exact same movement to bypass the set cap, a massive penalty is applied to the Cost function if the same exercise is scheduled more than once on the same day.
$$ Cost \mathrel{+}= \text{Penalty} \quad \text{if } \sum x_{i,d} > 1 \text{ on the same } d $$

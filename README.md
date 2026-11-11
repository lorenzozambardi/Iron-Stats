<div align="center">
  <img src="full_logo.png" alt="Iron Stats Banner" width="400" />

  <h1>Iron Stats</h1>

  <p>
    <a href="https://www.python.org/downloads/"><img src="https://img.shields.io/badge/python-3.10%2B-3776AB?logo=python&logoColor=white" alt="Python 3.10+" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache_2.0-blue.svg" alt="License: Apache 2.0" /></a>
    <a href="https://github.com/astral-sh/ruff"><img src="https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/astral-sh/ruff/main/assets/badge/v2.json" alt="Code style: Ruff" /></a>
    <a href="docs/paper.pdf"><img src="https://img.shields.io/badge/Technical_Paper-docs%2Fpaper.pdf-b31b1b.svg?logo=adobeacrobatreader&logoColor=white" alt="Technical Paper PDF" /></a>
  </p>
</div>

## Abstract

Conventional resistance-training analytics rely on coarse scalar aggregates—such as raw set count, repetition volume, and mechanical tonnage ($\text{load} \times \text{reps}$)—which treat all repetitions, loading profiles, and effort levels as physiologically equivalent. **Iron Stats** replaces these naive scalars with a unified computational framework that models resistance training over three coupled domains: **(i) continuous biomechanical tension fields**, parameterizing per-muscle resistance profiles across normalized Range of Motion (ROM) $x \in [0, 1]$ via area-normalized cubic Bézier curves; **(ii) physiological fatigue and stimulus dynamics**, quantifying High-Threshold Motor Unit (HTMU) recruitment through an RPE-gated effective-repetition threshold, RIR-dependent concentric Time Under Tension (TUT) slowdown, and exponential central nervous system (CNS) fatigue accumulation; and **(iii) constrained combinatorial optimization**, synthesizing balanced multi-day training mesocycles via calibrated scalarized Simulated Annealing. Paired with a domain-specific workout log parser and an interactive React/Vite client, Iron Stats bridges empirical training logbooks with reproducible quantitative exercise science.

---

## System Architecture

| Component | Path | Responsibility |
| :--- | :--- | :--- |
| **Logbook Parser** | [`python_research/analyzer/parser.py`](python_research/analyzer/parser.py) | Parses compact markdown logs (`# Session`, dropsets, tempo `c-p_s-e-p_l`, RPE, `override:` directives) with alias and Levenshtein matching. |
| **Biomechanical Models** | [`python_research/analyzer/models.py`](python_research/analyzer/models.py) | Defines `BezierProfile`, `Exercise` (with magnitude normalization), `SetData`, `WeekData`, and `WorkoutExercise`. |
| **Metrics Engine** | [`python_research/analyzer/metrics.py`](python_research/analyzer/metrics.py) | Evaluates per-rep dynamic TUT (`calculate_set_tuts`), exponential CNS fatigue (`calculate_set_fatigue`), and filtered aggregations (`calculate_metrics`). |
| **SA Optimizer** | [`python_research/analyzer/solver.py`](python_research/analyzer/solver.py) | Implements `WorkoutSolver` with Monte Carlo scale calibration and Simulated Annealing over 7 normalized objectives. |
| **CLI & Constants** | [`python_research/analyzer/cli.py`](python_research/analyzer/cli.py), [`constants.py`](python_research/analyzer/constants.py), [`scripts/Analyzer.py`](python_research/scripts/Analyzer.py) | Exposes `iron-stats` CLI filters (`--session`, `--week`, `--macro`, `--sub`, `--file`) and shared muscle/alias tables. |
| **Interactive Client** | [`frontend/`](frontend/) | React/Vite/Capacitor app with live logbook parsing (`parser.js`), interactive Bézier editor, and client-side solver (`solver.js`). |

---

## Mathematical Formulation

All definitions below correspond directly to the reference implementation in [`python_research/analyzer/`](python_research/analyzer/).

### 1. Cubic Bézier Muscle Tension Curve & Normalization

In [`models.py`](python_research/analyzer/models.py) (`BezierProfile`), each exercise $e$ maps muscle group $m$ to a strictly monotone ($x_0 < x_1 < x_2 < x_3$) cubic Bézier curve over $R = 50$ samples (`resolution = 50`), defined by absolute control points $(x_0, y_0), (x_1, y_1), (x_2, y_2), (x_3, y_3)$ and target muscle contribution magnitude $M_m$ (with $y(x) = 0$ for $x \notin [x_0, x_3]$):

$$
x(t) = (1 - t)^3 x_0 + 3(1 - t)^2 t \, x_1 + 3(1 - t) t^2 \, x_2 + t^3 x_3
$$

$$
y(t) = (1 - t)^3 y_0 + 3(1 - t)^2 t \, y_1 + 3(1 - t) t^2 \, y_2 + t^3 y_3
$$

The curve area $A$ across the ROM domain is evaluated exactly via 3-point Gauss–Legendre quadrature, and the physical tension profile $B_m(x_i)$ is sampled on $x_i = i / (R - 1)$ via bisection inversion $t_i = x^{-1}(x_i)$ (`get_physical_curve`) and rescaled so its integral equals $M_m$:

$$
A = \int_0^1 y(t) x'(t)\,dt = \sum_{k=1}^{3} w_k \, y(t_k) x'(t_k), \qquad
B_m(x_i) = \begin{cases} y(t_i) \cdot \dfrac{M_m}{A}, & A > 0 \text{ and } x_i \in [x_0, x_3] \\ 0, & \text{otherwise} \end{cases}
$$

Every `Exercise` enforces the partition-of-unity constraint across its targeted muscles $m \in \mathcal{M}_e$ (`Exercise.__post_init__`, re-normalizing whenever $|\sum_m M_m - 1.0| > 10^{-12}$):

$$
\sum_{m \in \mathcal{M}_e} M_m = 1.0
$$

---

### 2. Effective Repetitions, Dynamic TUT & Exponential CNS Fatigue

Let a set consist of $n_b$ base repetitions (`base_reps`), $n_a$ assisted repetitions (`assisted_reps`), and $n_p$ partial repetitions (`partial_reps`) at $\text{RPE} \ge 0$ (default $9.0$; the solver mutates candidate RPEs within $[5.0, 10.0]$). With discount coefficients $\alpha_{\text{ass}} = 0.5$ (`COEFF_ASSISTED`) and $\alpha_{\text{part}} = 0.33$ (`COEFF_PARTIAL`) from [`constants.py`](python_research/analyzer/constants.py), total and HTMU-effective repetitions (`SetData` in [`models.py`](python_research/analyzer/models.py)) are:

$$
R_{\text{tot}} = n_b + \alpha_{\text{ass}} \, n_a + \alpha_{\text{part}} \, n_p
$$

$$
R_{\text{eff}} = \min\Bigl(n_b,\, \max\bigl(0,\, \text{RPE} - 4.0\bigr)\Bigr) + \alpha_{\text{ass}} \, n_a + \alpha_{\text{part}} \, n_p
$$

Only base repetitions performed within $\text{RIR} < 6$ (i.e., $\text{RPE} > 4.0$) cross the High-Threshold Motor Unit recruitment threshold.

Given an exercise's execution tempo $(c, p_s, e, p_l)$ (concentric, shortening pause, eccentric, lengthening pause; default `1-0-2-0`), nominal repetition duration is $\tau_0 = c + p_s + e + p_l$. In [`metrics.py`](python_research/analyzer/metrics.py) (`calculate_set_tuts`), each base repetition $j \in \{0, \dots, n_b - 1\}$ has instantaneous Reps in Reserve $\text{RIR}_j = (10.0 - \text{RPE}) + (n_b - 1 - j)$ and incurs a piecewise concentric slowdown $\Delta c(\text{RIR}_j)$:

$$
\tau_j = \tau_0 + \Delta c(\text{RIR}_j), \qquad
\Delta c(\text{RIR}_j) =
\begin{cases}
1.60\text{ s}, & \text{RIR}_j < 1.0 \\
1.00\text{ s}, & 1.0 \le \text{RIR}_j < 2.0 \\
0.60\text{ s}, & 2.0 \le \text{RIR}_j < 3.0 \\
0.35\text{ s}, & 3.0 \le \text{RIR}_j < 4.0 \\
0.15\text{ s}, & 4.0 \le \text{RIR}_j < 5.0 \\
0.00\text{ s}, & \text{RIR}_j \ge 5.0
\end{cases}
$$

Assisted repetitions take $\tau_0$, and partial repetitions take $0.5 \, \tau_0$.

In `calculate_set_fatigue`, per-rep RPE is $\text{RPE}_j = \max(0, 10.0 - \text{RIR}_j)$, and CNS fatigue scales continuously as $\mu(\text{RPE}_j) = 1.1^{\text{RPE}_j - 7.5}$ for all $\text{RPE}_j \ge 0$. Weighted by exercise fatigue factor $F_{\text{ex}}$ (`fatigue`), total set fatigue is:

$$
\Phi_{\text{set}} = F_{\text{ex}} \left[ \sum_{j=0}^{n_b - 1} \tau_j \, \mu(\text{RPE}_j) \;+\; \alpha_{\text{ass}} \, 1.1^{10.0 - 7.5} \, n_a \tau_0 \;+\; 0.5 \, \alpha_{\text{part}} \, 1.1^{10.0 - 7.5} \, n_p \tau_0 \right]
$$

For each logged set with raw load $L_{\text{raw}}$, actual load is $L = L_{\text{raw}} \cdot \text{load\_multiplier} + \text{load\_offset}$, yielding set tonnage $L \cdot R_{\text{tot}}$ and effective tonnage $L \cdot R_{\text{eff}}$ scaled by the queried muscle's `magnitude` coefficient $M_m$.

---

### 3. Multi-Objective Combinatorial Optimization

In [`solver.py`](python_research/analyzer/solver.py) (`WorkoutSolver`), a candidate mesocycle $\omega \in \Omega$ specifies $D$ training days, each assigning $N_d \in [N_{\min}, N_{\max}]$ exercise slots $(d, k)$ with $S_{d,k} \in [S_{\min}, S_{\max}]$ sets, base reps $r \in [r_{\min}, r_{\max}]$, $\text{RPE}$ initialized in $\{7.0, 8.0, 8.5, 9.0, 10.0\}$ (mutated in $0.5$ steps within $[5.0, 10.0]$), and partials $p \in \{0, 2, 4, 6\}$ (active only when $\text{RPE} \ge 9.0$).

Writing $e = e(d, k)$ for the exercise at slot $(d, k)$ and $N_{b,d,k}, N_{p,d,k}$ for its slot-level base and partial rep sums, cumulative muscle tension $V_m(x_i)$ is evaluated on a common physical ROM grid $x_i = i/(R - 1)$ via bisection ($t_{e,i} = x_e^{-1}(x_i)$) over base reps and $\alpha_{\text{part}}$-weighted stretched-range partials ($x_i \le 0.3333$):

$$
V_m(x_i) = \sum_{d=1}^{D} \sum_{k=1}^{N_d} B_{e,m}(x_i) \Bigl( N_{b,d,k} + \alpha_{\text{part}} N_{p,d,k} \, \mathbb{I}[x_i \le 0.3333] \Bigr)
$$

*(Note: for Simulated Annealing speed, `evaluate_workout` uses lightweight surrogates for load—Epley-like $\hat{L}$—and linear fatigue, while retaining dynamic RIR-slowdown TUT at default `1-0-2-0` tempo so $E_{\mathrm{tut}}$ remains distinct from $E_{\mathrm{vol}}$.)*

The solver evaluates seven dimensionless error terms $\mathcal{I} = \{\text{curve}, \text{vol}, \text{ton}, \text{tut}, \text{distr}, \text{variety}, \text{balance}\}$, weighting $E_{\text{curve}}$ by simplex target shares $\omega_m = p_m^{\text{target}}$ over $\mathcal{M}_{\text{eval}} = \{m : p_m^{\text{target}} > 0\}$ when targets are configured, or by active-ROM volume shares $\omega_m = W_m / \sum_{m' \in \mathcal{M}_{\text{eval}}} W_{m'}$ over $\mathcal{M}_{\text{eval}} = \{m : \max_r V_m(x_r) > 0\}$ otherwise:

$$
E_{\text{curve}} = \sum_{m \in \mathcal{M}_{\text{eval}}} \omega_m \frac{1}{R} \sum_{i=0}^{R-1} \left( \hat{V}_m(x_i) - T_m(x_i) \right)^2
$$

$$
E_q = \left( \frac{X_{q,\text{eff}}}{X_{q,\text{tot}}} - \rho_q^* \right)^2 \quad \forall q \in \{\text{vol}, \text{ton}, \text{tut}\}, \qquad
E_{\text{distr}} = \begin{cases} \frac{1}{2} \sum_{m} \bigl( p_m^{\text{actual}} - p_m^{\text{target}} \bigr)^2, & \text{if targets set} \\ 0, & \text{otherwise} \end{cases}
$$

where $p_m^{\text{actual}} = W_m / \sum_{m'} W_{m'}$ aggregates ROM-active base volume $M_{e,m}\mathbb{I}[I_{\mathrm{GL3},e,m}>0]N_{b,d,k}$ and stretched-ROM partial volume $\alpha_{\text{part}} M_{e,m,\text{part}} N_{p,d,k}$ with $M_{e,m,\text{part}} = \int_0^{0.3333} B_{e,m}(x)\,dx$:

$$
E_{\text{variety}} = \left( 1 - \frac{|\mathcal{U}(\omega)|}{N_{\text{tot}}(\omega)} \right)^2, \qquad
E_{\text{balance}} = \begin{cases} \frac{1}{2} \left( \frac{\operatorname{Var}_d(F_d)}{(F_{\max}/2)^2} + \frac{\operatorname{Var}_d(V_d)}{(V_{\max}/2)^2} \right), & D > 1 \\ 0, & D \le 1 \end{cases}
$$

During `calibrate()`, Monte Carlo sampling over $K = 500$ random states estimates scaling denominators $s_i = 2 \cdot \hat{\mu}_i$ (empirical sample mean, guarded at $10^{-6}$). `solve()` then minimizes the calibrated scalarized objective with same-day duplicate penalty $P_{\text{dup}}(\omega) = 150 \cdot N_{\text{dup}}(\omega)$ via Simulated Annealing ($T_0 = 50.0$, $T_t = T_0 \gamma^t$, Metropolis acceptance $\exp(-\Delta J / T_t)$):

$$
\min_{\omega \in \Omega} \; J(\omega) = 10^4 \sum_{i \in \mathcal{I}} w_i \, \frac{E_i(\omega)}{s_i} + 10^3 \, P_{\text{dup}}(\omega)
$$

---

## Reproducible Quickstart

### Prerequisites
- **Python**: `>= 3.10` (validated on Python `3.14.9`)
- **Node.js** *(optional, for frontend)*: `>= 22`

### 1. Python Environment Setup

```bash
git clone https://github.com/Lorenzo1901/Iron-Stats.git
cd Iron-Stats

python -m venv .venv
source .venv/bin/activate

# Runtime dependencies (numpy>=1.26,<3)
pip install -r requirements.txt

# Or install editable package with the `iron-stats` CLI (plus dev tools)
pip install -e ".[dev]"
```

### 2. Running the Analyzer & Optimizer

Analyze a workout logbook using either the installed CLI entrypoint or the script wrapper:

```bash
# Installed CLI (after `pip install -e .`)
iron-stats --file logbooks/Simone/Scheda_Simone.md

# Or run directly via the script wrapper
python python_research/scripts/Analyzer.py --file logbooks/Simone/Scheda_Simone.md
```

Optional filter flags: `--session <int>`, `--week <int>`, `--macro <group>` (e.g., `Chest`, `Back`, `Legs`), `--sub <muscle>` (e.g., `Latissimus Dorsi`). For full logbook syntax details, see [`HOW_TO_READ_THE_PROGRAM.md`](HOW_TO_READ_THE_PROGRAM.md).

Run the Simulated Annealing workout optimizer directly:

```bash
python -m analyzer.solver --config '{"days": 4, "iterations": 5000}'
```

### 3. Running Tests & Static Checks

**Python checks** (requires `pip install -e ".[dev]"`):

```bash
ruff check
mypy
pytest
```

> **Note**: Both Python (`pytest`) and frontend (`npm test`) include unit and numerical-invariant parity tests.

**Frontend web app & Vitest suite**:

```bash
cd frontend
npm install
npm test        # runs Vitest across parser, solver, and UI model parity tests
npm run lint    # ESLint check
npm run build   # production Vite bundle
npm run dev     # interactive local development server
```

---

## Further Documentation & License

- **Logbook Syntax Manual**: [`HOW_TO_READ_THE_PROGRAM.md`](HOW_TO_READ_THE_PROGRAM.md)
- **Generator Mathematical Notes**: [`frontend/public/GENERATOR_MATH_MODEL.md`](frontend/public/GENERATOR_MATH_MODEL.md)
- **License**: Distributed under the [Apache License 2.0](LICENSE).

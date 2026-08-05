# Iron Stats

**Iron Stats** is an advanced, data-driven, and computational approach to bodybuilding programming, simulation, and analysis. It abandons traditional, rudimentary metrics like simple Total Volume (Sets × Reps) and Tonnage, which fail to accurately evaluate mechanical tension and actual hypertrophy stimulus. 

Instead, this engine evaluates workout programs using **Effective Volume**, **Dynamic Time Under Tension (TUT)**, **Exponential Fatigue**, and **Cumulative Muscle Tension** modeled via 3rd-Degree Bezier Curves across the Range of Motion (ROM).

## 🚀 Key Features

- **Advanced Workout Parser**: Converts highly compact, human-readable markdown workout logs into analyzable object ecosystems. Supports complex notations including drop sets, backoff sets, partials, assisted reps, and dynamic exercise overrides.
- **Biomechanical Modeling**: Uses 3rd-Degree Bezier Curves to map the specific resistance profile of every exercise. This allows the system to understand where the tension peaks (e.g., stretched vs. contracted position) and how it impacts different muscle groups.
- **Dynamic Metrics Engine**:
  - *Effective Reps*: Discards "junk volume" by calculating reps that actually recruit high-threshold motor units (HTMUs) based on RIR (Reps in Reserve) and RPE (Rate of Perceived Exertion).
  - *Dynamic TUT*: Calculates concentric slowdown automatically as fatigue increases during a set.
  - *Exponential Fatigue*: Systemic fatigue is calculated exponentially based on the RPE of each individual repetition.
- **Mathematical Optimizer**: A multi-objective scalarized optimization engine capable of generating optimal routines based on target tension curves, volume ratios, and fatigue budgets.
- **Interactive Web App**: A React/Vite-based frontend featuring a live parsing logbook and an interactive Bezier curve editor to visually tweak exercise tension profiles.

## 📁 Project Structure

- `python_research/analyzer/`: The core Python engine containing the CLI, the parsing logic (`parser.py`), the mathematical models (`metrics.py`, `models.py`), and the optimization solver (`solver.py`).
- `python_research/scripts/`: Python analysis scripts and test utilities (`Analyzer.py`, calibration and evaluation scripts).
- `frontend/`: A modern web application built with React, Vite, and Capacitor (for Android support). It provides a UI for the parser, a visual editor for the biomechanical Bezier models, and a client-side workout generator (`src/solver.js`).
- `logbooks/`: A collection of markdown files (`.md`) containing real-world, parsed workout templates and routines.

## 🧠 The Math & Models

### 1. Cumulative Muscle Tension (Bezier Curves)
Instead of assigning flat percentage impacts (e.g., "Bench Press = 70% Chest, 30% Triceps"), the algorithm models tension dynamically. A cubic Bezier curve $B(t)$ for $t \in [0, 1]$ represents the ROM:
$$ x(t) = (1-t)^3 x_0 + 3(1-t)^2 t x_1 + 3(1-t) t^2 x_2 + t^3 x_3 $$
$$ y(t) = (1-t)^3 y_0 + 3(1-t)^2 t y_1 + 3(1-t) t^2 y_2 + t^3 y_3 $$
This allows the engine to differentiate between a movement that is hardest in the stretched position (e.g., DB Flies) versus one hardest in the contracted position (e.g., Pec Deck).

### 2. Effective Reps & Dynamic TUT
The engine calculates concentric slowdown based on proximity to failure. As Reps in Reserve (RIR) approach 0, the time required to complete the repetition increases exponentially. Only repetitions with an RIR < 4 contribute significantly to the **Effective Volume**.

### 3. Exponential Fatigue
Systemic CNS (Central Nervous System) fatigue is not linear. The engine assigns an exponential fatigue multiplier for reps performed above an RPE of 7.5:
$$ \text{RPE\_Multiplier} = 1.1^{(\text{rep\_rpe} - 7.5)} $$
Total set fatigue is the integral sum of the weighted TUT, the exercise's base fatigue cost, and its load coefficient.

## 📝 Syntax Guide

Workout logs are written in a specialized, highly compact markdown format. 

**Basic Structure:**
```text
# 1
Lat Machine | 3' | ultime mezze rep
90..9+2.7+2
90..10+2.8+2
```

- `# 1`: Denotes Session / Day 1.
- `Lat Machine | 3' | ultime mezze rep`: Exercise Name | Rest Time | Notes.
- `90..9+2.7+2`: Load (90kg) .. Set 1 (9 full reps + 2 partials) . Set 2 (7 full reps + 2 partials).

For a complete guide on how to read and write these logs, please refer to the [Manuale d'Uso: Come Leggere la Scheda](LEGGERE_LA_SCHEDA.md).

## 🛠 Getting Started

### Python CLI (Backend)

1. Ensure you have Python 3.10+ installed.
2. Run the analyzer on a workout file:
   ```bash
   python python_research/scripts/Analyzer.py --file logbooks/Scheda_Simone.md
   ```
   *Optional flags: `--session`, `--week`, `--macro`, `--sub` to filter the output.*

### React Frontend

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
   *The web app allows you to interactively edit workout logs and visualize Bezier profiles.*

## 📚 Documentation

- [LEGGERE_LA_SCHEDA.md](LEGGERE_LA_SCHEDA.md): Comprehensive guide to the workout parsing syntax (Drop sets, assisted reps, overrides, etc.).
- [GENERATOR_MATH_MODEL.md](frontend/public/GENERATOR_MATH_MODEL.md): Deep dive into the mathematical multi-objective optimization model used for routine generation.

## 📄 License

This project is open-source and available under the terms of its included `LICENSE` file.
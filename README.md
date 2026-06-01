# Algorithmic Bodybuilding

An algorithmic approach to tracking and analyzing bodybuilding workouts. This project parses detailed workout logs and calculates advanced metrics like Volume, Tonnage, Fatigue, and Time Under Tension (TUT) to provide a deeply analytical view of your training.

## Features

- **Workout Parser (`Analyzer.py`)**: A powerful Python script that parses custom markdown-based workout logs. It supports:
  - Advanced rep tracking: base reps, assisted reps, partial reps.
  - RPE (Rate of Perceived Exertion) integration.
  - Tempo tracking (concentric, shortening pause, eccentric, lengthening pause).
  - Custom overrides for specific exercises (fatigue, load coefficient, muscle distribution).
- **Advanced Metrics**: Calculates total/effective Volume, Tonnage, Fatigue, and Time Under Tension (TUT).
- **Cross-Platform App**: Includes a modern frontend built with React, Vite, and Capacitor that can be deployed as an Android app.
- **Continuous Integration**: Automatically builds a new Android APK on every push so you can always download the latest app directly from your phone.

## How It Works

The analyzer evaluates exercises based on predefined attributes (muscle distribution, baseline fatigue, load coefficients, etc.). When a workout log is processed, it calculates the impact of each set, adjusting for RPE and rep tempo, ultimately computing an "effective" metric that represents true muscle stimulus.

### Workout Log Syntax

Workout logs (e.g., `S1M3.md`) use a custom syntax specifying the exercise, loads, and repetitions:
- Formats like `load..base(assisted)+partial@RPE`
- Support for drop sets, cluster sets, and custom tempos.

## Building the Android App

This repository is configured with a GitHub Actions workflow. Every time you push to the `main` branch, it automatically builds the frontend, synchronizes with Capacitor, and generates an Android APK.

To install the latest version on your Android device:
1. Open this repository on your phone's browser.
2. Go to the **Releases** section.
3. Download the `Algorithmic-Bodybuilding.apk` from the **Latest Update** release.
4. Install the APK (make sure your phone is allowed to install apps from unknown sources).

## Local Development

### Python Analyzer
Run the analyzer on a log file:
```bash
python Analyzer.py --file S1M3.md
```

### Frontend
To run the frontend locally:
```bash
cd frontend
npm install
npm run dev
```

## License

This project is open-source and available under the terms of its included LICENSE.

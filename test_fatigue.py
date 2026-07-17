from analyzer.Analyzer import Analyzer
import os

analyzer = Analyzer()
workout = analyzer.parse_markdown("examples/S3M2.md")
metrics = analyzer.calculate_metrics(workout)

print("Total Fatigue:", metrics.accumulated_fatigue)

for i, day in enumerate(workout):
    day_fatigue = 0
    for ex in day:
        day_fatigue += analyzer._calculate_exercise_fatigue(ex)
    print(f"Day {i+1} Fatigue: {day_fatigue}")


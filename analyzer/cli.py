import argparse
import sys

from .metrics import calculate_metrics
from .models import exercises_list
from .parser import analyze_workout_log


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--session", type=int)
    parser.add_argument("--week", type=int)
    parser.add_argument("--macro", type=str)
    parser.add_argument("--sub", type=str)
    parser.add_argument("--file", type=str)

    args = parser.parse_args()

    raw_log = (
        open(args.file).read()
        if args.file
        else (sys.stdin.read() if not sys.stdin.isatty() else "")
    )

    if not raw_log.strip():
        sys.exit("No input.")

    parsed = analyze_workout_log(raw_log, exercises_list)
    metrics = calculate_metrics(parsed, args.session, args.week, args.macro, args.sub)

    print(
        f"\n{'Session':<10} | {'Exercise':<25} | {'Week':<10} | {'Volume':<10} | {'Tonnage':<15} | {'Eff Tonnage':<15} | {'Fatigue':<15} | {'TUT':<12} | {'Eff TUT':<12} | {'Sets':<10}\n"
        + "-" * 166
    )

    tv, tt, tet, tf, ttut, etut, tsets = 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0

    for m in metrics:
        tv += m["Volume"]
        tt += m["Tonnage"]
        tet += m["Eff Tonnage"]
        tf += m["Fatigue"]
        ttut += m["TUT"]
        etut += m["Eff TUT"]
        tsets += m["Sets"]
        print(
            f"{m['Session']:<10} | {m['Name']:<25} | {m['Week']:<10} | {m['Volume']:<10.2f} | {m['Tonnage']:<15.2f} | {m['Eff Tonnage']:<15.2f} | {m['Fatigue']:<15.2f} | {m['TUT']:<12.1f} | {m['Eff TUT']:<12.1f} | {m['Sets']:<10.2f}"
        )

    print(
        "-" * 166
        + f"\n{'TOTAL':<10} | {'':<25} | {'':<10} | {tv:<10.2f} | {tt:<15.2f} | {tet:<15.2f} | {tf:<15.2f} | {ttut:<12.1f} | {etut:<12.1f} | {tsets:<10.2f}"
    )


if __name__ == "__main__":
    main()

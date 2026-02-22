#!/usr/bin/env python3
"""Compare two load-test reports from benchmarks/load_optimize.py."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Compare baseline and candidate benchmark reports."
    )
    parser.add_argument(
        "--baseline",
        type=Path,
        required=True,
        help="Report JSON for baseline implementation (for example: python).",
    )
    parser.add_argument(
        "--candidate",
        type=Path,
        required=True,
        help="Report JSON for candidate implementation (for example: cpp).",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Optional output path for JSON comparison report.",
    )
    return parser.parse_args()


def load_report(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def pct_delta(base: float, cand: float) -> float | None:
    if base == 0:
        return None
    return ((cand - base) / base) * 100.0


def pct_improvement_lower_is_better(base: float, cand: float) -> float | None:
    if base == 0:
        return None
    return ((base - cand) / base) * 100.0


def get_runs_by_concurrency(report: dict) -> dict[int, dict]:
    runs: dict[int, dict] = {}
    for run in report.get("runs", []):
        runs[int(run["concurrency"])] = run
    return runs


def build_comparison(baseline: dict, candidate: dict) -> dict:
    baseline_runs = get_runs_by_concurrency(baseline)
    candidate_runs = get_runs_by_concurrency(candidate)
    common = sorted(set(baseline_runs) & set(candidate_runs))

    rows = []
    for concurrency in common:
        base = baseline_runs[concurrency]
        cand = candidate_runs[concurrency]

        base_rps = float(base["throughput_rps_success"])
        cand_rps = float(cand["throughput_rps_success"])
        base_p95 = base["success_latency_ms"]["p95"]
        cand_p95 = cand["success_latency_ms"]["p95"]
        base_error = float(base["error_rate"])
        cand_error = float(cand["error_rate"])

        row = {
            "concurrency": concurrency,
            "baseline_success_rps": base_rps,
            "candidate_success_rps": cand_rps,
            "success_rps_delta_pct": pct_delta(base_rps, cand_rps),
            "baseline_p95_success_latency_ms": base_p95,
            "candidate_p95_success_latency_ms": cand_p95,
            "p95_latency_improvement_pct": None,
            "baseline_error_rate": base_error,
            "candidate_error_rate": cand_error,
            "error_rate_delta_pp": (cand_error - base_error) * 100.0,
        }

        if isinstance(base_p95, (int, float)) and isinstance(cand_p95, (int, float)):
            row["p95_latency_improvement_pct"] = pct_improvement_lower_is_better(
                float(base_p95), float(cand_p95)
            )
        rows.append(row)

    return {
        "baseline_implementation": baseline.get("implementation", "baseline"),
        "candidate_implementation": candidate.get("implementation", "candidate"),
        "common_concurrency_levels": common,
        "missing_from_baseline": sorted(set(candidate_runs) - set(baseline_runs)),
        "missing_from_candidate": sorted(set(baseline_runs) - set(candidate_runs)),
        "rows": rows,
    }


def fmt_pct(value: float | None) -> str:
    if value is None:
        return "n/a"
    return f"{value:+.2f}%"


def fmt_ms(value: float | None) -> str:
    if value is None:
        return "n/a"
    return f"{value:.1f}ms"


def print_human_summary(comparison: dict) -> None:
    baseline = comparison["baseline_implementation"]
    candidate = comparison["candidate_implementation"]
    print(f"baseline={baseline} candidate={candidate}")
    print(
        "concurrency  baseline_rps  candidate_rps  delta_rps%  "
        "baseline_p95  candidate_p95  p95_improve%  error_delta_pp"
    )
    for row in comparison["rows"]:
        print(
            "{c:>11}  {br:>12.2f}  {cr:>13.2f}  {dr:>9}  "
            "{bp95:>12}  {cp95:>13}  {p95i:>11}  {ed:>+13.2f}".format(
                c=row["concurrency"],
                br=row["baseline_success_rps"],
                cr=row["candidate_success_rps"],
                dr=fmt_pct(row["success_rps_delta_pct"]),
                bp95=fmt_ms(row["baseline_p95_success_latency_ms"]),
                cp95=fmt_ms(row["candidate_p95_success_latency_ms"]),
                p95i=fmt_pct(row["p95_latency_improvement_pct"]),
                ed=row["error_rate_delta_pp"],
            )
        )

    missing_baseline = comparison["missing_from_baseline"]
    missing_candidate = comparison["missing_from_candidate"]
    if missing_baseline:
        print(f"missing in baseline report: {missing_baseline}")
    if missing_candidate:
        print(f"missing in candidate report: {missing_candidate}")


def main() -> int:
    args = parse_args()
    baseline = load_report(args.baseline)
    candidate = load_report(args.candidate)
    comparison = build_comparison(baseline, candidate)
    print_human_summary(comparison)

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(comparison, indent=2) + "\n", encoding="utf-8")
        print(f"wrote comparison report: {args.output}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Threaded load test for the optimize endpoint."""

from __future__ import annotations

import argparse
import http.client
import json
import math
import threading
import time
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable
from urllib.parse import urlsplit


SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_PAYLOAD_PATH = SCRIPT_DIR / "default_optimize_payload.json"


@dataclass
class WorkerMetrics:
    requests: int = 0
    successes: int = 0
    failures: int = 0
    latencies_ms: list[float] = field(default_factory=list)
    success_latencies_ms: list[float] = field(default_factory=list)
    status_counts: Counter[int] = field(default_factory=Counter)
    error_counts: Counter[str] = field(default_factory=Counter)

    def merge(self, other: "WorkerMetrics") -> None:
        self.requests += other.requests
        self.successes += other.successes
        self.failures += other.failures
        self.latencies_ms.extend(other.latencies_ms)
        self.success_latencies_ms.extend(other.success_latencies_ms)
        self.status_counts.update(other.status_counts)
        self.error_counts.update(other.error_counts)


@dataclass(frozen=True)
class EndpointConfig:
    scheme: str
    host: str
    port: int
    path: str


@dataclass(frozen=True)
class BenchmarkConfig:
    endpoint: EndpointConfig
    payload_bytes: bytes
    expected_statuses: frozenset[int]
    request_timeout_seconds: float
    validate_response_status_field: bool


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run load against POST /api/v1/deliveries/optimize."
    )
    parser.add_argument(
        "--base-url",
        default="http://localhost:5050",
        help="Base URL for the public API service.",
    )
    parser.add_argument(
        "--endpoint",
        default="/api/v1/deliveries/optimize",
        help="Endpoint path to benchmark.",
    )
    parser.add_argument(
        "--payload-file",
        type=Path,
        default=DEFAULT_PAYLOAD_PATH,
        help="JSON payload used for each request.",
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        action="append",
        default=None,
        help="Concurrency level. Repeat this flag to test multiple levels.",
    )
    parser.add_argument(
        "--duration-seconds",
        type=int,
        default=30,
        help="Measured duration per concurrency level.",
    )
    parser.add_argument(
        "--warmup-seconds",
        type=int,
        default=5,
        help="Warmup duration per concurrency level.",
    )
    parser.add_argument(
        "--request-timeout-seconds",
        type=float,
        default=40.0,
        help="Socket timeout per request.",
    )
    parser.add_argument(
        "--expected-statuses",
        default="200",
        help="Comma-separated successful HTTP statuses.",
    )
    parser.add_argument(
        "--implementation",
        default="python",
        help="Implementation label included in the output report.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Optional path to write JSON report.",
    )
    parser.add_argument(
        "--validate-response-status-field",
        action="store_true",
        help="Count a response as success only if JSON body has status=ok.",
    )
    parser.add_argument(
        "--allow-zero-success",
        action="store_true",
        help="Do not fail the run when there are zero successful responses.",
    )
    return parser.parse_args()


def parse_expected_statuses(raw: str) -> frozenset[int]:
    values = set()
    for part in raw.split(","):
        token = part.strip()
        if not token:
            continue
        status = int(token)
        if status < 100 or status > 599:
            raise ValueError(f"Invalid HTTP status code: {status}")
        values.add(status)
    if not values:
        raise ValueError("At least one expected status code is required.")
    return frozenset(values)


def parse_endpoint(base_url: str, endpoint: str) -> EndpointConfig:
    parsed_base = urlsplit(base_url)
    if parsed_base.scheme not in {"http", "https"}:
        raise ValueError("Base URL must use http or https.")
    if not parsed_base.hostname:
        raise ValueError("Base URL must include a host.")

    parsed_endpoint = urlsplit(endpoint)
    if parsed_endpoint.scheme or parsed_endpoint.netloc:
        raise ValueError("Endpoint must be a path, not a full URL.")

    endpoint_path = parsed_endpoint.path or "/"
    if not endpoint_path.startswith("/"):
        endpoint_path = f"/{endpoint_path}"
    base_path = parsed_base.path.rstrip("/")
    path = f"{base_path}{endpoint_path}"
    if parsed_endpoint.query:
        path = f"{path}?{parsed_endpoint.query}"

    port = parsed_base.port
    if port is None:
        port = 443 if parsed_base.scheme == "https" else 80

    return EndpointConfig(
        scheme=parsed_base.scheme,
        host=parsed_base.hostname,
        port=port,
        path=path,
    )


def load_payload_bytes(payload_file: Path) -> bytes:
    payload = json.loads(payload_file.read_text(encoding="utf-8"))
    # Canonicalize JSON to keep request bytes stable across runs.
    return json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")


def new_connection(endpoint: EndpointConfig, timeout_seconds: float):
    if endpoint.scheme == "https":
        return http.client.HTTPSConnection(
            endpoint.host, endpoint.port, timeout=timeout_seconds
        )
    return http.client.HTTPConnection(endpoint.host, endpoint.port, timeout=timeout_seconds)


def percentile(sorted_values: list[float], quantile: float) -> float | None:
    if not sorted_values:
        return None
    if len(sorted_values) == 1:
        return sorted_values[0]
    index = (len(sorted_values) - 1) * quantile
    low = math.floor(index)
    high = math.ceil(index)
    if low == high:
        return sorted_values[low]
    low_value = sorted_values[low]
    high_value = sorted_values[high]
    return low_value + (high_value - low_value) * (index - low)


def run_workers(
    *,
    concurrency: int,
    duration_seconds: int,
    benchmark: BenchmarkConfig,
    collect_metrics: bool,
) -> tuple[list[WorkerMetrics], float]:
    results: list[WorkerMetrics] = []
    lock = threading.Lock()
    start_signal = threading.Event()
    stop_time = time.monotonic() + duration_seconds

    payload_headers = {
        "Content-Type": "application/json",
        "Connection": "keep-alive",
    }

    def worker() -> None:
        metrics = WorkerMetrics()
        conn = None
        start_signal.wait()
        while time.monotonic() < stop_time:
            started = time.perf_counter()
            try:
                if conn is None:
                    conn = new_connection(
                        benchmark.endpoint, benchmark.request_timeout_seconds
                    )
                conn.request(
                    "POST",
                    benchmark.endpoint.path,
                    body=benchmark.payload_bytes,
                    headers=payload_headers,
                )
                response = conn.getresponse()
                body = response.read()
                latency_ms = (time.perf_counter() - started) * 1000.0

                if not collect_metrics:
                    continue

                metrics.requests += 1
                metrics.latencies_ms.append(latency_ms)
                metrics.status_counts[response.status] += 1

                ok = response.status in benchmark.expected_statuses
                if ok and benchmark.validate_response_status_field:
                    try:
                        decoded = json.loads(body.decode("utf-8"))
                        ok = decoded.get("status") == "ok"
                    except (UnicodeDecodeError, json.JSONDecodeError, AttributeError):
                        ok = False
                        metrics.error_counts["response_json_decode_error"] += 1

                if ok:
                    metrics.successes += 1
                    metrics.success_latencies_ms.append(latency_ms)
                else:
                    metrics.failures += 1
            except Exception as exc:
                if not collect_metrics:
                    if conn is not None:
                        try:
                            conn.close()
                        except Exception:
                            pass
                        conn = None
                    continue

                latency_ms = (time.perf_counter() - started) * 1000.0
                metrics.requests += 1
                metrics.failures += 1
                metrics.latencies_ms.append(latency_ms)
                metrics.error_counts[type(exc).__name__] += 1
                if conn is not None:
                    try:
                        conn.close()
                    except Exception:
                        pass
                    conn = None

        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass

        with lock:
            results.append(metrics)

    threads = [threading.Thread(target=worker, daemon=True) for _ in range(concurrency)]
    for thread in threads:
        thread.start()

    wall_started = time.time()
    start_signal.set()
    for thread in threads:
        thread.join()
    elapsed_seconds = time.time() - wall_started

    return results, elapsed_seconds


def summarize(metrics: Iterable[WorkerMetrics], elapsed_seconds: float) -> dict:
    merged = WorkerMetrics()
    for entry in metrics:
        merged.merge(entry)

    all_latencies = sorted(merged.latencies_ms)
    success_latencies = sorted(merged.success_latencies_ms)

    throughput_total = merged.requests / elapsed_seconds if elapsed_seconds > 0 else 0.0
    throughput_success = merged.successes / elapsed_seconds if elapsed_seconds > 0 else 0.0
    error_rate = merged.failures / merged.requests if merged.requests > 0 else 0.0

    return {
        "elapsed_seconds": round(elapsed_seconds, 3),
        "requests": merged.requests,
        "successes": merged.successes,
        "failures": merged.failures,
        "error_rate": error_rate,
        "throughput_rps_total": throughput_total,
        "throughput_rps_success": throughput_success,
        "latency_ms": {
            "min": all_latencies[0] if all_latencies else None,
            "avg": (sum(all_latencies) / len(all_latencies)) if all_latencies else None,
            "p50": percentile(all_latencies, 0.50),
            "p90": percentile(all_latencies, 0.90),
            "p95": percentile(all_latencies, 0.95),
            "p99": percentile(all_latencies, 0.99),
            "max": all_latencies[-1] if all_latencies else None,
        },
        "success_latency_ms": {
            "p50": percentile(success_latencies, 0.50),
            "p90": percentile(success_latencies, 0.90),
            "p95": percentile(success_latencies, 0.95),
            "p99": percentile(success_latencies, 0.99),
        },
        "status_counts": {str(code): count for code, count in sorted(merged.status_counts.items())},
        "error_counts": dict(sorted(merged.error_counts.items())),
    }


def fmt_ms(value: float | None) -> str:
    if value is None:
        return "n/a"
    return f"{value:.1f}ms"


def print_run_summary(run: dict) -> None:
    concurrency = run["concurrency"]
    total_rps = run["throughput_rps_total"]
    success_rps = run["throughput_rps_success"]
    error_rate_pct = run["error_rate"] * 100.0
    p95 = run["success_latency_ms"]["p95"]
    print(
        "concurrency={c:>3} total_rps={trps:>8.2f} success_rps={srps:>8.2f} "
        "p95(success)={p95:>8} error_rate={err:>6.2f}%".format(
            c=concurrency,
            trps=total_rps,
            srps=success_rps,
            p95=fmt_ms(p95),
            err=error_rate_pct,
        )
    )


def main() -> int:
    args = parse_args()

    concurrency_levels = args.concurrency or [8, 16, 32]
    if any(level <= 0 for level in concurrency_levels):
        raise ValueError("Concurrency levels must all be positive integers.")
    if args.duration_seconds <= 0:
        raise ValueError("Duration must be positive.")
    if args.warmup_seconds < 0:
        raise ValueError("Warmup duration cannot be negative.")

    expected_statuses = parse_expected_statuses(args.expected_statuses)
    endpoint = parse_endpoint(args.base_url, args.endpoint)
    payload_bytes = load_payload_bytes(args.payload_file)

    benchmark = BenchmarkConfig(
        endpoint=endpoint,
        payload_bytes=payload_bytes,
        expected_statuses=expected_statuses,
        request_timeout_seconds=args.request_timeout_seconds,
        validate_response_status_field=args.validate_response_status_field,
    )

    runs = []
    for concurrency in concurrency_levels:
        if args.warmup_seconds > 0:
            run_workers(
                concurrency=concurrency,
                duration_seconds=args.warmup_seconds,
                benchmark=benchmark,
                collect_metrics=False,
            )

        worker_metrics, elapsed_seconds = run_workers(
            concurrency=concurrency,
            duration_seconds=args.duration_seconds,
            benchmark=benchmark,
            collect_metrics=True,
        )
        summary = summarize(worker_metrics, elapsed_seconds)
        summary["concurrency"] = concurrency
        runs.append(summary)
        print_run_summary(summary)
        if summary["successes"] == 0 and not args.allow_zero_success:
            raise RuntimeError(
                "Zero successful responses recorded. "
                "Use --allow-zero-success to override."
            )

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "implementation": args.implementation,
        "target": {
            "base_url": args.base_url,
            "endpoint": args.endpoint,
        },
        "benchmark": {
            "duration_seconds": args.duration_seconds,
            "warmup_seconds": args.warmup_seconds,
            "request_timeout_seconds": args.request_timeout_seconds,
            "expected_statuses": sorted(expected_statuses),
            "validate_response_status_field": args.validate_response_status_field,
        },
        "runs": runs,
    }

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(f"wrote report: {args.output}")
    else:
        print(json.dumps(report, indent=2))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

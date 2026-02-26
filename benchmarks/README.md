# Python vs C++ Benchmark Suite

This folder provides reproducible benchmarking for the optimize API across two implementations:

- Python (`origin/main` by default)
- C++ (`HEAD` by default)

It benchmarks `POST /api/v1/deliveries/optimize` with identical load profiles and map data.

## Files

- `load_optimize.py`: threaded load generator for optimize endpoint.
- `default_optimize_payload.json`: canonical payload used for probes and load runs.
- `compare_reports.py`: compares baseline/candidate reports and includes throughput, latency, error, CPU, and memory deltas.
- `run_py_vs_cpp.py`: orchestration runner for full-stack and HTTP-only scenarios.
- `stubs/vroom_stub.sh`: VROOM-compatible stub used in HTTP-only scenario.
- `compose/python.vroom-stub.override.yml`: Python compose override for VROOM stub.
- `compose/cpp.vroom-stub.override.yml`: C++ compose override for VROOM stub.

## Scenarios

- `full-stack`: real API + VROOM + OSRM.
- `http-only`: API + OSRM with VROOM replaced by local stub.

## Standard Profile (Default)

This runs both scenarios, concurrency matrix `4/8/16/32`, warmup `10s`, duration `60s`, and `3` repeats.

```bash
python3 benchmarks/run_py_vs_cpp.py
```

Default output location:

`benchmarks/reports/<timestamp>/`

Outputs include:

- `raw/*.json`: per-run raw artifacts
- `aggregated.json`: median summary per implementation/scenario/concurrency
- `python-vs-cpp.json`: comparison deltas
- `python-vs-cpp.md`: markdown summary table

## Quick Smoke Profile

Use a fast command to validate harness wiring before full runs:

```bash
python3 benchmarks/run_py_vs_cpp.py \
  --scenario http-only \
  --concurrency 4 \
  --warmup-seconds 2 \
  --duration-seconds 5 \
  --repeats 1
```

## Useful Overrides

```bash
python3 benchmarks/run_py_vs_cpp.py \
  --python-ref origin/main \
  --cpp-ref HEAD \
  --map-url https://download.geofabrik.de/europe/monaco-latest.osm.pbf
```

## Report Interpretation

Primary comparison fields per concurrency:

- `success_rps_delta_pct`: candidate vs baseline successful throughput delta.
- `p95_latency_improvement_pct`: positive means candidate p95 latency is lower.
- `error_rate_delta_pp`: candidate minus baseline error-rate delta (percentage points).
- `cpu_avg_delta_pct`, `cpu_p95_delta_pct`: whole-stack CPU deltas.
- `mem_avg_delta_pct`, `mem_p95_delta_pct`: whole-stack memory deltas.

## Caveats

- Run both implementations on the same machine profile.
- Avoid heavy background workloads during benchmark runs.
- For stable decisions, use standard profile and compare medians.
- Docker build/startup time is intentionally excluded from performance metrics.

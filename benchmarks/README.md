# Benchmark Suite

This folder provides a baseline load-testing workflow for the public optimize API.

## Files

- `load_optimize.py`: threaded load generator for `POST /api/v1/deliveries/optimize`
- `default_optimize_payload.json`: default request payload used by the load generator
- `compare_reports.py`: compares two JSON reports (for example: Python baseline vs C++ candidate)

## 1) Capture Python Baseline

Start the current stack first:

```bash
cmake --preset dev
cmake --build --preset dev --target up
```

Run benchmark matrix and save baseline report:

```bash
python3 benchmarks/load_optimize.py \
  --implementation python \
  --base-url http://localhost:5050 \
  --concurrency 4 \
  --concurrency 8 \
  --concurrency 16 \
  --concurrency 32 \
  --warmup-seconds 10 \
  --duration-seconds 60 \
  --output benchmarks/reports/python-baseline.json
```

What you get per concurrency:

- total and successful throughput (RPS)
- latency stats (min/avg/p50/p90/p95/p99/max)
- status code counts and transport error counts
- failure/error rate

## 2) Capture C++ Candidate

Once C++ service is ready, run the same command and only change implementation label + output:

```bash
python3 benchmarks/load_optimize.py \
  --implementation cpp \
  --base-url http://localhost:5050 \
  --concurrency 4 \
  --concurrency 8 \
  --concurrency 16 \
  --concurrency 32 \
  --warmup-seconds 10 \
  --duration-seconds 60 \
  --output benchmarks/reports/cpp-candidate.json
```

## 3) Compare Python vs C++

```bash
python3 benchmarks/compare_reports.py \
  --baseline benchmarks/reports/python-baseline.json \
  --candidate benchmarks/reports/cpp-candidate.json \
  --output benchmarks/reports/python-vs-cpp.json
```

Comparison includes:

- success throughput delta (%)
- p95 success latency improvement (%)
- error rate delta (percentage points)

## Notes

- Keep payload, concurrency matrix, warmup, and duration identical across implementations.
- Run both benchmarks on the same machine profile and with no background heavy workloads.
- For consistent data, run each benchmark at least 3 times and compare medians.
- The load tool fails if a run has zero successful responses; use `--allow-zero-success` only for connectivity debugging.

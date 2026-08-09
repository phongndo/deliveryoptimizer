# Allocation Reduction — Implementation & Evaluation Report

Status: **implemented and measured**. All 78 unit tests pass (75 pre-existing + 3 new),
including under ASAN+UBSAN. One optimization (P0-7) was **scrapped** after measurement
showed it saved zero allocations.

---

## How this was evaluated

A dedicated benchmark harness was added (`bench/allocation_bench.cpp`, built with
`-DDELIVERYOPTIMIZER_ENABLE_BENCHMARKS=ON`, off by default). It overrides global
`operator new`/`new[]`/aligned-new to count allocations and bytes, and replays each
hot-path function with a representative 1000-job / 50-vehicle workload:

- `parse-request` — async worker: `ParseJsonText` + `ParseAndValidateOptimizeRequest`
- `parse-vroom-output` — runner: `ParseJsonText` over a 33 KB vroom output document
- `vroom-payload` — `BuildVroomInput`+render vs `BuildVroomInputText`
- `success-body` — `BuildOptimizeSuccessBody`
- `to-coordinated` / `worker-flow` — `ToCoordinatedSolveResult` and the worker loop sequence
- `log-line` — per-request `LogSolveRequest`
- `request-context` — `EnsureRequestContext`/`GetRequestContext`/`CreateSolveLifecycle`
- `http-json-response-copy|move` — drogon response construction, both overloads
- `write-payload-string|stream` — replicated `WritePayloadToFile` variants
- `spawn-args-baseline|optimized` — replicated `BuildSpawnArguments` variants
- `closure-sbo-single-ptr|heap-big-capture` — std::function capture-size mechanism

Allocation counts are bit-stable across runs (only wall time varies ±5%).

### Measured results (per iteration)

| Scenario | Baseline allocs | Optimized allocs | Δ allocs | Δ bytes | Δ time |
|---|---|---|---|---|---|
| parse-request | 17 846 | 17 830 | **−16** | −5.4 KB | −1% |
| parse-vroom-output | 3 255 | 3 239 | **−16** | −5.4 KB | −2% |
| vroom-payload | 40 130 | **2** | **−40 128 (−99.99%)** | −3.04 MB (−91%) | −95% |
| success-body | 7 794 | 3 499 | **−4 295 (−55%)** | −305 KB | −50% |
| to-coordinated | 6 478 | 3 239 | **−3 239 (−50%)** | −246 KB | −51% |
| worker-flow | 14 272 | 3 499 | **−10 773 (−75%)** | −797 KB | −72% |
| log-line | 32 | 1 | **−31 (−97%)** | −3.3 KB | −88% |
| request-context | 12 | 6 | **−6 (−50%)** | −240 B | −20% |
| http-json-response copy→move | 6 481 | 3 242 | **−3 239 (−50%)** | −246 KB | −49% |
| write-payload string→stream | 786 | 765 | −21 | −132 KB | — |
| spawn-args | 5 | 3 | −2 | −344 B | — |
| closure capture >16 B → 1 ptr | 5 | 0 | **−5 (−100%)** | −392 B | — |

Representative per-solve totals (1000 jobs): **~80 000 allocations → ~24 000 (−70%)**,
**~5.9 MB → ~2.2 MB (−63%)** on the synchronous pipeline (parse + payload + solve
conversion + response + log), before any vroom subprocess time.

---

## Per-optimization verdicts

### KEPT — P0-1 `ToCoordinatedSolveResult` takes `VroomRunResult&&` (moves output)
`solve_execution.cpp`/`.hpp`. `to-coordinated`: 6 478 → 3 239 allocs (−50%). The
jsoncpp 1.9.5 `Json::Value` copy is a full recursive deep copy (no COW), so the old
const-ref signature duplicated the whole vroom output tree once per solve.
Callers updated: `solve_coordinator.cpp` (drop `const`, `std::move`),
`optimization_job_runtime.cpp`.

### KEPT — P0-2 `BuildOptimizeSuccessBody` takes `Json::Value` by value, moves subtrees
`optimize_request.cpp`/`.hpp`. `success-body`: 7 794 → 3 499 allocs (−55%). `summary`,
`routes`, `unassigned` are moved out of the (now-owned) output instead of deep-copied.
`BuildSolveExecutionResult` now takes `CoordinatedSolveResult` by value so the output
can be moved through. Test updated to pass `std::move(vroom_output)`.

### KEPT — P0-3 WorkerLoop assignment is a move, not a copy
`optimization_job_runtime.cpp`. `worker-flow`: 14 272 → 3 499 allocs (−75%) — the
combination of P0-1 + P0-2 + this move eliminates two full output-tree copies per
async job.

### KEPT — P0-4 `WritePayloadToFile` no longer renders JSON
`vroom_runner.cpp`. Superseded by P2-1: the payload is text end-to-end, so the temp
file write is a plain `ofstream << text` with no JSON writer, no intermediate string.
The standalone stream-writer micro-optimization (786 → 765 allocs, −132 KB) is
therefore moot in the real pipeline and was not carried over as separate code.

### KEPT — P0-5 external-id `std::map` → `std::vector<const char*>` indexed by id−1
`optimize_request.cpp`. VROOM ids are contiguous 1..N (we emit them), so lookup is
O(1) indexing with zero node/string allocations; `const char*` values are copied into
the `Json::Value` exactly once via `operator=(const char*)`. Bounds-checked for
robustness. Included in the `success-body` numbers.

### SCRAPPED — P0-7 lazy validation field names
`optimize_request.cpp` (reverted). Measured impact: **0 heap allocations**. libc++
small-string optimization (22 bytes) absorbs `"vehicles[12]"`/`"jobs[999]"` (≤ 15
chars at the 10k/2k limits), so per-item `base_field` strings never allocate. The
replacement added code for no allocation benefit; reverted to the original loop.
(It was also confirmed the parse-path −16 allocs comes entirely from P1-1.)

### KEPT — P0-6 header/attribute key strings allocated once
`observability.hpp` (new `RequestIdHeaderName()`), `request_context.cpp` (file-local
`const std::string` key), `api_server.cpp` (8 call sites). `request-context`:
12 → 6 allocs (−50%); applies to every request/response in the server, including the
response-creation advice.

### KEPT — P1-1 reusable `thread_local` JSON `CharReader`
`libs/adapters/src/json_utils.cpp`. Verified in the vendored jsoncpp that
`OurReader::parse()` resets `nodes_`/`comments_`/`errors_` at entry, so reuse is
safe. Saves ~16 allocations per parse (builder settings map + reader construction);
parses run per solve output, per async job claim, and per stored-job re-parse
(parse-request −16, parse-vroom-output −16).

### KEPT — P1-2 `LogSolveRequest` renders the flat log line directly
`observability.cpp`. 32 → 1 allocation (−97%), 3.7 KB → 348 B. JSON field names,
ordering and escaping are preserved byte-for-byte (verified against a live server
log line: `{"request_id":...,"method":"POST","path":...,"outcome":"failed",...}`).

### KEPT — P1-3 per-request closures bundled into one `SyncSolveContext`
`endpoints/deliveries_optimize_endpoint.cpp`. Every `std::function` capture is now a
single 16-byte `shared_ptr` (small-buffer optimized, 0 allocations) instead of the
~184-byte capture (heap closure + re-copied weather-options strings, ×2 on the
weather re-run path). The weather adjustment scalar is stored on the context so the
re-run factory also captures just the pointer. Mechanism quantified by the closure
scenarios: 5 allocs/construction → 0.

### KEPT — P1-4 `CreateJob` stores the raw request body
`endpoints/optimization_jobs_endpoint.cpp`. `request->body()` (drogon 1.9 returns
`std::string_view`) replaces `internal::RenderJson(*parsed_json)`, eliminating the
JSON writer + Value→text re-render per async submission. One unavoidable copy of the
body bytes remains (the DB layer needs an owned string).

### KEPT — P1-5 `BuildSpawnArguments` points argv at the config
`vroom_runner.cpp`. `std::array<std::string,2>` owned storage for `--limit`/`--output`
only; the fixed entries reference `runtime_config_` members (which outlive the spawn
call). 5 → 3 allocations per solve.

### KEPT — P1-6 drogon `newHttpJsonResponse(Json::Value&&)` move overload
`deliveries_optimize_endpoint.cpp`, `optimization_jobs_endpoint.cpp`. The move
overload halves response construction (6 481 → 3 242 allocs on the 33 KB fixture;
proportionally more for large success bodies). Applied to error/validation/status
bodies, `BuildSolveExecutionResponse` (now by-value, moves the success body), and
the async job-result handler (`std::move(*job->result_body)`).

### KEPT — P2-1 VROOM payload rendered directly to text
`optimize_request.cpp` (`BuildVroomInputText`), `forecast_optimizer.cpp`
(`BuildWeatherAdjustedVroomInputText` → delegates with the service adjustment),
`vroom_runner.hpp/.cpp` (`Run(const std::string&)`), `solve_coordinator.hpp`
(`PayloadFactory = std::function<std::string()>`). Replaces the per-node
`Json::Value` tree + `writeString` render (~5 nodes + string per job): 40 130 → 2
allocations, 3.35 MB → 309 KB, 2.7 ms → 0.14 ms per 1000-job payload.
The renderer uses `std::to_chars` (shortest round-trip doubles) and a full JSON
string escaper; three new unit tests assert round-trip parity, escaping
(`order-"quoted"\path`), and service adjustment.

### KEPT — P2-2 OSRM proxy path built in one reserved buffer
`endpoints/osrm_proxy_endpoint.cpp`. 3 allocations → 1 for long route paths.

### KEPT — harness + fixes
- `bench/` target behind `DELIVERYOPTIMIZER_ENABLE_BENCHMARKS` (default OFF).
- `tests/CMakeLists.txt`: link order fix (`GTest::gtest_main` before drogon's
  transitive static Boost archives) so the test binary links at all in this
  environment — a pre-existing failure unrelated to allocations.

---

## Testing

| Check | Result |
|---|---|
| Unit tests (Release) | 78/78 pass — 75 pre-existing + 3 new (`BuildVroomInputText` round-trip, adjustment, compactness) |
| Unit tests (ASAN+UBSAN) | 78/78 pass, no sanitizer reports |
| Server smoke test | Starts; `/health` correct; sync optimize path executes (validation → admission → spawn → log line); log line byte-identical to previous JSON format |
| Benchmark stability | Allocation counts identical across repeat runs |

Not run: docker-based e2e suites (require vroom/OSRM/postgres containers) — the text
payload format is covered by the round-trip unit tests and the previous Value-based
builder is byte-equivalent in field semantics.

## Reproduce

```sh
cmake -S . -B build/build/Release -DDELIVERYOPTIMIZER_ENABLE_BENCHMARKS=ON
cmake --build build/build/Release --target deliveryoptimizer_tests deliveryoptimizer_alloc_bench
./build/build/Release/tests/deliveryoptimizer_tests
./build/build/Release/bench/deliveryoptimizer_alloc_bench
```
